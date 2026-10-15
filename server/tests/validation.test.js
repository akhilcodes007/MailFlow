/**
 * server/tests/validation.test.js
 * Unit tests for email syntax validation, normalization, and deduplication logic.
 */
'use strict';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function cleanAndValidate(recipients) {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  const duplicates = [];

  for (const item of recipients) {
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

describe('Recipient Validation & Deduplication', () => {
  test('correctly accepts valid RFC 5322 email addresses', () => {
    const input = [
      { email: 'user@example.com', name: 'User' },
      { email: 'first.last+tag@sub.domain.co.uk', name: 'Tag User' },
      { email: 'simple123@domain.org', name: '' },
    ];
    const { valid, invalid, duplicates } = cleanAndValidate(input);

    expect(valid).toHaveLength(3);
    expect(invalid).toHaveLength(0);
    expect(duplicates).toHaveLength(0);
  });

  test('normalizes email addresses to lowercase and strips surrounding whitespace', () => {
    const input = [{ email: '  ALICE@EXAMPLE.COM  ', name: 'Alice' }];
    const { valid } = cleanAndValidate(input);

    expect(valid[0].email).toBe('alice@example.com');
  });

  test('catches malformed syntax as invalid', () => {
    const input = [
      { email: 'plainaddress', name: 'No At' },
      { email: '@missingusername.com', name: 'No User' },
      { email: 'username@.com', name: 'No Domain' },
      { email: 'user@domain..com', name: 'Double Dot' },
      { email: '', name: 'Empty' },
    ];
    const { valid, invalid } = cleanAndValidate(input);

    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(5);
  });

  test('identifies and separates duplicate email addresses', () => {
    const input = [
      { email: 'test@example.com', name: 'First' },
      { email: 'test@example.com', name: 'Duplicate Exact' },
      { email: 'TEST@EXAMPLE.COM', name: 'Duplicate Case' },
      { email: 'other@example.com', name: 'Other' },
    ];
    const { valid, duplicates } = cleanAndValidate(input);

    expect(valid).toHaveLength(2);
    expect(duplicates).toHaveLength(2);
    expect(valid.map((v) => v.email)).toEqual(['test@example.com', 'other@example.com']);
  });
});
