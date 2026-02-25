# Roadmap: Shiva OS — Artha Dashboard

## Overview

The Artha Dashboard builds out two financial deity modules — Lakshmi (personal finance) and Kubera (business/eBay finance) — on top of the existing Shiva OS. The build order is architecturally non-negotiable: a Cloudflare Worker proxy must exist before any live API data can flow, a shared data layer must be established before any view can render safely, Teller enrollment must work before any balance or transaction is visible, and Lakshmi must be complete before Kubera inherits its patterns and adds eBay complexity. Reports are last because they compute on data that the earlier phases must make trustworthy first.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Proxy Infrastructure** - Deploy Cloudflare Worker that proxies Teller (mTLS) and eBay (CORS) API calls from the browser
- [ ] **Phase 2: Data Layer Foundations** - Establish shared cache, currency utilities, date normalization, and fetch architecture used by all views
- [ ] **Phase 3: Teller Enrollment and Account Routing** - Connect bank/card/investment accounts via Teller Connect and label each as personal or business
- [ ] **Phase 4: Lakshmi Core Views** - Dashboard, Accounts, Cashflow, and Transactions views with live Teller data and Chart.js renders
- [ ] **Phase 5: Lakshmi Investments View** - Portfolio balance, top movers, holdings list, and allocation graph for personal investment accounts
- [ ] **Phase 6: Kubera and eBay Integration** - All five Kubera views scoped to business accounts with eBay revenue and transaction data
- [ ] **Phase 7: Kubera Reports View** - P&L, margin analysis, tax workflow, and unit economics computed on stable business data

## Phase Details

### Phase 1: Proxy Infrastructure
**Goal**: A deployed Cloudflare Worker at a stable URL acts as the sole bridge between the browser and both external APIs — Teller via mTLS and eBay via CORS — with no credentials visible in any HTML file
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. A fetch from lakshmi.html to the Worker URL returns live Teller account data (not a sandbox stub) without a browser CORS error
  2. A fetch from kubera.html to the Worker URL returns a valid eBay OAuth token exchange response without exposing App ID, Cert ID, or Client Secret in DevTools
  3. The Worker URL is configurable via localStorage so no code changes are needed to point at a different Worker deployment
  4. Opening browser DevTools on any Shiva OS page reveals no Teller certificate and no eBay credentials
**Plans**: 1 plan
Plans:
- [ ] 01-01-PLAN.md — Deploy Cloudflare Worker proxy with Teller sandbox routing, eBay stub, CORS, and browser-side Worker URL config

### Phase 2: Data Layer Foundations
**Goal**: All views build on a shared layer of correct, safe utilities — currency arithmetic in integer cents, dates normalized to local midnight, transactions cached in IndexedDB with TTL, and skeleton states shown while data loads
**Depends on**: Phase 1
**Requirements**: INFRA-08, INFRA-09, INFRA-10
**Success Criteria** (what must be TRUE):
  1. Adding two dollar amounts via toCents/formatCurrency produces the same result as correct decimal arithmetic (no floating-point drift)
  2. A transaction dated "2026-02-22T05:00:00Z" is categorized under Feb 22 (not Feb 21) when viewed in Eastern time
  3. Fetching transaction history a second time returns cached data from IndexedDB without making a network call, and cache expires after TTL
  4. Switching the date filter (1W, 1M, YTD, 3M, 1Y, custom) updates the visible data range on any view that uses the shared filter component
**Plans**: TBD

### Phase 3: Teller Enrollment and Account Routing
**Goal**: Rahul can connect any bank, card, or investment account through the Teller Connect widget, immediately label it personal or business, and have that label persist so all downstream views scope data correctly
**Depends on**: Phase 2
**Requirements**: INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):
  1. Clicking "Connect Account" opens the Teller Connect widget and completing enrollment stores the access token in localStorage without the token appearing in any network request outside the Worker
  2. After connecting an account, a prompt appears asking "personal or business" and the label persists across page reloads
  3. When a bank link expires, a "Re-link Account" popup appears naming the specific institution rather than silently showing $0 balances
  4. Completing eBay OAuth through the Worker stores a valid eBay access token with its expiry timestamp in localStorage
**Plans**: TBD

### Phase 4: Lakshmi Core Views
**Goal**: Rahul can see all personal account balances, spending vs budget trend, credit card utilization, cash flow by month, category spending breakdown, and full transaction history — all live from Teller with date filtering throughout
**Depends on**: Phase 3
**Requirements**: LDASH-01, LDASH-02, LDASH-03, LDASH-04, LDASH-05, LDASH-06, LDASH-07, LDASH-08, LDASH-09, LDASH-10, LDASH-11, LDASH-12, LDASH-13, LCASH-01, LCASH-02, LCASH-03, LACCT-01, LACCT-02, LACCT-03, LACCT-04, LACCT-05, LACCT-06, LTXN-01, LTXN-02, LTXN-03, LTXN-04
**Success Criteria** (what must be TRUE):
  1. The Dashboard shows a spending-vs-budget line graph where the budget line is computed from income minus the 50-60% investing target — not entered manually
  2. Clicking any credit card in the Dashboard opens a transaction log for that card plus a projected payoff date
  3. The Transactions view shows a categorized transaction list on the left and average category spending graphs on the right, both updating when the date filter changes
  4. The Accounts view shows debt-to-assets chart and all account sections (cards, depositories, investments, loans) with a connection alert for any account needing re-auth
  5. Switching chart views destroys the previous Chart.js canvas instance before creating the new one (no memory leak accumulation)
**Plans**: TBD

### Phase 5: Lakshmi Investments View
**Goal**: Rahul can see his full investment picture — live portfolio balance with time-range toggles, which holdings are moving most, how his allocation breaks down across equity/ETF/cash/crypto/derivative, and a full holdings list with dollar and percentage values
**Depends on**: Phase 4
**Requirements**: LINV-01, LINV-02, LINV-03, LINV-04, LINV-05, LINV-06
**Success Criteria** (what must be TRUE):
  1. The Investments view shows a live portfolio balance that updates when a time-range toggle (1W, 1M, YTD, 3M, 1Y) is clicked
  2. The top movers scroll wheel shows at least the top 5 holdings ranked by movement, and toggling between percentage and dollar change rerenders the values without a page reload
  3. The allocation donut chart shows equity, ETF, cash, crypto, and derivative percentages that sum to 100%
  4. The holdings list displays every position with its dollar value and percentage of total portfolio, with no undefined or NaN values visible
**Plans**: TBD

### Phase 6: Kubera and eBay Integration
**Goal**: All five standard financial views (Dashboard, Cashflow, Accounts, Investments, Transactions) are available in Kubera scoped exclusively to business-tagged accounts, with eBay revenue and transaction data merged in alongside Teller card data
**Depends on**: Phase 4
**Requirements**: KDASH-01, KDASH-02, KDASH-03, KCASH-01, KCASH-02, KACCT-01, KINV-01, KTXN-01, KTXN-02
**Success Criteria** (what must be TRUE):
  1. The Kubera Dashboard shows only accounts labeled "business" — personal accounts are not visible anywhere in kubera.html
  2. eBay sales revenue appears in the Kubera Dashboard revenue figures and Kubera Transactions view alongside Teller card transactions
  3. eBay fees and COGS appear as spend categories in the Kubera Cashflow view
  4. When the eBay OAuth token expires (2-hour TTL), the next eBay fetch silently refreshes the token via the Worker without an error shown to the user
**Plans**: TBD

### Phase 7: Kubera Reports View
**Goal**: Rahul can pull up a numbers-heavy Reports view in Kubera that gives him P&L, gross/net/operating margin, quarterly tax estimates with Schedule C mapping, and eBay unit economics per category — with every computed number expandable to show its exact formula and inputs
**Depends on**: Phase 6
**Requirements**: KRPT-01, KRPT-02, KRPT-03, KRPT-04, KRPT-05, KRPT-06, KRPT-07, KRPT-08, KRPT-09, KRPT-10, KRPT-11, KRPT-12
**Success Criteria** (what must be TRUE):
  1. The P&L statement shows gross revenue, eBay fees, COGS, operating expenses, and net income — clicking any line item expands to show the formula and the individual transactions that produced that number
  2. The quarterly tax calculator shows estimated tax owed for the current quarter based on net profit and a self-employment rate, with Schedule C category mapping visible
  3. The unit economics table shows average profit per item, sell-through rate, and days-to-sell broken down by eBay category, using manually entered item costs stored in localStorage per SKU
  4. The break-even analysis shows the number of items and revenue amount needed to cover fixed costs for the current period
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Proxy Infrastructure | 0/1 | Planned | - |
| 2. Data Layer Foundations | 0/TBD | Not started | - |
| 3. Teller Enrollment and Account Routing | 0/TBD | Not started | - |
| 4. Lakshmi Core Views | 0/TBD | Not started | - |
| 5. Lakshmi Investments View | 0/TBD | Not started | - |
| 6. Kubera and eBay Integration | 0/TBD | Not started | - |
| 7. Kubera Reports View | 0/TBD | Not started | - |
