# Phase 2: Data Layer Foundations - Research

**Researched:** 2026-02-25
**Domain:** Browser-side data utilities — IndexedDB caching, currency arithmetic, timezone-safe dates, skeleton loading states, shared date filter component
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Caching behavior:** Cache stored in IndexedDB with 1-hour TTL. Data refreshes on explicit reload only — no background auto-refresh. When cache is stale (past TTL), next page load fetches fresh data and updates cache.
- **Loading states:** Skeleton shimmer animation while data loads. Layout-matched skeletons — skeleton shapes mirror the actual content layout (cards, chart rectangles, list rows). Like Robinhood's loading feel — premium, not generic bars. Each view provides its own skeleton template matching its layout.
- **Date filter:** Shared date filter bar positioned below the glassmorphic topbar, always visible, never scrolls. Filter options: 1W, 1M, YTD, 3M, 1Y, custom range. Default range: 1Y (one year) on first load. Filter selection persists across all views — switching from Lakshmi Dashboard to Transactions keeps the same date range. Filter state stored in localStorage so it persists across page reloads.
- **Currency display:** Mint/Robinhood style — whole numbers only, no cents (e.g., "$1,234" not "$1,234.56"). Internal arithmetic uses integer cents (no floating-point drift). Comma-separated thousands.

### Claude's Discretion

- Refresh mechanism (UI button vs browser refresh)
- Negative currency display style
- Skeleton shimmer animation speed and color
- IndexedDB schema design
- Date filter component implementation details

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-08 | IndexedDB cache layer for transaction history with TTL-based invalidation | idb@8 library via CDN ESM import; openDB with upgrade callback; TTL stored as `cachedAt` timestamp; stale check on read; delete-on-stale pattern |
| INFRA-09 | Currency utilities using cent-based integers to prevent floating point errors | `toCents()` using `Math.round(val * 100)`; `formatCurrency()` using `Intl.NumberFormat` with `maximumFractionDigits: 0`; confirmed pattern from MDN |
| INFRA-10 | Date filtering system (1W, 1M, YTD, 3M, 1Y, custom) shared across all views | localStorage key `artha-date-filter` stores selected range; `getDateRange(preset)` returns `{start, end}` as Date objects; filter bar renders as sticky row below topbar |
</phase_requirements>

---

## Summary

Phase 2 establishes four shared utilities that every financial view will depend on: a currency arithmetic module, a timezone-safe date normalization module, an IndexedDB cache with TTL, and a shared date filter bar. These utilities live as small, self-contained JS modules importable via `<script type="module">` tags — consistent with the project's pattern of using ESM imports via CDN (established in Krishna AI chat with `esm.sh`).

The currency problem is well-understood and has a definitive solution: store all values as integer cents (multiply input by 100, round), perform all arithmetic on integers, then divide by 100 only at the moment of display. `Intl.NumberFormat` with `maximumFractionDigits: 0` produces the exact Mint/Robinhood display format the user specified — `$1,234` with no cents, comma-separated thousands, built into every modern browser at zero cost.

The date problem has one critical trap: `new Date("2026-02-22")` (date-only string, no time component) is parsed as midnight UTC — so Eastern users see it as the *previous* day (Feb 21). The correct fix is to always use the local-aware date component methods (`getFullYear()`, `getMonth()`, `getDate()`) when categorizing transactions into days — never `getUTCDate()`. For the filter bar, `setHours(0, 0, 0, 0)` normalizes any `Date` to local midnight, which is the correct boundary for day comparisons.

IndexedDB is the right tool for caching transaction history (up to tens of thousands of records, structured queries, async). The idb@8 library by Jake Archibald (~1.19kB brotli'd) provides a promise-based API over the raw callback-heavy IndexedDB, available via ESM CDN — no npm, no build step. The skeleton loading pattern is pure CSS: a shimmer gradient animation applied to placeholder elements, adapted to the project's dark color tokens.

**Primary recommendation:** Create a single `artha-utils.js` shared module with four exports — `toCents`, `formatCurrency`, `normalizeToLocalDate`, and `getDateRange` — plus an `artha-cache.js` module for IndexedDB operations, and a `date-filter.js` module for the shared UI component. Keep all three files in the root alongside the HTML pages.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `idb` (Jake Archibald) | `8.0.3` | Promise-based IndexedDB wrapper | ~1.19kB brotli'd, ESM CDN available, official web.dev recommendation; raw IndexedDB is callback-heavy and transaction-lifecycle error-prone |
| `Intl.NumberFormat` | Built-in (all modern browsers) | US dollar formatting with comma separators, no cents | Zero cost, baseline browser API, produces exact Mint/Robinhood format |
| `Date` (vanilla JS) | Built-in | Timezone-aware date arithmetic | Temporal API is NOT yet production-ready (limited browser support as of 2026); use `getDate()`/`getMonth()`/`getFullYear()` local methods |
| `localStorage` | Built-in | Persisting date filter selection across pages and reloads | Already used in this project (`shiva-theme`, `shiva-worker-url`); correct tool for UI state |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `idb-keyval` (Jake Archibald) | `6.x` | Simpler key-value only IndexedDB | Could replace `idb` if schema complexity never materializes — but `idb` is the safer default for structured transaction cache |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `idb@8` | Raw `indexedDB` API | Raw API is callback-based, transaction lifecycle is error-prone (transactions go inactive if event loop is re-entered). idb is the clear winner for maintainability |
| `idb@8` | `Dexie.js` | Dexie is more full-featured (queries, relations) but ~47kB min — overkill for a simple TTL cache. idb is smaller and sufficient |
| `Intl.NumberFormat` | Manual string formatting | Manual formatting (`toLocaleString()` without options) has browser inconsistency. `Intl.NumberFormat` is explicit and reliable |
| `Temporal` API | `Date` object | Temporal is NOT production-ready in 2026 (limited browser support, still experimental). Continue using `Date` with local-aware methods |
| `date-fns` | `Date` + local methods | `date-fns` adds a dependency and CDN load. For the small set of date operations needed here (range boundaries, local day comparison), vanilla `Date` is sufficient |

**Installation:**

No npm installation. All imports via ESM CDN:
```html
<!-- In any artha HTML page -->
<script type="module">
  import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';
  import { toCents, formatCurrency, normalizeToLocalDate, getDateRange }
    from './artha-utils.js';
  import { cacheGet, cachePut } from './artha-cache.js';
</script>
```

---

## Architecture Patterns

### Recommended Project Structure

```
shiva-os/
├── lakshmi.html           # Existing — imports artha-utils.js, artha-cache.js, date-filter.js
├── kubera.html            # Existing — same imports
├── artha-utils.js         # NEW — toCents, formatCurrency, normalizeToLocalDate, getDateRange
├── artha-cache.js         # NEW — openArtha­DB, cacheGet, cachePut, cacheInvalidate
├── date-filter.js         # NEW — shared date filter bar component (renders HTML + handles events)
└── worker/                # Existing — Cloudflare Worker from Phase 1
```

**Why co-located at root:** The project is pure HTML/CSS/JS with no build system. Relative imports (`./artha-utils.js`) work correctly from `lakshmi.html` and `kubera.html` without any path complexity. CLAUDE.md instructs: "Keep files self-contained — inline styles and scripts unless extracting to shared files." Phase 2 is the first legitimate case for shared extraction.

### Pattern 1: Currency Utilities (toCents / formatCurrency)

**What:** Convert dollar amounts from float to integer cents for arithmetic; format cents back to display string.
**When to use:** All currency inputs (from Teller API, user entry) go through `toCents()`. All display values go through `formatCurrency()`. Never perform arithmetic on float dollar amounts.

```javascript
// artha-utils.js
// Source: MDN https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat

/**
 * Convert a float dollar amount to integer cents.
 * Use Math.round() to eliminate floating-point representation error.
 * Example: toCents(10.30) → 1030 (not 1029.9999...)
 */
export function toCents(dollars) {
  return Math.round(dollars * 100);
}

/**
 * Convert integer cents back to a float dollar amount.
 * Use only when interfacing with external APIs that expect floats.
 */
export function fromCents(cents) {
  return cents / 100;
}

// Reuse formatter — Intl.NumberFormat is expensive to construct.
const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format integer cents as whole-number US dollar string.
 * formatCurrency(123456) → "$1,235"
 * formatCurrency(-45000) → "-$450" (or see negative style options below)
 */
export function formatCurrency(cents) {
  return USD_FORMATTER.format(cents / 100);
}

/**
 * Negative currency display options (Claude's discretion — pick one):
 *
 * Option A — Red text, minus sign (Robinhood style):
 *   formatCurrency(-45000) → "-$450" displayed in var(--verm-hi) color
 *   HTML: `<span class="negative">${formatCurrency(cents)}</span>`
 *   CSS:  `.negative { color: var(--verm-hi); }`
 *
 * Option B — Parentheses (accounting style):
 *   formatCurrency(-45000) → "($450)"
 *   Implementation: if (cents < 0) return `(${USD_FORMATTER.format(-cents/100)})`;
 *
 * Recommendation: Option A (red minus sign) — matches Robinhood aesthetic,
 * consistent with existing .num.debit color in lakshmi.html.
 */
```

### Pattern 2: Timezone-Safe Date Normalization

**What:** Extract the calendar date (year/month/day) of a UTC ISO timestamp in the *user's local timezone*. This prevents the Feb 22 → Feb 21 cross-midnight shift that occurs when using UTC methods on Eastern US timestamps.

**Root cause:** `new Date("2026-02-22T05:00:00Z")` is midnight UTC+0 = 12 AM UTC. That is 7 PM Feb 21 EST (UTC-5). Using `.getUTCDate()` returns 22 (correct), but if you mistakenly use `.toISOString().split('T')[0]` or compare as UTC, you bucket Feb 22 transactions under Feb 21 for Eastern users.

**The safe approach:** Use the LOCAL date methods (`.getFullYear()`, `.getMonth()`, `.getDate()`) — these automatically apply the browser's timezone offset and return the date as the user sees it on their wall calendar.

```javascript
// artha-utils.js
// Source: MDN https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset

/**
 * Normalize any Date (or UTC ISO string) to local midnight (00:00:00.000 local time).
 * Use this to compare dates by calendar day in the user's timezone.
 *
 * normalizeToLocalDate("2026-02-22T05:00:00Z") in Eastern time (UTC-5):
 *   → new Date(2026, 1, 22, 0, 0, 0, 0)  // Feb 22, midnight local
 *   → NOT Feb 21 (which UTC midnight would give)
 */
export function normalizeToLocalDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  // getFullYear/getMonth/getDate return LOCAL calendar values, not UTC values.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Check if two dates fall on the same local calendar day.
 */
export function isSameLocalDay(a, b) {
  const da = normalizeToLocalDate(a);
  const db = normalizeToLocalDate(b);
  return da.getTime() === db.getTime();
}

/**
 * Return a YYYY-MM-DD string using LOCAL date components (not UTC).
 * Safe for display labels and localStorage keys.
 * localDateString(new Date()) → "2026-02-25"
 */
export function localDateString(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

### Pattern 3: Date Range Computation (getDateRange)

**What:** Compute `{start, end}` Date objects for each filter preset. Start and end are normalized to local midnight so they can be used with `>=` / `<=` comparisons against `normalizeToLocalDate(txDate)`.

```javascript
// artha-utils.js
// Source: MDN Date API

/**
 * Compute start/end Date boundaries for a date filter preset.
 * All boundaries are set to local midnight (00:00:00).
 *
 * @param {'1W'|'1M'|'YTD'|'3M'|'1Y'|'custom'} preset
 * @param {{ start: Date, end: Date } | null} customRange  — required when preset === 'custom'
 * @returns {{ start: Date, end: Date }}
 */
export function getDateRange(preset, customRange = null) {
  const now = new Date();
  const today = normalizeToLocalDate(now);  // local midnight today
  let start;

  switch (preset) {
    case '1W':
      start = new Date(today);
      start.setDate(today.getDate() - 7);
      break;
    case '1M':
      start = new Date(today);
      start.setMonth(today.getMonth() - 1);
      break;
    case '3M':
      start = new Date(today);
      start.setMonth(today.getMonth() - 3);
      break;
    case 'YTD':
      start = new Date(today.getFullYear(), 0, 1);  // Jan 1 of current year
      break;
    case '1Y':
      start = new Date(today);
      start.setFullYear(today.getFullYear() - 1);
      break;
    case 'custom':
      if (!customRange) throw new Error('customRange required for custom preset');
      return {
        start: normalizeToLocalDate(customRange.start),
        end: normalizeToLocalDate(customRange.end),
      };
    default:
      throw new Error(`Unknown preset: ${preset}`);
  }

  return { start, end: today };
}
```

### Pattern 4: IndexedDB Cache (idb@8)

**What:** Store transaction history by cache key (e.g., account ID + endpoint path) with a `cachedAt` timestamp. On read, compare `Date.now() - cachedAt` against `TTL_MS = 3600000` (1 hour). If stale, delete the record and return `null` so the caller fetches fresh data.

```javascript
// artha-cache.js
// Source: https://github.com/jakearchibald/idb
//         https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';

const DB_NAME    = 'artha-cache';
const DB_VERSION = 1;
const STORE_NAME = 'responses';
const TTL_MS     = 60 * 60 * 1000;  // 1 hour

// Singleton DB promise — open once, reuse connection.
let _db;
async function getDB() {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Object store keyed by cache key string (e.g., '/api/teller/accounts/abc123/transactions')
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      },
    });
  }
  return _db;
}

/**
 * Retrieve cached data for a key.
 * Returns null if the key does not exist or the cached entry has expired.
 */
export async function cacheGet(key) {
  const db = await getDB();
  const record = await db.get(STORE_NAME, key);
  if (!record) return null;

  const age = Date.now() - record.cachedAt;
  if (age > TTL_MS) {
    // Stale — delete and signal caller to re-fetch.
    await db.delete(STORE_NAME, key);
    return null;
  }
  return record.data;
}

/**
 * Store data in cache for a key.
 * Overwrites any existing entry for that key.
 */
export async function cachePut(key, data) {
  const db = await getDB();
  await db.put(STORE_NAME, { key, data, cachedAt: Date.now() });
}

/**
 * Manually invalidate a cache key (e.g., user clicked refresh).
 */
export async function cacheInvalidate(key) {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
}

/**
 * Invalidate all cached entries (full refresh).
 */
export async function cacheInvalidateAll() {
  const db = await getDB();
  await db.clear(STORE_NAME);
}
```

**Usage pattern in a view:**

```javascript
// In lakshmi.html or kubera.html <script type="module">
import { cacheGet, cachePut } from './artha-cache.js';

async function fetchTransactions(accountId) {
  const cacheKey = `/api/teller/accounts/${accountId}/transactions`;

  // 1. Check cache first
  const cached = await cacheGet(cacheKey);
  if (cached) {
    renderTransactions(cached);  // instant — no network call
    return;
  }

  // 2. Cache miss or stale — show skeleton while loading
  showSkeleton();
  const res  = await workerFetch(cacheKey, { headers: { Authorization: getAuthHeader() } });
  const data = await res.json();

  // 3. Store fresh data and render
  await cachePut(cacheKey, data);
  hideSkeleton();
  renderTransactions(data);
}
```

### Pattern 5: Skeleton Loading States

**What:** CSS shimmer animation on placeholder elements that mirror the actual content layout. Applied while an async data fetch is in progress. Each view manages its own skeleton HTML structure.

**Implementation:** A single CSS block added to the Shiva OS design system (can go in a shared `<style>` block or inline in each page). The shimmer uses the project's existing dark color tokens.

```css
/* Skeleton shimmer — fits dark mode color tokens */
/* Source: Standard CSS pattern, adapted to --bg-2/--border-1 tokens */

.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-2)     0%,
    var(--border-1) 50%,
    var(--bg-2)     100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  border-radius: 2px;   /* Match project's minimal radius aesthetic */
}

@keyframes skeleton-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Skeleton element variants matching layout shapes */
.skeleton-card  { height: 80px;  width: 100%; }
.skeleton-row   { height: 18px;  width: 100%; margin-bottom: 10px; }
.skeleton-row.short { width: 60%; }
.skeleton-chart { height: 180px; width: 100%; }
.skeleton-num   { height: 32px;  width: 120px; }
```

**JS toggle pattern:**

```javascript
// Show/hide skeleton vs real content
function showSkeleton(containerId) {
  document.getElementById(containerId + '-skeleton').style.display = 'block';
  document.getElementById(containerId + '-content').style.display  = 'none';
}
function hideSkeleton(containerId) {
  document.getElementById(containerId + '-skeleton').style.display = 'none';
  document.getElementById(containerId + '-content').style.display  = 'block';
}
```

### Pattern 6: Shared Date Filter Bar Component

**What:** A sticky bar rendered below the glassmorphic topbar. Renders 1W / 1M / YTD / 3M / 1Y / Custom buttons. Persists selected preset in localStorage as `artha-date-filter`. Fires a custom DOM event `datefilterchange` that any view can listen to.

```javascript
// date-filter.js

const STORAGE_KEY  = 'artha-date-filter';
const DEFAULT_PRESET = '1Y';
const PRESETS = ['1W', '1M', 'YTD', '3M', '1Y', 'custom'];

/**
 * Inject the filter bar HTML into a target element and wire up events.
 * Call once per page after DOMContentLoaded.
 *
 * @param {string} targetId  — ID of element to render the bar into
 * @param {function} onChange — callback(preset, {start, end}) called on selection
 */
export function initDateFilter(targetId, onChange) {
  const container = document.getElementById(targetId);
  if (!container) return;

  const saved   = localStorage.getItem(STORAGE_KEY) || DEFAULT_PRESET;
  let current   = PRESETS.includes(saved) ? saved : DEFAULT_PRESET;

  // Render filter bar
  container.innerHTML = `
    <div class="date-filter-bar" role="tablist" aria-label="Date range filter">
      ${PRESETS.map(p => `
        <button class="date-filter-btn${p === current ? ' active' : ''}"
                data-preset="${p}"
                role="tab"
                aria-selected="${p === current}">
          ${p}
        </button>`).join('')}
    </div>
  `;

  // Wire click events
  container.querySelectorAll('.date-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      if (preset === 'custom') {
        // Custom range: Claude's discretion — could open a date picker dialog
        // For now, fall through to onChange with null range (view handles dialog)
      }
      selectPreset(container, preset);
      current = preset;
      localStorage.setItem(STORAGE_KEY, preset);
      if (onChange) onChange(preset);
    });
  });

  // Fire initial callback so view loads with the saved range
  if (onChange) onChange(current);
}

function selectPreset(container, preset) {
  container.querySelectorAll('.date-filter-btn').forEach(btn => {
    const active = btn.dataset.preset === preset;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
  });
}
```

**CSS for the filter bar** (fits project design system):

```css
.date-filter-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 36px;
  background: var(--topbar-bg);
  border-bottom: 1px solid var(--border-0);
  position: sticky;
  top: 50px;          /* 50px = topbar height */
  z-index: 190;       /* Below topbar z-index: 200 */
  backdrop-filter: blur(12px);
}

.date-filter-btn {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--text-3);
  background: none;
  border: 1px solid transparent;
  border-radius: 1px;
  padding: 3px 10px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  text-transform: uppercase;
}

.date-filter-btn:hover {
  color: var(--text-2);
  border-color: var(--border-1);
}

.date-filter-btn.active {
  color: var(--gold);
  border-color: var(--gold-dim);
  background: var(--gold-bg);
}
```

**Usage in lakshmi.html:**

```html
<!-- In body, immediately after .topbar div -->
<div id="date-filter-mount"></div>

<script type="module">
  import { initDateFilter } from './date-filter.js';
  import { getDateRange }   from './artha-utils.js';

  initDateFilter('date-filter-mount', (preset) => {
    if (preset === 'custom') return; // handled separately
    const { start, end } = getDateRange(preset);
    loadDataForRange(start, end);
  });
</script>
```

### Anti-Patterns to Avoid

- **Float arithmetic on dollar amounts:** `0.1 + 0.2 === 0.30000000000000004` in JS. Always convert to cents first, do integer math, divide only at display time.
- **`new Date("2026-02-22")` (date-only string parsed as UTC midnight):** MDN specifies date-only strings are treated as UTC — this is Feb 22 midnight UTC, which is Feb 21 evening in Eastern US. Always include a time component or use `normalizeToLocalDate()` on ISO datetime strings.
- **`toISOString().split('T')[0]` for local date display:** `toISOString()` always returns UTC — comparing UTC date strings to local date expectations fails for users west of UTC. Use `localDateString()` instead.
- **Opening a new IndexedDB connection per operation:** `openDB()` is async and expensive. Open once, store the promise, reuse the `db` reference.
- **IndexedDB in a readwrite transaction kept open across `await` boundaries:** Transactions auto-commit when the event loop is returned without any pending requests. Complete all reads/writes in one synchronous burst after getting the store reference, or use `idb`'s shorthand methods (`db.get()`, `db.put()`) which each open their own short-lived transaction.
- **Hardcoding `localStorage.setItem('artha-date-filter', '1Y')` without checking existing value:** This would override the user's saved preference on every page load. Always read first, write only on explicit user action.
- **Using `Temporal` API:** Browser support is limited in 2026 (not Baseline). Stick with `Date`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB promise wrapper | Custom callback-to-promise shim around raw `indexedDB.open()` | `idb@8` via CDN | Raw IDB has subtle transaction lifecycle bugs (transactions expire between event loop ticks). idb handles this correctly and is ~1.19kB |
| Currency formatting | String concatenation with `toFixed(0)` + manual comma insertion | `Intl.NumberFormat('en-US', { style: 'currency', maximumFractionDigits: 0 })` | `Intl.NumberFormat` handles edge cases (negative formatting, locale grouping, currency symbol placement). Construction is expensive — instantiate once as a module-level constant |
| Float-safe currency math | `parseFloat((a + b).toFixed(2))` | `toCents()` + integer arithmetic + `fromCents()` | `toFixed()` does NOT fix floating-point errors (it rounds the string representation). Only integer arithmetic is truly safe |
| Timezone offset math | Manual `getTimezoneOffset()` arithmetic | `normalizeToLocalDate()` using `new Date(y, m, d)` constructor | The local constructor `new Date(year, month, day)` always produces midnight in local time — no offset calculation needed. DST transitions are handled automatically |
| Custom date picker for "custom" range | Building a full calendar widget | HTML `<input type="date">` native date picker, two inputs for start/end | Native date inputs are sufficient for this use case, accessible by default, and zero-dependency |

**Key insight:** The two most dangerous areas — floating-point currency and timezone date bucketing — are both solved by choosing the right representation (cents integers, local Date constructors) rather than by complex compensation logic.

---

## Common Pitfalls

### Pitfall 1: Float Accumulation Drift

**What goes wrong:** Summing 12 months of float dollar amounts produces a value like `$24,359.99999999997` instead of `$24,360`.
**Why it happens:** IEEE 754 double precision cannot represent 0.10, 0.30, etc. exactly. Errors are small but accumulate across thousands of additions.
**How to avoid:** Convert every incoming dollar value to cents with `toCents()` immediately. Sum integers. Convert to float only when calling `formatCurrency()` at the very end.
**Warning signs:** Displayed values that are off by $0.01 or show unexpected decimals when `minimumFractionDigits: 0` is set.

### Pitfall 2: UTC Date Parsing Cross-Midnight Bug

**What goes wrong:** A Teller transaction timestamped `"2026-02-22T05:00:00Z"` (midnight Eastern) is categorized under Feb 21 instead of Feb 22 for Eastern US users.
**Why it happens:** Any code that processes the date as UTC (`.getUTCDate()`, `.toISOString().split('T')[0]`) extracts the UTC calendar date (Feb 22), but if the app then *displays* it in local time without the same normalization, the bucket and display diverge. Conversely, code using only UTC methods when local display is expected always shifts.
**How to avoid:** Use `normalizeToLocalDate(isoString)` as the single normalization function. Compare filter ranges using `start <= normalizeToLocalDate(txDate) <= end`. Never mix UTC and local methods on the same date value.
**Warning signs:** Transactions disappearing near midnight, off-by-one-day errors in daily breakdowns, YTD totals that include Dec 31 of last year.

### Pitfall 3: IndexedDB Transaction Already Finished

**What goes wrong:** `db.put()` or `db.get()` throws `TransactionInactiveError` in the middle of an async flow.
**Why it happens:** IDB transactions auto-commit when control returns to the event loop without any active requests. If you `await fetch(...)` between getting a transaction and using it, the transaction closes.
**How to avoid:** Use `idb`'s top-level shorthand methods (`db.get(store, key)`, `db.put(store, value)`) — each creates its own micro-transaction. Never hold a raw transaction object across an `await` boundary to a non-IDB operation.
**Warning signs:** Console errors: `DOMException: The transaction has finished.` or `TransactionInactiveError` in IDB operations after async code.

### Pitfall 4: IndexedDB Not Available (Private Browsing in Safari)

**What goes wrong:** `indexedDB.open()` throws or returns an error in Safari private browsing mode.
**Why it happens:** Safari historically restricted IndexedDB in private mode. As of Safari 14+, this was largely fixed, but some versions still have quota limits of 0 bytes in private mode.
**How to avoid:** Wrap cache initialization in try/catch. If IndexedDB is unavailable, fall back gracefully: always fetch fresh data and skip caching. The app works, just without caching speed.
**Warning signs:** `UnknownError: An internal error was encountered in the Indexed Database server` or immediate quota errors on first `put()`.

### Pitfall 5: localStorage Key Collision Between Shiva OS Modules

**What goes wrong:** The date filter state set in `lakshmi.html` accidentally conflicts with a key used by another Shiva OS module.
**Why it happens:** The project already uses `shiva-theme` and `shiva-os-key` as localStorage keys. A generic key name like `dateFilter` or `preset` risks future conflicts.
**How to avoid:** Prefix all Artha-related localStorage keys with `artha-`. Convention: `artha-date-filter`, `artha-worker-url` (if ever moved from `shiva-worker-url`).
**Warning signs:** Unexpected filter state on load; another module's data appearing in the filter slot.

### Pitfall 6: Date Filter Bar z-index Conflict with Topbar

**What goes wrong:** The date filter bar overlaps the topbar or content scrolls behind both sticky elements without correct offset.
**Why it happens:** The project's topbar uses `z-index: 200` and `position: sticky; top: 0`. The filter bar must stack *below* the topbar (`z-index: 190`) and itself be `position: sticky; top: 50px` (the topbar height).
**How to avoid:** Set filter bar: `position: sticky; top: 50px; z-index: 190`. Main content area must NOT have `position: relative` without a higher z-index (would create a stacking context that hides sticky elements).
**Warning signs:** Filter bar disappears behind topbar when scrolling, or content scrolls over the filter bar.

---

## Code Examples

Verified patterns from official sources:

### Safe Dollar Addition

```javascript
// Source: MDN Intl.NumberFormat + standard integer arithmetic
import { toCents, formatCurrency } from './artha-utils.js';

// WRONG: float arithmetic
const wrong = 10.10 + 10.20 + 10.30;  // 30.599999999999998

// CORRECT: cents arithmetic
const a = toCents(10.10);  // 1010
const b = toCents(10.20);  // 1020
const c = toCents(10.30);  // 1030
const sum = a + b + c;     // 3060 (exact integer)
console.log(formatCurrency(sum));  // "$31"
```

### Local Date Day-Bucketing

```javascript
// Source: MDN Date — getFullYear/getMonth/getDate return LOCAL time
import { normalizeToLocalDate, localDateString } from './artha-utils.js';

// Teller API transaction timestamp (UTC)
const txTimestamp = "2026-02-22T05:00:00Z";

// WRONG — UTC date string (fails for Western hemisphere users)
const wrongDate = new Date(txTimestamp).toISOString().split('T')[0];  // "2026-02-22"
// But displayed as "Feb 21" in the UI because local rendering uses local time

// CORRECT — local date extraction
const localDate = normalizeToLocalDate(txTimestamp);
// In Eastern time (UTC-5): returns Date representing 2026-02-22 00:00:00 local
console.log(localDateString(localDate));  // "2026-02-22" ✓

// Filtering transactions in a date range:
function isInRange(txIsoString, start, end) {
  const txDate = normalizeToLocalDate(txIsoString);
  return txDate >= start && txDate <= end;
}
```

### IndexedDB Cache Read-Through

```javascript
// Source: https://github.com/jakearchibald/idb
import { cacheGet, cachePut } from './artha-cache.js';

async function getAccountTransactions(accountId, accessToken) {
  const key = `/api/teller/accounts/${accountId}/transactions`;

  // Try cache first
  const hit = await cacheGet(key);
  if (hit) return hit;  // No network call — cache valid

  // Fetch from Worker proxy
  const res  = await workerFetch(key, {
    headers: { 'Authorization': `Basic ${btoa(accessToken + ':')}` }
  });

  if (!res.ok) throw new Error(`Teller fetch failed: ${res.status}`);
  const data = await res.json();

  // Store in cache (TTL resets to 1 hour from now)
  await cachePut(key, data);
  return data;
}
```

### Skeleton Shimmer Toggle

```javascript
// Pure JS pattern — no dependencies
function withSkeleton(skeletonId, contentId, asyncFn) {
  const sk = document.getElementById(skeletonId);
  const ct = document.getElementById(contentId);
  sk.style.display = 'block';
  ct.style.display  = 'none';

  return asyncFn().finally(() => {
    sk.style.display = 'none';
    ct.style.display  = 'block';
  });
}

// Usage
withSkeleton('txn-skeleton', 'txn-content', () => fetchTransactions(accountId));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `parseFloat(val.toFixed(2))` for float rounding | Integer cents arithmetic throughout | Always been correct — adoption lags | Float "fix" doesn't actually fix representation errors, only hides them in display |
| Manual `getTimezoneOffset()` math for local dates | `new Date(y, m, d)` local constructor | Always available | Local constructor is DST-aware and timezone-correct without any manual offset calculation |
| `webkitIndexedDB` / callback-based raw IndexedDB | `indexedDB` (unprefixed) + `idb@8` promise wrapper | Prefix dropped ~2015; idb active since ~2018 | All major browsers support unprefixed IndexedDB; idb@8 is current stable |
| Temporal API (proposal) | `Date` object (use local methods) | Temporal not yet Baseline in 2026 | Do NOT use Temporal yet; limited browser support |
| CSS spinner (single rotating circle) | CSS skeleton shimmer matching layout shape | Industry pattern shift ~2016-2020 (pioneered by Facebook, LinkedIn) | Skeleton loaders reduce perceived wait time vs generic spinners |

**Deprecated/outdated:**
- `toLocaleString()` without explicit `Intl.NumberFormat` options: Formatting depends on browser locale and may be inconsistent. Use `new Intl.NumberFormat('en-US', {...})` with explicit options.
- `moment.js`: Heavy (67kB min), in maintenance mode. Not needed here anyway — vanilla `Date` handles everything required.
- `webkitIndexedDB`, `mozIndexedDB` vendor prefixes: Dropped by all major browsers. Use `indexedDB` directly.

---

## Open Questions

1. **Custom date range UI — date picker approach**
   - What we know: User requested custom range as one of the filter options. HTML `<input type="date">` native inputs are zero-dependency and accessible.
   - What's unclear: Whether the custom range UI should be an inline input pair (replacing the filter bar buttons) or a modal dialog on "custom" click.
   - Recommendation (Claude's discretion): Render a compact inline start/end input pair that appears when "custom" is clicked, replacing or extending the button row. Simpler than a modal, no z-index issues.

2. **Refresh mechanism — UI button vs browser refresh**
   - What we know: Cache is 1 hour TTL, explicit refresh only. A UI refresh button (`⟳`) in the topbar-right area is conventional (Robinhood, Mint both use this).
   - What's unclear: Whether the refresh button should invalidate all caches or only the current view's cache.
   - Recommendation: Add a small `⟳ refresh` button in the Artha topbar-right. On click, call `cacheInvalidateAll()` then re-run the current view's data load. This is the most user-friendly behavior.

3. **Teller API date format confirmation**
   - What we know: Teller returns transaction dates. The exact format (ISO UTC, date-only, local) is not confirmed from Phase 1 research — Phase 1 used sandbox mode.
   - What's unclear: Whether Teller sends `"2026-02-22"` (date-only, parsed as UTC midnight by `new Date()`) or `"2026-02-22T05:00:00Z"` (UTC datetime) or `"2026-02-22T00:00:00-05:00"` (local datetime).
   - Recommendation: `normalizeToLocalDate()` handles all three formats correctly via the local constructor pattern. If Teller sends date-only strings, add one explicit guard: `if (str.length === 10) str += 'T00:00:00'` before `new Date(str)` to avoid the UTC-midnight trap for date-only strings.

---

## Sources

### Primary (HIGH confidence)

- [MDN: Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) — openDB pattern, transaction lifecycle, TTL schema design
- [MDN: Intl.NumberFormat constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat) — currency formatting with `maximumFractionDigits: 0`, verified `$3,500` output
- [MDN: Date.prototype.getTimezoneOffset()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset) — offset sign convention (positive = behind UTC), DST behavior
- [MDN: Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) — date-only ISO string parsed as UTC midnight; local Date methods; local constructor `new Date(y,m,d)`
- [MDN: Temporal.ZonedDateTime](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime) — confirmed "Limited availability", NOT Baseline in 2026 — do not use
- [GitHub: jakearchibald/idb](https://github.com/jakearchibald/idb) — `openDB` signature, shorthand methods (`db.get`, `db.put`, `db.delete`), CDN ESM import path, version 8.x, ~1.19kB brotli

### Secondary (MEDIUM confidence)

- [web.dev: Work with IndexedDB](https://web.dev/articles/indexeddb) — official Google recommendation to use idb library; transaction lifecycle rules
- [jsdelivr CDN: idb@8](https://www.jsdelivr.com/package/npm/idb) — confirmed CDN URL: `https://cdn.jsdelivr.net/npm/idb@8/+esm`
- [DEV Community: Browser Storage Deep Dive](https://dev.to/mino/browser-storage-deep-dive-cache-vs-indexeddb-for-scalable-pwas-35f4) — TTL schema pattern (cachedAt field), stale-delete pattern
- [Ursa Health: Dates and Timezones in JS](https://www.ursahealth.com/new-insights/dates-and-timezones-in-javascript) — `getTimezoneOffset()` arithmetic for local time; DST handling
- [Dark CSS: Skeleton Loading Animation](https://darkcssweb.com/skeleton-loading-animation/) — dark mode shimmer color guidance; `background-size: 200%` + `background-position` keyframes pattern

### Tertiary (LOW confidence)

- None — all critical implementation claims verified against MDN or official library documentation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `Intl.NumberFormat`, `Date` local methods, `idb@8` all verified via MDN + official GitHub
- Architecture: HIGH — File structure, module pattern consistent with existing ESM CDN usage in project (Krishna chat uses `esm.sh`); filter bar z-index approach derived from confirmed topbar CSS in `lakshmi.html`
- Pitfalls: HIGH — UTC date-only trap confirmed by MDN spec; float accumulation is fundamental IEEE 754; IDB transaction lifecycle confirmed by MDN + web.dev; Temporal non-availability confirmed by MDN "Limited availability" badge
- Custom range UI: MEDIUM — native `<input type="date">` recommendation is solid, but exact layout/interaction is Claude's discretion

**Research date:** 2026-02-25
**Valid until:** 2026-08-25 (6 months — `Intl.NumberFormat`, `Date`, and `idb@8` are stable; Temporal status to re-check before adopting)
