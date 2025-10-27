@@ -109,57 +109,59 @@ The renderer surfaces the core workflows through a set of tabs defined in
  `GET /api/safes/:address/owners` and `GET /api/safes/:address/transactions/held`
  to populate data and to surface aggregated hold counters plus the effective
  policy (global defaults + Safe override).
- Tune Safe-specific hold duration and enable/disable flags directly from the
  page. Changes are persisted to SQLite (`holds.sqlite`) and mirrored back via
  `POST /api/safes/:address/hold`.
- Held transactions reflect entries tracked by the SQLite-backed hold service in
  `backend/services/transactionHoldService.ts`, complete with live countdowns
  and manual release controls.

### 4.4 Sandbox
- Toggle between the legacy Safe callStatic form and the advanced sandbox panel
  in `modules/sandbox/ui/SandboxPanel.tsx`.
- Upload or paste ABIs, select contract functions, provide parameters, and run
  simulations via `POST /api/sandbox/contract/simulate`.
- Replay previous simulations pulled from `GET /api/sandbox/contract/history`
  and optionally run them against a local fork started with
  `POST /api/sandbox/fork/start` (defaults to the `anvil` command).
- Provide a `forkRpcUrl` to execute simulations against a remote Hardhat/Anvil
  fork when no managed local fork is available—the backend automatically falls
  back to standard RPC calls if neither option is configured.
- Use the Safe-focused tab to call `POST /api/sandbox/call-static` for quick
  guard checks.

### 4.5 Keyring
- Lists secrets registered through the Electron IPC bridge (`window.gnoman.invoke('keyring:list')`).
- Proxies every request to the backend AES keyring service (`/api/keyring/*`),
  which stores encrypted payloads under `.gnoman/keyrings/<service>.json`.
- Reveals a selected secret via `keyring:get`, which maps to `POST /api/keyring/get`.
  If the `keyring` module cannot load (for example, inside a sandbox), the backend
  switches to an in-memory store and logs a warning so you know the data is
  ephemeral.
- Encrypt, reveal, and delete secrets entirely inside the renderer. Each UI action
  forwards to `/api/keyring/*`, guaranteeing parity with the legacy CLI while
  capturing an auditable activity feed for operators.
- Switch between keyring services (for example `production`, `staging`, or
  `aes`) without leaving the UI. The currently active service is displayed in the
  global header and sidebar so you never lose track of your namespace.
- The backend still falls back to an in-memory store if the native `keyring`
  module is unavailable. The UI highlights this state and keeps secrets scoped to
  the session, while the CLI bridge remains for legacy automation only.

### 4.6 License & Settings
- The activation screen uses the preload bridge (`window.safevault`) to run the
  Python verifier (`backend/licenses/verify_license.py`) entirely offline.
- Successful validation writes `.safevault/license.env` with the raw token and a
  `VALIDATED_AT` timestamp. The preload re-verifies this token on every launch.
- Settings exposes the stored license metadata, the global transaction hold
  toggle/duration (persisted in the AES keyring via `SAFE_TX_HOLD_ENABLED`), and a
  vanity wallet generator surface with live job dashboards.
- Vanity jobs are executed in worker threads, persisted to `.gnoman/vanity-jobs.json`
  for auditability, and only expose mnemonic aliases so secrets stay in the
  secure store.
- For automation, the backend still accepts `POST /api/license`, which stores a
  JSON record in `.gnoman/license.json`. This endpoint exists for legacy flows
  that expect the previous storage format.

### 4.7 Wiki Guide
- Renders Markdown content from `docs/wiki/`, including the mirrored developer
  and licensing guides.

---

## 5. Offline licensing quick reference

| Task | Command |
