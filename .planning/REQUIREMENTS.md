# Requirements: Shiva OS — Artha Dashboard

**Defined:** 2026-02-23
**Core Value:** Real-time financial visibility across every account, card, and investment — personal and business separated cleanly.

## v1 Requirements

### Infrastructure

- [x] **INFRA-01**: Cloudflare Worker proxy handles Teller mTLS certificate presentation for all API calls
- [x] **INFRA-02**: Cloudflare Worker proxy handles eBay API calls (CORS + credential security)
- [ ] **INFRA-03**: User can connect bank/card/investment accounts via Teller Connect widget
- [ ] **INFRA-04**: User can authenticate eBay seller account via OAuth flow through proxy
- [ ] **INFRA-05**: User is prompted to label each connected account as personal or business
- [ ] **INFRA-06**: Access tokens stored securely in localStorage with silent refresh handling
- [ ] **INFRA-07**: Connection alert popup when a bank/card link expires or needs re-authentication
- [ ] **INFRA-08**: IndexedDB cache layer for transaction history with TTL-based invalidation
- [ ] **INFRA-09**: Currency utilities using cent-based integers to prevent floating point errors
- [ ] **INFRA-10**: Date filtering system (1W, 1M, YTD, 3M, 1Y, custom) shared across all views

### Lakshmi — Dashboard View

- [ ] **LDASH-01**: Spending vs budget line graph ($ on Y-axis, days-in-month on X-axis)
- [ ] **LDASH-02**: Budget line auto-calculated from income minus 50-60% investing target
- [ ] **LDASH-03**: Total amount spent this month displayed as a number
- [ ] **LDASH-04**: Cash saved vs cash spent this year — two card visuals side by side
- [ ] **LDASH-05**: Total cash amount across all personal depository accounts
- [ ] **LDASH-06**: Per-account cash breakdown listing which accounts hold the cash
- [ ] **LDASH-07**: Cash flow trend chart defaulting to 4-5 month window
- [ ] **LDASH-08**: Credit cards list showing each card's utilization rate
- [ ] **LDASH-09**: Click into any credit card to see transaction log and payoff date
- [ ] **LDASH-10**: Assets vs debt line graph with 1W/1M/YTD/3M/1Y toggles
- [ ] **LDASH-11**: Depository accounts displayed as stacked cards (above investments)
- [ ] **LDASH-12**: Investment accounts displayed as stacked cards (below depositories)
- [ ] **LDASH-13**: Allocation percentage breakdown — equity, ETF, cash, crypto, derivative

### Lakshmi — Cashflow View

- [ ] **LCASH-01**: Toggle between net income, spend, and income views
- [ ] **LCASH-02**: Spend view shows category-level breakdown
- [ ] **LCASH-03**: Date filtering on all cashflow charts

### Lakshmi — Accounts View

- [ ] **LACCT-01**: Debt-to-assets chart
- [ ] **LACCT-02**: Credit cards section with balances and utilization
- [ ] **LACCT-03**: Depositories section with balances
- [ ] **LACCT-04**: Investments section with balances
- [ ] **LACCT-05**: Loans and real estate section (if detectable from account data)
- [ ] **LACCT-06**: Connection alert popup for accounts needing re-authentication

### Lakshmi — Investments View

- [ ] **LINV-01**: Live portfolio balance estimate with 1W/1M/YTD/3M/1Y toggles
- [ ] **LINV-02**: Top movers horizontal scroll with toggle between percentage and price change
- [ ] **LINV-03**: Investment account cards showing balance per account
- [ ] **LINV-04**: Allocation graph (equity, ETF, cash, crypto, derivative)
- [ ] **LINV-05**: Full holdings list with dollar amount and percentage of portfolio per holding
- [ ] **LINV-06**: Fallback to free market data API if Teller doesn't provide individual holdings

### Lakshmi — Transactions View

- [ ] **LTXN-01**: Left panel — live transaction list with category tags
- [ ] **LTXN-02**: Right panel — average category spending graph
- [ ] **LTXN-03**: Right panel — category spending trend graph (monthly or date-filtered)
- [ ] **LTXN-04**: Date filtering across all transaction views

### Kubera — Dashboard View

- [ ] **KDASH-01**: Same layout as Lakshmi Dashboard but scoped to business accounts only
- [ ] **KDASH-02**: Integrates eBay API sales data into revenue figures
- [ ] **KDASH-03**: Business cards displayed (Robinhood virtual card, Amazon Prime card)

### Kubera — Cashflow View

- [ ] **KCASH-01**: Same structure as Lakshmi Cashflow scoped to business accounts
- [ ] **KCASH-02**: eBay fees and COGS reflected in spend categories

### Kubera — Accounts View

- [ ] **KACCT-01**: Same structure as Lakshmi Accounts scoped to business accounts

### Kubera — Investments View

- [ ] **KINV-01**: Same structure as Lakshmi Investments scoped to business investment accounts

### Kubera — Transactions View

- [ ] **KTXN-01**: Same structure as Lakshmi Transactions scoped to business accounts
- [ ] **KTXN-02**: eBay transactions integrated with platform fee breakdowns

### Kubera — Reports View

- [ ] **KRPT-01**: P&L statement with hover/click on any number to see calculation breakdown
- [ ] **KRPT-02**: Balance sheet view
- [ ] **KRPT-03**: Margin analysis (gross, net, operating)
- [ ] **KRPT-04**: Tax workflow — quarterly estimate calculator
- [ ] **KRPT-05**: Tax workflow — deductible expense categorization (Schedule C mapping)
- [ ] **KRPT-06**: Unit economics — average profit per item (requires manual cost entry per SKU)
- [ ] **KRPT-07**: Unit economics — sell-through rate, days to sell, ROI per category
- [ ] **KRPT-08**: Break-even analysis — items/revenue needed to cover fixed costs
- [ ] **KRPT-09**: DCF analysis — value eBay operation as a business
- [ ] **KRPT-10**: Growth projections — revenue forecasting from historical trends, what-if scenarios
- [ ] **KRPT-11**: Numbers-heavy layout with minimal graphs
- [ ] **KRPT-12**: Every calculated number shows its formula/breakdown on click/hover

## v2 Requirements

### Enhanced Analytics
- **EANA-01**: AI-powered spending insights (pattern detection across months)
- **EANA-02**: Predictive cash flow forecasting
- **EANA-03**: Automated tax document generation (Schedule C PDF export)

### Multi-Source Data
- **MSRC-01**: Import CSV statements from banks/brokerages
- **MSRC-02**: Manual transaction entry for cash purchases

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI chatbot in Artha views | Krishna already exists on index.html; would violate client-side constraint |
| Credit score monitoring | Requires separate API (Experian/TransUnion), adds complexity without core value |
| Bill payment / write access | Security risk — read-only financial data is the correct boundary |
| YNAB envelope budgeting | Conflicts with Rahul's percentage-target investing philosophy |
| Mobile app | Web-first; responsive design is sufficient |
| Multi-user support | Single-user personal tool |
| Backend database | Client-side with Cloudflare Worker proxy only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 3 | Pending |
| INFRA-04 | Phase 3 | Pending |
| INFRA-05 | Phase 3 | Pending |
| INFRA-06 | Phase 3 | Pending |
| INFRA-07 | Phase 3 | Pending |
| INFRA-08 | Phase 2 | Pending |
| INFRA-09 | Phase 2 | Pending |
| INFRA-10 | Phase 2 | Pending |
| LDASH-01 | Phase 4 | Pending |
| LDASH-02 | Phase 4 | Pending |
| LDASH-03 | Phase 4 | Pending |
| LDASH-04 | Phase 4 | Pending |
| LDASH-05 | Phase 4 | Pending |
| LDASH-06 | Phase 4 | Pending |
| LDASH-07 | Phase 4 | Pending |
| LDASH-08 | Phase 4 | Pending |
| LDASH-09 | Phase 4 | Pending |
| LDASH-10 | Phase 4 | Pending |
| LDASH-11 | Phase 4 | Pending |
| LDASH-12 | Phase 4 | Pending |
| LDASH-13 | Phase 4 | Pending |
| LCASH-01 | Phase 4 | Pending |
| LCASH-02 | Phase 4 | Pending |
| LCASH-03 | Phase 4 | Pending |
| LACCT-01 | Phase 4 | Pending |
| LACCT-02 | Phase 4 | Pending |
| LACCT-03 | Phase 4 | Pending |
| LACCT-04 | Phase 4 | Pending |
| LACCT-05 | Phase 4 | Pending |
| LACCT-06 | Phase 4 | Pending |
| LINV-01 | Phase 5 | Pending |
| LINV-02 | Phase 5 | Pending |
| LINV-03 | Phase 5 | Pending |
| LINV-04 | Phase 5 | Pending |
| LINV-05 | Phase 5 | Pending |
| LINV-06 | Phase 5 | Pending |
| LTXN-01 | Phase 4 | Pending |
| LTXN-02 | Phase 4 | Pending |
| LTXN-03 | Phase 4 | Pending |
| LTXN-04 | Phase 4 | Pending |
| KDASH-01 | Phase 6 | Pending |
| KDASH-02 | Phase 6 | Pending |
| KDASH-03 | Phase 6 | Pending |
| KCASH-01 | Phase 6 | Pending |
| KCASH-02 | Phase 6 | Pending |
| KACCT-01 | Phase 6 | Pending |
| KINV-01 | Phase 6 | Pending |
| KTXN-01 | Phase 6 | Pending |
| KTXN-02 | Phase 6 | Pending |
| KRPT-01 | Phase 7 | Pending |
| KRPT-02 | Phase 7 | Pending |
| KRPT-03 | Phase 7 | Pending |
| KRPT-04 | Phase 7 | Pending |
| KRPT-05 | Phase 7 | Pending |
| KRPT-06 | Phase 7 | Pending |
| KRPT-07 | Phase 7 | Pending |
| KRPT-08 | Phase 7 | Pending |
| KRPT-09 | Phase 7 | Pending |
| KRPT-10 | Phase 7 | Pending |
| KRPT-11 | Phase 7 | Pending |
| KRPT-12 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 56 total
- Mapped to phases: 56
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after roadmap creation — all 56 requirements mapped*
