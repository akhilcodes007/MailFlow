/**
 * client/src/lib/recipientParser.js
 * Browser-side parsing and validation for CSV, XLSX, XLS, and manual entry.
 * Uses SheetJS (xlsx) for zero-dependency client file parsing.
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_RECIPIENTS_LIMIT = 500;

export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validate a single email address syntax.
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return EMAIL_REGEX.test(trimmed) && trimmed.length <= 254;
}

/**
 * Normalizes email address (lowercase and trimmed).
 */
export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

/**
 * Automatically inspects headers or sample rows to identify the email and name column keys.
 */
export function detectColumns(rows, headers) {
  let emailCol = '';
  let nameCol = '';

  // 1. Header name heuristic
  const emailKeywords = ['email', 'e-mail', 'mail', 'emailaddress', 'email_address', 'to', 'recipient'];
  const nameKeywords = ['name', 'fullname', 'full_name', 'first_name', 'firstname', 'displayname', 'recipient_name'];

  for (const h of headers) {
    const norm = String(h).toLowerCase().replace(/[^a-z]/g, '');
    if (!emailCol && emailKeywords.some((k) => norm.includes(k))) {
      emailCol = h;
    }
    if (!nameCol && nameKeywords.some((k) => norm.includes(k))) {
      nameCol = h;
    }
  }

  // 2. Fallback: inspect actual data cells for email pattern
  if (!emailCol && rows.length > 0) {
    const sample = rows.slice(0, 15);
    for (const h of headers) {
      const matchCount = sample.filter((r) => isValidEmail(String(r[h]))).length;
      if (matchCount >= Math.min(3, sample.length)) {
        emailCol = h;
        break;
      }
    }
  }

  return { emailCol, nameCol };
}

/**
 * Parse an uploaded file (CSV, XLSX, XLS) into structured rows and column headers.
 * Dynamically imports SheetJS so it is only loaded on demand.
 */
export async function parseFile(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds 5MB limit.`);
  }

  const validExtensions = ['.csv', '.xlsx', '.xls'];
  const fileName = file.name.toLowerCase();
  const hasValidExt = validExtensions.some((ext) => fileName.endsWith(ext));
  if (!hasValidExt) {
    throw new Error('Unsupported file format. Please upload a .csv, .xlsx, or .xls file.');
  }

  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Workbook contains no sheets.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!jsonData || jsonData.length === 0) {
    throw new Error('File is empty or could not be parsed.');
  }

  const headers = Object.keys(jsonData[0] || {});
  const { emailCol, nameCol } = detectColumns(jsonData, headers);

  return {
    rows: jsonData,
    headers,
    detectedEmailCol: emailCol,
    detectedNameCol: nameCol,
    sheetName: firstSheetName,
  };
}

/**
 * Validates, deduplicates, and classifies an array of recipient objects.
 */
export function validateAndClassifyRecipients(rawList) {
  const seenEmails = new Set();
  const valid = [];
  const invalid = [];
  const duplicates = [];

  rawList.forEach((item, index) => {
    const rawEmail = typeof item === 'string' ? item : item.email;
    const rawName = typeof item === 'object' ? item.name || '' : '';
    const email = normalizeEmail(rawEmail);
    const name = String(rawName || '').trim();

    const recipientObj = {
      id: `rec-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: email || String(rawEmail || '').trim(),
      name,
      originalIndex: index + 1,
    };

    if (!email) {
      invalid.push({ ...recipientObj, reason: 'Missing email address' });
    } else if (!isValidEmail(email)) {
      invalid.push({ ...recipientObj, reason: 'Invalid email syntax' });
    } else if (seenEmails.has(email)) {
      duplicates.push({ ...recipientObj, reason: 'Duplicate in imported list' });
    } else {
      seenEmails.add(email);
      valid.push(recipientObj);
    }
  });

  return {
    valid,
    invalid,
    duplicates,
    total: rawList.length,
    counts: {
      total: rawList.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicates: duplicates.length,
    },
  };
}

/**
 * Parse manual text (chips or multi-line paste) separated by commas, semicolons, or newlines.
 */
export function parseManualRecipientsText(text) {
  if (!text || !text.trim()) return [];

  // Match items separated by newlines, commas, or semicolons
  const lines = text.split(/[\r\n;,]+/).map((s) => s.trim()).filter(Boolean);

  const results = [];
  for (const line of lines) {
    // Check if line format is "email, name" or "name <email>"
    const angleMatch = line.match(/^([^<]+)<([^>]+)>$/);
    if (angleMatch) {
      results.push({ name: angleMatch[1].trim(), email: angleMatch[2].trim() });
      continue;
    }

    const commaSplit = line.split(',');
    if (commaSplit.length >= 2) {
      results.push({ email: commaSplit[0].trim(), name: commaSplit.slice(1).join(',').trim() });
    } else {
      results.push({ email: line.trim(), name: '' });
    }
  }

  return results;
}

/**
 * Generates and downloads a CSV report of invalid rows.
 */
export function downloadInvalidReport(invalidRows) {
  if (!invalidRows || invalidRows.length === 0) return;

  const csvRows = [
    ['Row Number', 'Email', 'Name', 'Failure Reason'],
    ...invalidRows.map((r) => [r.originalIndex || 'N/A', `"${r.email || ''}"`, `"${r.name || ''}"`, `"${r.reason || 'Invalid'}"`]),
  ];

  const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `invalid_recipients_report_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
