/**
 * artha-data.js
 * Core data pipeline for Artha financial views.
 * Fetches Teller API data via Worker proxy, normalizes to cents + local dates,
 * and caches in IndexedDB via artha-cache.
 *
 * All functions return { ok: true, data } or { ok: false, error, code } — never throw.
 */

import { workerFetch }                       from './artha-fetch.js';
import { cacheGet, cachePut }                from './artha-cache.js';
import { toCents, normalizeToLocalDate, localDateString } from './artha-utils.js';

// ─── Result Helpers ──────────────────────────────────────────────────────────

function ok(data) {
  return { ok: true, data };
}

function err(error, code = 0) {
  return { ok: false, error, code };
}

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Normalizes a raw Teller account object.
 * @param {Object} raw - Raw account from Teller API
 * @param {string} enrollmentId
 * @param {string} institutionName
 * @returns {Object} Normalized account
 */
function normalizeAccount(raw, enrollmentId, institutionName) {
  return {
    id: raw.id,
    enrollmentId,
    institutionName,
    name: raw.name || 'Unknown Account',
    type: raw.type || 'unknown',
    subtype: raw.subtype || null,
    lastFour: raw.last_four || null,
    status: raw.status || 'unknown',
  };
}

/**
 * Normalizes a raw Teller balance response.
 * Teller returns balances as string dollar amounts — convert to integer cents.
 * @param {Object} raw - Raw balance from Teller API
 * @returns {{ ledger: number, available: number }} Balances in cents
 */
function normalizeBalance(raw) {
  const ledger = raw.ledger != null ? toCents(parseFloat(raw.ledger)) : 0;
  const available = raw.available != null ? toCents(parseFloat(raw.available)) : ledger;
  return { ledger, available };
}

/**
 * Normalizes a raw Teller transaction.
 * Amounts are strings like "-42.50" → parseFloat → toCents → -4250.
 * Dates are date-only strings like "2026-02-15" → normalizeToLocalDate handles UTC trap.
 * @param {Object} raw - Raw transaction from Teller API
 * @returns {Object} Normalized transaction
 */
function normalizeTransaction(raw) {
  const amountCents = raw.amount != null ? toCents(parseFloat(raw.amount)) : 0;
  const localDate = normalizeToLocalDate(raw.date || new Date().toISOString());
  return {
    id: raw.id,
    accountId: raw.account_id,
    amount: amountCents,
    date: localDate,
    dateString: localDateString(localDate),
    description: raw.description || raw.details?.counterparty?.name || 'Unknown',
    status: raw.status || 'posted',
    type: raw.type || 'unknown',
    category: raw.details?.category || raw.category || null,
    counterparty: raw.details?.counterparty?.name || null,
  };
}

// ─── Low-Level Fetch (single account) ────────────────────────────────────────

/**
 * Fetches accounts for a single enrollment.
 * @param {string} accessToken - Teller access token
 * @param {string} enrollmentId
 * @param {string} institutionName
 * @returns {Promise<{ ok: boolean, data?: Array, error?: string, code?: number }>}
 */
export async function fetchAccounts(accessToken, enrollmentId, institutionName) {
  const cacheKey = `teller:accounts:${enrollmentId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return ok(cached);

  try {
    const res = await workerFetch('/api/teller/accounts', {
      headers: { 'Authorization': `Basic ${btoa(accessToken + ':')}` },
    });

    if (!res.ok && res.status !== 0) {
      return err(`Accounts fetch failed: ${res.status}`, res.status);
    }
    if (res.status === 0) {
      const body = await res.json().catch(() => ({}));
      return err(body.error || 'Worker not configured', 0);
    }

    const raw = await res.json();
    if (!Array.isArray(raw)) return err('Unexpected accounts response', res.status);

    const accounts = raw.map((a) => normalizeAccount(a, enrollmentId, institutionName));
    await cachePut(cacheKey, accounts);
    return ok(accounts);
  } catch (e) {
    return err(e.message, -1);
  }
}

/**
 * Fetches balances for a single account.
 * @param {string} accountId
 * @param {string} accessToken
 * @returns {Promise<{ ok: boolean, data?: { ledger: number, available: number }, error?: string }>}
 */
export async function fetchBalances(accountId, accessToken) {
  const cacheKey = `teller:balances:${accountId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return ok(cached);

  try {
    const res = await workerFetch(`/api/teller/accounts/${accountId}/balances`, {
      headers: { 'Authorization': `Basic ${btoa(accessToken + ':')}` },
    });

    if (!res.ok && res.status !== 0) {
      return err(`Balances fetch failed: ${res.status}`, res.status);
    }
    if (res.status === 0) {
      const body = await res.json().catch(() => ({}));
      return err(body.error || 'Worker not configured', 0);
    }

    const raw = await res.json();
    const balance = normalizeBalance(raw);
    await cachePut(cacheKey, balance);
    return ok(balance);
  } catch (e) {
    return err(e.message, -1);
  }
}

/**
 * Fetches transactions for a single account within an optional date range.
 * @param {string} accountId
 * @param {string} accessToken
 * @param {{ startDate?: Date|string, endDate?: Date|string }} [dateRange={}]
 * @returns {Promise<{ ok: boolean, data?: Array, error?: string }>}
 */
export async function fetchTransactions(accountId, accessToken, { startDate, endDate } = {}) {
  const startStr = startDate ? localDateString(startDate) : '';
  const endStr = endDate ? localDateString(endDate) : '';
  const cacheKey = `teller:transactions:${accountId}:${startStr}:${endStr}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return ok(cached);

  try {
    let path = `/api/teller/accounts/${accountId}/transactions`;
    const params = new URLSearchParams();
    if (startStr) params.set('from_date', startStr);
    if (endStr) params.set('to_date', endStr);
    const qs = params.toString();
    if (qs) path += `?${qs}`;

    const res = await workerFetch(path, {
      headers: { 'Authorization': `Basic ${btoa(accessToken + ':')}` },
    });

    if (!res.ok && res.status !== 0) {
      return err(`Transactions fetch failed: ${res.status}`, res.status);
    }
    if (res.status === 0) {
      const body = await res.json().catch(() => ({}));
      return err(body.error || 'Worker not configured', 0);
    }

    const raw = await res.json();
    if (!Array.isArray(raw)) return err('Unexpected transactions response', res.status);

    const transactions = raw.map(normalizeTransaction);
    await cachePut(cacheKey, transactions);
    return ok(transactions);
  } catch (e) {
    return err(e.message, -1);
  }
}

// ─── High-Level (all enrollments) ────────────────────────────────────────────

/**
 * Fetches and flattens accounts across all enrollments in parallel.
 * @param {Array<{ accessToken: string, enrollmentId: string, institutionName: string }>} enrollments
 * @returns {Promise<{ ok: boolean, data?: Array, errors?: Array }>}
 */
export async function getAllAccounts(enrollments) {
  const results = await Promise.all(
    enrollments.map((e) => fetchAccounts(e.accessToken, e.enrollmentId, e.institutionName))
  );

  const accounts = [];
  const errors = [];
  for (const r of results) {
    if (r.ok) accounts.push(...r.data);
    else errors.push(r.error);
  }

  if (accounts.length === 0 && errors.length > 0) {
    return err(errors.join('; '), -1);
  }
  return { ok: true, data: accounts, errors: errors.length ? errors : undefined };
}

/**
 * Fetches balances for all accounts in parallel.
 * Returns a Map of accountId → { ledger, available } (both in cents).
 * @param {Array<{ id: string, enrollmentId: string }>} accounts
 * @param {Array<{ accessToken: string, enrollmentId: string }>} enrollments
 * @returns {Promise<{ ok: boolean, data?: Map<string, { ledger: number, available: number }> }>}
 */
export async function getAllBalances(accounts, enrollments) {
  const tokenMap = new Map(enrollments.map((e) => [e.enrollmentId, e.accessToken]));

  const results = await Promise.all(
    accounts.map((acc) => {
      const token = tokenMap.get(acc.enrollmentId);
      if (!token) return Promise.resolve(err(`No token for enrollment ${acc.enrollmentId}`));
      return fetchBalances(acc.id, token);
    })
  );

  const balanceMap = new Map();
  const errors = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.ok) balanceMap.set(accounts[i].id, r.data);
    else errors.push(r.error);
  }

  return { ok: true, data: balanceMap, errors: errors.length ? errors : undefined };
}

/**
 * Fetches transactions across all accounts in parallel, merges and sorts by date desc.
 * @param {Array<{ id: string, enrollmentId: string }>} accounts
 * @param {Array<{ accessToken: string, enrollmentId: string }>} enrollments
 * @param {{ startDate?: Date|string, endDate?: Date|string }} [dateRange={}]
 * @returns {Promise<{ ok: boolean, data?: Array, errors?: Array }>}
 */
export async function getAllTransactions(accounts, enrollments, { startDate, endDate } = {}) {
  const tokenMap = new Map(enrollments.map((e) => [e.enrollmentId, e.accessToken]));

  const results = await Promise.all(
    accounts.map((acc) => {
      const token = tokenMap.get(acc.enrollmentId);
      if (!token) return Promise.resolve(err(`No token for enrollment ${acc.enrollmentId}`));
      return fetchTransactions(acc.id, token, { startDate, endDate });
    })
  );

  const transactions = [];
  const errors = [];
  for (const r of results) {
    if (r.ok) transactions.push(...r.data);
    else errors.push(r.error);
  }

  // Sort by date descending (most recent first)
  transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (transactions.length === 0 && errors.length > 0) {
    return err(errors.join('; '), -1);
  }
  return { ok: true, data: transactions, errors: errors.length ? errors : undefined };
}
