/**
 * src/middleware/auth.js
 * JWT authentication middleware.
 * Attaches req.user = { id, email, role } on success.
 */
'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = header.slice(7);
    let payload;
    const secret = process.env.JWT_SECRET || 'test_jwt_secret_must_be_at_least_32_characters_long';
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      const msg =
        err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
      return res.status(401).json({ success: false, message: msg });
    }

    const user = await User.findById(payload.id).select('name email role isEmailVerified tokenVersion');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email address not verified. Please verify your email before accessing MailFlow.',
        unverified: true,
      });
    }

    const currentTokenVersion = user.tokenVersion || 0;
    const tokenVersionInPayload = payload.tokenVersion !== undefined ? payload.tokenVersion : 0;
    if (tokenVersionInPayload !== currentTokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'Session has been invalidated. Please log in again.',
      });
    }

    req.user = { id: user._id, name: user.name || '', email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
