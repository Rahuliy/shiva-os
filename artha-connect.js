/**
 * artha-connect.js
 * Teller Connect widget lifecycle and localStorage persistence.
 * Manages bank enrollments and account labels (personal/business routing).
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const TELLER_APP_ID = 'app_pp0pjj2j38mjncalt0000';
const TELLER_ENV = 'sandbox';
const TELLER_CDN = 'https://cdn.teller.io/connect/connect.js';

const ENROLLMENTS_KEY = 'artha-enrollments';
const LABELS_KEY = 'artha-account-labels';

// ─── Teller CDN Injection ────────────────────────────────────────────────────

let _cdnLoaded = false;
let _cdnPromise = null;

/**
 * Dynamically injects the Teller Connect CDN script (idempotent).
 * Returns a Promise that resolves when the script is loaded and `TellerConnect` is available.
 * @returns {Promise<void>}
 */
export function loadTellerConnect() {
  if (_cdnLoaded && window.TellerConnect) return Promise.resolve();
  if (_cdnPromise) return _cdnPromise;

  _cdnPromise = new Promise((resolve, reject) => {
    // Check if script already exists in DOM
    if (document.querySelector(`script[src="${TELLER_CDN}"]`)) {
      _cdnLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = TELLER_CDN;
    script.async = true;
    script.onload = () => {
      _cdnLoaded = true;
      resolve();
    };
    script.onerror = () => {
      _cdnPromise = null;
      reject(new Error('Failed to load Teller Connect CDN'));
    };
    document.head.appendChild(script);
  });

  return _cdnPromise;
}

// ─── Teller Connect Widget ──────────────────────────────────────────────────

/**
 * Opens the Teller Connect enrollment widget.
 * Auto-saves enrollment to localStorage on success.
 *
 * @param {Object} callbacks
 * @param {function} [callbacks.onSuccess] - Called with enrollment record after save
 * @param {function} [callbacks.onExit] - Called when user closes widget without completing
 * @returns {Promise<void>}
 */
export async function openTellerConnect({ onSuccess, onExit } = {}) {
  await loadTellerConnect();

  if (!window.TellerConnect) {
    throw new Error('TellerConnect not available after CDN load');
  }

  const handler = window.TellerConnect.setup({
    applicationId: TELLER_APP_ID,
    environment: TELLER_ENV,
    onSuccess: (enrollment) => {
      const record = {
        accessToken: enrollment.accessToken,
        enrollmentId: enrollment.enrollment?.id || enrollment.enrollmentId || crypto.randomUUID(),
        institutionName: enrollment.enrollment?.institution?.name || enrollment.institutionName || 'Unknown',
        connectedAt: new Date().toISOString(),
      };
      saveEnrollment(record);
      console.log('[Artha] Enrollment saved:', record.institutionName);
      if (onSuccess) onSuccess(record);
    },
    onExit: () => {
      console.log('[Artha] Teller Connect closed');
      if (onExit) onExit();
    },
  });

  handler.open();
}

// ─── Enrollment CRUD ─────────────────────────────────────────────────────────

/**
 * Saves an enrollment record to localStorage.
 * Deduplicates by enrollmentId — updates if already present.
 * @param {{ accessToken: string, enrollmentId: string, institutionName: string, connectedAt: string }} record
 */
export function saveEnrollment(record) {
  const enrollments = getEnrollments();
  const idx = enrollments.findIndex((e) => e.enrollmentId === record.enrollmentId);
  if (idx >= 0) {
    enrollments[idx] = record;
  } else {
    enrollments.push(record);
  }
  localStorage.setItem(ENROLLMENTS_KEY, JSON.stringify(enrollments));
}

/**
 * Returns all saved enrollment records.
 * @returns {Array<{ accessToken: string, enrollmentId: string, institutionName: string, connectedAt: string }>}
 */
export function getEnrollments() {
  try {
    return JSON.parse(localStorage.getItem(ENROLLMENTS_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * Removes an enrollment by enrollmentId.
 * @param {string} enrollmentId
 */
export function removeEnrollment(enrollmentId) {
  const enrollments = getEnrollments().filter((e) => e.enrollmentId !== enrollmentId);
  localStorage.setItem(ENROLLMENTS_KEY, JSON.stringify(enrollments));
}

// ─── Account Labels ──────────────────────────────────────────────────────────

/**
 * Sets a label ('personal' | 'business') for an account.
 * @param {string} accountId
 * @param {'personal'|'business'} label
 */
export function setAccountLabel(accountId, label) {
  const labels = _getLabels();
  labels[accountId] = label;
  localStorage.setItem(LABELS_KEY, JSON.stringify(labels));
}

/**
 * Gets the label for an account, or null if unlabeled.
 * @param {string} accountId
 * @returns {'personal'|'business'|null}
 */
export function getAccountLabel(accountId) {
  return _getLabels()[accountId] || null;
}

/**
 * Filters an array of account objects to those matching the given label.
 * Unlabeled accounts are included when label is 'personal' (default bucket).
 * @param {'personal'|'business'} label
 * @param {Array<{ id: string }>} accounts
 * @returns {Array<{ id: string }>}
 */
export function getAccountsForLabel(label, accounts) {
  const labels = _getLabels();
  return accounts.filter((acc) => {
    const accLabel = labels[acc.id];
    if (label === 'personal') return !accLabel || accLabel === 'personal';
    return accLabel === label;
  });
}

function _getLabels() {
  try {
    return JSON.parse(localStorage.getItem(LABELS_KEY)) || {};
  } catch {
    return {};
  }
}
