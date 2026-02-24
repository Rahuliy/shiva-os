# Pitfalls Research

**Domain:** Client-side financial dashboard (Teller API + eBay API, pure HTML/CSS/JS)
**Researched:** 2026-02-23
**Confidence:** HIGH for CORS/mTLS blockers (official docs confirmed), MEDIUM for charting/UX patterns, MEDIUM for security posture

---

## Critical Pitfalls

### Pitfall 1: Teller API Requires mTLS — Cannot Be Called Directly From a Browser

**What goes wrong:**
Teller API authenticates API callers using mutual TLS (mTLS) — the client must present a certificate issued by Teller alongside every request. Browsers cannot handle mTLS client certificates for arbitrary server connections. The result: every call to `api.teller.io` from a browser returns a connection error or TLS handshake failure. The Teller access token (obtained after Teller Connect) is literally useless without the accompanying client certificate. You can't just throw the token in an Authorization header from fetch() and call it done.

**Why it happens:**
Teller Connect (the browser UI widget) handles the bank authentication flow and yields an access token — this part runs in browser fine. Developers assume the access token is all they need and then try calling the REST API from the same browser context. The mTLS requirement is documented but easy to miss when skimming the quickstart.

**How to avoid:**
A CORS proxy or serverless function must sit between the browser and `api.teller.io`. The proxy holds the Teller client certificate and private key server-side, accepts requests from the browser with the access token, attaches the certificate, and forwards to Teller. Options for the no-backend constraint:
- Cloudflare Worker (free tier, deploy a tiny proxy script that loads the cert from an environment variable)
- A local proxy script (Node/Python) run on localhost for personal use only

**Warning signs:**
- TLS handshake errors or `net::ERR_SSL_CLIENT_AUTH_CERT_NEEDED` in the browser console when calling `api.teller.io`
- Sandbox works (mTLS not enforced in sandbox), production fails
- The Teller docs note: "mTLS is not required in the sandbox environment"

**Phase to address:**
API Integration phase — must architect the Cloudflare Worker proxy before writing a single line of financial data fetching code. Do not start building UI against live Teller data until the proxy layer is validated end-to-end.

---

### Pitfall 2: eBay API Has No CORS Headers — Also Blocked From Browser

**What goes wrong:**
eBay's REST APIs (including Sell Analytics, Inventory, Fulfillment) do not include `Access-Control-Allow-Origin` headers in their responses. Browsers block these responses entirely. Every `fetch()` call to `api.ebay.com` from the browser will fail with a CORS error. This has been a known issue for years in the eBay developer forums with no resolution from eBay.

**Why it happens:**
eBay's APIs were designed for server-side integrations. The developer community has been requesting CORS support repeatedly (confirmed in eBay developer forums). eBay has not added it. The third-party `ebay-api` npm library acknowledges this explicitly and provides a Cloudflare Worker proxy for browser usage.

**How to avoid:**
Same proxy pattern as Teller: route eBay API calls through a Cloudflare Worker or equivalent. The Worker holds the eBay OAuth client credentials (App ID + Client Secret), exchanges them for tokens, and proxies requests. The browser only ever talks to your Worker URL.

**Warning signs:**
- Any attempt to call `api.ebay.com` directly from fetch() in the browser fails immediately with CORS error
- Works fine in Postman or curl (server context) but fails in browser

**Phase to address:**
API Integration phase — same proxy layer as Teller. The Cloudflare Worker should handle both Teller (certificate attachment) and eBay (CORS proxy + credential management) from the start.

---

### Pitfall 3: eBay Client Secret Exposed in Browser JavaScript

**What goes wrong:**
eBay's OAuth flow requires a Client Secret (App ID + Dev ID + Cert ID combination) to obtain access tokens. If this is embedded in localStorage or in the JavaScript source of an HTML file, anyone who opens DevTools can steal it and use it against your eBay seller account. Unlike the Teller access token (scoped per-user with the certificate), the eBay client credentials give access to the entire application.

**Why it happens:**
The no-backend constraint creates pressure to store credentials somewhere accessible. localStorage feels natural since `shiva-os-key` already uses it for the Anthropic key. But the eBay client secret is an application credential, not a user credential — it should never leave a server context.

**How to avoid:**
The Cloudflare Worker (needed for CORS anyway) is the right place to store and use the eBay client secret. The Worker environment variables hold the secret. The browser sends a request to the Worker; the Worker calls eBay with proper credentials. The browser never sees the client secret. The Worker URL itself is not secret — only the credentials stored in its environment are.

**Warning signs:**
- The eBay App ID, Dev ID, or Cert ID appear anywhere in `.html` files or are stored in localStorage
- The eBay OAuth token exchange is happening from browser-side code

**Phase to address:**
Architecture phase (before any eBay integration work). The Cloudflare Worker architecture must be established first. If the Worker is built first, this pitfall is structurally prevented.

---

### Pitfall 4: Bank Connection Silently Expires — No Error, Just Empty Data

**What goes wrong:**
Teller bank connections (enrollments) can disconnect without warning when a user changes their bank password, the bank requires fresh MFA, or the institution's session expires. When this happens, API calls return errors or empty data rather than surfacing a clear "reconnect required" message. Without proper error handling, the dashboard silently shows stale or missing data with no indication of why.

**Why it happens:**
Teller sends a webhook (`enrollment.disconnected`) when a connection breaks, but webhooks require a server to receive them. In a pure client-side app, there are no webhooks. The disconnection is only discoverable when a subsequent API call fails. If error handling treats all failures the same (or ignores them), the user never knows why their balance shows $0.

**How to avoid:**
When any Teller API call returns a 401 or 403, treat it as a disconnection signal. Detect the specific error code, surface a prominent "Re-link Account" prompt with the institution name, and use `TellerConnect.setup({ enrollmentId: ... })` to repair the connection. Store the `enrollmentId` in localStorage alongside the access token so re-authentication can target the right enrollment.

**Warning signs:**
- Dashboard shows $0 balances or missing accounts with no error message
- API calls returning 401 with error body mentioning `enrollment.disconnected`
- Accounts view shows blank sections

**Phase to address:**
Error handling phase — immediately after first successful data fetch, before any other features are considered complete. The "happy path" is not enough for a financial dashboard.

---

## Moderate Pitfalls

### Pitfall 5: Chart.js Canvas Not Destroyed on View Switches

**What goes wrong:**
When the user switches between the 5 views (Dashboard, Cashflow, Accounts, Investments, Transactions), each view may re-render charts. If the previous chart instance on a canvas element is not explicitly destroyed before creating a new one, Chart.js throws a warning and memory usage grows. In severe cases, charts render on top of each other producing visual corruption.

**How to avoid:**
Maintain a registry of active chart instances (e.g., `const charts = {}`). Before creating any new chart on a canvas, check if `charts[canvasId]` exists and call `.destroy()` on it first. On every view switch, destroy all charts in the outgoing view before mounting the incoming view's charts.

**Warning signs:**
- Console warning: "Canvas is already in use. Chart with ID X must be destroyed"
- Memory usage creeps up as user switches views
- Charts showing double-rendered data or visual artifacts

**Phase to address:**
Chart integration phase — establish the destroy pattern in the first chart implementation so it becomes the habit for all subsequent charts.

---

### Pitfall 6: Floating Point Errors in Financial Calculations

**What goes wrong:**
JavaScript uses IEEE 754 floating point. `0.1 + 0.2 === 0.30000000000000004`. In a financial dashboard this produces display artifacts: totals that show `$12,450.30000000001`, percentages that add to `99.99999999%`, or budget calculations that are off by fractions of a cent. The P&L and DCF analysis in Kubera's Reports view is especially vulnerable.

**How to avoid:**
All financial arithmetic must go through a cents-based integer approach: multiply currency values by 100 to work in cents, do all math as integers, then divide by 100 for display. For display formatting, use `Intl.NumberFormat` with appropriate options rather than manual string manipulation. Never chain raw floating point operations.

```javascript
// Wrong
const total = transactions.reduce((sum, t) => sum + t.amount, 0);

// Right (cents-based)
const totalCents = transactions.reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
const total = totalCents / 100;
```

**Warning signs:**
- Any displayed dollar amount with more than 2 decimal places
- Category totals that don't sum correctly to the displayed grand total
- Budget percentage that shows as 99.97% when it should be 100%

**Phase to address:**
Data layer phase — establish a `formatCurrency(cents)` utility and `toCents(dollars)` helper before any calculation logic is written.

---

### Pitfall 7: Timezone Bugs in Transaction Date Filtering

**What goes wrong:**
Teller and eBay return dates as ISO 8601 strings (e.g., `"2026-02-22T23:45:00Z"`). When JavaScript's `new Date("2026-02-22")` parses a date-only string, it interprets it as UTC midnight — which is the previous day in Rahul's timezone (America/New_York, UTC-5). Date filters like "1W" or "YTD" can include or exclude transactions incorrectly, causing the wrong data to appear for a given period.

**How to avoid:**
Always parse API dates with explicit timezone handling. Compare dates by normalizing both the API date and the filter boundary to the same timezone (local timezone for display). For "days" calculations (1W = last 7 days), use midnight-to-midnight local time, not UTC day boundaries.

```javascript
// Wrong — treats date as UTC
const txDate = new Date(transaction.date);

// Right — parse and normalize to local day
function toLocalDate(isoString) {
    const d = new Date(isoString);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
```

**Warning signs:**
- Transactions from Jan 31st appearing in February's total for users west of UTC
- YTD filter including or excluding transactions from Jan 1st incorrectly
- Date filter showing 8 days of data when "1W" is selected

**Phase to address:**
Data layer phase — establish date parsing utilities before any filtering logic is written.

---

### Pitfall 8: eBay OAuth Access Token Expiry Not Handled

**What goes wrong:**
eBay user access tokens expire after 7,200 seconds (2 hours). If the token is stored in localStorage and reused without checking expiry, all eBay API calls start returning 401 errors after 2 hours of initial setup. The app shows empty eBay data with no explanation.

**How to avoid:**
Store the eBay access token alongside its expiry timestamp in localStorage (`ebay_token`, `ebay_token_expires_at`). Before every eBay API call, check if the token is expired (or within 60 seconds of expiry). If so, trigger a refresh via the Cloudflare Worker (which holds the refresh token). The worker handles the token exchange and returns a fresh token to the browser.

**Warning signs:**
- eBay data sections go blank after exactly 2 hours of use
- 401 responses from eBay Worker proxy calls after initial setup works
- No token expiry timestamp stored alongside the token in localStorage

**Phase to address:**
eBay integration phase — token lifecycle management must be part of the first eBay fetch implementation, not added later.

---

### Pitfall 9: Teller Connect Script Load Order Breaking Initialization

**What goes wrong:**
If the Teller Connect script (`https://cdn.teller.io/connect/connect.js`) is loaded with `async` or `defer` attributes, the inline JavaScript that calls `TellerConnect.setup()` may execute before the library is available, causing a `ReferenceError: TellerConnect is not defined` failure. The bank linking button appears but does nothing.

**How to avoid:**
Load Teller Connect without `async` or `defer`. Place the `<script src="https://cdn.teller.io/connect/connect.js">` tag at the bottom of `<body>`, just before the inline setup script. This preserves parsing performance (no render blocking) while guaranteeing load order.

**Warning signs:**
- `ReferenceError: TellerConnect is not defined` in console
- Works sometimes (on fast connections where library loads before DOMContentLoaded) and fails sometimes
- "Connect Bank" button is unresponsive

**Phase to address:**
First phase of Teller integration — the load order pattern should be established in the boilerplate before any other Teller code is written.

---

## Minor Pitfalls

### Pitfall 10: Single HTML File Growing Unmanageable

**What goes wrong:**
Following the Shiva OS pattern of fully inline HTML/CSS/JS, a financial dashboard with 5-6 views, multiple charts, and two API integrations can easily reach 2,000–4,000+ lines in a single file. Debugging becomes slow (no line-number context), accidentally breaking styles from one view while editing another becomes common, and CTRL+F becomes the only navigation tool.

**How to avoid:**
Structure the inline `<script>` block with clear section comments as if they were separate modules:
```javascript
// === DATA LAYER ===
// === TELLER API ===
// === EBAY API ===
// === CHART RENDERERS ===
// === VIEW CONTROLLERS ===
// === EVENT HANDLERS ===
// === INIT ===
```
Keep CSS variables at the top of the `<style>` block; group all component styles below. This doesn't solve the file length but makes navigation predictable. Consider `lakshmi.html` and `kubera.html` as separate files (they already are per the project structure) to avoid cramming both into one.

**Warning signs:**
- File exceeds 1,500 lines and still growing
- Having to scroll for more than 10 seconds to find a CSS class
- Accidentally changing Lakshmi styles while editing Kubera

**Phase to address:**
Architecture phase — establish section comment conventions before writing substantial code in each file.

---

### Pitfall 11: Displaying Raw API Data Without Null Guards

**What goes wrong:**
Teller and eBay APIs return null or undefined for certain fields depending on account type, institution, or data availability. Investment accounts may have no `balance.available` (only `balance.ledger`). Transactions may have null `merchant.name`. eBay analytics endpoints may return null for inactive periods. Rendering these fields directly causes `null` or `undefined` to appear on the dashboard, or worse, JavaScript errors that crash the view.

**How to avoid:**
Create display utility functions that handle null/undefined gracefully with sensible fallbacks:
```javascript
function displayAmount(amount) {
    return amount != null ? formatCurrency(amount) : '—';
}
function displayText(text, fallback = '—') {
    return text ?? fallback;
}
```
Apply these universally. Never render `transaction.merchant.name` directly; always use `displayText(transaction.merchant?.name)`.

**Warning signs:**
- "undefined" or "null" appearing in rendered text
- TypeError crashes when toggling date filters on partially-loaded data
- Empty cards instead of loading states for accounts that returned null balance

**Phase to address:**
Data layer phase — null-safe display utilities must be established before any rendering code is written.

---

### Pitfall 12: API Call Cascade on Page Load Freezing the UI

**What goes wrong:**
A financial dashboard may need to call 8–15 API endpoints on initial load (accounts list, balances for each account, recent transactions, eBay metrics, etc.). If these are called sequentially (awaiting each before the next), the page shows a loading spinner for 10–20 seconds before anything appears. If called in an uncontrolled parallel burst, the proxy worker may be overwhelmed and rate-limit itself.

**How to avoid:**
Group API calls by render priority:
1. Fetch accounts list (needed to know what to fetch next)
2. In parallel: fetch balances for all accounts + eBay summary metrics
3. After balances render: fetch transactions in background

Use `Promise.all()` for same-priority calls. Show skeleton cards immediately — don't wait for all data before rendering any UI. Each card/section becomes visible as its data resolves.

**Warning signs:**
- Blank page with spinner for more than 3 seconds
- Console showing API calls happening one-by-one in sequence
- UI appears to "pop in" all at once only after 15+ seconds

**Phase to address:**
Data layer phase — define the fetch waterfall architecture before writing any fetch calls.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode date ranges as literal strings | Fast to implement | Date filter changes require code edits, not config | Never — use constants from the start |
| Call Teller API without caching | Always fresh data | Every page visit fires all API calls again, slow UX | Never for static data (account list, balances rarely change per minute) |
| Display raw `amount` fields from Teller | No formatting code needed | Floating point display bugs surface in production | Never |
| Skip null guards "for now" | Faster MVP | Production crash on any account type that returns null | Never |
| Skip chart.destroy() "it works fine locally" | Less code | Memory leak visible after 5+ view switches | Never |
| Store eBay client secret in localStorage | Easy access | Anyone with DevTools access can steal app credentials | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Teller API | Call `api.teller.io` directly from browser fetch() | Route through Cloudflare Worker with mTLS certificate attached |
| Teller Connect | Load script with `async` or `defer` | Load synchronously at bottom of `<body>`, no attributes |
| Teller enrollments | Treat access token as permanent | Detect 401 responses; surface re-link prompt using `enrollmentId` |
| eBay REST APIs | Call `api.ebay.com` directly from browser | Route through Cloudflare Worker that handles CORS |
| eBay OAuth | Embed Client Secret in browser code or localStorage | Store Client Secret only in Worker environment variables |
| eBay OAuth | Reuse access token indefinitely | Check expiry timestamp; refresh via Worker when expired (2hr TTL) |
| Chart.js | Create new chart on existing canvas without destroy | Check for existing instance; call `.destroy()` before creating new chart |
| Financial math | Use raw float arithmetic | Work in integer cents; format only at display layer |
| Date filtering | Use `new Date(dateString)` without timezone handling | Normalize to local midnight for day-boundary comparisons |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential API fetches for all accounts | 15–20s initial load | Use `Promise.all()` for same-priority calls; prioritize above-fold data | Any time there are 3+ accounts |
| Re-fetching all data on every view switch | Slow tab navigation, API rate limits | Cache API responses in memory with `lastFetched` timestamp; refresh only when stale (>5 min) | Immediately noticeable with slow connections |
| Rendering full transaction history in DOM | Browser lag with 500+ transactions | Paginate or virtualize transaction list; only render visible rows | Beyond ~300 DOM nodes |
| Chart.js animations on every data update | Janky UX when data refreshes | Disable animations for data-refresh updates; keep only on initial render | Noticeable immediately |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing eBay Client Secret in localStorage | Anyone with DevTools access steals it; attacker makes API calls as your application | Store only in Cloudflare Worker environment variables |
| Storing Teller access token without per-account scoping | Token grants access to all accounts on that enrollment | Store tokens keyed by `enrollmentId`; treat as sensitive; clear on logout |
| XSS via unsanitized transaction data | Injected script extracts all localStorage tokens | Never use `innerHTML` with API-sourced strings; use `textContent` for all transaction/merchant data |
| Exposing Cloudflare Worker URL without any auth | Anyone can hit your proxy and make Teller/eBay calls at your cost | Add a shared secret header between the dashboard and your Worker (checked in Worker before forwarding) |
| Browser extension interference | Extensions can read localStorage from any tab | Document risk; acceptable for personal tool, but do not use this pattern for shared/SaaS tools |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state while API calls are in flight | Dashboard appears broken or empty; user refreshes repeatedly | Skeleton card placeholders for every section that fetches data |
| No "last updated" timestamp on data | User doesn't know if they're seeing fresh or cached data | Show "Updated 3m ago" near each data section |
| No reconnect prompt for expired bank connection | User sees $0 balances with no explanation | Detect 401 from Teller; show gold banner "Acme Bank needs re-authorization" with Re-link button |
| Date filter changes trigger full API re-fetch | Slow UX on every toggle | Cache all transactions in memory; apply date filters client-side |
| Number-heavy Reports view with no context | Numbers feel meaningless without anchors | Add prior period comparison and trend indicators alongside every metric |

---

## "Looks Done But Isn't" Checklist

- [ ] **Bank connection:** Teller Connect flow completes, token stored — but verify the proxy is actually using mTLS cert, not just passing the token without cert (sandbox doesn't require it; production will fail silently)
- [ ] **eBay data loading:** Charts display data from eBay sandbox — but verify production eBay credentials are stored in Worker env vars, not hardcoded in the Worker script
- [ ] **Date filters:** "1W" shows 7 days of data — but verify it's using local midnight boundaries, not UTC midnight (test by setting system clock to an Eastern timezone)
- [ ] **Chart memory:** Charts render correctly — but verify old instances are destroyed by switching views 10+ times and checking Chrome DevTools memory timeline
- [ ] **Financial totals:** Dashboard shows correct sum — but verify with a known transaction set that includes amounts like `$0.10 + $0.20` and confirm display shows `$0.30` not `$0.30000000000000004`
- [ ] **Error handling:** API calls work normally — but verify what happens when Teller returns 401 (connection expired), when eBay returns 429 (rate limit), and when network is offline
- [ ] **Token expiry:** eBay data loads — but verify it still loads after 2 hours and 1 minute by manually setting `ebay_token_expires_at` to a past timestamp and confirming refresh fires

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| mTLS not implemented, go live on production | HIGH | Build Cloudflare Worker proxy; migrate all Teller fetch calls to go through Worker; test mTLS cert attachment end-to-end |
| eBay client secret exposed in source | HIGH | Revoke credential in eBay developer portal immediately; generate new credentials; move to Worker env vars; audit git history for committed secrets |
| Floating point bugs in production data | MEDIUM | Add `toCents()` utility; audit every calculation; regression-test with edge-case amounts |
| Chart memory leak after months of use | LOW | Add `charts` registry and `.destroy()` calls; one-time refactor across all chart creation sites |
| Timezone bug in date filters | MEDIUM | Introduce `toLocalDate()` utility; audit all `new Date()` usage that touches transaction dates; re-test all date filter combinations |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Teller mTLS — no browser direct calls | Phase 1: Architecture & API proxy setup | Make a production Teller API call through the Worker; confirm mTLS cert is being used |
| eBay CORS — no browser direct calls | Phase 1: Architecture & API proxy setup | Fetch eBay seller data through Worker; confirm no CORS error in browser console |
| eBay client secret exposure | Phase 1: Architecture & API proxy setup | Audit that no eBay credentials appear in any .html file or localStorage |
| Bank connection expiry handling | Phase 2: Teller data integration | Manually expire a test enrollment; verify "Re-link" prompt appears |
| Chart.js canvas memory leak | Phase 3: Chart implementation | Switch views 20x; check DevTools memory heap for growth |
| Floating point precision | Phase 2: Data layer utilities | Unit test `toCents()` + `formatCurrency()` with edge cases |
| Timezone bugs in date filters | Phase 2: Data layer utilities | Test date filters with timezone set to UTC-8 |
| eBay token expiry | Phase 4: eBay integration | Manually set token expiry to past; verify auto-refresh fires |
| Teller Connect script load order | Phase 2: Teller Connect integration | Open browser console; verify no TellerConnect ReferenceError |
| Null guards on API data | Phase 2: Data layer utilities | Test with a Teller sandbox account that has null merchant names |
| API call cascade on load | Phase 2: Data layer utilities | Measure time-to-first-content; target < 2s for above-fold |

---

## Sources

- Teller API authentication documentation: https://teller.io/docs/api/authentication (mTLS requirement confirmed)
- Teller Connect documentation: https://teller.io/docs/guides/connect (script load order pattern)
- Teller webhooks documentation: https://teller.io/docs/api/webhooks (enrollment.disconnected reason codes)
- eBay Developer Forums — CORS blocked on major browsers: https://forums.developer.ebay.com/questions/25225/cors-blocked-on-major-browsers.html
- eBay Developer Forums — JavaScript Fetch CORS issue: https://forums.developer.ebay.com/questions/25263/javascript-fetch-cors-issue.html
- eBay OAuth best practices: https://developer.ebay.com/api-docs/static/oauth-best-practices.html
- eBay security guidelines: https://developer.ebay.com/api-docs/static/security.html
- Chart.js performance docs: https://www.chartjs.org/docs/latest/general/performance.html
- Chart.js memory leak GitHub issue: https://github.com/chartjs/Chart.js/issues/462
- XSS localStorage theft: https://shahjerry33.medium.com/xss-the-localstorage-robbery-d5fbf353c6b0
- JavaScript money precision: https://frontstuff.io/how-to-handle-monetary-values-in-javascript
- JavaScript Date timezone gotchas: https://dev.to/davo_man/the-javascript-date-time-zone-gotcha-that-trips-up-everyone-20lf
- eBay OAuth token expiry (2hr TTL confirmed): https://community.ebay.com/t5/Token-Messaging-Sandbox-related/Production-oauth-token-expires-after-one-hour/td-p/34346850

---

*Pitfalls research for: Client-side financial dashboard (Teller API + eBay API, pure HTML/CSS/JS, Shiva OS)*
*Researched: 2026-02-23*
