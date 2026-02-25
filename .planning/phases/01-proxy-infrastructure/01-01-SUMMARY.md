---
phase: 01-proxy-infrastructure
plan: 01
subsystem: infra
tags: [cloudflare-workers, wrangler, cors, mtls, teller, ebay, proxy, localStorage]

# Dependency graph
requires: []
provides:
  - Cloudflare Worker entry point (worker/src/index.js) with path-based routing, CORS, retry, Teller sandbox proxy, eBay 503 stub
  - Worker deployment config (worker/wrangler.toml) with mTLS scaffold for Phase 2+
  - .gitignore protecting worker/.dev.vars and .env files
  - WORKER_URL localStorage config and workerFetch() helper in both lakshmi.html and kubera.html
affects:
  - 02-teller-connect (will use Worker URL and Teller proxy route)
  - 03-financial-data (will call workerFetch for account/transaction data)
  - 06-kubera-views (will use Worker eBay route when approval arrives)

# Tech tracking
tech-stack:
  added:
    - Cloudflare Workers (module syntax, export default)
    - Wrangler CLI (npx wrangler deploy, wrangler secret put)
  patterns:
    - Path-based routing in single Worker (/api/teller/*, /api/ebay/*)
    - CORS headers mirroring request Origin for file:// and localhost compatibility
    - One-retry fetchWithRetry pattern for upstream resilience
    - Structured error responses {error: string, code: number} across all routes
    - localStorage-configurable Worker URL — no hardcoded URLs in HTML source
    - Wrangler Secrets for all sensitive values — never in wrangler.toml or source

key-files:
  created:
    - worker/src/index.js
    - worker/wrangler.toml
    - worker/.dev.vars (gitignored template)
    - .gitignore
  modified:
    - lakshmi.html
    - kubera.html

key-decisions:
  - "Teller sandbox mode (plain fetch) in Phase 1 — mTLS switch is a single line change when cert arrives"
  - "eBay route returns structured 503 stub with full OAuth flow in comments — ready to activate on approval"
  - "WORKER_URL read exclusively from localStorage('shiva-worker-url') — no hardcoded defaults"
  - "workerFetch() helper warns gracefully with console.warn when URL not configured, returns synthetic error instead of crashing"

patterns-established:
  - "Pattern: CORS headers mirror request Origin — handles file://, localhost, and deployed origins without wildcard bypass"
  - "Pattern: fetchWithRetry(req) — attempt once, clone and retry once on failure, return null on total failure"
  - "Pattern: errorResponse(request, message, code) — uniform {error, code} JSON with CORS headers on all error paths"
  - "Pattern: Worker URL via localStorage — switch between staging/production by setting one localStorage key, no HTML changes needed"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 1 Plan 1: Proxy Infrastructure Summary

**Cloudflare Worker proxy scaffold with path-based routing, CORS, one-retry resilience, Teller sandbox proxy, and eBay 503 stub — wired to both HTML pages via localStorage-configurable WORKER_URL**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T05:00:57Z
- **Completed:** 2026-02-25T05:02:55Z
- **Tasks:** 2 of 2
- **Files modified:** 6

## Accomplishments

- Cloudflare Worker (worker/src/index.js, 187 lines) with full CORS preflight handling, one-retry upstream logic, structured error responses, Teller sandbox proxy to api.teller.io, and eBay 503 stub with production OAuth flow in comments
- Worker deployment config (worker/wrangler.toml) with name, main entry, compatibility date, workers_dev flag, and commented mTLS scaffold ready for Phase 2+ certificate upload
- .gitignore protecting worker/.dev.vars, .env files, and OS artifacts — .dev.vars correctly blocked from git staging
- Both lakshmi.html and kubera.html have WORKER_URL constant from localStorage and workerFetch() helper with graceful fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Cloudflare Worker project with Teller proxy and eBay stub** - `4650e97` (feat)
2. **Task 2: Wire Worker URL localStorage config into lakshmi.html and kubera.html** - `5710448` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `worker/src/index.js` — Cloudflare Worker entry point: corsHeaders, handleOptions, fetchWithRetry, errorResponse, handleTeller (sandbox proxy), handleEbay (503 stub + OAuth comments)
- `worker/wrangler.toml` — Worker config: name shiva-os-proxy, main src/index.js, compatibility_date 2025-11-01, workers_dev true, commented mTLS scaffold
- `worker/.dev.vars` — Gitignored template with placeholder comments for eBay sandbox secrets
- `.gitignore` — Protects worker/.dev.vars, .env, .env.*, .DS_Store, Thumbs.db
- `lakshmi.html` — Added WORKER_URL localStorage config and workerFetch() helper before existing JS
- `kubera.html` — Added WORKER_URL localStorage config and workerFetch() helper before existing JS

## Decisions Made

- Teller proxy uses plain fetch in Phase 1 (sandbox mode requires no mTLS cert) — production switch to env.TELLER_CERT.fetch() is a single line change, scaffolded with comment in code
- eBay route returns structured 503 stub; full client credentials OAuth flow is in commented-out block in handleEbay, activated by setting EBAY_APP_ID secret via wrangler
- WORKER_URL reads exclusively from localStorage('shiva-worker-url') with empty string fallback — no hardcoded default URL prevents silent misdirection
- workerFetch() returns synthetic Response on missing URL rather than throwing, so callers can handle errors uniformly

## Deviations from Plan

None — plan executed exactly as written.

Note: .dev.vars was correctly blocked by .gitignore when git add was attempted. This is expected behavior confirming the gitignore works. The template file exists on disk but will never be committed.

## Issues Encountered

None — all verifications passed on first attempt.

## User Setup Required

**External services require manual configuration before Worker deployment:**

1. **Create a free Cloudflare account** (if not already): https://dash.cloudflare.com/sign-up
2. **Authenticate Wrangler CLI** from the worker/ directory:
   ```bash
   cd C:/Users/Rahul/Desktop/shiva-os/worker
   npx wrangler login
   ```
   This opens a browser OAuth flow.
3. **Deploy the Worker:**
   ```bash
   npx wrangler deploy
   ```
   Note the deployed URL (e.g., `https://shiva-os-proxy.<subdomain>.workers.dev`)
4. **Configure Worker URL in browser:**
   Open lakshmi.html or kubera.html in browser, then in DevTools Console:
   ```javascript
   localStorage.setItem('shiva-worker-url', 'https://shiva-os-proxy.<subdomain>.workers.dev')
   ```

**Verification after deployment:**
```bash
# Test Teller proxy (will get 401 from Teller, but NOT a CORS or Worker error)
curl -s https://shiva-os-proxy.<subdomain>.workers.dev/api/teller/accounts -H "Authorization: Basic dGVzdDo=" | cat

# Test eBay stub
curl -s https://shiva-os-proxy.<subdomain>.workers.dev/api/ebay/token | cat
# Expected: {"error":"eBay integration pending approval","code":503}

# Test CORS preflight
curl -s -X OPTIONS https://shiva-os-proxy.<subdomain>.workers.dev/api/teller/accounts \
  -H "Origin: http://localhost" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" -I

# Test 404
curl -s https://shiva-os-proxy.<subdomain>.workers.dev/api/unknown | cat
# Expected: {"error":"Not found","code":404}
```

## Next Phase Readiness

- Worker infrastructure is complete and deployable via `npx wrangler deploy`
- Both HTML pages are wired to read Worker URL from localStorage — no code changes needed after deploy
- mTLS scaffold is in place in wrangler.toml and commented in handleTeller — Phase 2+ production switch is a 3-step operation (upload cert, uncomment binding, update fetch call)
- eBay OAuth implementation is complete in comments — activates when EBAY_APP_ID secret is set
- Phase 2 (Teller Connect) can begin immediately after Worker is deployed and URL is set in localStorage

---
*Phase: 01-proxy-infrastructure*
*Completed: 2026-02-25*

## Self-Check: PASSED

- FOUND: worker/wrangler.toml
- FOUND: worker/src/index.js
- FOUND: .gitignore
- FOUND: lakshmi.html (modified)
- FOUND: kubera.html (modified)
- FOUND: .planning/phases/01-proxy-infrastructure/01-01-SUMMARY.md
- FOUND commit 4650e97 (Task 1)
- FOUND commit 5710448 (Task 2)
