![Sheen Banner](https://raw.githubusercontent.com/74Thirsty/74Thirsty/main/assets/gnoman.svg)

Gnoman is a cross-platform Electron desktop application that combines a local Express API with a React
renderer to manage Gnosis Safe workflows from a single secured workspace. The project is written entirely
in TypeScript and ships with tooling for simulating Safe transactions, managing wallets, and enforcing
registration policies before operators can act on production Safes.

## Tech stack

- **Electron 28** for the desktop shell, preload isolation, and IPC keyring bridge (`main/`).
- **Express** with TypeScript for the local API that powers wallet, Safe, sandbox, and registration flows
  (`backend/`).
- **React + Tailwind (Vite)** for the renderer UI (`renderer/`).
- **Better SQLite3** for persisting registration state and transaction holds under a local `.safevault/`
  directory.
- **Ethers v6** for wallet creation, encryption, and contract simulation utilities.

## Repository layout

```
/ (root)
├── backend/              # Express API, services, and route handlers
├── main/                 # Electron entrypoint, preload, and OS keyring integration
├── modules/sandbox/      # Shared sandbox engine, ABI parser, local fork helper, and UI panel
├── renderer/             # React renderer bundled with Vite
├── scripts/              # Build utilities for packaging renderer output and launching Electron
├── docs/                 # Markdown documentation surfaced in the app and project wiki
├── tests/                # API smoke tests and fixtures
├── package.json          # Root npm scripts and dependencies
└── tsconfig*.json        # TypeScript project references for each process
```

## Prerequisites

| Requirement | Notes |
| ----------- | ----- |
| Node.js 18+ | Tested with the LTS release bundled with npm 9 |
| npm 9+      | Installed with Node.js |
| SQLite      | Provided by `better-sqlite3`; native build tools (Xcode Command Line Tools / build-essential / Windows Build Tools) may be required on first install |
| Local fork tool (optional) | `anvil` or another Hardhat-compatible command for sandbox forking |

## Installation

```bash
npm install
(cd renderer && npm install)
```

## Development workflow

The backend listens on `http://localhost:4399` by default. Run the services in separate terminals:

```bash
npm run dev:backend    # Start the Express API with ts-node-dev
npm run dev:renderer   # Launch the Vite dev server for the renderer UI
```

You can also run both web stacks together:

```bash
npm run dev            # concurrently runs dev:backend and dev:renderer
```

To open the Electron shell, build the TypeScript bundles and launch the desktop window:

```bash
npm run dev:electron   # Builds backend/main/renderer then boots Electron
```

### Production build

```bash
npm run build          # Compile backend, main process, and renderer
npm start              # Launch Electron with the bundled renderer
```

### Additional scripts

| Script | Description |
| ------ | ----------- |
| `npm run clean` | Remove the `dist/` directory |
| `npm run lint`  | Run ESLint across backend, main, renderer, and modules |
| `npm run build:backend` | Compile the Express API to `dist/backend` |
| `npm run build:main` | Compile the Electron main process to `dist/main` |
| `npm run build:renderer` | Build the renderer UI (`renderer/dist`) |

## Backend API summary

All endpoints are served from `http://localhost:4399/api`.

### Health
- `GET /health` – service heartbeat with current timestamp.

### Wallets (`backend/routes/walletRoutes.ts`)
- `GET /wallets` – list stored wallet metadata.
- `POST /wallets/generate` – create a new encrypted wallet.
- `POST /wallets/import/mnemonic` – import a wallet from a mnemonic phrase.
- `POST /wallets/import/private-key` – import a wallet from a raw private key.
- `POST /wallets/vanity` – brute-force vanity address generation with prefix/suffix filters.
- `POST /wallets/:address/export` – decrypt and export an encrypted JSON keystore for a stored wallet.

Wallet metadata and encrypted secrets live in-memory for now. Exports are re-encrypted with
`ethers.Wallet.encrypt` so that secrets never leave the API unprotected. The UI currently surfaces wallet
creation and listing from the `/wallets` page.

### Safes (`backend/routes/safeRoutes.ts`)
- `POST /safes/load` – connect to a Safe on a specified RPC URL.
- `GET /safes/:address/owners` – list cached Safe owners.
- `POST /safes/:address/owners` – add an owner and update the threshold.
- `DELETE /safes/:address/owners/:ownerAddress` – remove an owner and update the threshold.
- `POST /safes/:address/threshold` – change the approval threshold.
- `POST /safes/:address/modules` – enable a Safe module.
- `DELETE /safes/:address/modules/:moduleAddress` – disable a module.
- `POST /safes/:address/transactions` – register a transaction proposal and enforce hold policy tracking.
- `POST /safes/:address/transactions/:txHash/execute` – execute a stored transaction (respecting hold timers).
- `POST /safes/:address/hold/toggle` – enable or disable the hold policy for a Safe.
- `GET /safes/:address/transactions/held` – list transactions currently under the hold policy.

Transactions and Safe metadata are kept in-memory while hold-state metadata is persisted to SQLite under
`.safevault/holds.sqlite`.

### Sandbox (`backend/routes/sandboxRoutes.ts`)
- `POST /sandbox/call-static` – legacy helper for single `callStatic` simulations using ad-hoc ABI JSON.
- `POST /sandbox/contract/abi` – parse and cache contract ABI definitions.
- `GET /sandbox/contract/abis` – list cached ABIs.
- `POST /sandbox/contract/simulate` – run contract simulations with decoded return data, gas estimates, and traces.
- `POST /sandbox/contract/safe` – execute Safe-specific simulations with the canonical Safe ABI.
- `GET /sandbox/contract/history` – retrieve the most recent simulation results for replay.
- `DELETE /sandbox/contract/history` – clear the persisted simulation history.
- `POST /sandbox/fork/start` – spawn a local fork (defaults to `anvil`) for simulations.
- `POST /sandbox/fork/stop` – stop the active fork.
- `GET /sandbox/fork/status` – inspect fork process status.

The sandbox writes JSON logs to `modules/sandbox/logs/` and coordinates optional local fork lifecycles.

### Product registration (`backend/routes/registrationRoutes.ts`)
- `GET /registration` – fetch current registration status.
- `POST /registration` – store a hashed product license and registration email using scrypt hardening.

Registration data persists in `.safevault/registration.sqlite` and must match the previously registered
license to update the email address.

## Desktop application features

- **Dashboard** – high-level overview of stored wallets and the currently connected Safe.
- **Wallets** – generate encrypted wallets with optional aliases, hidden flag, and password overrides, then
  list stored metadata.
- **Safes** – connect to a Safe, review owners/modules, and monitor transactions held under the enforced
  delay window.
- **Sandbox** – switch between the legacy Safe callStatic form and the advanced sandbox panel powered by
  `modules/sandbox/ui`. Upload or paste ABIs, choose functions, provide parameters, replay historical
  simulations, and manage an optional local fork.
- **Keyring** – interact with the Electron IPC bridge (`window.safevault`) to list and reveal secrets stored
  in the OS keyring (with an in-memory fallback when `keytar` is unavailable).
- **Settings** – register the product license, view current registration status, and jump to the in-app wiki.
- **Wiki Guide** – render Markdown documentation from `docs/wiki` directly inside the renderer.

## Data directories & security

- Registration and transaction-hold records are stored under `.safevault/` in the project working directory.
- Sandbox logs persist to `modules/sandbox/logs/` for replay and auditing purposes.
- Wallet private keys stay encrypted in-memory using AES-256-GCM with PBKDF2 key derivation. Exported
  keystores require the caller-supplied password.
- The Electron preload exposes a minimal `window.safevault.invoke` surface to keep privileged operations
  isolated from the renderer context.

## Documentation

Additional guides live under `docs/`. Start with `docs/user-guide.md` for a comprehensive walkthrough and
`docs/wiki/` for content surfaced in the in-app knowledge base.
