/**
 * src/middleware/errorHandler.js
 * Centralized error handler — the last middleware in the Express chain.
 * Never leaks stack traces to the client in production.
 */
'use strict';

function errorHandler(err, req, res, _next) {
  const isDev = process.env.NODE_ENV === 'development';

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({ success: false, message: 'Validation failed', errors });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] ?? 'field';
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
    });
  }

  // JWT errors (should be caught by auth middleware, but belt-and-suspenders)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  // Default
  const status = err.statusCode || err.status || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  if (status >= 500) {
    console.error('[ERROR]', err);
  }

  res.status(status).json({
    success: false,
    message,
    ...(isDev && status >= 500 && { stack: err.stack }),
  });
}

module.exports = errorHandler;
