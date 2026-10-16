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
const webhooksRouter = require('./routes/webhooks');
const errorHandler = require('./middleware/errorHandler');
const { connectDB } = require('./config/database');

function createApp(options = {}) {
  const app = express();

  // ── Proxy configuration ──────────────────────────────────────────────────
  // Vercel routes requests through a reverse proxy. Trust the 1st hop (Vercel)
  // so express-rate-limit and req.ip accurately identify client IPs without
  // allowing arbitrary spoofed X-Forwarded-For chains.
  app.set('trust proxy', 1);

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ─────────────────────────────────────────────────────────────────
  const configuredOrigin = process.env.CLIENT_ORIGIN;
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin requests, local development, configured client origin, and Vercel domains
        if (
          !origin ||
          origin === configuredOrigin ||
          origin === 'http://localhost:5173' ||
          /\.vercel\.app$/.test(origin)
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Twilio-Email-Event-Webhook-Signature', 'X-Twilio-Email-Event-Webhook-Timestamp'],
    })
  );

  // ── Body parsing with rawBody capture for webhook signature verification ─
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
    max: process.env.NODE_ENV === 'production' ? 10 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts, please try again later.' },
  });
  app.use('/api/auth', authLimiter);

  // ── Scoped database connection middleware ────────────────────────────────
  // Ensures MongoDB is connected before any database-dependent route executes.
  // Unrelated routes and nonexistent paths (404s) do not trigger DB connections.
  // Root health probe (GET /api/health) checks DB status independently.
  const shouldConnectDb = options.connectDb ?? (process.env.NODE_ENV !== 'test');
  const dbMiddleware = shouldConnectDb
    ? async (req, res, next) => {
        try {
          await connectDB();
          next();
        } catch (err) {
          next(err);
        }
      }
    : (req, res, next) => next();

  app.use('/api/health/config', dbMiddleware);
  app.use('/api/auth', dbMiddleware);
  app.use('/api/campaigns', dbMiddleware);
  app.use('/api/webhooks', dbMiddleware);

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/webhooks', webhooksRouter);

  // ── 404 handler ──────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ success: false, message: `Cannot ${req.method} ${req.path}` });
  });

  // ── Centralized error handler (must be last) ─────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
