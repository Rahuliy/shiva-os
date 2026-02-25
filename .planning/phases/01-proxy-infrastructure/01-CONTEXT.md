# Phase 1: Proxy Infrastructure - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy a Cloudflare Worker that acts as the sole bridge between the browser and both external APIs — Teller via mTLS and eBay via CORS. No credentials visible in any HTML file. The Worker lives in a `worker/` folder inside the shiva-os repo and is deployed via Wrangler CLI.

</domain>

<decisions>
## Implementation Decisions

### Credential storage
- Use Wrangler Secrets (encrypted vault built into Cloudflare) for all sensitive values: Teller certificates, eBay App ID, Cert ID, Client Secret
- Never store secrets in `wrangler.toml`, environment variables, or code files
- Rotation via `wrangler secret put <KEY>` — no code changes or redeployment needed
- Worker code accesses secrets via `env.SECRET_NAME`

### URL routing design
- Single Worker with path-based routing at `<subdomain>.workers.dev/api`
- Routes: `/api/teller/*` for Teller API calls, `/api/ebay/*` for eBay API calls
- Shared CORS headers, error handling, and retry logic across both APIs
- Browser modules store one Worker URL in localStorage — configurable, no code changes to switch deployments

### Error & fallback behavior
- Worker retries failed upstream requests once silently (handles temporary network blips)
- If retry also fails, return structured error JSON: `{error: "<description>", code: <status>}`
- No aggressive retry loops — max 1 retry to avoid user-facing delay
- HTML pages receive clean error responses they can display however they choose (toast, banner, etc.)

### Code location & deployment
- Worker code lives in `worker/` folder inside the shiva-os repo
- Structure: `worker/wrangler.toml` (config) + `worker/src/index.js` (Worker code)
- Deploy via `npx wrangler deploy` from the `worker/` directory
- Single repo keeps atomic commits possible (frontend + proxy changes together)

### Claude's Discretion
- CORS header configuration specifics
- Request validation and sanitization approach
- Teller mTLS handshake implementation details
- eBay OAuth token exchange flow internals
- Worker logging strategy

</decisions>

<specifics>
## Specific Ideas

- Worker URL stored in localStorage so switching between staging/production requires no code changes
- Teller starts in sandbox mode (no mTLS needed yet) — production mTLS comes later
- eBay integration is pending developer approval (not blocking Phase 1 — can stub the eBay routes)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-proxy-infrastructure*
*Context gathered: 2026-02-24*
