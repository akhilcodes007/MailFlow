/**
 * server/tests/api.test.js
 * Integration tests using Supertest to verify routes, auth guards, sender identity validation, and startup env checks.
 */
'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const { validateEnv } = require('../src/config/env');
const { sanitizeUri } = require('../src/config/database');
const mongoose = require('mongoose');

const app = createApp();

const testUser = {
  _id: '507f1f77bcf86cd799439011',
  email: 'admin@example.com',
  role: 'admin',
};

const authToken = jwt.sign(
  { id: testUser._id, email: testUser.email, role: testUser.role },
  process.env.JWT_SECRET || 'test_jwt_secret_must_be_at_least_32_characters_long'
);

describe('API Integration Tests', () => {
  describe('GET /api/health', () => {
    test('returns service health information and database state', async () => {
      const res = await request(app).get('/api/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('service', 'mailflow-api');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('database');
    });
  });

  describe('Startup Environment Validation', () => {
    test('reports whether SENDGRID_FROM_EMAIL is configured without printing secrets', () => {
      const oldEmail = process.env.SENDGRID_FROM_EMAIL;
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      process.env.SENDGRID_FROM_EMAIL = 'verified@example.com';
      const statusConfigured = validateEnv();
      expect(statusConfigured.isFromEmailConfigured).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('SENDGRID_FROM_EMAIL is configured'));

      delete process.env.SENDGRID_FROM_EMAIL;
      const statusMissing = validateEnv();
      expect(statusMissing.isFromEmailConfigured).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SENDGRID_FROM_EMAIL is not configured'));

      // Verify secrets are never logged
      const allLogCalls = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((c) => c.join(' ')).join(' ');
      if (process.env.JWT_SECRET) {
        expect(allLogCalls).not.toContain(process.env.JWT_SECRET);
      }
      if (process.env.MONGODB_URI) {
        expect(allLogCalls).not.toContain(process.env.MONGODB_URI);
      }

      logSpy.mockRestore();
      warnSpy.mockRestore();
      process.env.SENDGRID_FROM_EMAIL = oldEmail;
    });
  });

  describe('Authentication Enforcement', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('rejects unauthenticated requests to /api/campaigns with 401', async () => {
      const res = await request(app).get('/api/campaigns');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects login when user does not exist with 401', async () => {
      // Mock User.findOne to resolve to null (user not found)
      jest.spyOn(User, 'findOne').mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'WrongPassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid email or password');

      User.findOne.mockRestore();
    });

    test('validates required fields on login', async () => {
      const res = await request(app).post('/api/auth/login').send({});

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    test('authenticates credentials without exposing passwords or secrets in response', async () => {
      const mockAdminUser = {
        _id: '507f1f77bcf86cd799439011',
        email: 'admin@example.com',
        role: 'admin',
        isLocked: false,
        comparePassword: jest.fn().mockResolvedValue(true),
        resetLoginAttempts: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(User, 'findOne').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockAdminUser),
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminPass123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toEqual({
        id: '507f1f77bcf86cd799439011',
        email: 'admin@example.com',
        role: 'admin',
      });
      expect(res.body.user.password).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('AdminPass123!');

      User.findOne.mockRestore();
    });
  });

  describe('Sender Identity Enforcement on Campaign Routes', () => {
    beforeEach(() => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(testUser),
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('rejects POST /api/campaigns when supplied fromEmail differs from configured sender', async () => {
      const oldFrom = process.env.SENDGRID_FROM_EMAIL;
      process.env.SENDGRID_FROM_EMAIL = 'verified@example.com';

      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Summer Sale',
          subject: 'Special discounts',
          body: 'Hello and welcome!',
          fromEmail: 'different@unverified.org',
          recipients: [{ email: 'customer@example.com' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('From address does not match the verified Sender Identity');

      process.env.SENDGRID_FROM_EMAIL = oldFrom;
    });

    test('rejects POST /api/campaigns/test-email when supplied fromEmail differs from configured sender', async () => {
      const oldFrom = process.env.SENDGRID_FROM_EMAIL;
      process.env.SENDGRID_FROM_EMAIL = 'verified@example.com';

      const res = await request(app)
        .post('/api/campaigns/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Test Subject',
          body: 'Test Body',
          fromEmail: 'wrong-sender@unverified.org',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('From address does not match the verified Sender Identity');

      process.env.SENDGRID_FROM_EMAIL = oldFrom;
    });
  });

  describe('POST /api/webhooks/sendgrid', () => {
    test('rejects missing signature headers in production mode', async () => {
      const oldEnv = process.env.NODE_ENV;
      const oldKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

      process.env.NODE_ENV = 'production';
      process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...';

      const res = await request(app)
        .post('/api/webhooks/sendgrid')
        .send([{ sg_event_id: 'evt-1', event: 'delivered', email: 'test@example.com' }]);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);

      process.env.NODE_ENV = oldEnv;
      process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = oldKey;
    });
  });

  describe('Proxy and Rate Limit Configuration', () => {
    test('trusts exactly 1 proxy hop for Vercel deployment', () => {
      expect(app.get('trust proxy')).toBe(1);
    });

    test('handles X-Forwarded-For header without ERR_ERL_UNEXPECTED_X_FORWARDED_FOR', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', '203.0.113.195');

      expect([200, 503]).toContain(res.status);
      expect(res.body.service).toBe('mailflow-api');
    });

    test('ignores spoofed client IP in multi-hop X-Forwarded-For chain', async () => {
      // With trust proxy = 1, Express treats the rightmost IP before the proxy as client IP
      const express = require('express');
      const testApp = express();
      testApp.set('trust proxy', 1);

      let capturedIp;
      testApp.get('/test-ip', (req, res) => {
        capturedIp = req.ip;
        res.json({ ip: req.ip });
      });

      await request(testApp)
        .get('/test-ip')
        .set('X-Forwarded-For', '198.51.100.1, 203.0.113.195');

      expect(capturedIp).toBe('203.0.113.195');
    });
  });

  describe('Database Connection and Sanitization', () => {
    test('sanitizeUri removes credentials and query string from MongoDB URI', () => {
      const standardUri = 'mongodb+srv://admin_user:SuperSecret123@cluster0.abcde.mongodb.net/mailflow?retryWrites=true&w=majority';
      const sanitized = sanitizeUri(standardUri);
      expect(sanitized).not.toContain('admin_user');
      expect(sanitized).not.toContain('SuperSecret123');
      expect(sanitized).not.toContain('retryWrites');
      expect(sanitized).toBe('mongodb+srv://cluster0.abcde.mongodb.net/mailflow');

      const replicaUri = 'mongodb://user:pass@host1:27017,host2:27017/mailflow?replicaSet=rs0';
      const sanitizedReplica = sanitizeUri(replicaUri);
      expect(sanitizedReplica).not.toContain('user');
      expect(sanitizedReplica).not.toContain('pass');
      expect(sanitizedReplica).toBe('mongodb://***:***@host1:27017,host2:27017/mailflow');
    });

    test('propagates error when connectDB fails in serverless request middleware', async () => {
      const dbApp = createApp({ connectDb: true });
      jest.spyOn(mongoose, 'connect').mockRejectedValueOnce(new Error('Connection timeout in Atlas'));

      const res = await request(dbApp).post('/api/auth/login').send({
        email: 'admin@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      mongoose.connect.mockRestore();
    });

    test('allows GET /api/health to report status without being blocked by connection middleware', async () => {
      const dbApp = createApp({ connectDb: true });
      jest.spyOn(mongoose, 'connect').mockRejectedValueOnce(new Error('Atlas unreachable'));

      const res = await request(dbApp).get('/api/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.service).toBe('mailflow-api');
      expect(res.body.database).toBeDefined();
      expect(res.body.database.connected).toBe(false);
      mongoose.connect.mockRestore();
    });

    test('blocks GET /api/health/config from reaching authenticated handler when connection fails', async () => {
      const dbApp = createApp({ connectDb: true });
      jest.spyOn(mongoose, 'connect').mockRejectedValueOnce(new Error('Atlas unreachable'));
      const findByIdSpy = jest.spyOn(User, 'findById');

      const res = await request(dbApp)
        .get('/api/health/config')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      // Confirms authenticate middleware / handler was never reached
      expect(findByIdSpy).not.toHaveBeenCalled();

      findByIdSpy.mockRestore();
      mongoose.connect.mockRestore();
    });

    test('returns 404 for nonexistent routes without triggering database connection', async () => {
      const dbApp = createApp({ connectDb: true });
      const connectSpy = jest.spyOn(mongoose, 'connect');

      const res = await request(dbApp).get('/api/nonexistent-route');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(connectSpy).not.toHaveBeenCalled();
      connectSpy.mockRestore();
    });
  });
});
