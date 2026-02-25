# Phase 1: Proxy Infrastructure - Research

**Researched:** 2026-02-24
**Domain:** Cloudflare Workers — mTLS proxy, CORS proxy, credential security
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Credential storage:** Wrangler Secrets (encrypted vault) for all sensitive values — Teller certificates, eBay App ID, Cert ID, Client Secret. Never store in `wrangler.toml`, env vars, or code files. Rotation via `wrangler secret put <KEY>`. Worker accesses via `env.SECRET_NAME`.
- **URL routing design:** Single Worker, path-based routing at `<subdomain>.workers.dev/api`. Routes: `/api/teller/*` for Teller, `/api/ebay/*` for eBay. Shared CORS headers, error handling, retry logic across both APIs.
- **Error & fallback behavior:** One silent retry on upstream failure. If retry also fails, return structured error JSON: `{error: "<description>", code: <status>}`. No aggressive loops — max 1 retry.
- **Code location & deployment:** Worker code in `worker/` folder inside shiva-os repo. Structure: `worker/wrangler.toml` + `worker/src/index.js`. Deploy via `npx wrangler deploy` from `worker/` directory.

### Claude's Discretion

- CORS header configuration specifics
- Request validation and sanitization approach
- Teller mTLS handshake implementation details
- eBay OAuth token exchange flow internals
- Worker logging strategy

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Cloudflare Worker proxy handles Teller mTLS certificate presentation for all API calls | mTLS binding via `mtls_certificates` in wrangler config; `env.CERT.fetch()` call pattern; sandbox requires no cert (Phase 1 uses sandbox) |
| INFRA-02 | Cloudflare Worker proxy handles eBay API calls (CORS + credential security) | CORS header pattern verified; eBay OAuth client credentials grant flow documented; secrets stored via `wrangler secret put` |
</phase_requirements>

---

## Summary

This phase deploys a Cloudflare Worker that acts as the sole bridge between the shiva-os browser pages and two external APIs: Teller (financial data) and eBay (selling data). The Worker solves two distinct but related problems: (1) mTLS — browsers cannot present client certificates, so the Worker presents Teller's issued certificate on behalf of the browser; and (2) CORS — eBay's API does not allow direct browser requests, so the Worker proxies the call from Cloudflare's edge.

The standard stack is minimal and well-supported: Wrangler CLI for deployment, Wrangler Secrets for credential storage, and the built-in `fetch` API in Workers runtime for all upstream calls. No npm dependencies are required in the Worker itself — the Workers runtime provides everything needed. The mTLS binding (`mtls_certificates` in wrangler config) is the key mechanism that allows the Worker to attach a client certificate to outbound `fetch` calls with a single line change: `env.TELLER_CERT.fetch(url)` instead of plain `fetch(url)`.

A critical scoping note from the context: Phase 1 starts Teller in **sandbox mode** (no mTLS needed yet) and treats the eBay routes as stubs (approval pending). This means the full mTLS flow can be scaffolded and tested structurally without requiring a real Teller certificate. The eBay token exchange logic can be implemented and tested against the eBay sandbox. The architecture just needs to be in place; live data validation comes later.

**Primary recommendation:** Scaffold `worker/src/index.js` with path-based routing, CORS headers, structured error responses, and the one-retry pattern — then wire up sandbox Teller first, stub eBay routes, and verify the Worker URL is configurable via localStorage.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Wrangler CLI | `^4.x` (latest) | Deployment, secrets management, local dev | Official Cloudflare toolchain; `npx wrangler` requires no global install |
| Cloudflare Workers Runtime | Compatibility date `2025-11-01` or later | `fetch`, `Request`, `Response`, `URL`, `URLPattern` | Built-in — no install needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `wrangler dev --remote` | Wrangler built-in | Local dev with real mTLS bindings | mTLS `mtls_certificates` bindings only work in remote mode, not local |
| `.dev.vars` file | N/A | Local secret injection for dev | Simulates `wrangler secret` values during `wrangler dev` local mode |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cloudflare Workers | Deno Deploy | Deno Deploy lacks native mTLS client certificate binding — would require certificate pinning workaround; Workers is the correct choice |
| Wrangler Secrets | Environment vars in `wrangler.toml` | `vars` in `wrangler.toml` are committed to git and visible in the dashboard — never appropriate for secrets |
| Single Worker with path routing | Separate Workers per API | Separate Workers require separate deployments, separate URLs, more complexity; single Worker is the correct choice |

**Installation:**
```bash
# From worker/ directory — no global install needed
npx wrangler login
npx wrangler deploy
```

No `package.json` is strictly required for a plain JS Worker. If one is created for Wrangler tooling, `wrangler` is a devDependency only — no runtime deps.

---

## Architecture Patterns

### Recommended Project Structure

```
worker/
├── wrangler.toml          # Worker config (name, main, compatibility_date, mtls bindings)
├── .dev.vars              # Local secrets — NEVER commit (add to .gitignore)
├── src/
│   └── index.js           # Single Worker entry point
```

The root `shiva-os/.gitignore` (or `worker/.gitignore`) must include `.dev.vars` and `.env`.

### Pattern 1: Worker Entry Point with Path-Based Routing

**What:** A single `fetch` handler dispatches to route-specific handler functions based on `url.pathname`.
**When to use:** Always — this is the standard single-Worker pattern for multiple API proxies.

```javascript
// worker/src/index.js
// Source: https://developers.cloudflare.com/workers/get-started/guide/

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight for all routes
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    if (url.pathname.startsWith('/api/teller/')) {
      return handleTeller(request, env, url);
    }

    if (url.pathname.startsWith('/api/ebay/')) {
      return handleEbay(request, env, url);
    }

    return new Response(JSON.stringify({ error: 'Not found', code: 404 }), {
      status: 404,
      headers: corsHeaders(request),
    });
  },
};
```

### Pattern 2: CORS Headers

**What:** Every response from the Worker includes headers that allow the browser to read the response from a different origin (the shiva-os page on `file://` or `localhost`).
**When to use:** All responses — including errors. Preflight OPTIONS handled separately.

```javascript
// Source: https://developers.cloudflare.com/workers/examples/cors-header-proxy/

function corsHeaders(request) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function handleOptions(request) {
  const origin = request.headers.get('Origin');
  const method = request.headers.get('Access-Control-Request-Method');
  const headers = request.headers.get('Access-Control-Request-Headers');

  if (origin && method && headers) {
    // Proper preflight
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }
  // Standard OPTIONS
  return new Response(null, { status: 200, headers: { Allow: 'GET, POST, OPTIONS' } });
}
```

### Pattern 3: One-Retry with Structured Error Response

**What:** Attempt the upstream fetch once; if it fails (network error or 5xx), retry once; if both fail, return structured `{error, code}` JSON.
**When to use:** Both Teller and eBay upstream calls.

```javascript
async function fetchWithRetry(request) {
  let response;
  try {
    response = await fetch(request);
    if (response.ok) return response;
  } catch (_) {
    // First attempt failed — fall through to retry
  }
  // Single retry
  try {
    response = await fetch(request.clone ? request.clone() : request);
    if (response.ok) return response;
    // Upstream returned an error status
    return null; // Signal caller to return structured error
  } catch (_) {
    return null;
  }
}

// Structured error JSON — same shape regardless of which API failed
function errorResponse(request, message, code) {
  return new Response(
    JSON.stringify({ error: message, code }),
    { status: code, headers: corsHeaders(request) }
  );
}
```

### Pattern 4: Teller mTLS Proxy (Sandbox Phase — no cert needed)

**What:** In sandbox mode, the Worker proxies requests to `https://api.teller.io` using a standard `fetch`. The access token from localStorage is forwarded via the `Authorization` header.
**When to use:** Phase 1 (sandbox). mTLS cert binding added in a later phase.

```javascript
// Source: https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/

// Sandbox (Phase 1) — no mTLS cert required
async function handleTeller(request, env, url) {
  const tellerPath = url.pathname.replace('/api/teller', '');
  const tellerUrl = `https://api.teller.io${tellerPath}${url.search}`;

  const upstreamRequest = new Request(tellerUrl, {
    method: request.method,
    headers: {
      'Authorization': request.headers.get('Authorization') || '',
      'Content-Type': 'application/json',
    },
  });

  const upstream = await fetchWithRetry(upstreamRequest);
  if (!upstream) return errorResponse(request, 'Teller upstream error', 502);

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: corsHeaders(request),
  });
}

// Production (future phase) — mTLS cert binding
// The only change is: env.TELLER_CERT.fetch(tellerUrl, options)
// instead of: fetch(tellerUrl, options)
// Binding defined in wrangler.toml:
// [[mtls_certificates]]
// binding = "TELLER_CERT"
// certificate_id = "<id from: npx wrangler mtls-certificate upload --cert cert.pem --key key.pem>"
```

### Pattern 5: eBay OAuth Token Exchange (Stub Phase)

**What:** Exchanges eBay App ID + Cert ID + Client Secret for a short-lived application access token. Token valid 2 hours. In Phase 1, this route is stubbed (eBay approval pending).
**When to use:** Once eBay developer approval arrives.

```javascript
// Source: https://developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html

async function handleEbay(request, env, url) {
  // Phase 1 stub — return placeholder until eBay approval
  if (!env.EBAY_APP_ID || !env.EBAY_CLIENT_SECRET) {
    return new Response(
      JSON.stringify({ error: 'eBay integration pending approval', code: 503 }),
      { status: 503, headers: corsHeaders(request) }
    );
  }

  const credentials = btoa(`${env.EBAY_APP_ID}:${env.EBAY_CLIENT_SECRET}`);
  const tokenUrl = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'; // sandbox for Phase 1

  const tokenRequest = new Request(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });

  const upstream = await fetchWithRetry(tokenRequest);
  if (!upstream) return errorResponse(request, 'eBay token exchange failed', 502);

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: corsHeaders(request),
  });
}
```

### Pattern 6: wrangler.toml Configuration

```toml
# worker/wrangler.toml
name = "shiva-os-proxy"
main = "src/index.js"
compatibility_date = "2025-11-01"
workers_dev = true

# Secrets are NOT listed here — set via: npx wrangler secret put <KEY>
# Accessible in code as: env.EBAY_APP_ID, env.EBAY_CERT_ID, env.EBAY_CLIENT_SECRET

# Phase 1: No mTLS binding needed (Teller sandbox)
# Future phase: Uncomment when cert is uploaded
# [[mtls_certificates]]
# binding = "TELLER_CERT"
# certificate_id = "<from: npx wrangler mtls-certificate upload>"
```

### Pattern 7: localStorage Worker URL Config (Browser Side)

**What:** HTML pages read the Worker URL from localStorage instead of hardcoding it.
**When to use:** Every `fetch` call from `lakshmi.html` or `kubera.html` to the Worker.

```javascript
// In lakshmi.html / kubera.html
const WORKER_URL = localStorage.getItem('shiva-worker-url') || 'https://shiva-os-proxy.<subdomain>.workers.dev';

async function fetchTellerAccounts(accessToken) {
  const res = await fetch(`${WORKER_URL}/api/teller/accounts`, {
    headers: { 'Authorization': `Basic ${btoa(accessToken + ':')}` }
  });
  if (!res.ok) throw new Error(`Teller error: ${res.status}`);
  return res.json();
}
```

### Anti-Patterns to Avoid

- **Storing secrets in `wrangler.toml` `[vars]`:** Committed to git and visible in Cloudflare dashboard. Always use `wrangler secret put`.
- **Using plain `fetch` for mTLS:** Will silently succeed in sandbox, fail in production. Scaffold the `env.TELLER_CERT.fetch()` pattern now so the production switch is trivial.
- **Running `wrangler dev` (local mode) to test mTLS:** mTLS bindings are `undefined` in local mode — use `wrangler dev --remote` when testing certificate bindings.
- **Hardcoding the Worker URL in HTML:** Kills the localStorage-configurable deployment goal. Always read from `localStorage.getItem('shiva-worker-url')`.
- **Forwarding the browser's `Origin` header upstream:** Teller and eBay will see `null` or `localhost` as origin, potentially causing rejections. Strip it before forwarding.
- **One Worker per API:** Creates multiple Worker URLs to manage. Use path-based routing in a single Worker.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| mTLS client certificate presentation | Custom TLS layer, Node.js `https` module with cert/key | `env.TELLER_CERT.fetch()` via `mtls_certificates` binding | Workers runtime handles TLS handshake; `env.CERT.fetch()` is a single line change from plain `fetch` |
| CORS preflight handling | Complex logic for all header combinations | The three-check pattern (Origin + Method + Headers) from official docs | Handles 99% of browser preflight behavior correctly |
| eBay credential Base64 encoding | Custom encoder | `btoa(clientId + ':' + clientSecret)` | `btoa()` is available in Workers runtime natively |
| Local secret injection | Hardcoded test values in JS | `.dev.vars` file | Wrangler reads `.dev.vars` automatically; keeps secrets out of source code even locally |

**Key insight:** The Workers runtime's `fetch` API with the mTLS binding abstraction means the entire mTLS flow requires zero cryptographic code — the certificate presentation is handled by Cloudflare's network layer automatically once the binding is configured.

---

## Common Pitfalls

### Pitfall 1: mTLS Local Dev Failure

**What goes wrong:** `wrangler dev` (local mode) silently returns `undefined` for `env.TELLER_CERT`, causing a runtime error when `.fetch()` is called.
**Why it happens:** mTLS certificate bindings are a Cloudflare-managed resource that doesn't exist locally — the local Wrangler runtime can't emulate it.
**How to avoid:** Use `wrangler dev --remote` when testing any code path that uses `env.TELLER_CERT.fetch()`. For Phase 1 (sandbox, no cert), local mode is fine.
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'fetch')` in wrangler dev output.
**Source:** [GitHub Issue #6067 — MTLS Certificate fetch doesn't work](https://github.com/cloudflare/workers-sdk/issues/6067)

### Pitfall 2: Missing API Token Scope for Certificate Upload

**What goes wrong:** `npx wrangler mtls-certificate upload` fails with a permissions error.
**Why it happens:** The upload command requires the **"SSL and Certificates Edit"** API token scope. OAuth login sets this automatically; API tokens created manually may not include it.
**How to avoid:** Use `wrangler login` (OAuth flow) rather than a manually created API token. Or ensure the API token includes "SSL and Certificates Edit" scope.
**Warning signs:** `Error: A request to the Cloudflare API (/accounts/.../mtls_certificates) failed` during the upload step.

### Pitfall 3: mTLS Target Cannot Be a Cloudflare-Proxied Zone

**What goes wrong:** `env.TELLER_CERT.fetch('https://api.teller.io/...')` returns a `520` error.
**Why it happens:** Cloudflare prohibits mTLS fetch to a target that is itself proxied through Cloudflare.
**How to avoid:** Verify `api.teller.io` is not a Cloudflare-proxied zone. If Teller proxies their API through Cloudflare, this entire approach is blocked and would require a workaround (Deno Deploy or a VPS). Based on current knowledge this is unlikely for a fintech API, but verify.
**Warning signs:** Consistent `520` responses from `env.TELLER_CERT.fetch()` in production.
**Source:** [mTLS · Cloudflare Workers docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/)

### Pitfall 4: eBay `btoa()` With Non-ASCII Characters in Credentials

**What goes wrong:** `btoa(appId + ':' + clientSecret)` throws `InvalidCharacterError` if any credential contains a character outside the Latin1 range.
**Why it happens:** `btoa()` in Workers runtime (same as browsers) only handles 0x00–0xFF characters.
**How to avoid:** eBay App IDs are alphanumeric with dashes — no non-ASCII expected, but good to know. If needed: `btoa(unescape(encodeURIComponent(str)))`.
**Warning signs:** `DOMException: The string to be encoded contains characters outside of the Latin1 range` in Worker logs.

### Pitfall 5: CORS Preflight Fails for the `Authorization` Header

**What goes wrong:** Browser requests that include `Authorization: Basic ...` trigger a preflight, which the Worker rejects if `Access-Control-Allow-Headers` doesn't include `Authorization`.
**Why it happens:** `Authorization` is not a CORS-safelisted header — any request that includes it is "non-simple" and requires a preflight.
**How to avoid:** Include `Authorization` in `Access-Control-Allow-Headers` on the OPTIONS response. The pattern in this research does this.
**Warning signs:** Browser console shows `CORS error` on the preflight request (OPTIONS), not the actual GET/POST.

### Pitfall 6: Free Tier CPU Time Limit (10ms)

**What goes wrong:** The Worker times out on large Teller responses or slow upstream connections.
**Why it happens:** Cloudflare Workers free tier enforces a 10ms CPU time limit per request. `fetch` I/O time does not count against CPU time, but JSON parsing, header manipulation, and retry logic do.
**How to avoid:** Keep Worker logic minimal — proxy, don't transform. For Phase 1's scope (credential security + CORS), 10ms is more than sufficient. Watch logs if Worker start timing out.
**Warning signs:** `Error 1102: Worker exceeded resource limits` response from Cloudflare.
**Source:** [Limits · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/limits/)

### Pitfall 7: `.dev.vars` Committed to Git

**What goes wrong:** eBay credentials or test values in `.dev.vars` get committed and pushed.
**Why it happens:** Developers forget to add the file to `.gitignore` before `git add`.
**How to avoid:** Add `worker/.dev.vars` to the root `.gitignore` before writing any values into it. Make this the first step when creating the `worker/` directory.
**Warning signs:** `git status` shows `.dev.vars` as an untracked file.

---

## Code Examples

Verified patterns from official sources:

### Full Worker Entry Point (Phase 1)

```javascript
// worker/src/index.js
// Sources:
//   https://developers.cloudflare.com/workers/get-started/guide/
//   https://developers.cloudflare.com/workers/examples/cors-header-proxy/
//   https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/

function corsHeaders(request) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function handleOptions(request) {
  const origin = request.headers.get('Origin');
  const method = request.headers.get('Access-Control-Request-Method');
  const reqHeaders = request.headers.get('Access-Control-Request-Headers');
  if (origin && method && reqHeaders) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  return new Response(null, { status: 200, headers: { Allow: 'GET, POST, OPTIONS' } });
}

async function fetchWithRetry(upstreamReq) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = attempt === 0 ? await fetch(upstreamReq) : await fetch(upstreamReq.clone());
      if (res.ok) return res;
    } catch (_) {}
  }
  return null;
}

function errorResponse(request, message, code) {
  return new Response(JSON.stringify({ error: message, code }), {
    status: code,
    headers: corsHeaders(request),
  });
}

async function handleTeller(request, env, url) {
  const tellerPath = url.pathname.replace('/api/teller', '');
  const tellerUrl = `https://api.teller.io${tellerPath}${url.search}`;

  // Phase 1: plain fetch (sandbox — no mTLS cert needed)
  // Phase 2+ production: env.TELLER_CERT.fetch(tellerUrl, ...)
  const upstreamReq = new Request(tellerUrl, {
    method: request.method,
    headers: {
      'Authorization': request.headers.get('Authorization') || '',
      'Content-Type': 'application/json',
    },
  });

  const upstream = await fetchWithRetry(upstreamReq);
  if (!upstream) return errorResponse(request, 'Teller upstream unavailable', 502);

  const body = await upstream.text();
  return new Response(body, { status: upstream.status, headers: corsHeaders(request) });
}

async function handleEbay(request, env, url) {
  // Phase 1 stub — eBay approval pending
  return new Response(
    JSON.stringify({ error: 'eBay integration pending approval', code: 503 }),
    { status: 503, headers: corsHeaders(request) }
  );
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return handleOptions(request);

    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/teller/')) return handleTeller(request, env, url);
    if (url.pathname.startsWith('/api/ebay/'))   return handleEbay(request, env, url);

    return errorResponse(request, 'Not found', 404);
  },
};
```

### Secret Management Commands

```bash
# Source: https://developers.cloudflare.com/workers/configuration/secrets/

# Set secrets (run from worker/ directory)
npx wrangler secret put EBAY_APP_ID
npx wrangler secret put EBAY_CERT_ID
npx wrangler secret put EBAY_CLIENT_SECRET
# For production mTLS (future phase — cert/key are uploaded as a binding, not a secret)
# npx wrangler mtls-certificate upload --cert cert.pem --key key.pem --name teller-cert

# Local dev secrets (file: worker/.dev.vars)
# EBAY_APP_ID="your-sandbox-app-id"
# EBAY_CLIENT_SECRET="your-sandbox-client-secret"
```

### Teller API Request Format (from curl example in docs)

```bash
# Source: https://teller.io/docs/api/authentication
# Teller uses HTTP Basic Auth with the access token as the username, password empty

curl https://api.teller.io/accounts \
  -u ACCESS_TOKEN:
  # In Worker: Authorization: Basic btoa(accessToken + ':')
  # The browser sends the raw access token; Worker forwards it as Basic auth
```

### eBay Token Exchange

```bash
# Source: https://developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html

# Sandbox endpoint: https://api.sandbox.ebay.com/identity/v1/oauth2/token
# Production endpoint: https://api.ebay.com/identity/v1/oauth2/token
# Authorization header: Basic <base64(appId:clientSecret)>
# Body: grant_type=client_credentials&scope=<url-encoded scopes>
# Response: { access_token, expires_in: 7200, token_type: "Application Access Token" }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `wrangler.toml` (TOML format) | `wrangler.jsonc` (JSON with comments — recommended) | 2024-2025 | Both still work; jsonc is now the default from `npm create cloudflare@latest`; TOML remains fully supported |
| `wrangler publish` | `wrangler deploy` | ~2022-2023 | `publish` is deprecated; use `deploy` |
| Module Worker (`export default`) | Module Worker (same) | Always current | This is the correct pattern; "Service Worker" (addEventListener) is legacy |

**Deprecated/outdated:**
- `wrangler publish`: Replaced by `wrangler deploy`. Some old blog posts still use `publish` — ignore them.
- Service Worker syntax (`addEventListener('fetch', ...)`): Legacy. Use module syntax (`export default { async fetch(...) }`).

---

## Open Questions

1. **Is `api.teller.io` proxied through Cloudflare?**
   - What we know: Cloudflare mTLS cannot target a Cloudflare-proxied zone (returns 520).
   - What's unclear: Whether Teller routes their API through Cloudflare's network.
   - Recommendation: After deploying the Worker, attempt `env.TELLER_CERT.fetch('https://api.teller.io/')` in `--remote` mode and verify no 520 errors. Phase 1 (sandbox, no cert) is unaffected by this — address before production switch.

2. **Teller client certificate format: PEM files or combined bundle?**
   - What we know: Teller issues client certificates; `wrangler mtls-certificate upload --cert cert.pem --key key.pem` expects separate cert and key PEM files.
   - What's unclear: Whether Teller provides the certificate as a `.pem` pair or as a `.p12`/`.pfx` bundle (which would require conversion with `openssl pkcs12 -in cert.p12 -out cert.pem`).
   - Recommendation: Check the Teller dashboard when activating development mode. If `.p12`, convert with: `openssl pkcs12 -in teller.p12 -nocerts -out key.pem -nodes && openssl pkcs12 -in teller.p12 -nokeys -out cert.pem`. This is a Phase 2+ concern — not needed for sandbox.

3. **eBay developer account approval status**
   - What we know: eBay sandbox is available immediately after account approval (1-2 business days). Production requires a separate eligibility application (~10 business days).
   - What's unclear: Whether Rahul has a developer account already or needs to register.
   - Recommendation: Register at `developer.ebay.com` now if not already done; sandbox credentials become available within 1-2 days. Phase 1 stubs the eBay route anyway, so this doesn't block Phase 1 completion — but registering early unblocks Phase 1 eBay success criteria.

4. **eBay scope for Sell/Finances API access**
   - What we know: The client credentials grant returns an application token; specific scopes like `https://api.ebay.com/oauth/api_scope/sell.finances` are required for financial data.
   - What's unclear: Exact scope string for the Fulfillment/Finances APIs Rahul needs, and whether client credentials grant is sufficient (vs. user OAuth flow).
   - Recommendation: Use `https://api.ebay.com/oauth/api_scope` as the base scope for Phase 1 token exchange testing. Full scope research deferred to Phase 6 (Kubera views).

---

## Sources

### Primary (HIGH confidence)

- [mTLS · Cloudflare Workers docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/) — mTLS binding format, fetch pattern, limitations
- [Secrets · Cloudflare Workers docs](https://developers.cloudflare.com/workers/configuration/secrets/) — `wrangler secret put`, `.dev.vars`, env access pattern
- [CORS header proxy · Cloudflare Workers docs](https://developers.cloudflare.com/workers/examples/cors-header-proxy/) — Official CORS pattern, header names, preflight handling
- [Get started guide · Cloudflare Workers docs](https://developers.cloudflare.com/workers/get-started/guide/) — Worker structure, `wrangler dev`, `wrangler deploy`
- [Limits · Cloudflare Workers docs](https://developers.cloudflare.com/workers/platform/limits/) — Free tier: 100k req/day, 10ms CPU, 128MB memory, 50 subrequests
- [Configuration - Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/) — `wrangler.toml`/`wrangler.jsonc` schema, `mtls_certificates` binding format
- [eBay Client Credentials Grant](https://developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html) — Token endpoint, request format, response shape
- [Teller Authentication](https://teller.io/docs/api/authentication) — mTLS requirement, Basic Auth access token format
- [Teller Environments](https://teller.io/docs/guides/environments) — Sandbox (no cert), Development (cert required), Production

### Secondary (MEDIUM confidence)

- [Cloudflare Workers mTLS blog post](https://blog.cloudflare.com/mtls-workers/) — General availability confirmation for all tiers including free
- [GitHub Issue #6067 — MTLS cert fetch doesn't work in local mode](https://github.com/cloudflare/workers-sdk/issues/6067) — Confirmed: `wrangler dev --remote` required for mTLS binding testing
- [eBay developer approval timeline](https://forums.developer.ebay.com/questions/40457/developer-account-still-pending-approval-1.html) — 1-2 business days for sandbox, ~10 for production

### Tertiary (LOW confidence)

- None — all critical claims were verified against official documentation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Wrangler/Workers runtime confirmed via official Cloudflare docs
- Architecture: HIGH — Path routing, CORS, mTLS binding all from official examples
- Pitfalls: HIGH for mTLS local-dev issue (GitHub issue confirmed), MEDIUM for eBay btoa edge case (standard JS behavior, unlikely to affect eBay credentials)
- eBay scopes: LOW — exact scope strings for Sell/Finances API not pinned; deferred to Phase 6

**Research date:** 2026-02-24
**Valid until:** 2026-05-24 (90 days — Cloudflare Workers API is stable; Wrangler CLI updates frequently but breaking changes are rare)
