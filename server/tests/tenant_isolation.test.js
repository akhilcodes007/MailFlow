/**
 * server/tests/tenant_isolation.test.js
 * Multi-tenant data isolation and authorization tests.
 * Ensures User A can never read, modify, delete, or send User B's campaigns.
 * Verifies global suppression enforcement across tenants.
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Campaign = require('../src/models/Campaign');
const Suppression = require('../src/models/Suppression');

jest.mock('../src/services/emailService', () => ({
  ...jest.requireActual('../src/services/emailService'),
  processCampaignSending: jest.fn().mockResolvedValue({
    _id: 'campaign_id',
    status: 'completed',
    mode: 'dry-run',
    stats: { total: 1, accepted: 1 },
  }),
}));

const app = createApp();
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_at_least_32_characters_long';

const userA = {
  _id: '507f1f77bcf86cd799439011',
  name: 'User A',
  email: 'usera@example.com',
  role: 'user',
  isEmailVerified: true,
  tokenVersion: 0,
};

const userB = {
  _id: '507f1f77bcf86cd799439022',
  name: 'User B',
  email: 'userb@example.com',
  role: 'user',
  isEmailVerified: true,
  tokenVersion: 0,
};

const adminUser = {
  _id: '507f1f77bcf86cd799439033',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin',
  isEmailVerified: true,
  tokenVersion: 0,
};

const tokenA = jwt.sign(
  { id: userA._id, email: userA.email, role: userA.role, tokenVersion: 0 },
  JWT_SECRET
);
const tokenB = jwt.sign(
  { id: userB._id, email: userB.email, role: userB.role, tokenVersion: 0 },
  JWT_SECRET
);
const tokenAdmin = jwt.sign(
  { id: adminUser._id, email: adminUser.email, role: adminUser.role, tokenVersion: 0 },
  JWT_SECRET
);

describe('Multi-Tenant Data Isolation Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Campaign Ownership Isolation', () => {
    test('User A cannot fetch User B campaign details (GET /api/campaigns/:id)', async () => {
      // Mock auth middleware for User A
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(userA),
      });

      // Campaign.findOne should query with { _id: targetId, createdBy: userA._id }
      const findOneSpy = jest.spyOn(Campaign, 'findOne').mockResolvedValue(null);

      const targetId = '507f191e810c19729de860ea';
      const res = await request(app)
        .get(`/api/campaigns/${targetId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(findOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: targetId,
          createdBy: userA._id,
        })
      );

      findOneSpy.mockRestore();
      User.findById.mockRestore();
    });

    test('User A cannot trigger send on User B campaign (POST /api/campaigns/:id/send)', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(userA),
      });

      // findOneAndUpdate with createdBy: userA._id returns null
      const updateSpy = jest.spyOn(Campaign, 'findOneAndUpdate').mockResolvedValue(null);

      const targetId = '507f191e810c19729de860ea';
      const res = await request(app)
        .post(`/api/campaigns/${targetId}/send`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(409);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: targetId,
          createdBy: userA._id,
        }),
        expect.any(Object),
        expect.any(Object)
      );

      updateSpy.mockRestore();
      User.findById.mockRestore();
    });

    test('User A cannot retry failed recipients on User B campaign (POST /api/campaigns/:id/retry-failed)', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(userA),
      });

      const findSpy = jest.spyOn(Campaign, 'findOne').mockResolvedValue(null);

      const targetId = '507f191e810c19729de860ea';
      const res = await request(app)
        .post(`/api/campaigns/${targetId}/retry-failed`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: targetId,
          createdBy: userA._id,
        })
      );

      findSpy.mockRestore();
      User.findById.mockRestore();
    });

    test('User A cannot delete User B campaign (DELETE /api/campaigns/:id)', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(userA),
      });

      const deleteSpy = jest.spyOn(Campaign, 'findOneAndDelete').mockResolvedValue(null);

      const targetId = '507f191e810c19729de860ea';
      const res = await request(app)
        .delete(`/api/campaigns/${targetId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(deleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: targetId,
          createdBy: userA._id,
        })
      );

      deleteSpy.mockRestore();
      User.findById.mockRestore();
    });

    test('Campaign list strictly filters by createdBy: req.user.id', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(userA),
      });

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      };

      const findSpy = jest.spyOn(Campaign, 'find').mockReturnValue(mockQuery);
      const countSpy = jest.spyOn(Campaign, 'countDocuments').mockResolvedValue(0);

      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: userA._id,
        })
      );

      findSpy.mockRestore();
      countSpy.mockRestore();
      User.findById.mockRestore();
    });
  });

  describe('Global Suppressions Role Enforcement', () => {
    test('Non-admin user is forbidden from deleting suppressions (DELETE /api/campaigns/suppressions/:email)', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(userA), // role: 'user'
      });

      const res = await request(app)
        .delete('/api/campaigns/suppressions/bounced@example.com')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Forbidden');

      User.findById.mockRestore();
    });

    test('Admin user is permitted to delete suppressions', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(adminUser), // role: 'admin'
      });

      jest.spyOn(Suppression, 'findOneAndDelete').mockResolvedValue({ email: 'bounced@example.com' });

      const res = await request(app)
        .delete('/api/campaigns/suppressions/bounced@example.com')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      Suppression.findOneAndDelete.mockRestore();
      User.findById.mockRestore();
    });
  });
});
