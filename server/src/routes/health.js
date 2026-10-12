/**
 * src/routes/health.js
 * GET /api/health — server liveness + MongoDB connectivity check
 */
'use strict';

const express = require('express');
const { getConnectionStatus } = require('../config/database');

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

module.exports = router;
