# COD OTP Backend

Standalone backend for the COD OTP flow. It is **completely separate from the
Shopify app** and is reached only through Shopify's **App Proxy**. It generates,
stores, and verifies OTPs, and sends SMS via the Synapse provider. All
credentials live in environment variables and are never exposed to the frontend.

## How it's called

The Checkout UI Extension calls:

```
https://<shop-domain>/apps/cod-otp/api/otp/send
https://<shop-domain>/apps/cod-otp/api/otp/verify
```

Shopify's App Proxy forwards these to this backend (configured via the app's
`[app_proxy].url`), appending a signed `signature` query parameter. Every
request to `/api/otp/*` is verified against `SHOPIFY_API_SECRET`. This means:

- No CORS: requests are same-origin with the store.
- No backend URL in the frontend: Shopify holds the mapping.
- Forged requests are rejected (HMAC signature check).

## Endpoints (all under the App Proxy, signature-verified)

- `POST /api/otp/send` — body `{ "phone": "<uae number>" }`. Generates a secure
  6-digit OTP, stores it with a TTL, sends the SMS. Never returns the OTP.
- `POST /api/otp/verify` — body `{ "phone": "...", "code": "..." }`. Returns only
  `{ ok, message }`.
- `GET /api/otp/status?phone=...` — `{ verified: boolean }`.
- `POST /api/otp/reset` — body `{ "phone": "..." }`. Clears verification.
- `GET /health` — open health check (no signature).

## Configuration

Copy `.env.example` to `.env` and set:

- `SYNAPSE_SMS_URL`, `SYNAPSE_USERNAME`, `SYNAPSE_PASSWORD`, `SYNAPSE_SENDER_ID`
- `SHOPIFY_API_SECRET` — the app's client secret (Partner dashboard), used to
  verify App Proxy signatures.
- OTP policy: `OTP_LENGTH`, `OTP_TTL_SECONDS`, `OTP_RESEND_COOLDOWN_SECONDS`,
  `OTP_MAX_SENDS_PER_HOUR`, `OTP_MAX_VERIFY_ATTEMPTS`, `SMS_REQUEST_TIMEOUT_MS`.

## Run

```
npm install
npm start
```

## Production deployment

1. Deploy this folder to a host with a stable **HTTPS** URL (Render, Railway,
   Fly.io, AWS, etc.). No localhost / tunnels / proxies in production.
2. Set all env vars in the host.
3. In `shopify-app/shopify.app.*.toml`, set `[app_proxy].url` to this backend's
   HTTPS base URL, then run `shopify app deploy` from the `shopify-app` folder.

## Modules

- `config.js` — validated env config (secrets read lazily, never logged).
- `phone.js` — UAE normalization/validation + API phone format.
- `otpStore.js` — secure OTP generation, TTL, cooldown, rate limit, verify.
- `smsProvider.js` — Synapse payload + send with timeout/error handling.
- `appProxy.js` — App Proxy HMAC signature verification.
- `otpRoutes.js` — send/verify/status/reset handlers.
- `index.js` — Express wiring.

## Scaling note

The OTP store is in-memory (single instance). For multiple instances or
durability, replace the `Map`s in `otpStore.js` with Redis/DB with TTL.
