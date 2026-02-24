# Stack Research

**Domain:** Personal/Business Financial Dashboard (Vanilla JS, CDN-only, client-side)
**Researched:** 2026-02-23
**Confidence:** MEDIUM — charting library versions HIGH confidence (verified from npm/official releases), Teller/eBay CORS/mTLS constraints HIGH confidence (verified from official docs), proxy pattern MEDIUM confidence (Cloudflare Worker feasibility confirmed, tier restrictions unverified)

---

## Critical Architecture Constraint

**Both Teller API and eBay API block direct browser calls.** This is not a minor implementation detail — it shapes every technology decision in this stack.

| API | Problem | Root Cause | Mitigation |
|-----|---------|-----------|------------|
| Teller API | All data-read calls require mTLS client certificates | Browsers cannot expose private key material to JavaScript — this is a security platform constraint, not a bug | Cloudflare Worker proxy that holds the cert and forwards requests |
| eBay API | CORS headers not set for browser origins | eBay has never enabled CORS for their REST APIs | Same Cloudflare Worker proxy, or separate Worker |

**The architecture is: Browser → Cloudflare Worker (handles mTLS/CORS) → API.** The "no backend server" constraint is preserved because Cloudflare Workers are serverless functions, not a traditional backend. They deploy from a config file, have a generous free tier (100k requests/day), and take ~15 minutes to set up.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vanilla JS (ES2022+) | Native | Application logic, DOM, state | Already the Shiva OS standard — zero divergence, no build step, works in any browser |
| Teller Connect.js | Latest (CDN) | Bank account linking UI | Official Teller browser SDK. Handles the entire auth flow (credential entry, MFA, account selection) and returns an access token. No alternative for this step. |
| Chart.js | 4.5.1 | Line charts, bar charts, doughnut charts (spending trends, cash flow, allocation) | Best CDN-loadable charting library for financial dashboards: 48KB UMD build, rich annotation support, excellent time-series axis handling, active maintenance. v4.5.1 released Oct 2025. |
| Cloudflare Worker | N/A (deploy via wrangler CLI one-time) | Proxy for Teller API mTLS calls and eBay CORS | Only viable zero-server solution for mTLS. Cloudflare Workers natively support mTLS certificate bindings. Free tier: 100k requests/day. Deploy once, forget it. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Day.js | 1.11.x (CDN) | Date formatting, range arithmetic (1W/1M/YTD/3M/1Y filters), relative time display | All date filtering logic — replaces ad-hoc `new Date()` math across 5 views. 2KB gzipped. Load via `https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js`. |
| chartjs-chart-financial | 0.2.x (CDN) | OHLC/candlestick chart type for investment price data | Only when charting investment price history over time. Extends Chart.js — load after Chart.js. |
| Luxon | — | **Do not use** | Day.js covers all needs at 1/10th the weight. Only add Luxon if timezone-aware recurring calculations become needed. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Wrangler CLI (one-time setup) | Deploy and configure Cloudflare Worker proxy | `npm install -g wrangler` — this is a one-time infrastructure deploy, not a project dependency. The Shiva OS HTML files themselves never use npm. |
| Live Server (VS Code) or browser file:// | Local development | Chart.js and Day.js work with file:// protocol. Teller Connect.js requires HTTPS — use localhost with Live Server for testing the connection flow. |

---

## Installation

No npm in the project. All libraries are loaded via CDN script tags inside each HTML file.

```html
<!-- Chart.js — primary charting -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>

<!-- Chart.js Financial plugin — only on Investments view -->
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-financial@0.2.1/dist/chartjs-chart-financial.min.js"></script>

<!-- Day.js — date math for all filtering -->
<script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js"></script>

<!-- Teller Connect — bank account linking UI (only on settings/accounts view) -->
<script src="https://cdn.teller.io/connect/connect.js"></script>
```

For the Cloudflare Worker proxy, deploy once using wrangler CLI (not part of Shiva OS files):
```bash
# One-time setup — not a project file, not committed to shiva-os
npm install -g wrangler
wrangler deploy
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Chart.js 4.5.1 | TradingView Lightweight Charts 5.1.0 | If you need professional-grade candlestick charts with real-time tick data. Lightweight Charts excels at high-frequency price updates but is designed for one chart type only. Chart.js handles the full variety of chart types needed here (line, bar, doughnut, scatter) from a single library. |
| Chart.js 4.5.1 | ApexCharts | If annotations and interactive zoom are top priorities. ApexCharts has a better built-in zoom/pan UX but is 170KB+ (4x Chart.js) and has had breaking API changes between minor versions. |
| Cloudflare Worker | cors-anywhere / allorigins.win | For eBay only, not for Teller (mTLS impossible with public proxies). For a personal dashboard handling real financial data, never route through a third-party public proxy — credentials and account data would pass through unknown infrastructure. |
| Day.js | Native `Intl` + `Date` | For simple formatting only. `Intl` is fine for locale-aware display; Day.js pays off the moment you need date arithmetic (start of month, YTD window start, 3-month lookback). |
| Cloudflare Worker | Deno Deploy | Both work. Cloudflare has native mTLS binding support documented with examples. Deno Deploy mTLS is possible but less documented for this exact pattern. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Direct `fetch()` to `api.teller.io` from browser | **This will always fail.** Teller requires mTLS client certificates on all live/development API calls. Browsers cannot present client certificates from JavaScript — this is a platform security constraint, not a config issue. The sandbox environment skips this requirement, but sandbox data is fake. | Cloudflare Worker proxy that holds the Teller certificate and forwards requests |
| Direct `fetch()` to `api.ebay.com` from browser | eBay does not set CORS headers on any of their REST API endpoints. This has been a known issue for years with no plans to fix it. The `Access-Control-Allow-Origin` header is absent — all browser fetch calls will be blocked. | Same Cloudflare Worker proxy |
| Moment.js | Officially deprecated as of 2022. 67KB minified for a date library is indefensible when Day.js is 2KB with the same API surface. | Day.js |
| D3.js | Massive learning cliff (requires SVG knowledge), 87KB library, overkill for this chart set. The time investment to build Chart.js-equivalent visuals in D3 from scratch is 5-10x. | Chart.js for all chart types needed |
| Plaid JavaScript SDK | Plaid does not support pure browser-only integration — requires a backend to generate link tokens. Teller Connect.js is fully browser-loadable from CDN. | Teller Connect.js |
| Any npm-installed charting library | Violates the no-build-system constraint. Any library requiring `import from` without an ESM CDN is off-limits. | CDN-distributed UMD builds of Chart.js |

---

## Stack Patterns by Variant

**For Lakshmi module (personal finance):**
- Chart.js for all 5 views (line, bar, doughnut)
- Day.js for date filtering
- Teller Connect.js for linking personal bank accounts
- Cloudflare Worker for all API data reads

**For Kubera module (business finance):**
- Same Chart.js + Day.js setup
- Teller Connect.js for business accounts (Robinhood virtual card, Amazon Prime card)
- Cloudflare Worker handles both Teller and eBay API calls
- eBay Sell API (Analytics, Fulfillment, Finances endpoints) for sales/fee data
- Reports view: pure table rendering, minimal charts — no additional library needed

**If investment price history becomes a priority:**
- Add `chartjs-chart-financial` plugin alongside Chart.js
- This adds OHLC/candlestick support for holdings view
- Load after Chart.js: `<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-financial@0.2.1/dist/chartjs-chart-financial.min.js"></script>`

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Chart.js@4.5.1 | chartjs-chart-financial@0.2.x | Use 0.2.x; 0.1.x targets Chart.js v3 and will break |
| Day.js@1.11.x | All modern browsers | No compatibility concerns; no transpile needed |
| Teller Connect.js (CDN latest) | Any browser that supports ES2018+ | Always load from `cdn.teller.io` — do not self-host; Teller updates it for security patches |
| Chart.js@4.x | Chart.js@3.x | Breaking API change — do not mix versions. All plugins must target v4. |

---

## The Proxy Architecture (Required, Not Optional)

```
Browser (Shiva OS HTML file)
    |
    | 1. Teller Connect.js flow → user links bank → returns { accessToken }
    | 2. store accessToken in localStorage('teller-token')
    |
    | 3. fetch('https://your-worker.workers.dev/teller/accounts', {
    |      headers: { 'Authorization': 'Bearer <accessToken>' }
    |    })
    |
    v
Cloudflare Worker (deployed once)
    |
    | - Reads accessToken from Authorization header
    | - Makes mTLS-authenticated request to api.teller.io using bound certificate
    | - Returns JSON response to browser
    |
    | For eBay:
    | - Exchanges App ID + Cert ID for OAuth token (server-side, safe)
    | - Forwards request to api.ebay.com with token
    | - Returns response to browser
    v
api.teller.io  /  api.ebay.com
```

The Worker is the minimal viable "backend." It has no database, no auth logic beyond forwarding the Teller access token, and no state. It is a thin TLS-terminating proxy.

---

## Sources

- [Teller API Authentication docs](https://teller.io/docs/api/authentication) — mTLS requirement confirmed; "access tokens are useless without a Teller client certificate" (HIGH confidence)
- [Teller Connect docs](https://teller.io/docs/guides/connect) — CDN URL `https://cdn.teller.io/connect/connect.js` confirmed; three-step enrollment flow documented (HIGH confidence)
- [eBay CORS Developer Forums](https://forums.developer.ebay.com/questions/25263/javascript-fetch-cors-issue.html) — CORS not supported confirmed; community confirms proxy required (HIGH confidence)
- [Cloudflare mTLS Workers docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/) — mTLS binding support for Workers confirmed, generally available (HIGH confidence)
- [Chart.js releases](https://github.com/chartjs/Chart.js/releases) — v4.5.1 confirmed as latest stable (Oct 2025) (HIGH confidence)
- [Lightweight Charts GitHub](https://github.com/tradingview/lightweight-charts) — v5.1.0 on unpkg confirmed; used as comparison baseline (HIGH confidence)
- [Day.js official site](https://day.js.org/) — 2KB, Moment.js-compatible API, CDN available (HIGH confidence)
- [jsDelivr Chart.js CDN](https://www.jsdelivr.com/package/npm/chart.js) — CDN URLs verified (HIGH confidence)
- [chartjs-chart-financial GitHub](https://github.com/chartjs/chartjs-chart-financial) — Official Chart.js financial plugin; v0.2.x targets Chart.js v4 (MEDIUM confidence — version compatibility requires validation before use)
- [WebSearch: Cloudflare Worker free tier mTLS, Feb 2026] — Free tier availability for mTLS binding unconfirmed; stated "all Workers customers" which implies free tier but needs verification (LOW confidence — verify at cloudflare.com/plans before committing)

---

*Stack research for: Shiva OS Artha Dashboard (Lakshmi + Kubera financial modules)*
*Researched: 2026-02-23*
