/**
 * src/models/Suppression.js
 * Tracks unsubscribed or bounced email addresses to guarantee compliance.
 * Promotional campaigns are blocked from dispatching to suppressed addresses.
 */
'use strict';

const mongoose = require('mongoose');

const suppressionSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ['unsubscribe', 'bounce', 'complaint', 'manual'],
      default: 'unsubscribe',
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Suppression', suppressionSchema);
