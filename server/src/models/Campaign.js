/**
 * src/models/Campaign.js
 * A Campaign represents one bulk-email send job.
 */
'use strict';

const mongoose = require('mongoose');

const MAX_RECIPIENTS = parseInt(process.env.MAX_RECIPIENTS_PER_CAMPAIGN, 10) || 500;

const recipientSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Must be a valid email address'],
    },
    name: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending', 'processing', 'accepted', 'delivered', 'bounced', 'failed', 'dry-run'],
      default: 'pending',
    },
    providerMessageId: { type: String, index: true },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    bouncedAt: { type: Date },
  },
  { _id: true }
);

const campaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Campaign name is required'],
      trim: true,
      maxlength: [120, 'Campaign name cannot exceed 120 characters'],
    },
    subject: {
      type: String,
      required: [true, 'Email subject is required'],
      trim: true,
      maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    body: {
      type: String,
      required: [true, 'Email body is required'],
      maxlength: [50000, 'Body cannot exceed 50,000 characters'],
    },
    fromName: {
      type: String,
      trim: true,
      maxlength: [80, 'From name cannot exceed 80 characters'],
    },
    fromEmail: {
      type: String,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Must be a valid email address'],
    },
    recipients: {
      type: [recipientSchema],
      validate: {
        validator: (arr) => arr.length > 0 && arr.length <= MAX_RECIPIENTS,
        message: `Recipients must be between 1 and ${MAX_RECIPIENTS}`,
      },
    },
    status: {
      type: String,
      enum: ['draft', 'sending', 'completed', 'failed', 'dry-run'],
      default: 'draft',
    },
    mode: {
      type: String,
      enum: ['live', 'dry-run'],
      default: 'dry-run',
    },
    startedAt: { type: Date },
    sentAt: { type: Date },
    completedAt: { type: Date },
    errorDetails: { type: String },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    stats: {
      total: { type: Number, default: 0 },
      accepted: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      dryRun: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Indexes for high performance querying
campaignSchema.index({ createdBy: 1, createdAt: -1 });
campaignSchema.index({ status: 1 });
campaignSchema.index({ createdAt: -1 });
campaignSchema.index({ 'recipients.providerMessageId': 1 });

// Helper method to recompute aggregate stats
campaignSchema.methods.recomputeStats = function () {
  const counts = this.recipients.reduce(
    (acc, r) => {
      if (r.status === 'delivered') acc.delivered += 1;
      else if (r.status === 'accepted') acc.accepted += 1;
      else if (r.status === 'bounced') acc.bounced += 1;
      else if (r.status === 'failed') acc.failed += 1;
      else if (r.status === 'dry-run') acc.dryRun += 1;
      return acc;
    },
    { accepted: 0, delivered: 0, bounced: 0, failed: 0, dryRun: 0 }
  );

  this.stats = {
    total: this.recipients.length,
    accepted: counts.accepted,
    delivered: counts.delivered,
    bounced: counts.bounced,
    failed: counts.failed,
    dryRun: counts.dryRun,
  };
};

// Auto-compute stats before saving if recipients changed
campaignSchema.pre('save', function (next) {
  if (this.isModified('recipients')) {
    this.recomputeStats();
  }
  next();
});

module.exports = mongoose.model('Campaign', campaignSchema);
