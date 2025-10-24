# SafeVault Desktop Application

SafeVault is a cross-platform Electron application designed to manage Gnosis Safe deployments,
wallets, and transaction simulations from a single secure interface. The project combines an
Electron shell with a React/Tailwind renderer and a local Express backend to coordinate security
sensitive workflows.

## Repository Structure

```
/ (root)
├── main/            # Electron main process and preload bridge
├── backend/         # Express API, wallet + Safe orchestration, SQLite hold store
├── renderer/        # React/Tailwind/shadcn UI powered by Vite
├── package.json     # Root dependency manifest and scripts
└── tsconfig*.json   # TypeScript configuration for backend and main process
```

### Key Features

- Wallet management: generate/import/export wallets with AES-GCM encrypted secrets.
- OS keyring integration via Electron IPC and `keytar` (with an in-memory fallback for dev).
- Secure product registration flow with scrypt-hardened license storage.
- Gnosis Safe scaffolding for owners, threshold, modules, and transaction proposals.
- 24-hour transaction hold enforcement backed by SQLite.
- Transaction sandbox for `callStatic` contract simulations and forked execution stubs.
- Modern React UI with contexts for wallet and Safe state.

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   (cd renderer && npm install)
   ```

2. **Run the development stack**

   ```bash
   npm run dev:backend   # starts Express API with TypeScript watcher
   npm run dev:renderer  # launches Vite dev server at http://localhost:5173
   npm run dev:electron  # builds Electron main process and opens the desktop shell
   ```

   Combine these as needed; the backend coordinates wallet and Safe actions for the renderer via
   HTTP, while Electron exposes secure keyring IPC endpoints.

3. **Build for production**

   ```bash
   npm run build
   npm start
   ```

## Backend API Overview

The Express server exposes modular routes:

- `GET /api/health` – service heartbeat.
- `/api/wallets/*` – wallet creation, import, vanity address search, and export.
- `/api/safes/*` – Safe lifecycle actions, hold toggle, owner/threshold management.
- `/api/sandbox/*` – Transaction simulation endpoints.

Transaction hold metadata persists in `.safevault/holds.sqlite` using `better-sqlite3`.

## Renderer Highlights

- Navigation across **Dashboard**, **Wallets**, **Safes**, **Sandbox**, **Keyring**, and **Settings**
  tabs.
- Wallet context hydrates from the backend and offers quick generation with encryption options.
- Safe dashboard surfaces owners, modules, and pending held transactions.
- Sandbox page runs `callStatic` simulations without leaving the desktop client.
- Keyring view invokes Electron IPC to list and reveal stored aliases.

## Security Considerations

- Secrets are encrypted with AES-256-GCM before persistence.
- Hidden wallets prefer OS keyring storage via `keytar`.
- Electron preload exposes a minimal `window.safevault.invoke` surface with context isolation.
- Database and log files live under `.safevault/` to keep sensitive material scoped locally.
- Product registration details are stored locally with scrypt-derived hashing and can be audited via
  the Settings page.

## Documentation Wiki

- Explore the in-app wiki under **Wiki Guide** to review onboarding and security checklists.
- Markdown sources live in `docs/wiki/` for easy customization and operational runbooks.

## Roadmap

- Integrate official Gnosis Safe Core SDK for on-chain execution.
- Expand sandbox support for scripted multi-owner signing workflows.
- Add UI for managing transaction holds and module toggles directly from the renderer.
- Package installers via `electron-builder` with CI automation.
