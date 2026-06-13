import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import Fuse from 'fuse.js';

dayjs.extend(customParseFormat);

// Canonical member names from the CSV story
const KNOWN_MEMBERS = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Dev', 'Sam'];

// Membership timeline (from the story)
const MEMBERSHIP_TIMELINE = {
  Aisha: { joinedAt: '2026-02-01', leftAt: null },
  Rohan: { joinedAt: '2026-02-01', leftAt: null },
  Priya: { joinedAt: '2026-02-01', leftAt: null },
  Meera: { joinedAt: '2026-02-01', leftAt: '2026-03-31' },
  Dev:   { joinedAt: '2026-03-08', leftAt: '2026-03-14' }, // trip only
  Sam:   { joinedAt: '2026-04-10', leftAt: null },
};

// Settlement detection keywords
const SETTLEMENT_KEYWORDS = [
  'paid back', 'paid aisha', 'paid rohan', 'paid priya', 'paid meera', 'paid sam', 'paid dev',
  'settlement', 'settled', 'deposit share', 'deposit', 'repaid', 'reimburs',
];

// Near-duplicate detection: same date + same participants + fuzzy description
const DATE_FORMATS = [
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MMM-DD',
  'MMM DD',
  'D-MMM-YYYY',
];

/**
 * Parse date string with multiple format fallbacks.
 * Returns { date: Date|null, format: string|null, ambiguous: boolean }
 */
export function parseDate(str) {
  if (!str || !str.trim()) return { date: null, format: null, ambiguous: false };
  const s = str.trim();

  // Try dominant format first (DD-MM-YYYY from the CSV)
  for (const fmt of DATE_FORMATS) {
    const parsed = dayjs(s, fmt, true);
    if (parsed.isValid()) {
      // Check if MM-DD-YYYY also parses differently (ambiguous)
      let ambiguous = false;
      if (fmt === 'DD-MM-YYYY') {
        const altParsed = dayjs(s, 'MM-DD-YYYY', true);
        if (altParsed.isValid() && altParsed.toISOString() !== parsed.toISOString()) {
          ambiguous = true;
        }
      }
      // Handle MMM-DD (like "Mar-14") → assume current year or 2026
      let finalDate = parsed.toDate();
      if (fmt === 'MMM-DD') {
        finalDate = dayjs(`${s}-2026`, 'MMM-DD-YYYY').toDate();
      }
      return { date: finalDate, format: fmt, ambiguous };
    }
  }

  return { date: null, format: null, ambiguous: false };
}

/**
 * Parse amount string — handles commas, extra decimals.
 */
export function parseAmount(str) {
  if (str === null || str === undefined || str === '') return null;
  const cleaned = String(str).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return +num.toFixed(2);
}

/**
 * Normalize member name — fuzzy match to canonical names.
 */
export function normalizeName(name, knownNames = KNOWN_MEMBERS) {
  if (!name || !name.trim()) return { canonical: null, confidence: 0, exact: false };
  const trimmed = name.trim();

  // Exact match (case-insensitive)
  const exact = knownNames.find(n => n.toLowerCase() === trimmed.toLowerCase());
  if (exact) return { canonical: exact, confidence: 1.0, exact: true };

  // Fuzzy match
  const fuse = new Fuse(knownNames, { threshold: 0.4 });
  const results = fuse.search(trimmed);
  if (results.length > 0) {
    return {
      canonical: results[0].item,
      confidence: 1 - results[0].score,
      exact: false,
      original: trimmed,
    };
  }

  return { canonical: null, confidence: 0, exact: false, original: trimmed };
}

/**
 * Parse split members from split_with and split_details strings.
 */
export function parseSplitMembers(splitWith, splitDetails, splitType) {
  if (!splitWith) return { members: [], warnings: [] };
  const warnings = [];

  const names = splitWith.split(';').map(n => n.trim()).filter(Boolean);
  const members = [];

  if (splitType === 'unequal' || splitType === 'percentage' || splitType === 'share') {
    // Parse split_details: "Rohan 700; Priya 400; Meera 400" or "Aisha 30%; ..."
    if (!splitDetails) {
      warnings.push(`Split type '${splitType}' requires split_details but it's missing`);
      return { members: names.map(n => ({ name: n, value: null })), warnings };
    }

    const detailParts = splitDetails.split(';').map(d => d.trim()).filter(Boolean);
    const detailMap = {};
    for (const part of detailParts) {
      const match = part.match(/^(.+?)\s+([\d.]+)%?$/);
      if (match) {
        detailMap[match[1].trim().toLowerCase()] = parseFloat(match[2]);
      }
    }

    for (const name of names) {
      const key = name.toLowerCase();
      const value = detailMap[key];
      members.push({ name, value: value ?? null });
      if (value === undefined) {
        warnings.push(`No split detail found for member '${name}'`);
      }
    }
  } else {
    // Equal split — just names
    members.push(...names.map(n => ({ name: n, value: 1 })));
  }

  return { members, warnings };
}

/**
 * Detect if a row is likely a settlement.
 */
export function detectSettlement(row) {
  const desc = (row.description || '').toLowerCase();
  const isKeyword = SETTLEMENT_KEYWORDS.some(kw => desc.includes(kw));
  const noSplitType = !row.split_type || !row.split_type.trim();
  const singleRecipient = row.split_with && !row.split_with.includes(';');
  return { isSettlement: isKeyword || (noSplitType && singleRecipient), reason: isKeyword ? 'keyword' : 'no_split_type' };
}

/**
 * Check if a member was active on a given date.
 */
export function isMemberActiveOnDate(memberName, date) {
  const timeline = MEMBERSHIP_TIMELINE[memberName];
  if (!timeline) return { active: false, reason: 'not_in_timeline' };

  const expDate = dayjs(date);
  const joinDate = dayjs(timeline.joinedAt);
  const leftDate = timeline.leftAt ? dayjs(timeline.leftAt) : null;

  if (expDate.isBefore(joinDate)) {
    return { active: false, reason: `${memberName} hadn't joined yet (joined ${timeline.joinedAt})` };
  }
  if (leftDate && expDate.isAfter(leftDate)) {
    return { active: false, reason: `${memberName} had left by ${timeline.leftAt}` };
  }
  return { active: true };
}

/**
 * Master anomaly detector.
 * Runs all checks on a single parsed CSV row.
 * Returns array of anomaly objects.
 */
export function detectAnomalies(row, rowIndex, allRows) {
  const anomalies = [];
  const addAnomaly = (type, description, severity, meta = {}) => {
    anomalies.push({ type, description, severity, rowIndex, rowData: row, ...meta });
  };

  // 1. Missing payer
  if (!row.paid_by || !row.paid_by.trim()) {
    addAnomaly('MISSING_PAYER', `Row ${rowIndex}: paid_by is empty. Notes: "${row.notes}"`, 'error');
  }

  // 2. Name casing / fuzzy match
  if (row.paid_by && row.paid_by.trim()) {
    const norm = normalizeName(row.paid_by.trim());
    if (!norm.exact && norm.canonical) {
      addAnomaly('NAME_CASING', `Row ${rowIndex}: paid_by "${row.paid_by}" normalized to "${norm.canonical}"`, 'warning', { normalized: norm.canonical });
    } else if (!norm.canonical) {
      addAnomaly('UNKNOWN_MEMBER', `Row ${rowIndex}: paid_by "${row.paid_by}" is not a known member`, 'error', { original: row.paid_by });
    }
  }

  // 3. Amount parsing — comma-formatted
  const rawAmount = row.amount;
  if (typeof rawAmount === 'string' && rawAmount.includes(',')) {
    addAnomaly('COMMA_AMOUNT', `Row ${rowIndex}: amount "${rawAmount}" has comma formatting, will be parsed as ${parseAmount(rawAmount)}`, 'info', { parsed: parseAmount(rawAmount) });
  }

  // 4. Amount missing or zero
  const amount = parseAmount(row.amount);
  if (amount === null) {
    addAnomaly('MISSING_AMOUNT', `Row ${rowIndex}: amount is missing or unparseable`, 'error');
  } else if (amount === 0) {
    addAnomaly('ZERO_AMOUNT', `Row ${rowIndex}: amount is ₹0 — "${row.description}". Notes: "${row.notes}". Will be skipped.`, 'warning');
  } else if (amount < 0) {
    addAnomaly('NEGATIVE_AMOUNT', `Row ${rowIndex}: amount is negative (${amount}) — treating as refund for "${row.description}"`, 'warning', { isRefund: true });
  }

  // 5. Excessive decimal precision
  if (amount !== null && amount !== parseFloat(row.amount?.toString().replace(/,/g, ''))) {
    const raw = parseFloat(row.amount?.toString().replace(/,/g, ''));
    if (raw !== Math.round(raw * 100) / 100) {
      addAnomaly('EXCESS_PRECISION', `Row ${rowIndex}: amount "${row.amount}" rounded to ${amount}`, 'info', { original: raw, rounded: amount });
    }
  }

  // 6. Missing currency
  if (!row.currency || !row.currency.trim()) {
    addAnomaly('MISSING_CURRENCY', `Row ${rowIndex}: currency is missing for "${row.description}". Defaulting to INR.`, 'warning', { defaulted: 'INR' });
  }

  // 7. Foreign currency (USD etc.)
  if (row.currency && row.currency.trim() && row.currency.trim() !== 'INR') {
    addAnomaly('FOREIGN_CURRENCY', `Row ${rowIndex}: amount is in ${row.currency} (${row.amount} ${row.currency}) — will fetch historical exchange rate`, 'info', { currency: row.currency.trim() });
  }

  // 8. Date parsing
  const { date, format, ambiguous } = parseDate(row.date);
  if (!date) {
    addAnomaly('INVALID_DATE', `Row ${rowIndex}: cannot parse date "${row.date}"`, 'error');
  } else if (ambiguous) {
    addAnomaly('AMBIGUOUS_DATE', `Row ${rowIndex}: date "${row.date}" is ambiguous (DD-MM or MM-DD?). Defaulting to DD-MM-YYYY → ${dayjs(date).format('YYYY-MM-DD')}`, 'warning', { parsedAs: dayjs(date).format('YYYY-MM-DD') });
  } else if (format !== 'DD-MM-YYYY') {
    addAnomaly('DATE_FORMAT', `Row ${rowIndex}: date "${row.date}" not in standard DD-MM-YYYY format (parsed using ${format})`, 'info', { parsedAs: dayjs(date).format('YYYY-MM-DD') });
  }

  // 9. Settlement detection
  const { isSettlement, reason } = detectSettlement(row);
  if (isSettlement) {
    addAnomaly('PROBABLE_SETTLEMENT', `Row ${rowIndex}: "${row.description}" looks like a settlement (${reason}), not an expense`, 'warning', { settlementReason: reason });
  }

  // 10. Missing split_type (when not a settlement)
  if (!isSettlement && (!row.split_type || !row.split_type.trim())) {
    addAnomaly('MISSING_SPLIT_TYPE', `Row ${rowIndex}: split_type is empty for "${row.description}"`, 'error');
  }

  // 11. Percentage sum validation
  if (row.split_type === 'percentage' && row.split_details) {
    const pcts = [...row.split_details.matchAll(/([\d.]+)%/g)].map(m => parseFloat(m[1]));
    const total = pcts.reduce((s, p) => s + p, 0);
    if (Math.abs(total - 100) > 0.1) {
      addAnomaly('PERCENTAGE_SUM', `Row ${rowIndex}: percentages sum to ${total}% (not 100%) in "${row.description}"`, 'error', { percentageTotal: total, percentages: pcts });
    }
  }

  // 12. Non-members in split_with
  if (row.split_with) {
    const splitNames = row.split_with.split(';').map(n => n.trim()).filter(Boolean);
    for (const name of splitNames) {
      const norm = normalizeName(name);
      if (!norm.canonical && name.toLowerCase() !== 'all') {
        addAnomaly('UNKNOWN_SPLIT_MEMBER', `Row ${rowIndex}: "${name}" in split_with is not a known member`, 'warning', { unknownMember: name });
      }
    }
  }

  // 13. Post-exit / pre-join member in split
  if (date && row.split_with) {
    const splitNames = row.split_with.split(';').map(n => n.trim()).filter(Boolean);
    for (const name of splitNames) {
      const norm = normalizeName(name);
      if (norm.canonical) {
        const { active, reason } = isMemberActiveOnDate(norm.canonical, date);
        if (!active) {
          addAnomaly('MEMBER_TIMELINE', `Row ${rowIndex}: "${norm.canonical}" is in split but ${reason}`, 'warning', { member: norm.canonical, reason });
        }
      }
    }
  }

  // 14. Conflicting split_type vs split_details
  if (row.split_type === 'equal' && row.split_details && row.split_details.trim()) {
    const hasShareNotation = /\w+\s+\d+/.test(row.split_details);
    if (hasShareNotation) {
      addAnomaly('SPLIT_TYPE_CONFLICT', `Row ${rowIndex}: split_type is "equal" but split_details has "${row.split_details}". Will treat as equal split.`, 'info');
    }
  }

  // 15. Exact duplicate detection
  const duplicate = allRows.filter((r, i) => i !== rowIndex - 2 && // exclude self (rowIndex is 1-based, array is 0-based)
    r.date === row.date &&
    r.paid_by?.toLowerCase() === row.paid_by?.toLowerCase() &&
    parseAmount(r.amount) === amount &&
    r.currency === row.currency
  );
  if (duplicate.length > 0) {
    addAnomaly('EXACT_DUPLICATE', `Row ${rowIndex}: exact duplicate of row(s) with same date/payer/amount. Keep the one with better data.`, 'error', { duplicateOf: duplicate.map(r => allRows.indexOf(r) + 2) });
  }

  // 16. Near-duplicate detection (same date + fuzzy description + same group)
  const nearDup = allRows.filter((r, i) => {
    if (i === rowIndex - 2) return false;
    if (r.date !== row.date) return false;
    if (!r.description || !row.description) return false;
    // Simple: same first word, different amounts
    const desc1 = row.description.toLowerCase().replace(/[^a-z]/g, '');
    const desc2 = r.description.toLowerCase().replace(/[^a-z]/g, '');
    return desc1.includes(desc2.slice(0, 6)) || desc2.includes(desc1.slice(0, 6));
  });
  if (nearDup.length > 0 && !duplicate.length) {
    addAnomaly('NEAR_DUPLICATE', `Row ${rowIndex}: "${row.description}" may be a duplicate of "${nearDup[0].description}" on the same date. Review both.`, 'warning', { possibleDuplicateOf: nearDup.map(r => allRows.indexOf(r) + 2) });
  }

  return anomalies;
}
