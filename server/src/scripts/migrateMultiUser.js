/**
 * src/scripts/migrateMultiUser.js
 * Idempotent migration script for Multi-User MailFlow upgrade.
 *
 * CRITICAL SAFETY RULES:
 * 1. Uses updateMany with raw $set — NEVER calls .save() on existing users,
 *    preventing pre('save') hooks from re-hashing already hashed passwords!
 * 2. Sets isEmailVerified: true, role: 'admin', tokenVersion: 0, name: 'Admin'
 *    for all existing admin accounts so they are never locked out.
 * 3. Verifies that all campaigns have a createdBy user reference.
 *
 * Run with: node src/scripts/migrateMultiUser.js
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { connectDB } = require('../config/database');

async function migrate() {
  console.log('[MIGRATION] Connecting to database...');
  await connectDB();

  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');
  const campaignsCollection = db.collection('campaigns');

  // 1. Migrate existing users safely
  console.log('[MIGRATION] Checking existing user accounts...');
  const existingUsers = await usersCollection.find({}).toArray();
  console.log(`[MIGRATION] Found ${existingUsers.length} existing user(s).`);

  if (existingUsers.length > 0) {
    const result = await usersCollection.updateMany(
      {
        $or: [
          { isEmailVerified: { $exists: false } },
          { tokenVersion: { $exists: false } },
          { name: { $exists: false } },
          { role: { $exists: false } },
        ],
      },
      {
        $set: {
          isEmailVerified: true,
          tokenVersion: 0,
          role: 'admin',
          name: 'Admin',
        },
      }
    );
    console.log(`[MIGRATION] Updated ${result.modifiedCount} user record(s) with multi-user fields without re-hashing.`);
  }

  // 2. Ensure unique index on email
  console.log('[MIGRATION] Ensuring unique index on users.email...');
  try {
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    console.log('[MIGRATION] Unique index on users.email verified.');
  } catch (err) {
    console.warn('[MIGRATION] Warning creating index on users.email:', err.message);
  }

  // 3. Verify campaigns have createdBy set
  console.log('[MIGRATION] Checking campaign ownership...');
  const adminUser = await usersCollection.findOne({ role: 'admin' });
  if (adminUser) {
    const unassignedCampaigns = await campaignsCollection.updateMany(
      {
        $or: [
          { createdBy: { $exists: false } },
          { createdBy: null },
        ],
      },
      {
        $set: { createdBy: adminUser._id },
      }
    );
    if (unassignedCampaigns.modifiedCount > 0) {
      console.log(`[MIGRATION] Assigned ${unassignedCampaigns.modifiedCount} legacy campaign(s) to admin: ${adminUser.email}`);
    } else {
      console.log('[MIGRATION] All campaigns have valid createdBy ownership.');
    }
  }

  console.log('[MIGRATION] ✅ Idempotent migration completed successfully.');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('[MIGRATION] ❌ Migration failed:', err.message);
  process.exit(1);
});
