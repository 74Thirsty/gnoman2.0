# GNOMAN 2.0 Desktop Application — Comprehensive User Guide

Welcome to GNOMAN 2.0. This guide explains how to prepare your workstation,
launch each part of the stack, and navigate the renderer workflows that ship
with the desktop build.

---

## 1. Requirements & prerequisites

| Component | Requirement |
| --- | --- |
| Operating system | macOS, Windows, or Linux capable of running Electron 28+ |
| Node.js | v18 LTS or newer |
| npm | v9 or newer (bundled with Node.js) |
| Python | 3.10+ with the `cryptography` package for offline license tooling |
| Native build tools | Required the first time `better-sqlite3` compiles (Xcode Command Line Tools / build-essential / Windows Build Tools). The AES keyring has no native dependencies. |
| Optional fork utility | `anvil`, `hardhat node`, or another Hardhat-compatible command for sandbox forking |

> **Security tip:** Enable full-disk encryption on any workstation that stores
the `.gnoman/` or `.safevault/` directories. License metadata, transaction holds,
and cached secrets live there in JSON, env, or SQLite files.

---

## 2. Installation

Clone the repository and install dependencies for both the root workspace and
the renderer package:

```bash
npm install
(cd renderer && npm install)
```

Running `npm install` at the project root also installs renderer dependencies
via the `postinstall` hook, but executing both commands explicitly surfaces
errors earlier.

---

## 3. Running the application

### 3.1 Development mode

Start the backend and renderer in separate terminals:

```bash
npm run dev:backend    # Express API with ts-node-dev on http://localhost:4399
npm run dev:renderer   # Vite development server for the React UI on http://localhost:5173
```

Use `npm run dev` if you prefer to run both processes together via
`concurrently`.

To interact with the preload APIs and keyring bridge, launch the Electron shell
once the TypeScript projects finish compiling:

```bash
npm run dev:electron   # Builds backend/main/renderer bundles and opens the desktop window
```

### 3.2 Production build

```bash
npm run build          # Compile backend, main process, and renderer into dist/
npm start              # Launch the packaged Electron shell with bundled assets
```

The packaged Electron shell automatically boots the compiled Express API,
waits for the `/api/health` probe to succeed, and only then opens the window so
renderer fetches and offline license validation work without manual steps.

### 3.3 Useful scripts

| Script | Description |
| --- | --- |
| `npm run lint` | Run ESLint across backend, renderer, main, and shared modules |
| `npm run start:backend` | Run the compiled backend from `dist/backend/index.js` |
| `npm run copy:backend` | Copy backend runtime assets such as `license_public.pem` into `dist/backend` |
| `npm run clean` | Remove build artifacts under `dist/` |

---

## 4. UI tour & primary workflows

The renderer surfaces the core workflows through a set of tabs defined in
`renderer/src/App.tsx`.

### 4.1 Dashboard
- Shows the total number of locally managed wallets and metadata for the
  currently connected Safe.
- Pulls state from `WalletContext` and `SafeContext` to give operators a quick
  health check.

### 4.2 Wallets
- Generate a new wallet with optional alias, password override, and hidden flag.
  Requests are sent to `POST /api/wallets/generate` and secrets are encrypted
  with AES-256-GCM inside `backend/services/walletService.ts`.
- Refresh the wallet list to retrieve metadata (address, alias, created
  timestamp, source) from the backend.
- Import/export endpoints exist on the API and can be exercised with REST
  clients, but the current UI only exposes wallet generation and listing.

### 4.3 Safes
- Connect to a Safe by providing an address and RPC URL. The backend verifies the
  RPC connection before caching Safe metadata (`POST /api/safes/load`).
- Review owners, modules, hold summaries, and held transactions. The page calls
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
| --- | --- |
| Generate keypair | `python backend/licenses/make_keys.py` |
| Issue license | `python backend/licenses/gen_license.py --id <ID> --product GNOMAN --version 2.0.0 --days 365` |
| Validate token | `python -c "import sys; from backend.licenses.verify_license import verify_token; print(verify_token(sys.argv[1], sys.argv[2], 'GNOMAN', '2.0.0'))" backend/licenses/license_public.pem <token>` |
| Stored artifacts | `.safevault/license.env` (desktop preload) and `.gnoman/license.json` (backend endpoint) |

Consult `docs/license-dev-guide.md` for the full walkthrough, including
troubleshooting tips and security recommendations.
