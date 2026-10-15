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
});
