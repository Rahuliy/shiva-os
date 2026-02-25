/**
 * artha-utils.js
 * Foundational currency arithmetic and timezone-safe date utilities for Artha financial views.
 * Pure logic module — no DOM manipulation, no imports, no CSS.
 *
 * Currency arithmetic uses integer cents to avoid IEEE 754 floating-point drift.
 * Date utilities use local Date methods (not UTC) to prevent cross-midnight bucketing bugs
 * for Eastern US timezone users.
 */

// ─── Currency Utilities ───────────────────────────────────────────────────────

/**
 * Module-level Intl.NumberFormat instance — constructed once, reused on every call.
 * Intl.NumberFormat construction is expensive; never create inside formatCurrency().
 * @type {Intl.NumberFormat}
 */
const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Converts a float dollar amount to integer cents.
 * Use Math.round to eliminate floating-point drift (e.g., 10.30 * 100 = 1029.9999...).
 * @param {number} dollars - Dollar amount as a float (e.g., 10.30)
 * @returns {number} Integer cents (e.g., 1030)
 * @example toCents(10.30) // 1030
 */
export function toCents(dollars) {
  return Math.round(dollars * 100);
}

/**
 * Converts integer cents back to float dollars.
 * Use only when interfacing with external APIs that expect float dollar amounts.
 * @param {number} cents - Integer cents (e.g., 1030)
 * @returns {number} Dollar amount as float (e.g., 10.30)
 * @example fromCents(1030) // 10.30
 */
export function fromCents(cents) {
  return cents / 100;
}

/**
 * Formats integer cents as a whole-number US dollar string.
 * Negative values display with a minus sign (Mint/Robinhood style).
 * @param {number} cents - Integer cents (e.g., 123456)
 * @returns {string} Formatted dollar string with no decimal places (e.g., "$1,235")
 * @example formatCurrency(123456) // "$1,235"
 * @example formatCurrency(-45000) // "-$450"
 */
export function formatCurrency(cents) {
  return USD_FORMATTER.format(cents / 100);
}

// ─── Date Utilities ───────────────────────────────────────────────────────────

/**
 * Normalizes a Date object or ISO string to local calendar midnight (00:00:00 local time).
 * Uses LOCAL date methods (getFullYear, getMonth, getDate) — NOT UTC methods.
 * This prevents the UTC cross-midnight bug where Eastern US users see transactions
 * bucketed under the wrong day (e.g., Feb 22 05:00 UTC = Feb 21 midnight UTC, but
 * it is actually Feb 22 in Eastern time).
 *
 * Date-only strings (e.g., "2026-02-22") are treated as local midnight by appending
 * 'T00:00:00' before parsing — avoiding the spec behavior where date-only ISO strings
 * are parsed as UTC midnight.
 *
 * @param {Date|string} input - A Date object or ISO date string
 * @returns {Date} Midnight in local timezone for that calendar day
 * @example normalizeToLocalDate('2026-02-22T05:00:00Z').getDate() // 22 in Eastern time
 */
export function normalizeToLocalDate(input) {
  let d;
  if (typeof input === 'string') {
    // Date-only strings (length === 10, e.g., "2026-02-22") must be treated as local midnight.
    // Per spec, "2026-02-22" is parsed as UTC midnight — adding T00:00:00 forces local parse.
    if (input.length === 10) {
      d = new Date(input + 'T00:00:00');
    } else {
      d = new Date(input);
    }
  } else {
    d = input;
  }
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  return new Date(y, m, day);
}

/**
 * Returns true if two dates or ISO strings fall on the same local calendar day.
 * Comparison uses local midnight timestamps from normalizeToLocalDate.
 * @param {Date|string} a - First date
 * @param {Date|string} b - Second date
 * @returns {boolean} True if both dates share the same local calendar day
 * @example isSameLocalDay('2026-02-22T05:00:00Z', '2026-02-22T23:59:59') // true
 */
export function isSameLocalDay(a, b) {
  return normalizeToLocalDate(a).getTime() === normalizeToLocalDate(b).getTime();
}

/**
 * Returns a YYYY-MM-DD string using LOCAL date components (not UTC).
 * Safe for use as display labels and localStorage keys.
 * @param {Date|string} d - A Date object or ISO date string
 * @returns {string} Date string in YYYY-MM-DD format using local timezone
 * @example localDateString(new Date('2026-02-22T05:00:00Z')) // "2026-02-22" in Eastern time
 */
export function localDateString(d) {
  const date = normalizeToLocalDate(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns a start/end date range normalized to local midnight for a given preset.
 * @param {'1W'|'1M'|'3M'|'YTD'|'1Y'|'custom'} preset - The date range preset
 * @param {{start: Date|string, end: Date|string}} [customRange] - Required when preset is 'custom'
 * @returns {{start: Date, end: Date}} Start and end dates at local midnight
 * @throws {Error} If preset is 'custom' but customRange is not provided
 * @throws {Error} If preset is unrecognized
 * @example getDateRange('1M') // { start: <30 days ago>, end: <today midnight> }
 * @example getDateRange('custom', { start: '2026-01-01', end: '2026-02-01' })
 */
export function getDateRange(preset, customRange) {
  const today = normalizeToLocalDate(new Date());

  switch (preset) {
    case '1W': {
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      return { start, end: today };
    }
    case '1M': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 1);
      return { start, end: today };
    }
    case '3M': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 3);
      return { start, end: today };
    }
    case 'YTD': {
      const start = new Date(today.getFullYear(), 0, 1); // January 1 of current year
      return { start, end: today };
    }
    case '1Y': {
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      return { start, end: today };
    }
    case 'custom': {
      if (!customRange) {
        throw new Error("getDateRange: customRange is required when preset is 'custom'");
      }
      return {
        start: normalizeToLocalDate(customRange.start),
        end: normalizeToLocalDate(customRange.end),
      };
    }
    default:
      throw new Error(`Unknown preset: ${preset}`);
  }
}
