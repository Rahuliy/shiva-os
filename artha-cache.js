/**
 * artha-cache.js
 * IndexedDB cache layer with 1-hour TTL for Artha financial API responses.
 * Pure cache module — no DOM manipulation, no currency/date logic, no HTML.
 *
 * Uses idb@8 by Jake Archibald (~1.19kB brotli'd) via jsdelivr CDN ESM import.
 * Singleton DB connection pattern avoids the anti-pattern of opening a new
 * connection per operation.
 *
 * Gracefully degrades when IndexedDB is unavailable (Safari private browsing):
 * cacheGet returns null, cachePut/cacheInvalidate/cacheInvalidateAll are no-ops.
 */

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'artha-cache';
const DB_VERSION = 1;
const STORE_NAME = 'responses';

/** 1-hour TTL per user decision */
const TTL_MS = 60 * 60 * 1000;

// ─── Module-level state ───────────────────────────────────────────────────────

/** Cached DB promise — singleton pattern avoids opening a new connection per operation */
let _db = null;

/** Set to true when IndexedDB is unavailable (e.g., Safari private browsing) */
let _disabled = false;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns the singleton DB promise.
 * Opens the database on first call, returns cached promise on subsequent calls.
 * Sets _disabled = true if IndexedDB fails to initialize.
 * @returns {Promise<IDBDatabase>} The opened IndexedDB database
 */
async function getDB() {
  if (_disabled) return null;
  if (_db) return _db;

  try {
    _db = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      },
    });
    // Await to confirm it actually opens successfully before caching the promise
    await _db;
    return _db;
  } catch (err) {
    _disabled = true;
    console.warn('IndexedDB unavailable — caching disabled');
    _db = null;
    return null;
  }
}

// ─── Exported cache functions ─────────────────────────────────────────────────

/**
 * Retrieves cached data by key.
 * Returns null if the entry does not exist or has exceeded the 1-hour TTL.
 * Stale entries are deleted automatically on retrieval.
 * @param {string} key - Cache key (typically a URL or derived identifier)
 * @returns {Promise<any|null>} The cached data, or null if missing/stale
 * @example const data = await cacheGet('/api/accounts'); // null if not cached or stale
 */
export async function cacheGet(key) {
  if (_disabled) return null;

  try {
    const db = await getDB();
    if (!db) return null;

    const record = await db.get(STORE_NAME, key);
    if (!record) return null;

    if (Date.now() - record.cachedAt > TTL_MS) {
      // Entry is stale — delete it and return null
      await db.delete(STORE_NAME, key);
      return null;
    }

    return record.data;
  } catch (err) {
    // If any DB operation fails, treat as a cache miss rather than crashing
    return null;
  }
}

/**
 * Stores data in the cache under the given key.
 * Overwrites any existing entry for that key.
 * Records cachedAt timestamp used for TTL calculation.
 * @param {string} key - Cache key (typically a URL or derived identifier)
 * @param {any} data - The data to store (must be structured-cloneable)
 * @returns {Promise<void>}
 * @example await cachePut('/api/accounts', responseData);
 */
export async function cachePut(key, data) {
  if (_disabled) return;

  try {
    const db = await getDB();
    if (!db) return;

    await db.put(STORE_NAME, { key, data, cachedAt: Date.now() });
  } catch (err) {
    // Cache write failures are non-fatal — app continues without caching
  }
}

/**
 * Deletes a single cache entry by key.
 * Use when you know a specific resource has been updated and needs re-fetching.
 * @param {string} key - Cache key to delete
 * @returns {Promise<void>}
 * @example await cacheInvalidate('/api/accounts/123/transactions');
 */
export async function cacheInvalidate(key) {
  if (_disabled) return;

  try {
    const db = await getDB();
    if (!db) return;

    await db.delete(STORE_NAME, key);
  } catch (err) {
    // Deletion failures are non-fatal
  }
}

/**
 * Clears all cached entries.
 * Used for manual refresh — the refresh button calls this to force re-fetch of all data.
 * @returns {Promise<void>}
 * @example await cacheInvalidateAll(); // user clicked "Refresh"
 */
export async function cacheInvalidateAll() {
  if (_disabled) return;

  try {
    const db = await getDB();
    if (!db) return;

    await db.clear(STORE_NAME);
  } catch (err) {
    // Clear failures are non-fatal
  }
}
