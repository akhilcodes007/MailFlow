/**
 * src/models/WebhookEvent.js
 * Records processed SendGrid event IDs (sg_event_id) to prevent duplicate processing.
 */
'use strict';

const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    messageId: { type: String, index: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// TTL index to automatically clean up older webhook deduplication records after 30 days
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
