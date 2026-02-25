# Phase 2: Data Layer Foundations - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish shared utilities used by all financial views: currency arithmetic in integer cents, timezone-safe date normalization, IndexedDB caching with TTL, skeleton loading states, and a shared date filter component. No view-specific logic — just the foundation layer.

</domain>

<decisions>
## Implementation Decisions

### Caching behavior
- Cache stored in IndexedDB with 1-hour TTL
- Data refreshes on explicit reload only — no background auto-refresh
- When cache is stale (past TTL), next page load fetches fresh data and updates cache
- Refresh mechanism: Claude's discretion (UI button or browser refresh)

### Loading states
- Skeleton shimmer animation while data loads
- Layout-matched skeletons — skeleton shapes mirror the actual content layout (cards, chart rectangles, list rows)
- Like Robinhood's loading feel — premium, not generic bars
- Each view provides its own skeleton template matching its layout

### Date filter
- Shared date filter bar positioned below the glassmorphic topbar, always visible, never scrolls
- Filter options: 1W, 1M, YTD, 3M, 1Y, custom range
- Default range: 1Y (one year) on first load
- Filter selection persists across all views — switching from Lakshmi Dashboard to Transactions keeps the same date range
- Filter state stored in localStorage so it persists across page reloads

### Currency display
- Mint/Robinhood style — whole numbers only, no cents (e.g., "$1,234" not "$1,234.56")
- Internal arithmetic uses integer cents (no floating-point drift)
- Comma-separated thousands
- Negative values: displayed clearly (Claude's discretion on style — red text, parentheses, or minus sign)

### Claude's Discretion
- Refresh mechanism (UI button vs browser refresh)
- Negative currency display style
- Skeleton shimmer animation speed and color
- IndexedDB schema design
- Date filter component implementation details

</decisions>

<specifics>
## Specific Ideas

- "Dollar amounts should look how Mint or Robinhood would display"
- "Give me whole numbers" — no cents in display, even though arithmetic uses cents internally
- Date filter should be "somewhere explicit, shown clearly" — not hidden or subtle

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-data-layer-foundations*
*Context gathered: 2026-02-25*
