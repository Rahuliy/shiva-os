# API Setup Guide — Artha Dashboard

## 1. Teller (bank/card/investment data)
- **Status:** ✓ Signed up
- **Application ID:** (save it here or in localStorage)
- **Public Key:** Downloaded (for Teller Connect token signing)
- **Environment:** Sandbox (no mTLS needed yet — production requires mTLS certificate)
- **Dashboard:** https://teller.io/dashboard

## 2. eBay Developer Program
- **Status:** Not started
- **Sign up:** https://developer.ebay.com
- **Steps:**
  1. Log in with your eBay seller account
  2. Go to Application Keys
  3. Create app named "shiva-os"
  4. Save: App ID, Dev ID, Cert ID, Client Secret
- **Note:** Not needed until Phase 6 (Kubera). Can skip for now.

## 3. Cloudflare (proxy)
- **Status:** Not started
- **Sign up:** https://dash.cloudflare.com/sign-up
- **Steps:**
  1. Create free account
  2. No domain needed — just Workers access
  3. We'll set up the Worker together in Phase 1
- **Note:** Needed for Phase 1. Do this before starting build.

## Build Order
1. **Cloudflare account** → needed first (Phase 1)
2. **Teller** → already done, sandbox mode ready (Phase 3)
3. **eBay Developer** → can wait until Phase 6
