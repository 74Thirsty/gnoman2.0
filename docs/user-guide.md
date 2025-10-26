# SafeVault Desktop Application — Comprehensive User Guide

Welcome to SafeVault. This guide explains how to set up the local environment, run each part of the stack,
and understand the workflows exposed in the renderer, backend, and Electron shell.

---

## 1. Requirements & prerequisites

| Component | Requirement |
| --- | --- |
| Operating system | macOS, Windows, or Linux capable of running Electron 28+ |
| Node.js | v18 LTS or newer |
| npm | v9 or newer (bundled with Node.js) |
| Native build tools | Required the first time `better-sqlite3` or `keytar` compiles (Xcode Command Line Tools / build-essential / Windows Build Tools) |
| Optional fork utility | `anvil`, `hardhat node`, or another Hardhat-compatible command for sandbox forking |

> **Security tip:** Enable full-disk encryption on any workstation that stores the `.safevault/` directory.
> Registration data and transaction holds live there in encrypted SQLite databases.

---

## 2. Installation

Clone the repository and install dependencies for both the root workspace and the renderer package:

```bash
npm install
(cd renderer && npm install)
```

Running `npm install` at the project root also installs renderer dependencies via the `postinstall` hook,
but running the commands explicitly can surface errors earlier.

---

## 3. Running the application

### 3.1 Development mode

Start the backend and renderer in separate terminals:

```bash
npm run dev:backend    # Express API with ts-node-dev on http://localhost:4399
npm run dev:renderer   # Vite development server for the React UI on http://localhost:5173
```

Use `npm run dev` if you prefer to run both processes together via `concurrently`.

To interact with the keyring bridge or preload APIs, launch the Electron shell after the build completes:

```bash
npm run dev:electron   # Builds TypeScript bundles and boots the Electron window
```

### 3.2 Production build

```bash
npm run build          # Compile backend, main process, and renderer into dist/
npm start              # Launch the packaged Electron shell with bundled assets
```

### 3.3 Useful scripts

| Script | Description |
| --- | --- |
| `npm run lint` | Run ESLint across backend, renderer, main, and shared modules |
| `npm run start:backend` | Run the compiled backend from `dist/backend/index.js` |
| `npm run clean` | Remove build artifacts under `dist/` |

---

## 4. UI tour & primary workflows

The renderer surfaces the core workflows through a set of tabs defined in `renderer/src/App.tsx`.

### 4.1 Dashboard
- Shows the total number of locally managed wallets and metadata for the currently connected Safe.
- Pulls state from `WalletContext` and `SafeContext` to give operators a quick health check.

### 4.2 Wallets
- Generate a new wallet with optional alias, password override, and hidden flag. Requests are sent to
  `POST /api/wallets/generate` and secrets are encrypted with AES-256-GCM inside
  `backend/services/walletService.ts`.
- Refresh the wallet list to retrieve metadata (address, alias, created timestamp, source) from the backend.
- Import/export endpoints exist on the API and can be exercised with REST clients, but the current UI only
  exposes wallet generation and listing.

### 4.3 Safes
- Connect to a Safe by providing an address and RPC URL. The backend verifies the RPC connection before
  caching Safe metadata (`POST /api/safes/load`).
- Review owners, modules, and held transactions. The page calls `GET /api/safes/:address/owners` and
  `GET /api/safes/:address/transactions/held` to populate data.
- Held transactions reflect entries tracked by the SQLite-backed hold service in
  `backend/services/transactionHoldService.ts`.

### 4.4 Sandbox
- Toggle between the legacy Safe callStatic form and the advanced sandbox panel in
  `modules/sandbox/ui/SandboxPanel.tsx`.
- Upload or paste ABIs, select contract functions, provide parameters, and run simulations via
  `POST /api/sandbox/contract/simulate`.
- Replay previous simulations pulled from `GET /api/sandbox/contract/history` and optionally run them against
  a local fork started with `POST /api/sandbox/fork/start` (defaults to the `anvil` command).
- Use the Safe-focused tab to call `POST /api/sandbox/call-static` for quick guard checks.

### 4.5 Keyring
- Lists secrets registered through the Electron IPC bridge (`window.safevault.invoke('keyring:list')`).
- Reveals a selected secret via `keyring:get`. When `keytar` cannot load, SafeVault falls back to an
  in-memory store so the UI continues to function in development environments.

### 4.6 Settings
- Register the product license and email address. Submissions hit `POST /api/registration`, which stores
  scrypt-hardened hashes in `.safevault/registration.sqlite`.
- View the current registration status and open the in-app wiki for additional documentation.

### 4.7 Wiki Guide
- Renders Markdown content from `docs/wiki/` so teams can ship custom runbooks with the application.

---

## 5. Backend capabilities

The Express API is modularized under `backend/routes/` and `backend/services/`:

- **Wallets:** generation, mnemonic/private-key import, vanity search, and keystore export.
- **Safes:** owner/module management, transaction proposals, execution checks, and hold toggles.
- **Sandbox:** ABI management, contract & Safe simulations, historical replay, and local fork orchestration.
- **Registration:** license enforcement with scrypt hashing and conflict detection.

Refer to the README for a full endpoint matrix.

---

## 6. Data storage & persistence

- `.safevault/holds.sqlite` – transaction hold configuration and queue.
- `.safevault/registration.sqlite` – product registration status.
- `modules/sandbox/logs/` – JSON payloads of prior contract simulations for replay.
- Wallet secrets are held in-memory for the current session; exports re-encrypt private keys with the
  provided password so they can be stored safely outside the app.

---

## 7. Troubleshooting

- **Keyring errors in the browser preview:** Launch the Electron shell (`npm run dev:electron`) so the
  preload bridge can expose `window.safevault`. The browser-only renderer cannot access the keyring IPC.
- **`better-sqlite3` install failures:** Install the required native toolchain (Xcode Command Line Tools on
  macOS, `build-essential` and `python3` on Debian/Ubuntu, or Windows Build Tools) and reinstall
  dependencies.
- **Local fork fails to spawn:** Ensure the configured command (default `anvil`) is available on your
  `PATH`, or override it with the desired executable in the sandbox panel.

---

SafeVault evolves alongside the Gnosis Safe ecosystem. Keep this guide updated as new modules or workflows
are added so operators have an accurate reference.
