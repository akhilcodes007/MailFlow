/**
 * src/models/User.js
 * Admin user model — passwords are ALWAYS stored hashed (bcryptjs, cost 12).
 * There is NO public registration endpoint. Admins are seeded via npm run seed.
 */
'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Must be a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never returned in queries unless explicitly requested
    },
    role: {
      type: String,
      enum: ['admin'],
      default: 'admin',
    },
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

// Compare plain-text password with stored hash
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Simple account lock after 5 failed attempts
userSchema.methods.incrementLoginAttempts = async function () {
  const LOCK_TIME = 15 * 60 * 1000; // 15 minutes
  if (this.loginAttempts >= 4) {
    this.lockUntil = new Date(Date.now() + LOCK_TIME);
  }
  this.loginAttempts += 1;
  return this.save();
};

userSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLogin = new Date();
  return this.save();
};

userSchema.virtual('isLocked').get(function () {
  return this.lockUntil && this.lockUntil > Date.now();
});

module.exports = mongoose.model('User', userSchema);
