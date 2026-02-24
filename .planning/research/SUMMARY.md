# Project Research Summary

**Project:** Shiva OS — Artha Dashboard (Lakshmi + Kubera financial modules)
**Domain:** Client-side personal/business financial dashboard with third-party API integration
**Researched:** 2026-02-23
**Confidence:** MEDIUM — stack HIGH confidence, features MEDIUM, architecture HIGH on auth flows, pitfalls HIGH on critical blockers

---

## Executive Summary

The Artha Dashboard is a two-module financial command center (Lakshmi for personal finance, Kubera for business/eBay) built as a pure vanilla JS extension of the existing Shiva OS. The defining architectural reality is that neither target API — Teller (bank data) nor eBay (seller data) — can be called directly from a browser. Teller requires mutual TLS (mTLS) client certificates that browsers cannot present, and eBay lacks CORS headers entirely. Every technology and architecture decision flows from this single constraint: a stateless Cloudflare Worker proxy is required as the bridge layer. This is not optional and not a workaround — it is the architecture.

The recommended approach is Browser → Cloudflare Worker (holds mTLS cert and eBay credentials) → Teller/eBay APIs, with Chart.js 4.5.1 and Day.js for client-side rendering and date math. The Cloudflare Worker is deployed once via wrangler CLI and is free up to 100K requests/day — far beyond what a single-user personal dashboard will ever use. Everything else stays true to Shiva OS conventions: vanilla JS, CDN-loaded libraries, inline scripts, no build system. The proxy is the only exception to the "no backend" constraint, and it is thin by design — no database, no auth logic, just TLS termination and credential forwarding.

Key risks are front-loaded: the mTLS proxy must be built and validated before any financial data views are coded, or all development is blocked. Secondary risks include floating-point precision errors in financial calculations, timezone bugs in date filtering, Chart.js memory leaks on view switches, and eBay OAuth token expiry not being handled. All are well-documented pitfalls with clear prevention patterns — none are novel problems. The differentiating feature set (eBay unit economics, DCF analysis, spending vs budget as a live mid-month pace chart) is genuinely not available in any off-the-shelf app and justifies building rather than using Mint, Monarch, or Kubera.com.

---

## Key Findings

### Recommended Stack

The stack preserves Shiva OS conventions completely on the client side. Chart.js 4.5.1 handles all chart types needed (line, bar, doughnut, candlestick via the financial plugin) from a single 48KB CDN library. Day.js at 2KB handles all date arithmetic for the shared filter component. Teller Connect.js is loaded from Teller's CDN for the bank-linking enrollment UI — it cannot be self-hosted and should never be loaded with `async`/`defer`. The only non-HTML piece is the artha-proxy Cloudflare Worker, deployed once from a standalone `artha-proxy/` directory alongside (but outside the flow of) the main Shiva OS HTML files.

**Core technologies:**
- **Vanilla JS (ES2022+):** Application logic, DOM, state — already the Shiva OS standard, zero divergence
- **Chart.js 4.5.1 (CDN UMD):** All charting — best CDN-loadable library for the required chart variety; 48KB; Chart.js@4.x is incompatible with v3 plugins
- **Day.js 1.11.x (CDN):** Date range arithmetic for the shared filter component — 2KB, Moment-compatible API
- **Teller Connect.js (cdn.teller.io, always latest):** Bank enrollment UI — no alternative for this step; must load synchronously at `</body>`
- **Cloudflare Worker (artha-proxy):** mTLS proxy for Teller + CORS proxy for eBay — only viable zero-server solution; free tier 100K req/day; mTLS binding confirmed generally available
- **chartjs-chart-financial 0.2.x (CDN, optional):** Candlestick/OHLC charts for investment price history — load after Chart.js, only on the Investments view

**What NOT to use:** Direct `fetch()` to `api.teller.io` or `api.ebay.com` (both fail from browser), Moment.js (67KB, deprecated), D3.js (overkill, 87KB), Plaid SDK (requires backend for link tokens), any npm-installed library requiring a build step.

See `.planning/research/STACK.md` for full alternatives analysis, CDN URLs, and version compatibility matrix.

### Expected Features

The dashboard sits in a unique competitive position: it handles personal finance (Lakshmi, competing with Monarch/Copilot), business finance (Kubera, competing with Wave/QuickBooks), AND eBay seller analytics — a combination that no existing tool covers. Table stakes are well-established by the existing apps; the differentiators are genuinely novel.

**Must have (table stakes) — Lakshmi:**
- Live account balances across all depository, credit, and investment accounts
- Transaction list with Teller's 28 auto-categories, date filter, merchant names
- Date range filter (1W / 1M / 3M / YTD / 1Y) — shared component across all 5 views
- Spending vs auto-budget line graph (budget derived from 50-60% investing target, not set manually)
- Cash flow trend chart (4-5 month rolling income vs spend bars)
- Credit card utilization display with payoff date estimation
- Net worth (assets minus liabilities) with trend

**Must have (table stakes) — Kubera:**
- Business vs personal account separation at the account routing layer
- P&L statement (revenue, fees, COGS, expenses, net) using eBay API + Teller card data
- Revenue trend over time (eBay sales by month)
- Transaction ledger scoped to business-tagged accounts

**Should have (differentiators, v1.x after validation):**
- Net worth trajectory projection to $7M by age 35 vs required rate
- eBay unit economics per category (avg profit/item, sell-through rate, days to sell)
- Spending vs budget as a running cumulative line vs days-in-month pace (mid-month trajectory)
- Investment allocation breakdown by Rahul's buckets (equity/ETF/cash/crypto/derivative)
- Top movers scroll wheel with % vs $ toggle
- Break-even analysis and quarterly estimated tax calculator (Kubera Reports)

**Defer to v2+:**
- DCF valuation of the eBay operation — requires 3-6 months of clean eBay data as input
- Growth projections / what-if scenarios — needs an established baseline first
- Schedule C CSV export, click-to-expand calculation breakdowns

**Anti-features (explicitly not building):** AI spending insights (Krishna AI already exists; don't duplicate), credit score monitoring (Teller doesn't provide bureau data), bill payment/autopay (adds security surface), YNAB envelope budgeting (conflicts with percentage-of-income model), notifications/push alerts (requires service worker + backend).

**Critical data gap:** eBay does not track item cost (purchase price). Unit economics require `profit = sale_price - item_cost - fees - shipping`. The `item_cost` must be stored manually in localStorage keyed by SKU or listing ID. This is the largest gap for Kubera's differentiating features.

**Unverified data availability:** Teller's individual holdings/positions endpoint is unconfirmed. Verify `/accounts/{id}/holdings` before building the Investments View holdings list and top movers features. If unavailable, a supplementary market data API (Polygon.io or similar) is needed.

See `.planning/research/FEATURES.md` for the full prioritization matrix, competitor analysis, and data availability tables.

### Architecture Approach

The system has two distinct zones: the browser (both HTML files, client-side cache, Chart.js renders) and the Cloudflare Worker proxy. The proxy is stateless — it holds secrets and certificates but no user data. `lakshmi.html` and `kubera.html` share a common cache layer (`artha-cache`) backed by localStorage for small/frequent data and IndexedDB for transaction history, but the two HTML files communicate through the cache, not directly.

**Major components:**
1. **artha-proxy (Cloudflare Worker):** Holds Teller mTLS certificate, eBay App ID/Cert ID/Client Secret in environment variables. Routes: `POST /teller/*` → api.teller.io with mTLS; `POST /ebay/token` → eBay OAuth token exchange; `GET /ebay/*` → eBay REST APIs. Adds CORS headers on all responses back to browser.
2. **artha-cache (localStorage + IndexedDB module):** TTL-based cache with cache-first + background revalidation pattern. Small data (<200KB) in localStorage, large data (transaction history, eBay order history) in IndexedDB. Cache keys scoped by account ID and date range to prevent cross-account data collisions.
3. **lakshmi.html:** Personal finance SPA — Teller Connect enrollment UI, 5 views (Dashboard, Cashflow, Accounts, Investments, Transactions), Chart.js renders, date filter state.
4. **kubera.html:** Business finance SPA — same structure as Lakshmi but filters to business-tagged accounts, adds eBay data views and Reports view.

**Key patterns:**
- Cache-first with background revalidation (perceived performance over absolute freshness)
- Single source of truth for account metadata in localStorage (prevents Lakshmi/Kubera disagreement)
- View-specific lazy data fetching (fetch on tab activate, not on page load — respects Teller rate limits)
- Keyed cache per account ID and date range (prevents out-of-order async overwrites)

**Build order dictated by architecture:** Proxy must exist before any API work. Cache layer before any data flows to charts. Teller enrollment before any live data views. This is not flexible — skipping order causes blocked development.

See `.planning/research/ARCHITECTURE.md` for full system diagram, auth flows, storage strategy, and anti-patterns.

### Critical Pitfalls

1. **Teller mTLS — browser calls will always fail** — Build the Cloudflare Worker proxy first, before writing a single line of data-fetch code. Test end-to-end with a production Teller call through the Worker before any UI work begins. Sandbox skips mTLS, so sandbox success does not validate the proxy is working correctly.

2. **eBay CORS + credential exposure** — Same proxy handles eBay. Never put eBay App ID, Cert ID, or Client Secret in any HTML file or localStorage. Worker environment variables only. Anyone who opens DevTools on the page should never be able to see eBay credentials.

3. **Floating-point precision in financial calculations** — Establish `toCents(dollars)` and `formatCurrency(cents)` utilities before any calculation logic is written. All arithmetic in integer cents; divide by 100 only at display. Never chain raw float operations on currency values.

4. **Timezone bugs in date filtering** — Teller and eBay return ISO 8601 UTC timestamps. `new Date("2026-02-22")` interprets a date-only string as UTC midnight, which is the previous day in Eastern time. All date comparisons must normalize to local midnight. Establish `toLocalDate(isoString)` utility before any filter logic.

5. **Bank connection silently expires** — Without webhooks (client-side only), the only way to detect enrollment disconnection is a 401/403 API response. Implement an error handler that detects the specific Teller disconnection error code and immediately surfaces a "Re-link Account" prompt using the stored `enrollmentId`. A dashboard showing $0 balances with no explanation is a trust failure.

Supporting pitfalls to address during implementation: Chart.js canvas not destroyed on view switches (maintain a chart registry, call `.destroy()` before creating a new chart on any canvas), eBay OAuth token expiry after 2 hours (store expiry timestamp, check before every eBay call, auto-refresh via Worker), Teller Connect script load order (load synchronously at `</body>`, no `async`/`defer`), null guards on API data (all transaction/balance rendering must use null-safe display utilities, never render `transaction.merchant.name` directly), and API call cascade on load (fetch by priority group using `Promise.all`, show skeleton cards immediately).

See `.planning/research/PITFALLS.md` for the full phase-to-pitfall mapping and "looks done but isn't" verification checklist.

---

## Implications for Roadmap

The architecture creates strict build dependencies. The phase order below is not a preference — it is determined by what must exist before what can be built. Deviating from this order means blocked development or undetectable bugs that only surface in production.

### Phase 1: Proxy Infrastructure (artha-proxy)

**Rationale:** Everything else depends on this. No live API data can flow to any view without a working proxy. Building UI against live data before this exists means all data-fetch code will be rewritten when the proxy is added. Building the proxy first also structurally prevents the eBay credential exposure pitfall.

**Delivers:** A deployed Cloudflare Worker at a stable URL that proxies both Teller API calls (with mTLS) and eBay API calls (with CORS headers and credential management). The Worker URL is stored in localStorage so the HTML files can be configured without code changes.

**Addresses:** All proxy-dependent features (every live data feature in both modules)

**Avoids:** Pitfalls 1 (Teller mTLS), 2 (eBay CORS), 3 (eBay credential exposure) — structurally, by design

**Research flag:** Needs validation of Cloudflare free tier mTLS binding availability (stated LOW confidence in STACK.md — verify at cloudflare.com/plans before committing)

---

### Phase 2: Data Layer Foundations

**Rationale:** Before any view can render, the cache layer, date utilities, currency utilities, and null-guard utilities must exist. Establishing these first means all subsequent view development builds on a consistent, correct base. Retrofitting these after the fact is expensive (audit every calculation site) and error-prone (floating-point bugs may already be in stored data).

**Delivers:** `artha-cache` module (localStorage + IndexedDB TTL cache with cache-first pattern), `toCents()` + `formatCurrency()` currency helpers, `toLocalDate()` date normalization utility, null-safe display functions, fetch waterfall architecture (accounts list → parallel balance fetches → lazy transaction fetches), skeleton card loading states.

**Addresses:** Date range filter shared component (P1 feature)

**Avoids:** Pitfalls 6 (floating point), 7 (timezone bugs), 11 (null guards), 12 (API cascade on load)

**Research flag:** Standard patterns — no additional research needed. Well-documented techniques.

---

### Phase 3: Teller Enrollment + Account Routing

**Rationale:** Teller Connect enrollment delivers the access token that all Lakshmi and Kubera data fetches depend on. The account routing decision (personal vs business label) made at enrollment time is the scoping mechanism for all views in both modules. This must be complete and reliable before building any data view.

**Delivers:** Teller Connect embed in both lakshmi.html and kubera.html, `onSuccess` handler storing token + enrollment metadata in artha-cache, personal/business account labeling UI, `enrollmentId`-keyed account metadata for re-link support, 401 error handler that surfaces re-authorization prompt.

**Addresses:** Teller API connection + account routing (P1 feature, dependency for all other features)

**Avoids:** Pitfall 4 (bank connection expiry handling), Pitfall 9 (Teller Connect script load order)

**Research flag:** Standard patterns — Teller Connect enrollment flow is well-documented with official guides.

---

### Phase 4: Lakshmi Core Views (Dashboard, Transactions, Accounts)

**Rationale:** Lakshmi is the simpler of the two modules (no eBay dependency) and its Dashboard view is the first end-to-end proof that the full stack works: proxy → Teller API → cache → Chart.js render. Completing this validates the architecture before tackling the more complex Kubera module.

**Delivers:** Live account balances, spending vs auto-budget line graph, cash flow trend chart (4-5 month rolling), credit card utilization list, transaction list with Teller categories, date range filter (1W/1M/3M/YTD/1Y shared component), Chart.js chart registry with `.destroy()` lifecycle management.

**Addresses:** All P1 Lakshmi table stakes features

**Uses:** Chart.js 4.5.1 + Day.js for date math; artha-cache for response caching; artha-proxy for all API calls

**Avoids:** Pitfall 5 (Chart.js canvas memory leak — establish destroy pattern here so it becomes the default for all subsequent chart work)

**Research flag:** Standard patterns for financial charts — no additional research needed.

---

### Phase 5: Lakshmi Extended Views (Cashflow, Investments)

**Rationale:** These views depend on Phase 4's foundation (chart lifecycle, cache, date filter) and add new data shapes (investment account holdings have a different response structure than bank/credit accounts). Investment holdings endpoint availability must be verified before building the holdings list.

**Delivers:** Cashflow view with income/spend toggle, category breakdown chart. Investments view with allocation donut chart, holdings cards. Net worth trajectory to $7M goal projection. Credit card payoff date estimation.

**Addresses:** P2 features (investment balances, category spending breakdown, allocation graph, net worth trajectory, payoff dates)

**Avoids:** Data shape mismatch risk — verify Teller holdings endpoint before building

**Research flag:** Teller holdings endpoint availability is unconfirmed (UNCERTAIN in FEATURES.md). Validate before this phase begins. If unavailable, supplementary market data API needs scoping.

---

### Phase 6: Kubera + eBay Integration

**Rationale:** Kubera reuses all patterns from Lakshmi (same proxy, same cache, same chart patterns) but adds eBay API data and scopes to business-tagged accounts. The eBay integration (OAuth token lifecycle, data fetching, order history parsing) adds new complexity. Doing this after Lakshmi is validated means the new complexity is isolated to eBay, not mixed with unknown chart/cache issues.

**Delivers:** Kubera Dashboard (business account balances, eBay revenue trend), Kubera Transactions view (business-scoped), Kubera P&L view (gross revenue, eBay fees, card expenses as COGS, net income). eBay OAuth token lifecycle management (2-hour expiry, auto-refresh via Worker). Item cost localStorage store (keyed by SKU — addresses the eBay item_cost data gap).

**Addresses:** All P1 Kubera table stakes features; eBay API connection

**Avoids:** Pitfall 8 (eBay token expiry) — implement token lifecycle in the first eBay fetch call, not as a follow-on

**Research flag:** eBay Sell API endpoint shapes (Fulfillment, Finances, Analytics) — moderate complexity; recommend `/gsd:research-phase` during planning to nail down exact endpoint structures and pagination patterns before coding begins.

---

### Phase 7: Kubera Reports View + Unit Economics

**Rationale:** Reports (P&L, break-even, gross margin, quarterly tax estimate) and unit economics (profit per item, sell-through rate, days to sell) are pure computation on data that Phases 4-6 already fetch and cache. No new API integration needed. These are high-value differentiating features that require stable P&L data as input — doing them after the data layer is validated ensures the numbers are trustworthy.

**Delivers:** Kubera Reports view (gross margin, break-even, quarterly tax calculator with IRS Schedule C category mapping). eBay unit economics per category (avg profit/item, sell-through rate, days to sell). Click-to-expand calculation breakdowns (tooltip/modal showing formula + inputs for any computed number).

**Addresses:** P2 business finance features; Kubera's unique differentiators vs any off-the-shelf tool

**Research flag:** DCF analysis deferred to v2+ (requires 3-6 months of clean eBay history as input; premature in v1). Growth projections / what-if scenarios also deferred to v2+.

---

### Phase Ordering Rationale

- **Proxy before UI** (Phase 1 before all others): mTLS and CORS constraints make this structurally non-negotiable. Building views without a working proxy means 100% of data-fetch code is throwaway or blocked.
- **Data layer before views** (Phase 2 before Phases 3-7): Currency precision, timezone handling, null guards, and caching patterns are cheaper to establish once than to retrofit across every calculation site. The "looks done but isn't" verification checklist in PITFALLS.md confirms this — floating-point and timezone bugs are invisible in development and painful to find post-launch.
- **Lakshmi before Kubera** (Phases 4-5 before 6-7): Lakshmi has no eBay dependency, so it validates the proxy + cache + chart architecture with a simpler integration. Debugging Teller mTLS issues is easier when eBay complexity isn't also in the mix.
- **Reports last** (Phase 7 after data is stable): DCF and unit economics require trustworthy P&L data. Computing DCF on incorrect or sparse data produces misleading outputs. Reports are high-value but should not be the first thing built.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 6 (eBay Integration):** eBay Sell API endpoint shapes — Fulfillment, Finances, and Analytics endpoints each have distinct response structures and pagination patterns. Recommend `/gsd:research-phase` before building eBay data fetching code.
- **Phase 5 (Investments View):** Teller holdings endpoint availability is unconfirmed. Must verify before building the holdings list and top movers features. If Teller doesn't provide individual position data, need to scope a supplementary market data source.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Proxy):** Cloudflare Workers mTLS binding is well-documented with official examples. Standard wrangler CLI workflow.
- **Phase 2 (Data Layer):** Currency cents pattern, date normalization, and IndexedDB caching are all well-documented, consensus patterns.
- **Phase 3 (Teller Enrollment):** Teller Connect enrollment flow has official step-by-step guides. No ambiguity.
- **Phase 4 (Lakshmi Core):** Chart.js patterns for financial dashboards are well-established. Day.js date arithmetic is standard.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | CDN URLs and library versions verified from official sources. mTLS constraint confirmed from Teller official docs. eBay CORS constraint confirmed by multiple forum threads + library acknowledgment. One gap: Cloudflare free tier mTLS binding availability stated as LOW confidence in STACK.md — verify before committing to this approach. |
| Features | MEDIUM | Table stakes are HIGH confidence (well-established by comparable apps). Differentiators are well-reasoned but unvalidated — no existing tool to compare against for eBay + bank integration. Teller holdings endpoint availability is UNCERTAIN — verify before planning the Investments view. eBay item cost gap is a known blocker for unit economics. |
| Architecture | HIGH | Auth flows (Teller mTLS, eBay OAuth) confirmed from official documentation. Proxy pattern confirmed as the only viable approach. localStorage + IndexedDB strategy is standard and well-documented. One area of medium confidence: Cloudflare Worker mTLS binding specifics require hands-on validation during Phase 1. |
| Pitfalls | HIGH | All critical pitfalls sourced from official docs and confirmed forum threads. Prevention strategies are established patterns with code examples. The "looks done but isn't" checklist in PITFALLS.md provides verification steps for each pitfall — use it at the end of each phase. |

**Overall confidence:** MEDIUM-HIGH — the architecture is clear and validated, the stack is appropriate, the pitfalls are known. The main uncertainties are verification items (Cloudflare free tier mTLS, Teller holdings endpoint) that require hands-on validation rather than additional research.

### Gaps to Address

- **Cloudflare free tier mTLS:** STACK.md flags this as LOW confidence — "all Workers customers" implies free tier support but is unverified. Verify at cloudflare.com/plans before beginning Phase 1. If mTLS requires a paid plan, Deno Deploy is the documented alternative (MEDIUM confidence for mTLS support).
- **Teller individual holdings endpoint:** FEATURES.md flags `/accounts/{id}/holdings` as UNCERTAIN. Verify against live Teller API documentation or sandbox before planning Phase 5. If unavailable, the Investments view needs a supplementary data source scoped during Phase 5 planning.
- **eBay item cost storage design:** eBay does not track acquisition cost. The unit economics feature requires Rahul to manually log item costs. The localStorage schema for this (keyed by SKU or listing ID) needs to be designed during Phase 6 planning — it affects both data entry UX and the unit economics calculation logic.
- **Teller rate limits:** Documented as "undocumented, enforced in dev/prod." The cache TTL values in the architecture (5 min for balances, 15 min for transactions) are conservative estimates. Validate actual rate limit behavior during Phase 4 development.
- **Worker URL security:** PITFALLS.md recommends adding a shared secret header between the dashboard HTML files and the Worker to prevent unauthorized use of the proxy. The implementation pattern for this in a pure localStorage context needs to be designed during Phase 1.

---

## Sources

### Primary (HIGH confidence)
- Teller API Authentication docs (teller.io/docs/api/authentication) — mTLS requirement, access token scope
- Teller Connect docs (teller.io/docs/guides/connect) — enrollment flow, CDN URL, `onSuccess` callback shape
- eBay Developer Forums (forums.developer.ebay.com) — CORS absence confirmed by multiple threads
- eBay OAuth docs (developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html) — token exchange pattern
- Cloudflare Workers mTLS docs (developers.cloudflare.com/workers/runtime-apis/bindings/mtls/) — binding support confirmed
- Cloudflare Workers pricing (developers.cloudflare.com/workers/platform/pricing/) — 100K req/day free tier confirmed
- Chart.js releases (github.com/chartjs/Chart.js/releases) — v4.5.1 as latest stable (Oct 2025)
- Chart.js performance docs (chartjs.org/docs/latest/general/performance.html) — canvas destroy pattern
- MDN Storage API docs (developer.mozilla.org) — localStorage 5MB limit, IndexedDB alternative
- Day.js official site (day.js.org) — 2KB size, Moment-compatible API, CDN availability

### Secondary (MEDIUM confidence)
- Competitor analysis (Monarch Money, Copilot Money, Wave, QuickBooks) — feature landscape and table stakes
- eBay OAuth token expiry community thread (community.ebay.com) — 2-hour TTL confirmed
- Ecommerce P&L benchmarks (A2X Accounting Q2 2025) — eBay fee structure reference
- How to value an ecommerce business (Phoenix Strategy Group 2025) — DCF framework for eBay operations
- Stale-while-revalidate caching pattern documentation — cache-first architecture pattern
- JavaScript money precision (frontstuff.io) — cents-based arithmetic pattern
- JavaScript Date timezone gotchas (dev.to) — `toLocalDate()` pattern

### Tertiary (LOW confidence)
- Cloudflare free tier mTLS binding availability — "all Workers customers" phrasing implies free tier but unverified; needs confirmation at cloudflare.com/plans before Phase 1 begins
- chartjs-chart-financial@0.2.x Chart.js v4 compatibility — version compatibility stated but needs validation before the Investments view is built

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
