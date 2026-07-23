# ABA PayWay KHQR integration

This directory is the server-only boundary for ABA PayWay.

## Scope

- KHQR only (`payment_option=abapay_khqr`)
- PayWay QR image template 3 (`qr_image_template=template3_color`)
- USD and KHR QR amounts
- ABA PayWay exchange-rate API
- Sandbox and production environment switching

No API key or HMAC operation belongs in the React/Vite application. Never create
`VITE_PAYWAY_API_KEY` or expose the merchant API key in a browser response.

## Files

- `client.js` signs and sends PayWay requests.
- `index.js` exports the integration boundary.
- `assets/` is reserved for official ABA assets exported from the supplied
  merchant Figma guideline.

## Required ABA setup

1. Obtain sandbox merchant credentials from ABA.
2. Ask ABA to whitelist the backend's public domain/IP.
3. Ask ABA to whitelist the HTTPS callback URL.
4. Fill the `PAYWAY_*` values in `.env`.
5. Keep `PAYWAY_ENV=sandbox` and `PAYWAY_ENABLED=false` until credentials and
   whitelisting are ready.
6. Enable the integration and verify test transactions in the PayWay sandbox.
7. Switch to production only after ABA approval.

## Important behavior

- `generateKhqr()` sends `payment_option=abapay_khqr`.
- Template 3 is fixed by `PAYWAY_QR_TEMPLATE=template3_color`.
- KHR amounts must be whole numbers and at least 100 KHR.
- USD amounts must be at least 0.01 USD.
- Transaction IDs are limited to 20 characters.
- QR responses include `qrString`, `qrImage`, and an ABA Mobile deeplink.
- A QR must not be considered paid merely because it was generated.
- Payment completion must be confirmed by a PayWay callback and/or a signed
  transaction-status check before updating a PhoneFlow trade.

## Exchange-rate policy

The PayWay exchange-rate endpoint is signed with the same merchant credentials.
`PAYWAY_USD_KHR_RATE_SIDE` chooses `buy` or `sell`; confirm the correct business
rule with ABA before production. PhoneFlow caches the selected rate and returns
the configured fallback when PayWay is disabled, unreachable, or omits USD/KHR.

Official references:

- https://developer.payway.com.kh/api-endpoints-984508m0
- https://developer.payway.com.kh/qr-api-14530840e0
- https://developer.payway.com.kh/exchange-rate-14530823e0
- https://developer.payway.com.kh/khqr-guideline-3192101f0
