/**
 * src/routes/campaigns.js
 * Endpoints for campaign creation, recipient validation, sending engine,
 * test email, campaign progress, recipient details, retry and suppression management.
 */
'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const Campaign = require('../models/Campaign');
const Suppression = require('../models/Suppression');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  processCampaignSending,
  sendSingleRecipientEmail,
  isSendGridConfigured,
  shouldDryRun,
} = require('../services/emailService');

const router = express.Router();
router.use(authenticate);

const MAX_RECIPIENTS = parseInt(process.env.MAX_RECIPIENTS_PER_CAMPAIGN, 10) || 500;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Helper to validate and clean a recipient list server-side.
 */
function cleanAndValidateRecipients(rawRecipients) {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  const duplicates = [];

  for (const item of rawRecipients) {
    const rawEmail = typeof item === 'string' ? item : item?.email;
    const name = typeof item === 'object' ? (item?.name || '').trim() : '';

    if (!rawEmail || typeof rawEmail !== 'string') {
      invalid.push({ email: '', name, reason: 'Missing email address' });
      continue;
    }

    const email = rawEmail.trim().toLowerCase();

    if (!EMAIL_REGEX.test(email) || email.length > 254) {
      invalid.push({ email, name, reason: 'Invalid email syntax' });
      continue;
    }

    if (seen.has(email)) {
      duplicates.push({ email, name, reason: 'Duplicate address' });
      continue;
    }

    seen.add(email);
    valid.push({ email, name });
  }

  return { valid, invalid, duplicates };
}

// ── 1. Validate recipients (pre-flight server-side check) ──────────────────────
router.post(
  '/validate-recipients',
  [
    body('recipients').isArray().withMessage('Recipients array is required'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { valid, invalid, duplicates } = cleanAndValidateRecipients(req.body.recipients);

      // Check against suppression list
      const validEmails = valid.map((r) => r.email);
      const suppressedDocs = await Suppression.find({ email: { $in: validEmails } }).select('email reason');
      const suppressedSet = new Map(suppressedDocs.map((s) => [s.email, s.reason]));

      const finalValid = [];
      const suppressed = [];

      for (const item of valid) {
        if (suppressedSet.has(item.email)) {
          suppressed.push({
            ...item,
            reason: `Suppressed (${suppressedSet.get(item.email)})`,
          });
        } else {
          finalValid.push(item);
        }
      }

      res.json({
        success: true,
        summary: {
          total: req.body.recipients.length,
          valid: finalValid.length,
          invalid: invalid.length,
          duplicates: duplicates.length,
          suppressed: suppressed.length,
          exceedsLimit: finalValid.length > MAX_RECIPIENTS,
          maxAllowed: MAX_RECIPIENTS,
        },
        valid: finalValid.slice(0, MAX_RECIPIENTS),
        invalid,
        duplicates,
        suppressed,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 2. Send test email to authenticated admin ──────────────────────────────────
router.post(
  '/test-email',
  [
    body('subject').trim().notEmpty().withMessage('Subject is required'),
    body('body').trim().notEmpty().withMessage('Body is required'),
    body('fromName').optional().trim(),
    body('fromEmail').optional().isEmail(),
    body('mode').optional().isIn(['live', 'dry-run']),
    validate,
  ],
  async (req, res, next) => {
    try {
      const adminEmail = req.user.email;
      const { subject, body: emailBody, fromName, fromEmail, mode = 'dry-run' } = req.body;

      const configuredFromEmail = (process.env.SENDGRID_FROM_EMAIL || '').trim();
      if (fromEmail && fromEmail.trim()) {
        if (!configuredFromEmail || fromEmail.trim().toLowerCase() !== configuredFromEmail.toLowerCase()) {
          return res.status(400).json({
            success: false,
            message: 'From address does not match the verified Sender Identity (SENDGRID_FROM_EMAIL)',
          });
        }
      }

      const result = await sendSingleRecipientEmail({
        to: adminEmail,
        name: req.user.name || 'User',
        fromEmail: configuredFromEmail,
        fromName,
        subjectTemplate: `[TEST] ${subject}`,
        bodyTemplate: emailBody,
        campaignId: 'test-preview',
        mode,
      });

      res.json({
        success: result.success,
        mode: result.mode,
        message: result.success
          ? `Test email processed for ${adminEmail} in ${result.mode} mode.`
          : `Test email failed: ${result.error}`,
        result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 3. Dashboard stats ─────────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [totals] = await Campaign.aggregate([
      { $match: { createdBy: req.user.id } },
      {
        $group: {
          _id: null,
          totalCampaigns: { $sum: 1 },
          totalRecipients: { $sum: '$stats.total' },
          totalAccepted: { $sum: '$stats.accepted' },
          totalDelivered: { $sum: '$stats.delivered' },
          totalBounced: { $sum: '$stats.bounced' },
          totalDryRun: { $sum: '$stats.dryRun' },
          totalFailed: { $sum: '$stats.failed' },
        },
      },
    ]);

    const recentCampaigns = await Campaign.find({ createdBy: req.user.id })
      .select('name status mode stats createdAt sentAt completedAt')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    res.json({
      success: true,
      stats: totals
        ? {
            totalCampaigns: totals.totalCampaigns,
            totalRecipients: totals.totalRecipients,
            totalAccepted: totals.totalAccepted,
            totalDelivered: totals.totalDelivered,
            totalBounced: totals.totalBounced,
            totalDryRun: totals.totalDryRun,
            totalFailed: totals.totalFailed,
          }
        : {
            totalCampaigns: 0,
            totalRecipients: 0,
            totalAccepted: 0,
            totalDelivered: 0,
            totalBounced: 0,
            totalDryRun: 0,
            totalFailed: 0,
          },
      recentCampaigns,
    });
  } catch (err) {
    next(err);
  }
});

// ── 4. List campaigns (with search & status filter) ───────────────────────────
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('status').optional().trim(),
    query('search').optional().trim(),
    validate,
  ],
  async (req, res, next) => {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 10;
      const skip = (page - 1) * limit;

      const filter = { createdBy: req.user.id };
      if (req.query.status && req.query.status !== 'all') {
        filter.status = req.query.status;
      }
      if (req.query.search) {
        filter.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { subject: { $regex: req.query.search, $options: 'i' } },
        ];
      }

      const [campaigns, total] = await Promise.all([
        Campaign.find(filter)
          .select('-recipients')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Campaign.countDocuments(filter),
      ]);

      res.json({
        success: true,
        campaigns,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 5. Create campaign ────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Campaign name is required').isLength({ max: 120 }),
    body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ max: 200 }),
    body('body').trim().notEmpty().withMessage('Email body is required').isLength({ max: 50000 }),
    body('fromName').optional().trim().isLength({ max: 80 }),
    body('fromEmail').optional().isEmail(),
    body('mode').optional().isIn(['live', 'dry-run']),
    body('recipients').isArray({ min: 1 }).withMessage('At least one recipient is required'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const configuredFromEmail = (process.env.SENDGRID_FROM_EMAIL || '').trim();
      if (req.body.fromEmail && req.body.fromEmail.trim()) {
        if (!configuredFromEmail || req.body.fromEmail.trim().toLowerCase() !== configuredFromEmail.toLowerCase()) {
          return res.status(400).json({
            success: false,
            message: 'From address does not match the verified Sender Identity (SENDGRID_FROM_EMAIL)',
          });
        }
      }

      // Validate recipients server-side
      const { valid } = cleanAndValidateRecipients(req.body.recipients);

      if (valid.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid recipient email addresses found' });
      }

      if (valid.length > MAX_RECIPIENTS) {
        return res.status(400).json({
          success: false,
          message: `Recipients count (${valid.length}) exceeds maximum limit (${MAX_RECIPIENTS})`,
        });
      }

      // Check suppressions
      const validEmails = valid.map((r) => r.email);
      const suppressedList = await Suppression.find({ email: { $in: validEmails } }).select('email');
      const suppressedEmails = new Set(suppressedList.map((s) => s.email));

      const recipientsToStore = valid
        .filter((r) => !suppressedEmails.has(r.email))
        .map((r) => ({
          email: r.email,
          name: r.name || '',
          status: 'pending',
        }));

      if (recipientsToStore.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'All provided recipients are currently in the suppression list',
        });
      }

      const mode = req.body.mode === 'live' && isSendGridConfigured() ? 'live' : 'dry-run';

      const campaign = new Campaign({
        name: req.body.name,
        subject: req.body.subject,
        body: req.body.body,
        fromName: req.body.fromName || '',
        fromEmail: configuredFromEmail,
        recipients: recipientsToStore,
        mode,
        status: 'draft',
        createdBy: req.user.id,
      });

      campaign.recomputeStats();
      await campaign.save();

      res.status(201).json({ success: true, campaign });
    } catch (err) {
      next(err);
    }
  }
);

// ── 6. Suppression management routes (declared before /:id to prevent route shadowing) ──
router.get('/suppressions', async (req, res, next) => {
  try {
    const suppressions = await Suppression.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, suppressions });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/suppressions',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('reason').optional().isIn(['unsubscribe', 'bounce', 'complaint', 'manual']),
    validate,
  ],
  async (req, res, next) => {
    try {
      const email = req.body.email.toLowerCase().trim();
      const suppression = await Suppression.findOneAndUpdate(
        { email },
        { email, reason: req.body.reason || 'manual' },
        { upsert: true, new: true }
      );
      res.json({ success: true, suppression });
    } catch (err) {
      next(err);
    }
  }
);

// Only admins may delete global suppressions to protect deliverability and safety
router.delete('/suppressions/:email', requireRole('admin'), async (req, res, next) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    await Suppression.findOneAndDelete({ email });
    res.json({ success: true, message: 'Email removed from suppression list' });
  } catch (err) {
    next(err);
  }
});

// ── 7. Get single campaign details ─────────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid campaign ID'), validate],
  async (req, res, next) => {
    try {
      const campaign = await Campaign.findOne({ _id: req.params.id, createdBy: req.user.id });
      if (!campaign) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      res.json({ success: true, campaign });
    } catch (err) {
      next(err);
    }
  }
);

// ── 7. Get campaign progress / per-recipient status (paginated) ────────────────
router.get(
  '/:id/progress',
  [param('id').isMongoId().withMessage('Invalid campaign ID'), validate],
  async (req, res, next) => {
    try {
      const campaign = await Campaign.findOne({ _id: req.params.id, createdBy: req.user.id }).select(
        'name status mode stats startedAt completedAt sentAt recipients'
      );
      if (!campaign) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      const total = campaign.recipients.length;
      const processed = campaign.recipients.filter((r) => r.status !== 'pending' && r.status !== 'processing').length;
      const progressPercent = total > 0 ? Math.round((processed / total) * 100) : 100;

      res.json({
        success: true,
        id: campaign._id,
        name: campaign.name,
        status: campaign.status,
        mode: campaign.mode,
        stats: campaign.stats,
        total,
        processed,
        progressPercent,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 8. Start campaign send / dry-run ───────────────────────────────────────────
router.post(
  '/:id/send',
  [param('id').isMongoId().withMessage('Invalid campaign ID'), validate],
  async (req, res, next) => {
    try {
      // Atomic status transition check to prevent concurrent runs / race conditions
      const campaign = await Campaign.findOneAndUpdate(
        {
          _id: req.params.id,
          createdBy: req.user.id,
          status: { $in: ['draft', 'failed'] }, // only draft or failed can be started
        },
        { status: 'sending', startedAt: new Date() },
        { new: true }
      );

      if (!campaign) {
        return res.status(409).json({
          success: false,
          message: 'Campaign is either already processing, completed, or does not exist.',
        });
      }

      const configuredFromEmail = (process.env.SENDGRID_FROM_EMAIL || '').trim();
      if (campaign.fromEmail && campaign.fromEmail.trim()) {
        if (!configuredFromEmail || campaign.fromEmail.trim().toLowerCase() !== configuredFromEmail.toLowerCase()) {
          campaign.status = 'draft';
          await campaign.save();
          return res.status(400).json({
            success: false,
            message: 'Campaign From address does not match the verified Sender Identity (SENDGRID_FROM_EMAIL)',
          });
        }
      }

      // Check mode override if explicitly requested
      if (req.body.mode) {
        campaign.mode = req.body.mode === 'live' && isSendGridConfigured() ? 'live' : 'dry-run';
        await campaign.save();
      }

      // Process sending asynchronously or run inline
      // We run processCampaignSending and await it to update statuses
      const updatedCampaign = await processCampaignSending(campaign._id);

      res.json({
        success: true,
        message:
          updatedCampaign.mode === 'live'
            ? 'Campaign processed in LIVE mode.'
            : 'Campaign processed in DRY-RUN mode (safe simulation).',
        campaign: {
          id: updatedCampaign._id,
          status: updatedCampaign.status,
          mode: updatedCampaign.mode,
          stats: updatedCampaign.stats,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 9. Retry failed recipients in a campaign ──────────────────────────────────
router.post(
  '/:id/retry-failed',
  [param('id').isMongoId().withMessage('Invalid campaign ID'), validate],
  async (req, res, next) => {
    try {
      const campaign = await Campaign.findOne({ _id: req.params.id, createdBy: req.user.id });
      if (!campaign) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      const configuredFromEmail = (process.env.SENDGRID_FROM_EMAIL || '').trim();
      if (campaign.fromEmail && campaign.fromEmail.trim()) {
        if (!configuredFromEmail || campaign.fromEmail.trim().toLowerCase() !== configuredFromEmail.toLowerCase()) {
          return res.status(400).json({
            success: false,
            message: 'Campaign From address does not match the verified Sender Identity (SENDGRID_FROM_EMAIL)',
          });
        }
      }

      const failedRecipients = campaign.recipients.filter((r) => r.status === 'failed');
      if (failedRecipients.length === 0) {
        return res.status(400).json({ success: false, message: 'No failed recipients found to retry' });
      }

      // Reset failed recipients to pending
      failedRecipients.forEach((r) => {
        r.status = 'pending';
        r.error = null;
      });

      campaign.status = 'draft';
      campaign.recomputeStats();
      await campaign.save();

      // Trigger send
      const updatedCampaign = await processCampaignSending(campaign._id);

      res.json({
        success: true,
        message: `Retried ${failedRecipients.length} failed recipients.`,
        campaign: {
          id: updatedCampaign._id,
          status: updatedCampaign.status,
          stats: updatedCampaign.stats,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── 10. Delete campaign ────────────────────────────────────────────────────────
router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid campaign ID'), validate],
  async (req, res, next) => {
    try {
      const campaign = await Campaign.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id });
      if (!campaign) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      res.json({ success: true, message: 'Campaign deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;

