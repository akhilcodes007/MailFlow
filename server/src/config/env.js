/**
 * src/config/env.js
 * Validates required environment variables at startup.
 * The server refuses to start if critical variables are missing.
 */
'use strict';

const required = ['MONGODB_URI', 'JWT_SECRET'];

function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `\n[CONFIG ERROR] Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
        `Copy server/.env.example to server/.env and fill in real values.\n`
    );
    process.exit(1);
  }

  // Warn about weak JWT secret in production
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.JWT_SECRET.length < 32
  ) {
    console.error('[CONFIG ERROR] JWT_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }

  // Warn if SendGrid key is missing (dry-run mode)
  if (!process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY.startsWith('SG.REPLACE')) {
    console.warn(
      '[CONFIG WARN] SENDGRID_API_KEY is not configured. Email service will run in DRY-RUN mode.'
    );
  }
}

module.exports = { validateEnv };
