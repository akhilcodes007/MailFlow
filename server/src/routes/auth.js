/**
 * src/routes/auth.js
 * POST /api/auth/login  — returns JWT
 * GET  /api/auth/me     — returns current user profile (protected)
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
        // Generic message — don't reveal whether email exists
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Account temporarily locked. Try again in 15 minutes.',
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

module.exports = router;
