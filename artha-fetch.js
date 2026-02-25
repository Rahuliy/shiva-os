/**
 * artha-fetch.js
 * Shared Worker proxy fetch for Artha financial modules.
 * Reads the Cloudflare Worker URL from localStorage on each call.
 */

const WORKER_KEY = 'shiva-worker-url';

/**
 * Returns true if the Worker proxy URL is configured in localStorage.
 * @returns {boolean}
 */
export function isWorkerConfigured() {
  return !!localStorage.getItem(WORKER_KEY);
}

/**
 * Fetches from the Cloudflare Worker proxy.
 * Reads `localStorage('shiva-worker-url')` on each call so it picks up
 * runtime configuration changes without a reload.
 *
 * @param {string} path - API path (e.g., '/api/teller/accounts')
 * @param {RequestInit} [options={}] - Standard fetch options
 * @returns {Promise<Response>} Fetch response, or synthetic error Response if not configured
 */
export function workerFetch(path, options = {}) {
  const url = localStorage.getItem(WORKER_KEY);
  if (!url) {
    console.warn('[Artha] Worker URL not configured. Set localStorage key "shiva-worker-url".');
    return Promise.resolve(
      new Response(JSON.stringify({ error: 'Worker URL not configured' }), {
        status: 0,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
  return fetch(`${url}${path}`, options);
}
