# Robinhood integration templates for Gnoman

Robinhood currently publishes official developer APIs for **crypto trading**, while stock/ETF execution relies on undocumented endpoints used by first-party applications.

## Supported path: Robinhood Crypto API

The backend includes template helpers under `backend/services/robinhood`:

- `auth.ts` – ECDSA request-signing helper (`signRobinhoodRequest`).
- `client.ts` – `RobinhoodCryptoClient` with:
  - `getAccountBalance()`
  - `placeOrder(symbol, amountCash)`
  - `getOrderStatus(orderID)`
  - built-in HTTP 429 retry handling
- `purchaseCryptoWithCash(...)` convenience helper for Gnoman purchase flows.

### Environment variables

- `ROBINHOOD_API_KEY` – API key from Robinhood portal.
- `ROBINHOOD_PRIVATE_KEY` – PEM private key used to sign requests.

## Unsupported path: Robinhood equity endpoints (use at your own risk)

`unofficialClient.ts` is intentionally guarded behind:

- `GNOMAN_ENABLE_UNOFFICIAL_ROBINHOOD=true`

If the feature flag is not set, calls throw immediately.

> ⚠️ Undocumented endpoints can change without notice and may violate platform terms. Use only for local experiments.
