# Shiva OS — Artha Dashboard

## What This Is

A live financial command center split across two deity modules — **Lakshmi** (personal finance) and **Kubera** (business finance) — powered by Teller API for bank/card/investment data and eBay API for sales metrics. Both modules share the same visual structure but are scoped to personal vs business accounts. Built as pure HTML/CSS/JS within the existing Shiva OS dashboard, following the Lakshmi design system.

## Core Value

Real-time financial visibility across every account, card, and investment — personal and business separated cleanly — so Rahul can see exactly where his money is, how it's moving, and what it's doing at any moment.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Data Layer**
- [ ] Teller API integration for live bank, card, and investment account connections
- [ ] eBay API integration for sales, fees, and inventory data
- [ ] Account routing: prompt personal vs business when connecting an account
- [ ] Date filtering system across all views (1W, 1M, YTD, 3M, 1Y + custom)

**Lakshmi — Dashboard View**
- [ ] Spending vs Budget line graph ($ vs days-in-month, auto-calculated budget from 50-60% investing target)
- [ ] Total spent number displayed alongside graph
- [ ] Cash Saved vs Spent this year — two card visuals with total cash across all accounts and per-account breakdown
- [ ] Cash Flow Trend chart (default 4-5 month window)
- [ ] Credit cards list with usage rates, clickable into transaction log + payoff date + utilization details
- [ ] Assets vs Debt line graph with 1W/1M/YTD/3M/1Y toggles
- [ ] Depositories and investment accounts (stacked cards, depositories on top)
- [ ] Allocation percentage breakdown (equity, ETF, cash, crypto, derivative)

**Lakshmi — Cashflow View**
- [ ] Toggles: net income, spend (with category breakdown), income
- [ ] Category-level spend analysis

**Lakshmi — Accounts View**
- [ ] Debt-to-assets chart
- [ ] Credit cards, depositories, investments, loans/real estate sections
- [ ] Connection alert popups for accounts needing attention

**Lakshmi — Investments View**
- [ ] Live balance estimate with time-range toggles
- [ ] Top movers scroll wheel with % vs $ toggle
- [ ] Investment account cards showing balance per account
- [ ] Allocation graph
- [ ] Full holdings list with $ amount and % of portfolio per holding

**Lakshmi — Transactions View**
- [ ] Left panel: live transaction list with category tags
- [ ] Right panel: average category spending graph + category spending trend graph
- [ ] Date filtering throughout

**Kubera — Same 5-View Structure**
- [ ] Dashboard, Cashflow, Accounts, Investments, Transactions — identical structure to Lakshmi
- [ ] Scoped to business accounts only (Robinhood virtual card, Amazon Prime card, eBay)
- [ ] eBay API data integrated into relevant views

**Kubera — Reports View (6th view, business only)**
- [ ] Tax workflow: quarterly estimates, deductible expenses, Schedule C prep
- [ ] DCF analysis (value eBay operation as a business)
- [ ] P&L statements, balance sheet, margin analysis
- [ ] Unit economics: avg profit per item, sell-through rate, days to sell, ROI per category
- [ ] Break-even analysis: items/revenue needed to cover fixed costs
- [ ] Growth projections: revenue forecasting from historical trends, what-if scenarios
- [ ] Numbers-heavy layout, minimal graphs
- [ ] Click/hover any number to see calculation breakdown

### Out of Scope

- Backend server or database — stays client-side with API calls for now
- Multi-user support — single-user (Rahul) only
- Mobile app — web only
- Modifications to other Shiva OS modules (Ganesha, Saraswati, Hanuman, etc.)
- Krishna AI integration into Artha views

## Context

- Shiva OS is an existing pure HTML/CSS/JS dashboard with 9 deity modules
- Kubera currently exists as a static hardcoded P&L page — will be rebuilt entirely
- Lakshmi currently exists as a static finance page — will be rebuilt entirely
- Design system is established: Cinzel/Spectral/IBM Plex Mono fonts, gold/jade/vermillion colors, dark/light mode, glassmorphic topbar, 45-degree diamond grid
- Teller API provides bank, card, and investment account data via REST
- eBay API provides seller metrics, sales history, fees
- Business expenses flow through dedicated cards (Robinhood virtual card, Amazon Prime card)
- Rahul's financial goal: $7M net worth by age 35 (currently ~$125k), 50-60% investing target

## Constraints

- **Tech stack**: Pure HTML/CSS/JS — no frameworks, no npm, no TypeScript, no build system
- **Architecture**: Self-contained HTML files with inline styles/scripts (existing Shiva OS pattern)
- **API keys**: Never hardcoded, stored in localStorage
- **Design**: Must follow Lakshmi design system (fonts, color tokens, grid, animations)
- **Charting**: Needs a vanilla JS charting library loadable via CDN (Chart.js, Lightweight Charts, or similar)
- **Data privacy**: All data stays client-side, API calls direct from browser

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Teller API for bank data | Industry-standard, supports banks/cards/investments in one API | — Pending |
| eBay API for business metrics | Direct source of truth for sales data | — Pending |
| Personal vs business account separation | Clean financial boundaries, different analytical needs | — Pending |
| Same 5-view structure for both modules | Consistent UX, learn once use twice | — Pending |
| Reports view Kubera-only | Business needs professional analysis; personal finance doesn't | — Pending |
| Numbers-heavy Reports with calculation tooltips | Professional reporting feel, transparency into math | — Pending |

---
*Last updated: 2026-02-23 after initialization*
