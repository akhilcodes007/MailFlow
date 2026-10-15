/**
 * src/scripts/seed.js
 * Creates the initial admin user from environment variables.
 * Run with: npm run seed
 *
 * This is the ONLY way to create admin accounts — there is no public registration.
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const { connectDB } = require('../config/database');

async function seed() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('[SEED] ADMIN_EMAIL and ADMIN_PASSWORD must be set in server/.env');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('[SEED] ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`[SEED] Admin already exists: ${email}`);
    await mongoose.disconnect();
    return;
  }

  const user = new User({
    name: 'Admin',
    email,
    password,
    role: 'admin',
    isEmailVerified: true,
    tokenVersion: 0,
  });
  await user.save();
  console.log(`[SEED] ✅ Admin created: ${email}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[SEED] Error:', err.message);
  process.exit(1);
});
