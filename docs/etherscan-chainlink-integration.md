# Etherscan + Chainlink Integration

## Environment Variables

Required for Etherscan features:

- `ETHERSCAN_API_KEY`

Optional Etherscan overrides:

- `ETHERSCAN_CHAIN_ID` (default `1`)
- `ETHERSCAN_BASE_URL` (default `https://api.etherscan.io/api`)

Required for Chainlink runtime configuration:

- `CHAINLINK_NODE_URL`
- `CHAINLINK_JOB_ID`
- `CHAINLINK_OPERATOR_ADDRESS`
- `CHAINLINK_LINK_TOKEN`
- `RPC_URL` (or `GNOMAN_RPC_URL` / `SAFE_RPC_URL`)

## Service Modules

- `backend/services/etherscanService.ts`
  - ABI auto-resolve by address
  - proxy-aware implementation ABI resolution (`getsourcecode` then `getabi`)
  - address-tethered cache + metadata sidecar
  - in-process cache and per-process fetch-once semantics
  - 3 req/sec limiter for free-tier compatibility
  - tx history and gas oracle helpers
- `backend/services/chainlinkService.ts`
  - price feed helper for `latestRoundData`
  - runtime env validation helper for node/job/operator/link settings
- `backend/utils/http.ts`
  - reusable axios HTTP client for Etherscan
- `backend/utils/signer.ts`
  - backend signer helper for server-side execution

## Solidity Examples

- `contracts/PriceFeedConsumer.sol`
- `contracts/OracleConsumer.sol`

These examples are minimal references for using Chainlink feed reads and oracle request/fulfillment flow scaffolding.
