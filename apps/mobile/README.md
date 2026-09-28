# IQX Mobile

Expo Router app for the consumer IQX flows. It uses the shared domain, API, and
design-token packages; `/admin/**` remains web-only.

## Local development

```bash
pnpm install
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api/v2 pnpm --filter @iqx/mobile start
```

The app keeps the access token in memory and the refresh token in
`expo-secure-store`. Mobile mutations must include an idempotency key and must
wait for an authoritative server response.

## Release configuration

- Configure EAS project credentials and app signing for `development`,
  `preview`, and `production` profiles in `eas.json`.
- Android builds are pinned to compile/target API 36 through
  `expo-build-properties`, matching the 31/08/2026 Play requirement.
- Configure `MOBILE_IOS_PRODUCT_IDS` and `MOBILE_ANDROID_PRODUCT_IDS` in
  backend-v2 before enabling a store product. The server entitlement remains
  authoritative; the UI never grants Premium from a client receipt alone.
- The iOS Associated Domains and Android App Links entries target `iqx.vn`.
  Publish the Apple association and Android `assetlinks.json` files with the
  production web deployment, using the real Apple Team ID and signing
  certificate fingerprints.
- Native StoreKit/Play Billing adapters still need to be supplied before a
  production purchase button is enabled. The current screen intentionally
  exposes no fake purchase success.
- The chart bridge accepts only schema-validated frames and never carries a
  token in a WebView URL. Verify the TradingView mobile/WebView license before
  shipping the advanced chart surface; a license mismatch is a release gate.
- Learning media must use short-lived signed URLs. Do not log, cache publicly,
  or send those URLs to analytics.

## Production gates still outstanding

- Wire the StoreKit and Google Play receipt providers, including refund,
  grace-period, revoke, and server-to-server notification verification.
- Add the native PDF/video renderers and finish the full demo-journey order
  ticket, chart-drawing, alert-rule, and backtest interaction surfaces.
- Connect the push delivery worker and privacy export/deletion worker; the API
  now persists device and request records but does not process queued jobs yet.

## Validation

```bash
pnpm --filter @iqx/mobile typecheck
pnpm --filter @iqx/mobile exec expo install --check
node --test apps/mobile/tests/smoke.test.mjs
```
