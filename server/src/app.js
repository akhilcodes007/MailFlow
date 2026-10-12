/**
 * src/app.js
 * Express application factory — separate from server startup for testability.
 */
'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const campaignsRouter = require('./routes/campaigns');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ─────────────────────────────────────────────────────────────────
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  app.use(
    cors({
      origin: [clientOrigin],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ── Request logging ──────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // ── Global rate limiter ──────────────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
  });
  app.use(globalLimiter);

  // ── Stricter limiter for auth endpoints ──────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts.' },
  });
  app.use('/api/auth', authLimiter);

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/campaigns', campaignsRouter);

  // ── 404 handler ──────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ success: false, message: `Cannot ${req.method} ${req.path}` });
  });

  // ── Centralized error handler (must be last) ─────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
