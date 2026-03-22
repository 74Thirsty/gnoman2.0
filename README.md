![Sheen Banner](https://github.com/74Thirsty/74Thirsty/blob/main/assets/gnoman.svg)

GNOMAN 2.0 is a pure Electron desktop application for managing Gnosis Safe workflows. All backend logic runs directly in the Electron main process via IPC — no HTTP server, no ports, no network dependency for local operations. Written entirely in TypeScript.

## How to run

### Development

```bash
npm install
npm run dev:electron
```

This builds the main process + renderer and launches the Electron window. Everything runs in a single process — no separate backend to start.

### Production build

```bash
npm run build
npm run start
```

### First-time setup

```bash
# Install root dependencies (also installs renderer deps via postinstall)
npm install

# Rebuild native modules for your Electron version
npm rebuild better-sqlite3
npm rebuild keytar
```

## Tech stack

- **Electron 28** — desktop shell, preload isolation, IPC bridge (`main/`)
- **React + Tailwind (Vite)** — renderer UI (`renderer/`)
- **Better SQLite3** — transaction holds and vanity job history (`.gnoman/`)
- **Ethers v6** — wallet creation, encryption, contract simulation
- **Gnosis Safe SDK** — Safe management, owner/threshold/module/delegate operations

## Architecture

All renderer ↔ backend communication goes through Electron IPC:

```
renderer  →  window.gnoman.invoke(channel, payload)
          →  contextBridge (preload)
          →  ipcMain.handle(channel, handler)
          →  backend services (walletService, safeService, etc.)
```

No Express server. No localhost HTTP. No ports.

## Repository layout

```
/ (root)
├── backend/services/     # All service logic (wallet, safe, sandbox, keyring, etc.)
├── main/                 # Electron entrypoint + IPC handlers + preload
├── modules/sandbox/      # Sandbox engine, ABI parser, fork helper, UI panel
├── renderer/             # React renderer (Vite)
├── scripts/              # Build + launch utilities
├── docs/                 # Markdown docs surfaced in-app and wiki
├── package.json
└── tsconfig*.json        # TypeScript project references per process
```

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev:electron` | Build everything and launch Electron (use this for dev) |
| `npm run build` | Full production build (main + renderer) |
| `npm run start` | Build then launch Electron |
| `npm run build:main` | TypeScript compile of main process only |
| `npm run build:renderer` | Vite build of renderer only |
| `npm test` | Run Jest tests |
| `npm run lint` | ESLint |

## Features

- **Dashboard** — overview of stored wallets and connected Safe
- **Wallets** — generate, import (mnemonic/private key), send, export, remove encrypted wallets
- **Safes** — connect to a Safe, manage owners/threshold/modules/delegates/fallback/guard, propose and execute transactions, configure hold policies
- **Sandbox** — Safe callStatic simulation + advanced contract sandbox (upload ABI, pick function, set params, replay history, manage local fork via anvil/hardhat)
- **Developer Tools** — contract discovery, gas estimation, source code scanner, calldata decoder
- **Keyring** — manage named secrets stored in the system keyring
- **Settings** — license activation, global hold defaults, vanity wallet generator, Robinhood crypto integration
- **History** — audit log of all operations

## Data & security

- Wallet private keys encrypted with AES-256-GCM + PBKDF2 — never stored in plaintext
- Transaction holds and vanity jobs: `.gnoman/holds.sqlite`, `.gnoman/vanity-jobs.json`
- License tokens: `.safevault/license.env`
- Sandbox logs: `modules/sandbox/logs/`
- Preload exposes only `window.gnoman.invoke` — renderer has no Node.js access

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ETHERSCAN_API_KEY` | Enables source code fetching and ABI resolution |
| `ETHERSCAN_ENABLED` | Set to `false` to disable Etherscan even if key is present |

## Offline license workflow

| Purpose | Command |
| --- | --- |
| Generate keypair (one-time) | `python backend/licenses/make_keys.py` |
| Generate license token | `python backend/licenses/gen_license.py --id "Customer"` |
| Apply license | Enter token in Settings → License |
