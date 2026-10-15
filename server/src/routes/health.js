/**
 * src/routes/health.js
 * GET /api/health — server liveness + MongoDB connectivity check
 * GET /api/health/config — safe system status for admin Settings/Status page without exposing secrets.
 */
'use strict';

const express = require('express');
const { getConnectionStatus } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isSendGridConfigured } = require('../services/emailService');

const router = express.Router();

router.get('/', async (req, res) => {
  const db = getConnectionStatus();
  const isHealthy = db.readyState === 1;

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    service: 'mailflow-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: {
      state: db.state,
      connected: isHealthy,
    },
  });
});

// Authenticated safe configuration status for admin Settings page
router.get('/config', authenticate, async (req, res) => {
  const db = getConnectionStatus();
  const sendgridConfigured = isSendGridConfigured();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || '';
  const maskedFromEmail = fromEmail
    ? fromEmail.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}***${c}`)
    : 'Not configured';

  res.json({
    success: true,
    status: {
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 5000,
      database: {
        connected: db.readyState === 1,
        state: db.state,
      },
      emailProvider: {
        provider: 'Twilio SendGrid (@sendgrid/mail)',
        configured: sendgridConfigured,
        mode: sendgridConfigured ? 'live-ready (default dry-run)' : 'dry-run only',
        senderName: process.env.SENDGRID_FROM_NAME || 'MailFlow',
        senderEmailMasked: maskedFromEmail,
      },
      webhook: {
        signatureVerificationConfigured: Boolean(process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY),
        endpoint: '/api/webhooks/sendgrid',
      },
      limits: {
        maxRecipientsPerCampaign: parseInt(process.env.MAX_RECIPIENTS_PER_CAMPAIGN, 10) || 500,
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
        rateLimitWindowMinutes: Math.round((parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000) / 60000),
      },
      corsOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    },
  });
});

module.exports = router;
