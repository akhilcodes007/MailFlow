/**
 * src/routes/auth.js
 * POST /api/auth/login            — returns JWT
 * GET  /api/auth/me               — returns current user profile (protected)
 * POST /api/auth/change-password  — updates password for authenticated admin (protected)
 *
 * There is NO registration endpoint. Admins are created via npm run seed.
 */
'use strict';

const express = require('express');
const { body } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

// ── Login ─────────────────────────────────────────────────────────────────────
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

      await user.resetLoginAttempts();

      const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      res.json({
        success: true,
        token,
        user: { id: user._id, email: user.email, role: user.role },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── Current user ──────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('email role lastLogin createdAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// ── Change password (authenticated) ───────────────────────────────────────────
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

      // Pre-save hook hashes user.password with bcryptjs cost 12
      user.password = req.body.newPassword;
      await user.save();

      res.json({
        success: true,
        message: 'Password updated successfully. Please use your new password on next login.',
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
