# Architecture Research

**Domain:** Client-side financial dashboard with third-party financial API integration
**Researched:** 2026-02-23
**Confidence:** HIGH (auth flows), MEDIUM (proxy implementation specifics)

---

## The Critical Architecture Question

The Artha Dashboard wants to be pure client-side HTML/CSS/JS with no backend. But both target APIs
require server-side components. This section addresses that conflict directly before anything else.

### Teller API: Server Proxy Is Non-Negotiable

Teller requires mTLS (mutual TLS) for every API request. The client must present a certificate
that Teller issued to your application. Browsers cannot load and present arbitrary TLS client
certificates to outbound fetch() requests. This is a hard technical constraint — not a policy
choice — enforced by the browser security model.

What this means concretely:

- `fetch("https://api.teller.io/accounts", { cert: ... })` is not possible in a browser
- The Teller Connect JavaScript embed (CDN script) handles the user-facing enrollment UI in the
  browser — this part IS browser-safe
- After enrollment, the `onSuccess` callback delivers an `accessToken` to the browser
- That access token is useless from the browser — it only works when presented alongside the mTLS
  certificate, which must live server-side

**Resolution:** A lightweight server-side proxy holds the mTLS certificate and private key. The
browser sends the access token to the proxy; the proxy adds the certificate and forwards to
`api.teller.io`. The proxy is the only component that touches the Teller certificate.

### eBay API: Server Proxy Is Required for CORS

eBay's OAuth token endpoint (`api.ebay.com/identity/v1/oauth2/token`) does not include
`Access-Control-Allow-Origin` headers in its responses. Browsers block these requests. This is
confirmed by multiple eBay developer forum threads and is a known, persistent eBay API constraint.

Additionally, eBay client credentials (App ID, Cert ID) cannot be in client-side code without
exposing them to anyone who opens DevTools.

**Resolution:** Same proxy handles eBay token exchange and API forwarding. eBay credentials stay
in proxy environment variables, never reach the browser.

### The Proxy Solution: Cloudflare Workers (Free Tier)

Cloudflare Workers support mTLS certificate bindings (confirmed in Cloudflare docs, 2025).
Implementation: upload the Teller client certificate and private key as a Workers mTLS binding,
then reference it in `fetch()` calls from the Worker script.

Workers free tier: 100,000 requests/day at no cost, no credit card required.

For a single-user personal dashboard, 100K requests/day is effectively unlimited.

This means the proxy can be:
- Deployed in under an hour
- Free indefinitely at this scale
- Stateless — it holds no user data, just forwards authenticated requests
- The only server-side component in the entire system

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (client)                                │
│                                                                          │
│  ┌────────────────────────┐    ┌────────────────────────────────────┐   │
│  │   lakshmi.html         │    │   kubera.html                       │   │
│  │   (Personal Finance)   │    │   (Business Finance)                │   │
│  │                        │    │                                      │   │
│  │  - Teller Connect UI   │    │  - Teller Connect UI               │   │
│  │  - Chart.js renders    │    │  - Chart.js renders                │   │
│  │  - localStorage reads  │    │  - eBay data views                 │   │
│  └──────────┬─────────────┘    └────────────────┬───────────────────┘   │
│             │                                   │                        │
│             └─────────────┬─────────────────────┘                        │
│                           │ fetch()                                       │
│  ┌────────────────────────▼────────────────────────────────────────┐    │
│  │               artha-cache (localStorage / IndexedDB)             │    │
│  │   - Teller access tokens (per enrollment)                        │    │
│  │   - API response cache with TTL timestamps                       │    │
│  │   - Account metadata (labels, personal/business flag)            │    │
│  │   - Chart display preferences, date filter state                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                               fetch() to proxy
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                     CLOUDFLARE WORKERS (proxy layer)                     │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  artha-proxy Worker                                               │   │
│  │                                                                   │   │
│  │  Bindings (env vars, secret):                                     │   │
│  │    TELLER_CERT  (mTLS certificate binding)                        │   │
│  │    EBAY_APP_ID, EBAY_CERT_ID, EBAY_CLIENT_SECRET                  │   │
│  │                                                                   │   │
│  │  Routes:                                                          │   │
│  │    POST /teller/*   → api.teller.io/* + mTLS cert                 │   │
│  │    POST /ebay/token → api.ebay.com/identity/v1/oauth2/token       │   │
│  │    GET  /ebay/*     → api.ebay.com/* + Bearer token               │   │
│  │                                                                   │   │
│  │  CORS headers added on responses back to browser                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────┬──────────────────────────┬────────────────────────┘
                      │ mTLS + access token       │ App credentials + Bearer
                      ▼                           ▼
          ┌───────────────────┐       ┌─────────────────────┐
          │   Teller API      │       │   eBay REST APIs     │
          │   api.teller.io   │       │   api.ebay.com       │
          │                   │       │                       │
          │  /accounts        │       │  /sell/analytics      │
          │  /accounts/*/     │       │  /sell/finances       │
          │   transactions    │       │  /sell/fulfillment    │
          │  /accounts/*/     │       │                       │
          │   balances        │       │                       │
          └───────────────────┘       └─────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Lives In |
|-----------|---------------|-------------------|----------|
| `lakshmi.html` | Personal finance views, Teller Connect enrollment UI, chart rendering | artha-cache (read/write), artha-proxy (fetch) | Browser |
| `kubera.html` | Business finance + eBay views, Teller Connect enrollment UI, Reports view | artha-cache (read/write), artha-proxy (fetch) | Browser |
| `artha-cache` | localStorage/IndexedDB layer: tokens, API response cache, user preferences | Both HTML files (read/write) | Browser |
| `artha-proxy` | mTLS certificate holder, CORS resolver, credential keeper, API forwarder | Teller API, eBay API | Cloudflare Workers |
| Teller API | Bank/card/investment account data | artha-proxy only (never browser directly) | Teller servers |
| eBay REST API | Sales, fees, inventory, analytics | artha-proxy only (never browser directly) | eBay servers |
| Teller Connect (CDN) | Enrollment UI, institution auth, account selection | Teller auth servers, delivers token to browser | CDN + browser |

---

## Auth Flows

### Teller Auth Flow

```
1. User clicks "Connect Account" in lakshmi.html or kubera.html
       │
2. Browser loads Teller Connect widget from cdn.teller.io/connect/connect.js
       │
3. User selects institution, authenticates with their bank, selects accounts
       │  (all handled by Teller Connect UI — browser talks directly to Teller)
       │
4. onSuccess(enrollment) callback fires in browser JavaScript
       │  enrollment = { accessToken: "token_xxx", userId, enrollmentId, ... }
       │
5. Browser stores accessToken in artha-cache (localStorage)
       │  Key pattern: `artha-token-{enrollmentId}`
       │  User labels as "personal" or "business" at this point
       │
6. For subsequent data fetches:
       Browser → artha-proxy (with token in Authorization header)
       artha-proxy → api.teller.io (with token + mTLS cert)
       api.teller.io → returns account data
       artha-proxy → strips sensitive headers, adds CORS headers, returns to browser
       Browser → writes response to artha-cache with TTL timestamp
```

Security note: The access token in localStorage is a pragmatic compromise. For a single-user
personal dashboard on a personally-controlled device, this is acceptable. The token is useless
without the mTLS certificate (which never leaves the Worker). This is explicitly documented in
Teller's authentication docs.

### eBay Auth Flow

```
1. User provides eBay App ID and Cert ID once via settings UI in kubera.html
       │
2. kubera.html sends credentials to artha-proxy (POST /ebay/token)
       │
3. artha-proxy exchanges credentials for an Application access token
       │  POST to api.ebay.com/identity/v1/oauth2/token (Client Credentials grant)
       │  Token valid for 2 hours
       │
4. artha-proxy returns token to browser (or caches it internally)
       │
5. For eBay data requests:
       Browser → artha-proxy (GET /ebay/sell/analytics/...)
       artha-proxy → api.ebay.com (with Bearer token)
       api.ebay.com → returns seller data
       artha-proxy → adds CORS headers, returns to browser
       Browser → writes to artha-cache with TTL timestamp
```

Note: eBay credentials (App ID, Cert ID) are stored in Workers environment variables, not in the
browser. The browser only sees API responses, never raw credentials.

---

## Data Flow: API Response to Chart

```
Trigger (page load OR user changes date filter OR manual refresh)
    │
    ▼
artha-cache.get(cacheKey)
    │
    ├── Cache HIT and not stale (TTL not expired) ──────────────────────┐
    │                                                                     │
    └── Cache MISS or stale                                              │
           │                                                             │
           ▼                                                             │
      fetch(artha-proxy/teller/accounts/*/transactions)                 │
           │                                                             │
           ▼                                                             │
      Parse and normalize response into internal data model             │
           │                                                             │
           ▼                                                             │
      artha-cache.set(cacheKey, data, ttl)  ──────────────────────────┐│
                                                                        ││
                                                    ◄───────────────────┘│
                                                    ◄────────────────────┘
                                                    │
                                                    ▼
                                          filter by date range
                                                    │
                                                    ▼
                                          aggregate / compute metrics
                                          (spending by category,
                                           net worth delta, etc.)
                                                    │
                                                    ▼
                                          Chart.js .update() or
                                          DOM element textContent update
```

---

## Client-Side Storage Strategy

### What Goes in localStorage vs IndexedDB

localStorage is synchronous, limited to ~5MB, and stores strings. IndexedDB is async, stores
objects natively, and can use gigabytes. For this project:

**localStorage** (simple, synchronous, fits within 5MB for small datasets):
- Teller access tokens (per enrollment, small strings)
- eBay app credentials if user enters them in browser (optional, see security note)
- User preferences (active view, date filter state, personal/business labels)
- `shiva-theme` (existing key, dark/light mode)

**IndexedDB** (large structured data, needs async access):
- Transaction history (can be thousands of records per account)
- Historical balance snapshots for time-series charts
- eBay order history and sales data

A simple wrapper module handles both storage layers transparently:

```javascript
// artha-cache.js (inlined into each module's <script>)
const ArthaCache = {
  TTL: {
    BALANCES: 5 * 60 * 1000,       // 5 minutes
    TRANSACTIONS: 15 * 60 * 1000,  // 15 minutes
    ACCOUNTS: 60 * 60 * 1000,      // 1 hour
    INVESTMENTS: 5 * 60 * 1000,    // 5 minutes
    EBAY_METRICS: 30 * 60 * 1000,  // 30 minutes
  },

  async get(key) {
    // Try localStorage first (fast, synchronous via wrapper)
    const raw = localStorage.getItem(`artha-cache-${key}`);
    if (raw) {
      const { data, expires } = JSON.parse(raw);
      if (Date.now() < expires) return data;
    }
    // Fall back to IndexedDB for large datasets
    return await idbGet(key);
  },

  async set(key, data, ttl) {
    const payload = { data, expires: Date.now() + ttl };
    const serialized = JSON.stringify(payload);
    if (serialized.length < 200_000) { // ~200KB threshold
      localStorage.setItem(`artha-cache-${key}`, serialized);
    } else {
      await idbSet(key, payload);
    }
  }
};
```

### Cache Key Conventions

```
artha-cache-accounts-{enrollmentId}
artha-cache-transactions-{accountId}-{dateRange}
artha-cache-balances-{accountId}
artha-cache-investments-{accountId}
artha-cache-ebay-analytics-{dateRange}
artha-token-{enrollmentId}
artha-account-meta-{enrollmentId}    (personal vs business label, display name)
```

---

## File Structure

This project does not use a build system. The structure extends existing Shiva OS:

```
shiva-os/
├── index.html                  # Root (unchanged)
├── lakshmi.html                # Personal finance — REBUILT
├── kubera.html                 # Business finance — REBUILT
│
├── artha-proxy/                # Cloudflare Worker (separate deploy)
│   ├── wrangler.toml           # Worker config, mTLS bindings, env vars
│   └── worker.js               # Proxy logic (~150 lines)
│
├── .planning/
│   └── research/
│       └── ARCHITECTURE.md     # This file
│
└── CLAUDE.md                   # Project intelligence (existing)
```

Note: `artha-proxy/` is a standalone deploy. It does not affect any other Shiva OS module.
The Worker URL (`artha-proxy.your-subdomain.workers.dev`) is stored in localStorage so it can be
configured without modifying the HTML files.

---

## Architectural Patterns to Follow

### Pattern 1: Cache-First with Background Revalidation

**What:** Return cached data immediately, trigger a background fetch to refresh if stale. Charts
render instantly on cached data; a silent refresh updates them seconds later.

**When:** Every API call. Financial data doesn't change second-by-second. Perceived performance
matters more than absolute freshness.

**Implementation:**
```javascript
async function getAccountData(accountId) {
  const cached = await ArthaCache.get(`balances-${accountId}`);
  if (cached) {
    renderCharts(cached);              // Render immediately
    if (ArthaCache.isStale(cached)) { // But check if stale
      fetchFresh(accountId).then(data => {
        ArthaCache.set(`balances-${accountId}`, data, ArthaCache.TTL.BALANCES);
        renderCharts(data);            // Re-render with fresh data
      });
    }
    return cached;
  }
  const data = await fetchFresh(accountId);
  ArthaCache.set(`balances-${accountId}`, data, ArthaCache.TTL.BALANCES);
  renderCharts(data);
  return data;
}
```

### Pattern 2: Single Source of Truth for Account Metadata

**What:** Account metadata (which enrollment is personal vs business, display names, institution
name) lives in one localStorage key per enrollment. Both lakshmi.html and kubera.html read the
same metadata — they do not duplicate it.

**When:** Always. Prevents drift where lakshmi and kubera disagree on which accounts are which.

**Implementation:**
```javascript
// Stored once at enrollment time
const meta = {
  enrollmentId: enrollment.enrollmentId,
  institutionName: enrollment.institution.name,
  scope: 'personal', // or 'business' — user picks at enrollment
  addedAt: Date.now(),
  accessToken: enrollment.accessToken,
};
localStorage.setItem(`artha-account-meta-${enrollment.enrollmentId}`, JSON.stringify(meta));
```

### Pattern 3: View-Specific Data Fetching

**What:** Each view (Dashboard, Cashflow, Accounts, Investments, Transactions) fetches only the
data it needs when it becomes active. Lazy load, not eager load.

**When:** Tab navigation. Do not prefetch all data on page load — Teller has rate limits.

**Implementation:**
```javascript
function switchView(viewName) {
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === viewName));
  if (viewName === 'investments') initInvestmentsView();
  if (viewName === 'transactions') initTransactionsView();
  // etc.
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Calling Teller API Directly from the Browser

**What people try:** `fetch("https://api.teller.io/accounts", { headers: { Authorization: "Basic token" } })`

**Why it fails:** Teller requires mTLS. Even if CORS weren't an issue, the browser cannot present
the Teller-issued client certificate. The request will fail at the TLS handshake.

**Do this instead:** All Teller calls go through `artha-proxy`. The browser only ever calls the
Worker URL.

### Anti-Pattern 2: Storing eBay Client Secret in localStorage or HTML Source

**What people try:** `const EBAY_SECRET = "abc123"` in the script block of kubera.html.

**Why it's wrong:** Anyone who views source or opens DevTools can exfiltrate the credential and
make eBay API calls as the application.

**Do this instead:** eBay App ID, Cert ID, and Client Secret live in Cloudflare Workers environment
variables. The browser sends a request to the proxy; the proxy supplies the credentials. The browser
never sees them.

### Anti-Pattern 3: Fetching All Transactions on Every Page Load

**What people try:** On DOMContentLoaded, fetch 12 months of transactions from all accounts.

**Why it's wrong:** Teller has undocumented rate limits. Fetching all data eagerly can burn through
rate limits, cause errors, and slow page load to seconds.

**Do this instead:** Fetch on demand per view, per date range. Cache aggressively. Default date
range is short (1 month). Expand on user request.

### Anti-Pattern 4: One Monolithic Data Model Object

**What people try:** One giant `window.arthaData = {}` containing all accounts, all transactions,
all balances, updated in place.

**Why it's wrong:** When one async fetch completes out of order and overwrites a different account's
data, charts silently show wrong numbers. Hard to debug.

**Do this instead:** Keyed cache by account ID and date range. Each fetch is independent and writes
to its own key. Charts read from their specific key.

---

## Build Order (Phase Dependencies)

The architecture creates clear build dependencies. This is the required order:

```
Phase 1: Proxy (artha-proxy Worker)
    Must exist before any API work begins.
    Nothing else can be tested without it.
    Deliverable: Working Worker that proxies Teller and eBay, deployable in dev mode.
    │
    ▼
Phase 2: Cache Layer (artha-cache module)
    Must exist before data flows into charts.
    Deliverable: ArthaCache module, tested with mocked data, handles localStorage + IndexedDB.
    │
    ▼
Phase 3: Teller Connect Enrollment + Account Routing
    Teller Connect CDN embed, onSuccess handler, personal/business labeling,
    token storage via artha-cache.
    Deliverable: Can enroll a bank account, token stored, account marked personal or business.
    │
    ▼
Phase 4: Core Data Views (Dashboard first, then Accounts, Transactions)
    First real end-to-end: proxy → Teller → cache → DOM.
    Chart.js integration. Date filter state.
    Deliverable: Lakshmi Dashboard view shows live bank data.
    │
    ▼
Phase 5: Remaining Lakshmi Views (Cashflow, Investments)
    Investment account data has different shape than bank data.
    Deliverable: All 5 Lakshmi views functional.
    │
    ▼
Phase 6: eBay Integration + Kubera
    eBay credentials setup, eBay data into Kubera views.
    Kubera is Lakshmi's business twin — reuse patterns, scope to business accounts.
    Deliverable: All 5 Kubera views + eBay data flowing.
    │
    ▼
Phase 7: Kubera Reports View
    Computed financials: P&L, DCF, tax estimates, unit economics.
    No new API work — pure computation on already-cached data.
    Deliverable: Reports view with calculation tooltips.
```

---

## Integration Points

### External Services

| Service | Integration Pattern | Auth | CORS | Notes |
|---------|---------------------|------|------|-------|
| Teller API | Via artha-proxy Worker | mTLS cert + access token (proxy handles) | Resolved by proxy | Free for <100 enrollments in dev |
| Teller Connect (CDN) | Direct browser embed | None (Teller handles institution auth) | Not an issue — CDN script | `cdn.teller.io/connect/connect.js` |
| eBay REST API | Via artha-proxy Worker | Client Credentials OAuth (proxy handles) | Resolved by proxy | Token refresh needed every 2 hours |
| Cloudflare Workers | Direct browser fetch | None (proxy is public endpoint) | Configured in Worker | Free tier: 100K req/day |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| lakshmi.html / kubera.html | Share nothing directly — both read from artha-cache | No cross-page communication needed |
| artha-cache ↔ HTML modules | Direct localStorage/IndexedDB calls, same origin | Synchronous for small data, async for large |
| Browser ↔ artha-proxy | fetch() with JSON bodies, Authorization header for Teller token | Proxy URL stored in localStorage |
| artha-proxy ↔ Teller API | HTTPS + mTLS, HTTP Basic Auth for access token | Cert binding in wrangler.toml |
| artha-proxy ↔ eBay API | HTTPS, OAuth Bearer token | Proxy refreshes token automatically |

---

## Scalability Considerations

This is a single-user personal dashboard. Scale is not the concern. The constraints that matter:

| Concern | Reality | Mitigation |
|---------|---------|------------|
| Teller rate limits | Undocumented, enforced in dev/prod | Aggressive caching, lazy fetch per view |
| eBay token expiry | 2-hour token lifetime | Proxy auto-refreshes before expiry |
| localStorage 5MB cap | Transaction history can exceed this | Transaction history goes to IndexedDB |
| Cloudflare free tier | 100K req/day | More than sufficient for single user |
| Chart.js memory | Rendering large datasets can be slow | Aggregate data before passing to Chart.js, limit time windows |

---

## Sources

- Teller API Authentication (mTLS requirement): https://teller.io/docs/api/authentication — HIGH confidence
- Teller Connect enrollment flow: https://teller.io/docs/guides/connect — HIGH confidence
- Teller pricing / dev environment: https://teller.io/docs/guides/environments — MEDIUM confidence (WebSearch)
- eBay CORS restrictions (confirmed by eBay developer forum, multiple threads): https://forums.developer.ebay.com/questions/25263/javascript-fetch-cors-issue.html — HIGH confidence (multiple sources agree)
- eBay OAuth client credentials grant: https://developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html — HIGH confidence
- eBay token validity (2 hours): https://developer.ebay.com/api-docs/static/oauth-tokens.html — MEDIUM confidence (WebSearch)
- Cloudflare Workers mTLS support: https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/ — HIGH confidence
- Cloudflare Workers free tier (100K req/day): https://developers.cloudflare.com/workers/platform/pricing/ — HIGH confidence
- localStorage 5MB limit / IndexedDB alternative: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria — HIGH confidence
- Access token in localStorage security tradeoffs: https://auth0.com/docs/secure/security-guidance/data-security/token-storage — MEDIUM confidence (applies to multi-user apps; single-user dashboard with mTLS-gated tokens is lower risk)
- Stale-while-revalidate caching pattern: https://www.enjoyalgorithms.com/blog/refresh-ahead-caching-pattern/ — MEDIUM confidence

---

*Architecture research for: Shiva OS Artha Dashboard (Lakshmi + Kubera)*
*Researched: 2026-02-23*
