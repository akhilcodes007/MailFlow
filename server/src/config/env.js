/**
 * src/config/env.js
 * Validates required environment variables at startup.
 * The server refuses to start if critical variables are missing or insecure.
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const required = ['MONGODB_URI', 'JWT_SECRET'];

function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `\n[CONFIG ERROR] Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
        `Please verify your environment configuration.\n`
    );
    process.exit(1);
  }

  // Security enforcement in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET.length < 32) {
      console.error('[CONFIG ERROR] JWT_SECRET must be at least 32 characters in production.');
      process.exit(1);
    }

    if (process.env.ADMIN_PASSWORD && ['AdminPass123!', 'admin', 'password', '12345678'].includes(process.env.ADMIN_PASSWORD)) {
      console.error('[CONFIG ERROR] Insecure default ADMIN_PASSWORD detected in production. Change it to a secure passphrase.');
      process.exit(1);
    }
  }

  // Safe status notification (no secret values printed)
  const isSendGridActive = Boolean(
    process.env.SENDGRID_API_KEY &&
    process.env.SENDGRID_API_KEY.length > 20 &&
    !process.env.SENDGRID_API_KEY.startsWith('SG.REPLACE')
  );

  const hasFromEmail = Boolean(
    process.env.SENDGRID_FROM_EMAIL &&
    process.env.SENDGRID_FROM_EMAIL.trim().length > 0
  );

  if (hasFromEmail) {
    console.log('[CONFIG INFO] SENDGRID_FROM_EMAIL is configured.');
  } else {
    console.warn('[CONFIG WARN] SENDGRID_FROM_EMAIL is not configured. Live sending requires a verified sender identity.');
  }

  if (!isSendGridActive) {
    console.warn('[CONFIG INFO] SendGrid is unconfigured or in placeholder state. Email service active in DRY-RUN mode.');
  }

  return {
    isSendGridActive,
    isFromEmailConfigured: hasFromEmail,
  };
}

module.exports = { validateEnv };

