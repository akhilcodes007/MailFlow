/**
 * src/index.js
 * Server entry point.
 * Validates env → connects to MongoDB → starts Express.
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { validateEnv } = require('./config/env');
const { connectDB } = require('./config/database');
const { createApp } = require('./app');

validateEnv();

const PORT = parseInt(process.env.PORT, 10) || 5000;

async function start() {
  try {
    await connectDB();

    const app = createApp();

    const server = app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════╗
║        MailFlow API Server — Phase 1         ║
╠══════════════════════════════════════════════╣
║  Environment : ${(process.env.NODE_ENV || 'development').padEnd(28)}║
║  Port        : ${String(PORT).padEnd(28)}║
║  Health      : http://localhost:${PORT}/api/health${' '.repeat(Math.max(0, 12 - String(PORT).length))}║
║  Mode        : DRY-RUN (no real emails sent) ║
╚══════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n[SERVER] ${signal} received — shutting down gracefully...`);
      server.close(() => {
        console.log('[SERVER] HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('[SERVER] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
