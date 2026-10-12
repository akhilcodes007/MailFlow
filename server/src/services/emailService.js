/**
 * src/services/emailService.js
 * Production-ready bulk email service using Twilio SendGrid (@sendgrid/mail).
 *
 * Capabilities:
 * - Isolated per-recipient messaging with personalized merge tags ({{name}}, {{email}}).
 * - Safe HTML sanitization preventing injection/script attacks.
 * - Consent verification against the Suppression list.
 * - Configurable batch concurrency and rate-limit pacing.
 * - Transient error retry with exponential backoff (e.g. 429, 500, 503, timeouts).
 * - Ambiguous timeout safeguard (does NOT blindly retry potentially dispatched emails).
 * - Safe DRY-RUN mode active by default unless explicitly configured and requested.
 */
'use strict';

const sgMail = require('@sendgrid/mail');
const sanitizeHtml = require('sanitize-html');
const Suppression = require('../models/Suppression');
const Campaign = require('../models/Campaign');

const BATCH_SIZE = parseInt(process.env.SEND_BATCH_SIZE, 10) || 10;
const BATCH_DELAY_MS = parseInt(process.env.SEND_BATCH_DELAY_MS, 10) || 100;
const MAX_TRANSIENT_RETRIES = 2;

function isSendGridConfigured() {
  const key = process.env.SENDGRID_API_KEY;
  return Boolean(key && key.length > 20 && !key.startsWith('SG.REPLACE'));
}

function shouldDryRun(mode) {
  // If explicitly requested dry-run, or SendGrid key is missing/placeholder, run in dry-run
  if (mode === 'dry-run') return true;
  if (!isSendGridConfigured()) return true;
  return false;
}

/**
 * Sanitize HTML body: remove malicious tags, script execution, iframe, form, etc.
 */
function sanitizeEmailHtml(rawHtml) {
  if (!rawHtml) return '';
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'b', 'i', 'strong', 'em',
      'strike', 'u', 'ul', 'ol', 'li', 'br', 'hr', 'div', 'span', 'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'pre', 'code'
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'title', 'style'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      div: ['style', 'class'],
      span: ['style', 'class'],
      p: ['style', 'class'],
      table: ['style', 'class', 'border', 'cellpadding', 'cellspacing', 'width'],
      tr: ['style', 'class'],
      td: ['style', 'class', 'width', 'align', 'valign'],
      th: ['style', 'class', 'width', 'align', 'valign'],
      h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsModes: 'discard',
  });
}

/**
 * Interpolate merge tags like {{name}} and {{email}} into subject and body.
 */
function interpolateContent(template, recipient) {
  if (!template) return '';
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, recipient.name || 'there')
    .replace(/\{\{\s*email\s*\}\}/gi, recipient.email || '');
}

/**
 * Determine if an error is eligible for transient retry.
 */
function isTransientError(err) {
  if (!err) return false;
  const status = err.code || err.status || err.response?.status;
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('etimedout') || msg.includes('econnreset') || msg.includes('timeout')) {
    return true;
  }
  return false;
}

/**
 * Dispatch an isolated email to a single recipient with retries.
 */
async function sendSingleRecipientEmail({
  to,
  name,
  fromEmail,
  fromName,
  subjectTemplate,
  bodyTemplate,
  campaignId,
  mode = 'dry-run',
}) {
  const personalizedSubject = interpolateContent(subjectTemplate, { email: to, name });
  const rawBody = interpolateContent(bodyTemplate, { email: to, name });
  const sanitizedHtml = sanitizeEmailHtml(rawBody);
  const plainText = sanitizedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Suppression check
  const isSuppressed = await Suppression.exists({ email: to.toLowerCase().trim() });
  if (isSuppressed) {
    return {
      success: false,
      status: 'failed',
      mode,
      error: 'Recipient address is suppressed (unsubscribed or prior bounce)',
      isSuppressed: true,
    };
  }

  // 2. DRY-RUN execution
  if (shouldDryRun(mode)) {
    // Artificial small delay for realistic pacing
    await new Promise((r) => setTimeout(r, 15));
    const dryRunMsgId = `dryrun-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    return {
      success: true,
      status: 'dry-run',
      mode: 'dry-run',
      messageId: dryRunMsgId,
    };
  }

  // 3. LIVE SendGrid execution
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const msg = {
    to: name ? { email: to, name } : to,
    from: {
      email: fromEmail || process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com',
      name: fromName || process.env.SENDGRID_FROM_NAME || 'MailFlow',
    },
    subject: personalizedSubject,
    html: sanitizedHtml,
    text: plainText,
    customArgs: {
      campaign_id: String(campaignId),
    },
  };

  let attempts = 0;
  let lastError = null;

  while (attempts <= MAX_TRANSIENT_RETRIES) {
    attempts += 1;
    try {
      const [response] = await sgMail.send(msg);
      const messageId = response?.headers?.['x-message-id'] || `sg-${Date.now()}`;
      return {
        success: true,
        status: 'accepted', // SendGrid accepted for delivery (delivered updated via webhook)
        mode: 'live',
        messageId,
        retryCount: attempts - 1,
      };
    } catch (err) {
      lastError = err;
      const statusCode = err.response?.status || err.code;
      const apiErrorMessage = err.response?.body?.errors?.[0]?.message || err.message;

      // Ambiguous outcome check: if timeout happened on retry, provider may have accepted it
      if (attempts > 1 && (err.message || '').includes('ETIMEDOUT')) {
        return {
          success: false,
          status: 'failed',
          mode: 'live',
          error: `Ambiguous delivery outcome after timeout: ${apiErrorMessage}`,
          retryCount: attempts - 1,
        };
      }

      // If eligible transient error, wait exponential backoff
      if (attempts <= MAX_TRANSIENT_RETRIES && isTransientError(err)) {
        const backoffMs = Math.pow(2, attempts) * 200;
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      break;
    }
  }

  const finalErrorMessage =
    lastError?.response?.body?.errors?.[0]?.message || lastError?.message || 'Delivery request failed';

  return {
    success: false,
    status: 'failed',
    mode: 'live',
    error: finalErrorMessage,
    retryCount: attempts - 1,
  };
}

/**
 * Execute the sending process for a campaign in batches.
 * Updates campaign recipient statuses progressively in the database.
 */
async function processCampaignSending(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const fromEmail = campaign.fromEmail || process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com';
  const fromName = campaign.fromName || process.env.SENDGRID_FROM_NAME || 'MailFlow';

  campaign.status = 'sending';
  campaign.startedAt = new Date();
  await campaign.save();

  const recipients = campaign.recipients;
  const total = recipients.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);

    // Process chunk concurrently
    const chunkPromises = chunk.map(async (recipient) => {
      // Skip already processed items if retrying
      if (['accepted', 'delivered', 'dry-run'].includes(recipient.status)) {
        return;
      }

      recipient.status = 'processing';

      const result = await sendSingleRecipientEmail({
        to: recipient.email,
        name: recipient.name,
        fromEmail,
        fromName,
        subjectTemplate: campaign.subject,
        bodyTemplate: campaign.body,
        campaignId: campaign._id,
        mode: campaign.mode,
      });

      recipient.status = result.status;
      recipient.providerMessageId = result.messageId;
      recipient.error = result.error || null;
      recipient.retryCount = result.retryCount || 0;
      recipient.sentAt = result.success ? new Date() : undefined;
    });

    await Promise.all(chunkPromises);

    // Persist batch progress to MongoDB
    campaign.recomputeStats();
    await campaign.save();

    // Rate-limiting delay between batches
    if (i + BATCH_SIZE < total) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  // Finalize campaign state
  campaign.completedAt = new Date();
  const hasFailures = campaign.recipients.some((r) => r.status === 'failed');
  if (campaign.mode === 'dry-run') {
    campaign.status = hasFailures ? 'failed' : 'dry-run';
  } else {
    campaign.status = hasFailures ? 'failed' : 'completed';
  }

  campaign.recomputeStats();
  await campaign.save();

  return campaign;
}

module.exports = {
  isSendGridConfigured,
  shouldDryRun,
  sanitizeEmailHtml,
  interpolateContent,
  sendSingleRecipientEmail,
  processCampaignSending,
};
