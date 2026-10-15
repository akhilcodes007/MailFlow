/**
 * src/routes/auth.js
 * Multi-user authentication routes:
 * POST /api/auth/register            — User sign up (requires email verification, no JWT issued)
 * POST /api/auth/verify-email        — Verifies token, activates account
 * POST /api/auth/resend-verification — Resends verification link
 * POST /api/auth/forgot-password     — Sends password reset link
 * POST /api/auth/reset-password      — Updates password & revokes existing sessions
 * POST /api/auth/login               — Authenticates user (enforces verification & tokenVersion)
 * GET  /api/auth/me                  — Returns current authenticated user profile
 * POST /api/auth/change-password     — Authenticated password change (revokes other sessions)
 * POST /api/auth/logout              — Acknowledges logout
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const { body } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require('../services/emailService');

const router = express.Router();

function getFrontendUrl() {
  const url = process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  return url.replace(/\/+$/, '');
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// ── 1. Register ───────────────────────────────────────────────────────────────
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('confirmPassword').custom((val, { req }) => {
      if (val !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists.',
        });
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const user = new User({
        name,
        email,
        password,
        role: 'user',
        isEmailVerified: false,
        tokenVersion: 0,
        verificationTokenHash: tokenHash,
        verificationTokenExpires: tokenExpires,
      });

      await user.save();

      const verificationUrl = `${getFrontendUrl()}/verify-email?token=${rawToken}`;
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        verificationUrl,
      });

      // DO NOT issue a JWT — require email verification before any session is granted
      res.status(201).json({
        success: true,
        message: 'Account created! Please check your email to verify your account before logging in.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 2. Verify Email ───────────────────────────────────────────────────────────
router.post(
  '/verify-email',
  [
    body('token').trim().notEmpty().withMessage('Verification token required'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const tokenHash = hashToken(req.body.token);

      const user = await User.findOne({
        verificationTokenHash: tokenHash,
        verificationTokenExpires: { $gt: new Date() },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired verification link. Please request a new verification email.',
        });
      }

      user.isEmailVerified = true;
      user.verificationTokenHash = undefined;
      user.verificationTokenExpires = undefined;
      await user.save();

      res.json({
        success: true,
        message: 'Email verified successfully! You can now log in.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 3. Resend Verification ───────────────────────────────────────────────────
router.post(
  '/resend-verification',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });

      // Anti-enumeration: Return generic success regardless of whether user exists or is already verified
      if (user && !user.isEmailVerified) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        user.verificationTokenHash = hashToken(rawToken);
        user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        const verificationUrl = `${getFrontendUrl()}/verify-email?token=${rawToken}`;
        await sendVerificationEmail({
          to: user.email,
          name: user.name,
          verificationUrl,
        });
      }

      res.json({
        success: true,
        message: 'If an unverified account exists with that email, a verification link has been sent.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 4. Forgot Password ────────────────────────────────────────────────────────
router.post(
  '/forgot-password',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });

      if (user) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordTokenHash = hashToken(rawToken);
        user.resetPasswordTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();

        const resetUrl = `${getFrontendUrl()}/reset-password?token=${rawToken}`;
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl,
        });
      }

      // Generic response to prevent account enumeration
      res.json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been sent.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 5. Reset Password ────────────────────────────────────────────────────────
router.post(
  '/reset-password',
  [
    body('token').trim().notEmpty().withMessage('Reset token required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('confirmPassword').custom((val, { req }) => {
      if (val !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
    validate,
  ],
  async (req, res, next) => {
    try {
      const tokenHash = hashToken(req.body.token);

      const user = await User.findOne({
        resetPasswordTokenHash: tokenHash,
        resetPasswordTokenExpires: { $gt: new Date() },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired password reset link. Please request a new one.',
        });
      }

      // Pre-save hook hashes new password
      user.password = req.body.newPassword;
      // Invalidate all existing sessions across all devices
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.resetPasswordTokenHash = undefined;
      user.resetPasswordTokenExpires = undefined;
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();

      res.json({
        success: true,
        message: 'Password reset successfully! All previous sessions have been invalidated. Please log in with your new password.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 6. Login ──────────────────────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.',
        });
      }

      const valid = await user.comparePassword(password);
      if (!valid) {
        await user.incrementLoginAttempts();
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      // Check email verification before issuing JWT
      if (!user.isEmailVerified) {
        return res.status(403).json({
          success: false,
          message: 'Your email address has not been verified. Please check your inbox or request a new verification link.',
          unverified: true,
        });
      }

      await user.resetLoginAttempts();

      const tokenVersion = user.tokenVersion || 0;
      const secret = process.env.JWT_SECRET || 'test_jwt_secret_must_be_at_least_32_characters_long';
      const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role, tokenVersion },
        secret,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name || '',
          email: user.email,
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 7. Current User Profile ───────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('name email role lastLogin createdAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// ── 8. Change Password (Authenticated) ─────────────────────────────────────────
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters')
      .custom((val, { req }) => {
        if (val === req.body.currentPassword) {
          throw new Error('New password must differ from current password');
        }
        return true;
      }),
    validate,
  ],
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id).select('+password');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const isValid = await user.comparePassword(req.body.currentPassword);
      if (!isValid) {
        return res.status(401).json({ success: false, message: 'Incorrect current password' });
      }

      user.password = req.body.newPassword;
      // Invalidate existing sessions
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save();

      res.json({
        success: true,
        message: 'Password updated successfully. Other active sessions have been invalidated.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 9. Logout ─────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
