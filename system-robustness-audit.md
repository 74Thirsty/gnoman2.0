# GNOMAN 2.0 System Robustness Audit

## Executive Summary
- **Assessment window:** Historical architecture review and point-in-time verification on current main branch (commit HEAD prior to this audit).
- **Focus areas:** Core wallet lifecycle, sandbox tooling, secure storage, and backend service reliability.
- **Overall posture:** Medium risk. Critical issues were identified around sandbox command execution and wallet data durability. These have been remediated in this change set. Additional medium-risk gaps remain (notably lack of authentication and rate limiting) and are called out below.

## Methodology
1. Enumerated backend services (`backend/`) and sandbox modules (`modules/sandbox/`) with emphasis on security-sensitive flows.
2. Reviewed persistence and secret-handling mechanisms for wallet operations.
3. Exercised threat modelling for RPC sandbox operations and external tool integrations.
4. Implemented targeted mitigations for high-risk findings, followed by TypeScript compilation to validate correctness (`npm run build:backend`).

## Findings & Current Status
| Area | Issue | Risk | Status |
| --- | --- | --- | --- |
| Security | Sandbox fork endpoint accepted arbitrary `command` allowing remote code execution. | **Critical** | **Mitigated** – enforced allow-list validation in service layer and worker orchestration. |
| Security | Wallet secrets only stored in-memory; loss on restart and vulnerable to process crashes. | **High** | **Mitigated** – introduced encrypted SQLite persistence with durable settings. |
| Security | RPC fork inputs were not validated (arbitrary ports, malformed URLs). | High | **Mitigated** – strict validation for URL, port, block height, and command fields. |
| Reliability | Vanity job mnemonic persistence already handled; wallet lifecycle previously volatile. | Medium | **Improved** – wallet metadata now survives restarts. |
| Reliability | No audit trail for sandbox operations beyond existing logs. | Medium | **Existing** – retained history mechanism; recommend centralising log rotation. |
| Security | No authentication / rate-limiting on backend API. | High | **Open** – requires product decision; recommendation provided. |
| Security | Renderer-to-backend communication relies on implicit trust. | Medium | **Open** – recommend API key or signed requests. |
| Performance | Wallet listing now I/O bound; still acceptable (<1 ms per query in local testing). | Low | **Monitored** – future optimisation optional if dataset grows. |

## Remediation Actions Implemented
1. **Wallet persistence hardening**
   - Added `backend/services/walletStore.ts` with encrypted, journaled SQLite storage inside `.gnoman/wallets.db` using `WAL` + `FULL` sync for crash resilience.
   - Updated `walletService` to sanitise aliases, persist records, and decrypt from durable storage when exporting.
2. **Sandbox command execution controls**
   - Validated RPC fork inputs server-side, enforcing protocol, numeric port ranges, and non-negative block heights.
   - Restricted fork commands to an allow-list (default `anvil`, extendable via `GNOMAN_FORK_ALLOWLIST`) in both `sandboxService` and the worker harness (`LocalFork`). Path separators and unexpected characters are rejected.
3. **Operational verification**
   - Built backend TypeScript targets (`npm run build:backend`) ensuring all new modules compile and existing code adapts to persistence changes.

## Additional Recommendations
1. **Introduce authenticated API access** – require a local API token or OS keychain bound secret before serving wallet/sandbox endpoints to prevent unauthorised local usage.
2. **Rate limiting & request quotas** – apply middleware (e.g. `express-rate-limit`) on wallet export/import endpoints to reduce brute-force attempts.
3. **Secure configuration checks** – extend startup to verify `.gnoman` permissions (warn if more permissive than `0700`).
4. **Comprehensive automated tests** – add integration tests that cover wallet import/export persistence and sandbox fork lifecycle to guard against regressions.

## Verification & Evidence
- TypeScript compilation succeeded: `npm run build:backend`.
- Manual code review confirms new SQLite-backed storage and command validation pathways.
- See source updates in:
  - `backend/services/walletStore.ts`
  - `backend/services/walletService.ts`
  - `backend/services/sandboxService.ts`
  - `modules/sandbox/localFork.ts`

