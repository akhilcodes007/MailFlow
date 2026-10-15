/**
 * server/tests/emailService.test.js
 * Unit tests for Email Service:
 * - HTML sanitization
 * - Merge tag interpolation
 * - Dry-run execution & safeguards
 * - Sender Identity enforcement (SENDGRID_FROM_EMAIL)
 * - Error handling & transient retries
 */
'use strict';

const sgMail = require('@sendgrid/mail');
const Suppression = require('../src/models/Suppression');
const Campaign = require('../src/models/Campaign');
const {
  sanitizeEmailHtml,
  interpolateContent,
  shouldDryRun,
  isSendGridConfigured,
  sendSingleRecipientEmail,
  processCampaignSending,
} = require('../src/services/emailService');

describe('Email Service Unit Tests', () => {
  describe('HTML Sanitization', () => {
    test('removes malicious script tags and inline javascript event handlers', () => {
      const maliciousHtml = `
        <h1>Welcome</h1>
        <script>alert("hacked")</script>
        <p onclick="alert('xss')">Click here</p>
        <a href="javascript:stealCookies()">Link</a>
      `;

      const sanitized = sanitizeEmailHtml(maliciousHtml);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).toContain('<h1>Welcome</h1>');
      expect(sanitized).toContain('<p>Click here</p>');
    });

    test('preserves legitimate email HTML elements, styles and links', () => {
      const legitHtml = `
        <div style="color: blue; padding: 10px;">
          <h2>Hello</h2>
          <p>Please visit our <a href="https://example.com" target="_blank">website</a>.</p>
          <img src="https://example.com/logo.png" alt="Logo" width="100" />
        </div>
      `;

      const sanitized = sanitizeEmailHtml(legitHtml);

      expect(sanitized).toContain('href="https://example.com"');
      expect(sanitized).toContain('src="https://example.com/logo.png"');
      expect(sanitized).toContain('color:blue');
      expect(sanitized).toContain('padding:10px');
    });
  });

  describe('Merge Tag Interpolation', () => {
    test('replaces {{name}} and {{email}} with recipient details', () => {
      const template = 'Hello {{name}}, your registered email is {{email}}.';
      const recipient = { name: 'Sarah Connor', email: 'sarah@skynet.org' };

      const result = interpolateContent(template, recipient);

      expect(result).toBe('Hello Sarah Connor, your registered email is sarah@skynet.org.');
    });

    test('handles whitespace variations inside merge tags e.g. {{  name  }}', () => {
      const template = 'Hi {{   name   }}!';
      const recipient = { name: 'Bob' };

      const result = interpolateContent(template, recipient);

      expect(result).toBe('Hi Bob!');
    });

    test('falls back gracefully when recipient name is missing', () => {
      const template = 'Hello {{name}}!';
      const recipient = { email: 'anonymous@example.com' };

      const result = interpolateContent(template, recipient);

      expect(result).toBe('Hello there!');
    });
  });

  describe('Dry-Run Safety Engine', () => {
    test('shouldDryRun returns true when mode is explicitly dry-run', () => {
      expect(shouldDryRun('dry-run')).toBe(true);
    });

    test('shouldDryRun returns true when SendGrid key is missing or placeholder', () => {
      const oldKey = process.env.SENDGRID_API_KEY;
      delete process.env.SENDGRID_API_KEY;

      expect(shouldDryRun('live')).toBe(true);

      process.env.SENDGRID_API_KEY = 'SG.REPLACE_WITH_KEY';
      expect(shouldDryRun('live')).toBe(true);

      process.env.SENDGRID_API_KEY = oldKey;
    });

    test('shouldDryRun returns true when SENDGRID_FROM_EMAIL is missing or empty', () => {
      const oldKey = process.env.SENDGRID_API_KEY;
      const oldEmail = process.env.SENDGRID_FROM_EMAIL;

      process.env.SENDGRID_API_KEY = 'SG.VALID_LENGTH_KEY_HERE_FOR_TESTING_123456';
      delete process.env.SENDGRID_FROM_EMAIL;

      expect(isSendGridConfigured()).toBe(false);
      expect(shouldDryRun('live')).toBe(true);

      process.env.SENDGRID_FROM_EMAIL = '   ';
      expect(isSendGridConfigured()).toBe(false);
      expect(shouldDryRun('live')).toBe(true);

      process.env.SENDGRID_API_KEY = oldKey;
      process.env.SENDGRID_FROM_EMAIL = oldEmail;
    });

    test('isSendGridConfigured returns true when both valid API key and FROM email are present', () => {
      const oldKey = process.env.SENDGRID_API_KEY;
      const oldEmail = process.env.SENDGRID_FROM_EMAIL;

      process.env.SENDGRID_API_KEY = 'SG.VALID_LENGTH_KEY_HERE_FOR_TESTING_123456';
      process.env.SENDGRID_FROM_EMAIL = 'verified@example.com';

      expect(isSendGridConfigured()).toBe(true);
      expect(shouldDryRun('live')).toBe(false);

      process.env.SENDGRID_API_KEY = oldKey;
      process.env.SENDGRID_FROM_EMAIL = oldEmail;
    });
  });

  describe('Sender Identity & Configured Sender Enforcement', () => {
    beforeEach(() => {
      jest.spyOn(Suppression, 'exists').mockResolvedValue(false);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('rejects sendSingleRecipientEmail when supplied fromEmail does not match SENDGRID_FROM_EMAIL', async () => {
      const oldFrom = process.env.SENDGRID_FROM_EMAIL;
      process.env.SENDGRID_FROM_EMAIL = 'verified@example.com';

      const result = await sendSingleRecipientEmail({
        to: 'recipient@example.com',
        fromEmail: 'unverified@different.com',
        subjectTemplate: 'Hello',
        bodyTemplate: 'World',
        mode: 'dry-run',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('From address does not match the verified Sender Identity');

      process.env.SENDGRID_FROM_EMAIL = oldFrom;
    });

    test('sendSingleRecipientEmail uses process.env.SENDGRID_FROM_EMAIL in live mode', async () => {
      const oldKey = process.env.SENDGRID_API_KEY;
      const oldFrom = process.env.SENDGRID_FROM_EMAIL;

      process.env.SENDGRID_API_KEY = 'SG.VALID_LENGTH_KEY_HERE_FOR_TESTING_123456';
      process.env.SENDGRID_FROM_EMAIL = 'verified-sender@example.com';

      let sentPayload = null;
      jest.spyOn(sgMail, 'setApiKey').mockImplementation(() => {});
      jest.spyOn(sgMail, 'send').mockImplementation(async (msg) => {
        sentPayload = msg;
        return [{ headers: { 'x-message-id': 'mocked-msg-id-123' } }];
      });

      const result = await sendSingleRecipientEmail({
        to: 'customer@example.com',
        name: 'Customer',
        subjectTemplate: 'Special Offer',
        bodyTemplate: 'Hello {{name}}',
        campaignId: 'camp-123',
        mode: 'live',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('accepted');
      expect(result.mode).toBe('live');
      expect(sentPayload).not.toBeNull();
      expect(sentPayload.from.email).toBe('verified-sender@example.com');

      process.env.SENDGRID_API_KEY = oldKey;
      process.env.SENDGRID_FROM_EMAIL = oldFrom;
    });

    test('processCampaignSending rejects campaign if campaign.fromEmail does not match SENDGRID_FROM_EMAIL', async () => {
      const oldFrom = process.env.SENDGRID_FROM_EMAIL;
      process.env.SENDGRID_FROM_EMAIL = 'verified@example.com';

      jest.spyOn(Campaign, 'findById').mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        fromEmail: 'unverified@malicious.com',
        mode: 'dry-run',
        recipients: [],
      });

      await expect(processCampaignSending('507f1f77bcf86cd799439011')).rejects.toThrow(
        'From address does not match the verified Sender Identity (SENDGRID_FROM_EMAIL)'
      );

      process.env.SENDGRID_FROM_EMAIL = oldFrom;
    });
  });
});
