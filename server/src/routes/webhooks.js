/**
 * src/routes/webhooks.js
 * SendGrid Event Webhook endpoint with cryptographic signature verification
 * and idempotent processing.
 */
'use strict';

const express = require('express');
const { EventWebhook, EventWebhookHeader } = require('@sendgrid/eventwebhook');
const WebhookEvent = require('../models/WebhookEvent');
const Campaign = require('../models/Campaign');
const Suppression = require('../models/Suppression');

const router = express.Router();
const eventWebhook = new EventWebhook();

router.post(
  '/sendgrid',
  // SendGrid events arrive as application/json
  async (req, res) => {
    const verificationKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

    // 1. Signature Verification
    if (verificationKey) {
      const signature = req.headers[EventWebhookHeader.SIGNATURE()] || req.headers['x-twilio-email-event-webhook-signature'];
      const timestamp = req.headers[EventWebhookHeader.TIMESTAMP()] || req.headers['x-twilio-email-event-webhook-timestamp'];
      const rawBody = req.rawBody || JSON.stringify(req.body);

      if (!signature || !timestamp) {
        return res.status(401).json({ success: false, message: 'Missing webhook signature headers' });
      }

      try {
        const isValid = eventWebhook.verifySignature(verificationKey, rawBody, signature, timestamp);
        if (!isValid) {
          return res.status(403).json({ success: false, message: 'Invalid webhook signature' });
        }
      } catch (err) {
        return res.status(403).json({ success: false, message: 'Signature verification failed', error: err.message });
      }
    } else if (process.env.NODE_ENV === 'production') {
      // In production, require signature verification key
      return res.status(500).json({
        success: false,
        message: 'SENDGRID_WEBHOOK_VERIFICATION_KEY is not configured on server',
      });
    }

    const events = Array.isArray(req.body) ? req.body : [req.body];
    let processedCount = 0;
    let duplicateCount = 0;

    for (const evt of events) {
      const eventId = evt.sg_event_id;
      if (!eventId) continue;

      // 2. Idempotency check: prevent duplicate event processing
      const alreadyProcessed = await WebhookEvent.exists({ eventId });
      if (alreadyProcessed) {
        duplicateCount += 1;
        continue;
      }

      const email = (evt.email || '').toLowerCase().trim();
      const eventType = evt.event; // 'delivered', 'bounce', 'dropped', 'spamreport', 'unsubscribe', etc.
      const rawMsgId = evt.sg_message_id || '';
      // Strip SendGrid sub-id suffix like .filterd... if present
      const messageId = rawMsgId.split('.')[0];
      const campaignId = evt.campaign_id;

      // Record event in WebhookEvent
      await WebhookEvent.create({
        eventId,
        eventType,
        email,
        campaignId: campaignId || null,
        messageId,
      });

      // Handle unsubscribes, spam reports, bounces by adding to Suppression list
      if (['unsubscribe', 'spamreport', 'bounce'].includes(eventType)) {
        await Suppression.findOneAndUpdate(
          { email },
          {
            email,
            reason: eventType === 'bounce' ? 'bounce' : 'unsubscribe',
            campaignId: campaignId || undefined,
            notes: evt.reason || `SendGrid event: ${eventType}`,
          },
          { upsert: true }
        );
      }

      // Update Campaign & Recipient status
      const query = {};
      if (campaignId) {
        query._id = campaignId;
      } else if (messageId) {
        query['recipients.providerMessageId'] = { $regex: new RegExp(`^${messageId}`) };
      }

      if (Object.keys(query).length > 0) {
        const campaign = await Campaign.findOne(query);
        if (campaign) {
          const recipient = campaign.recipients.find(
            (r) => r.email === email || (messageId && r.providerMessageId && r.providerMessageId.includes(messageId))
          );

          if (recipient) {
            if (eventType === 'delivered') {
              recipient.status = 'delivered';
              recipient.deliveredAt = new Date();
            } else if (['bounce', 'dropped'].includes(eventType)) {
              recipient.status = 'bounced';
              recipient.bouncedAt = new Date();
              recipient.error = evt.reason || 'Email bounced or dropped by provider';
            }

            campaign.recomputeStats();
            await campaign.save();
          }
        }
      }

      processedCount += 1;
    }

    return res.status(200).json({
      success: true,
      received: events.length,
      processed: processedCount,
      duplicates: duplicateCount,
    });
  }
);

module.exports = router;
