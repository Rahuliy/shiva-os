// worker/src/index.js
// Shiva OS Proxy — Cloudflare Worker entry point
//
// Sources:
//   https://developers.cloudflare.com/workers/get-started/guide/
//   https://developers.cloudflare.com/workers/examples/cors-header-proxy/
//   https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/
//
// Routes:
//   /api/teller/*  → Teller API proxy (sandbox mode, Phase 1)
//   /api/ebay/*    → eBay stub (approval pending)
//   OPTIONS        → CORS preflight handler
//   *              → 404 structured error

// ── CORS Headers ─────────────────────────────────────────────────────────────
// Mirror the request Origin back so responses work from file://, localhost,
// or any deployed domain. Every response — including errors — uses these headers.

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

// ── CORS Preflight ────────────────────────────────────────────────────────────
// Authorization is a non-simple header, so every fetch with it triggers a
// preflight. We must echo back Allow headers or the browser will block the call.

function handleOptions(request) {
  const origin = request.headers.get('Origin');
  const method = request.headers.get('Access-Control-Request-Method');
  const reqHeaders = request.headers.get('Access-Control-Request-Headers');

  if (origin && method && reqHeaders) {
    // Proper CORS preflight — return 204 with all allow headers
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  // Plain OPTIONS (not a CORS preflight) — return allowed methods
  return new Response(null, {
    status: 200,
    headers: { Allow: 'GET, POST, OPTIONS' },
  });
}

// ── Retry Logic ───────────────────────────────────────────────────────────────
// Attempt the upstream fetch once; if it fails (network error or non-ok status),
// retry once. Max 1 retry to avoid user-facing delay. Returns null on total failure.

async function fetchWithRetry(upstreamRequest) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // First attempt uses request directly; second clones to avoid "body used" error
      const res = attempt === 0
        ? await fetch(upstreamRequest)
        : await fetch(upstreamRequest.clone());
      // Return any HTTP response (including 4xx) — only retry on network errors
      return res;
    } catch (_) {
      // Network error — fall through to retry or return null
    }
  }
  return null;
}

// ── Structured Error Response ─────────────────────────────────────────────────
// Consistent error shape: { error: string, code: number }
// Always includes CORS headers so browsers can read the error body.

function errorResponse(request, message, code) {
  return new Response(JSON.stringify({ error: message, code }), {
    status: code,
    headers: corsHeaders(request),
  });
}

// ── Teller Proxy ──────────────────────────────────────────────────────────────
// Phase 1 (sandbox): plain fetch to api.teller.io — no mTLS cert needed.
// The browser passes its Teller access token; we forward it via Authorization.
//
// Production mTLS switch (Phase 2+):
//   Replace: await fetchWithRetry(upstreamReq)
//   With:    env.TELLER_CERT.fetch(tellerUrl, { method, headers })
//
// wrangler.toml binding (uncomment when cert is uploaded):
//   [[mtls_certificates]]
//   binding = "TELLER_CERT"
//   certificate_id = "<from: npx wrangler mtls-certificate upload --cert cert.pem --key key.pem>"

async function handleTeller(request, env, url) {
  // Strip /api/teller prefix to get the Teller API path
  const tellerPath = url.pathname.replace('/api/teller', '');
  const tellerUrl = `https://api.teller.io${tellerPath}${url.search}`;

  try {
    // Use mTLS binding — env.TELLER_CERT.fetch() presents the client certificate
    const upstream = await env.TELLER_CERT.fetch(tellerUrl, {
      method: request.method,
      headers: {
        'Authorization': request.headers.get('Authorization') || '',
        'Content-Type': 'application/json',
      },
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: corsHeaders(request),
    });
  } catch (e) {
    return errorResponse(request, `Teller upstream error: ${e.message}`, 502);
  }
}

// ── eBay Handler ──────────────────────────────────────────────────────────────
// Phase 1: eBay developer approval pending — return structured 503 stub.
//
// When approval arrives, set secrets via:
//   npx wrangler secret put EBAY_APP_ID
//   npx wrangler secret put EBAY_CERT_ID
//   npx wrangler secret put EBAY_CLIENT_SECRET
//
// The stub checks env.EBAY_APP_ID — if the secret exists, it runs the real
// OAuth client credentials flow; if not, it returns the 503 stub.
//
// Production eBay OAuth client credentials grant (ready to activate):
//
//   async function handleEbay(request, env, url) {
//     if (!env.EBAY_APP_ID || !env.EBAY_CLIENT_SECRET) {
//       return new Response(
//         JSON.stringify({ error: 'eBay integration pending approval', code: 503 }),
//         { status: 503, headers: corsHeaders(request) }
//       );
//     }
//
//     const credentials = btoa(`${env.EBAY_APP_ID}:${env.EBAY_CLIENT_SECRET}`);
//     const tokenUrl = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
//
//     const tokenRequest = new Request(tokenUrl, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/x-www-form-urlencoded',
//         'Authorization': `Basic ${credentials}`,
//       },
//       body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
//     });
//
//     const upstream = await fetchWithRetry(tokenRequest);
//     if (!upstream) return errorResponse(request, 'eBay token exchange failed', 502);
//
//     const body = await upstream.text();
//     return new Response(body, { status: upstream.status, headers: corsHeaders(request) });
//   }

async function handleEbay(request, env, url) {
  // Phase 1 stub — activate the commented implementation above when eBay approval arrives
  if (env.EBAY_APP_ID) {
    // Secrets are set — run the real OAuth flow (uncomment production block above)
    // For now, fall through to stub until full flow is activated
  }
  return new Response(
    JSON.stringify({ error: 'eBay integration pending approval', code: 503 }),
    { status: 503, headers: corsHeaders(request) }
  );
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight first — before any route matching
    if (request.method === 'OPTIONS') return handleOptions(request);

    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/teller/')) return handleTeller(request, env, url);
    if (url.pathname.startsWith('/api/ebay/'))   return handleEbay(request, env, url);

    return errorResponse(request, 'Not found', 404);
  },
};
