/**
 * server/tests/auth_multiuser.test.js
 * Multi-user registration, email verification, session invalidation, and auth tests.
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const User = require('../src/models/User');

// Mock email service completely — zero live emails sent in tests
jest.mock('../src/services/emailService', () => ({
  ...jest.requireActual('../src/services/emailService'),
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true, mode: 'mock' }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true, mode: 'mock' }),
}));

const { sendVerificationEmail, sendPasswordResetEmail } = require('../src/services/emailService');

const app = createApp();
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_at_least_32_characters_long';

describe('Multi-User Auth & Lifecycle Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Registration: POST /api/auth/register', () => {
    test('successfully registers a new unverified user and dispatches verification email without issuing JWT', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      const saveSpy = jest.spyOn(User.prototype, 'save').mockResolvedValue(true);

      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice Cooper',
        email: 'alice@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeUndefined(); // MUST NOT issue JWT
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          name: 'Alice Cooper',
          verificationUrl: expect.stringContaining('/verify-email?token='),
        })
      );

      saveSpy.mockRestore();
      User.findOne.mockRestore();
    });

    test('rejects duplicate email registrations with a friendly 409 conflict', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue({
        _id: 'existing123',
        email: 'duplicate@example.com',
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Bob',
        email: 'duplicate@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
      expect(sendVerificationEmail).not.toHaveBeenCalled();

      User.findOne.mockRestore();
    });

    test('validates mismatched passwords and short passwords', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Charlie',
        email: 'charlie@example.com',
        password: 'short',
        confirmPassword: 'differentPassword',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('Email Verification: POST /api/auth/verify-email', () => {
    test('successfully verifies account with valid unexpired token', async () => {
      const rawToken = 'valid_hex_token_123';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const mockUser = {
        _id: 'user_to_verify',
        email: 'unverified@example.com',
        isEmailVerified: false,
        verificationTokenHash: tokenHash,
        verificationTokenExpires: new Date(Date.now() + 100000),
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);

      const res = await request(app).post('/api/auth/verify-email').send({
        token: rawToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUser.isEmailVerified).toBe(true);
      expect(mockUser.verificationTokenHash).toBeUndefined();
      expect(mockUser.save).toHaveBeenCalled();

      User.findOne.mockRestore();
    });

    test('rejects invalid, reused, or expired tokens', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(null);

      const res = await request(app).post('/api/auth/verify-email').send({
        token: 'already_used_or_expired_token',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid or expired verification link');

      User.findOne.mockRestore();
    });
  });

  describe('Login Verification Enforcement: POST /api/auth/login', () => {
    test('refuses to issue JWT for unverified account and returns 403', async () => {
      const mockUnverifiedUser = {
        _id: 'unverified_user_id',
        email: 'unverified@example.com',
        role: 'user',
        isEmailVerified: false,
        isLocked: false,
        comparePassword: jest.fn().mockResolvedValue(true),
      };

      const selectMock = jest.fn().mockResolvedValue(mockUnverifiedUser);
      jest.spyOn(User, 'findOne').mockReturnValue({ select: selectMock });

      const res = await request(app).post('/api/auth/login').send({
        email: 'unverified@example.com',
        password: 'ValidPassword123!',
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.unverified).toBe(true);
      expect(res.body.token).toBeUndefined();

      User.findOne.mockRestore();
    });

    test('successfully issues JWT containing tokenVersion for verified account', async () => {
      const mockVerifiedUser = {
        _id: 'verified_user_id',
        name: 'Verified User',
        email: 'verified@example.com',
        role: 'user',
        isEmailVerified: true,
        tokenVersion: 2,
        isLocked: false,
        comparePassword: jest.fn().mockResolvedValue(true),
        resetLoginAttempts: jest.fn().mockResolvedValue(true),
      };

      const selectMock = jest.fn().mockResolvedValue(mockVerifiedUser);
      jest.spyOn(User, 'findOne').mockReturnValue({ select: selectMock });

      const res = await request(app).post('/api/auth/login').send({
        email: 'verified@example.com',
        password: 'ValidPassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();

      const decoded = jwt.verify(res.body.token, JWT_SECRET);
      expect(decoded.id).toBe('verified_user_id');
      expect(decoded.tokenVersion).toBe(2);

      User.findOne.mockRestore();
    });
  });

  describe('Password Reset & Session Invalidation', () => {
    test('forgot-password generates token and returns generic anti-enumeration response', async () => {
      const mockUser = {
        _id: 'user_reset',
        name: 'Alice',
        email: 'alice@example.com',
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);

      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'alice@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If an account exists');
      expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

      User.findOne.mockRestore();
    });

    test('reset-password updates password and increments tokenVersion to revoke old sessions', async () => {
      const rawToken = 'reset_token_hex_999';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const mockUser = {
        _id: 'user_reset_target',
        email: 'target@example.com',
        tokenVersion: 1,
        resetPasswordTokenHash: tokenHash,
        resetPasswordTokenExpires: new Date(Date.now() + 60000),
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);

      const res = await request(app).post('/api/auth/reset-password').send({
        token: rawToken,
        newPassword: 'BrandNewPassword123!',
        confirmPassword: 'BrandNewPassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUser.tokenVersion).toBe(2); // Incremented!
      expect(mockUser.resetPasswordTokenHash).toBeUndefined();
      expect(mockUser.save).toHaveBeenCalled();

      User.findOne.mockRestore();
    });

    test('authenticate middleware rejects tokens with outdated tokenVersion', async () => {
      // Token issued with tokenVersion: 1
      const oldToken = jwt.sign(
        { id: 'user_revoked_id', email: 'user@example.com', role: 'user', tokenVersion: 1 },
        JWT_SECRET
      );

      // User in DB now has tokenVersion: 2 (e.g. After password reset)
      const userInDb = {
        _id: 'user_revoked_id',
        email: 'user@example.com',
        role: 'user',
        isEmailVerified: true,
        tokenVersion: 2,
      };

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(userInDb),
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${oldToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Session has been invalidated');

      User.findById.mockRestore();
    });
  });
});
