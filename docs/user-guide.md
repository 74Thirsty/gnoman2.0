# SafeVault Desktop Application — Comprehensive User Guide

Welcome to SafeVault, a desktop solution for orchestrating Gnosis Safe operations, wallet
management, and transaction simulations from a single secure interface. This guide explains how to
set up the stack, launch the app, understand its architecture, and interact with every function that
the project exposes.

---

## 1. System Requirements & Prerequisites

| Component | Requirement |
| --- | --- |
| Operating System | macOS, Windows, or Linux capable of running Electron 28+ |
| Node.js | v18 LTS or newer |
| npm | v9 or newer (bundled with Node.js) |
| SQLite | Bundled through `better-sqlite3`; native build tools may be required on first install |
| Network | HTTPS access to your Ethereum RPC providers |

> **Security note:** Enable full disk encryption on your workstation to protect the `.safevault/`
> data directory that contains encrypted secrets and transaction-hold metadata.

---

## 2. Repository Layout & Runtime Responsibilities

```
/
├── backend/          Express API for wallets, Safes, simulations, and product registration
├── main/             Electron shell, preload bridge, and OS keyring integration
├── renderer/         React + Tailwind user interface rendered by Vite
├── docs/wiki/        Markdown content surfaced by the in-app Wiki Guide
├── package.json      Root dependency manifest and npm scripts
└── tsconfig*.json    Shared TypeScript configuration
```

Each directory exposes callable functions that coordinate SafeVault workflows:

- **backend/**: Express route handlers fan out into services that implement wallet encryption,
  Safe management, sandbox simulations, transaction hold enforcement, and product registration
  persistence.
- **main/**: Bootstraps the Electron window, registers IPC handlers, and proxies keyring operations
  through `keytar` with an in-memory fallback.
- **renderer/**: React pages and contexts that consume backend APIs via HTTP and Electron IPC.

---

## 3. Installation & Environment Setup

1. **Install dependencies**
   ```bash
   npm install
   (cd renderer && npm install)
   ```

2. **Optional native prerequisites**
   - On macOS: `xcode-select --install`
   - On Linux: `sudo apt-get install build-essential python3`
   - On Windows: Install "Windows Build Tools" via `npm install --global windows-build-tools`

3. **Environment variables**
   - `PORT` (optional): Override the backend Express port (defaults to `4399`).
   - `NODE_ENV`: Set to `development` for hot reload (default) or `production` for packaged builds.

4. **RPC credentials**
   - Provision HTTPS RPC endpoints (Infura, Alchemy, Ankr, local node). Supply them when connecting
     a Safe or running sandbox simulations.

---

## 4. Running the Application

### 4.1 Development Mode

Run each process in a dedicated terminal:

```bash
npm run dev:backend    # Express API with ts-node + nodemon
npm run dev:renderer   # Vite dev server for the React renderer
npm run dev:electron   # Electron shell that loads the renderer and enables IPC
```

The renderer expects the backend on `http://localhost:4399`. Adjust the fetch URLs if you change the
backend port.

### 4.2 Production Build

```bash
npm run build          # Builds backend, main, and renderer bundles
npm start              # Launches the packaged Electron application
```

Build artifacts place the renderer output under `dist/renderer` and compile the Electron main
process to `dist/main` (mirroring the TypeScript entry points).

---

## 5. Application Architecture & Function Reference

This section documents every exported function or handler so you can understand the end-to-end
behavior of SafeVault. Functions are grouped by layer to match the repository layout.

### 5.1 Backend (Express API)

#### 5.1.1 Server bootstrap (`backend/index.ts`)
- `app.get('/api/health')`: Returns `{ status: 'ok', timestamp }` to verify liveness.
- `app.use('/api/wallets', walletRouter)`: Mounts wallet management routes.
- `app.use('/api/safes', safeRouter)`: Mounts Safe lifecycle and transaction routes.
- `app.use('/api/sandbox', sandboxRouter)`: Mounts simulation endpoints.
- `app.use('/api/registration', registrationRouter)`: Mounts product registration routes.
- Global error handler logs unhandled errors and responds with HTTP 500.

#### 5.1.2 Wallet service & routes

Routes (`backend/routes/walletRoutes.ts`):
- `GET /api/wallets/` → `walletController.listWallets`
- `POST /api/wallets/generate` → `walletController.generateWallet`
- `POST /api/wallets/import/mnemonic` → `walletController.importMnemonic`
- `POST /api/wallets/import/private-key` → `walletController.importPrivateKey`
- `POST /api/wallets/vanity` → `walletController.generateVanity`
- `POST /api/wallets/:address/export` → `walletController.exportWalletHandler`

Controller functions (`backend/controllers/walletController.ts`) map directly to service operations
and provide JSON responses.

Service (`backend/services/walletService.ts`):
- `createRandomWallet({ alias, password, hidden })`: Generates a new wallet and stores its encrypted
  private key. Secrets use PBKDF2 key derivation (100k iterations) and AES-256-GCM for encryption.
- `importWalletFromMnemonic({ mnemonic, derivationPath, alias, password, hidden })`: Restores a
  wallet from a BIP-39 mnemonic and optional derivation path.
- `importWalletFromPrivateKey({ privateKey, alias, password, hidden })`: Imports an EOA by private
  key string.
- `generateVanityAddress({ prefix, suffix, alias, password, hidden, maxAttempts })`: Repeatedly
  generates random wallets until the prefix/suffix filter matches (default 500k attempts).
- `listWalletMetadata()`: Returns stored wallet metadata (address, alias, hidden flag, source).
- `exportWallet(address, password)`: Decrypts the stored private key (verifying the password) and
  re-encrypts it using `ethers.Wallet.encrypt` for safe export.

Supporting helpers:
- `encryptSecret(secret, password)` / `decryptSecret(record, password)`: Wrap AES-256-GCM with
  randomly generated IVs and salts.
- `deriveKey(password, salt)`: Uses PBKDF2 (`sha512`, 32-byte key).
- `storeWallet(wallet, options)`: Persists the encrypted secret in memory and returns metadata.

> **Usage tip:** Passwords are optional; SafeVault generates a strong UUID when no password is
> provided, but you should record the password to decrypt the wallet later.

#### 5.1.3 Safe service & routes

Routes (`backend/routes/safeRoutes.ts`):
- `POST /api/safes/load` → `safeController.loadSafe`
- `GET /api/safes/:address/owners` → `safeController.listOwners`
- `POST /api/safes/:address/owners` → `safeController.addOwner`
- `DELETE /api/safes/:address/owners/:ownerAddress` → `safeController.removeOwner`
- `POST /api/safes/:address/threshold` → `safeController.changeThreshold`
- `POST /api/safes/:address/modules` → `safeController.enableModule`
- `DELETE /api/safes/:address/modules/:moduleAddress` → `safeController.disableModule`
- `POST /api/safes/:address/transactions` → `safeController.proposeTransaction`
- `POST /api/safes/:address/transactions/:txHash/execute` → `safeController.executeTransaction`
- `POST /api/safes/:address/hold/toggle` → `safeController.toggleHold`
- `GET /api/safes/:address/transactions/held` → `safeController.listHeldTransactions`

Service (`backend/services/safeService.ts`):
- `connectToSafe(address, rpcUrl)`: Validates the RPC endpoint, initializes in-memory Safe state, and
  returns the current owners/modules/threshold snapshot.
- `getOwners(address)`: Lists owners for a loaded Safe.
- `addOwner(address, owner, threshold)`: Adds an owner and updates the execution threshold.
- `removeOwner(address, owner, threshold)`: Removes an owner and adjusts the threshold.
- `changeThreshold(address, threshold)`: Updates the minimum signature count.
- `enableModule(address, moduleAddress)`: Adds a module to the Safe’s enabled list.
- `disableModule(address, moduleAddress)`: Removes a module from the enabled list.
- `proposeTransaction(address, tx, meta)`: Hashes a proposed transaction payload, stores it, and
  requests a transaction hold (via `holdService`).
- `executeTransaction(address, txHash, password?)`: Marks a stored transaction as executed after
  verifying hold requirements. (Password is reserved for future signing logic.)

Transaction hold service (`backend/services/transactionHoldService.ts`):
- Persists hold policies in SQLite (`.safevault/holds.sqlite`).
- `setHoldState(safeAddress, enabled, holdHours)`: Turns holds on/off per Safe and defines the hold
  duration.
- `getHoldState(safeAddress)`: Reads the Safe’s policy.
- `createHold(txHash, safeAddress)`: When holds are enabled, records a hold window per transaction.
- `getHold(txHash)`, `listHolds(safeAddress)`: Inspect outstanding holds.
- `canExecute(hold)`: Checks whether the hold window has expired.
- `markExecuted(txHash)`: Marks a transaction as executed to prevent replays.

#### 5.1.4 Sandbox service & routes

Routes (`backend/routes/sandboxRoutes.ts`):
- `POST /api/sandbox/call-static` → `sandboxController.callStaticSimulation`
- `POST /api/sandbox/fork` → `sandboxController.runForkSimulation`

Service (`backend/services/sandboxService.ts`):
- `simulateCallStatic({ rpcUrl, contractAddress, abi, method, args, value })`: Uses an
  `ethers.Contract` instance to perform a `staticCall`. Returns `{ success, result }` or `{ success:
  false, error }`.
- `simulateForkTransaction({ rpcUrl, targetAddress, data, value })`: Broadcasts a transaction using a
  temporary wallet connected to the RPC endpoint and returns the receipt hash/status. Failures are
  surfaced with an error message.

#### 5.1.5 Product registration service & routes

Routes (`backend/routes/registrationRoutes.ts`):
- `GET /api/registration` → returns `RegistrationStatus` (`{ registered, email?, registeredAt? }`).
- `POST /api/registration` → validates email/license, hashes the license, and persists the record.

Service (`backend/services/productRegistrationService.ts`):
- `getStatus()`: Reads the singleton registration row from `.safevault/registration.sqlite`.
- `register(email, licenseKey)`: Normalizes inputs, enforces uniqueness, hashes the license using
  `crypto.scryptSync`, and stores or updates the record.
- Internally uses `initialize()` to ensure required tables exist.

---

### 5.2 Electron Main Process (`main/`)

#### 5.2.1 `main/main.ts`
- Sets platform-specific environment quirks (removes unsupported GTK modules on Linux).
- `createWindow()`: Creates the Electron BrowserWindow with preload script, sandboxing, and context
  isolation. Loads the Vite dev server in development or packaged HTML in production.
- Registers lifecycle events (`app.on('window-all-closed')`, `app.on('activate')`) to match native
  expectations.
- Invokes `registerIpcHandlers(ipcMain)` before creating the window.

#### 5.2.2 `main/preload.ts`
- Exposes a minimal `window.safevault.invoke(channel, payload?)` bridge that proxies `ipcRenderer`
  invocations while keeping Node.js APIs isolated from the renderer.

#### 5.2.3 IPC & keyring (`main/ipcHandlers/index.ts`, `main/keyring/KeyringManager.ts`)
- `registerIpcHandlers(ipcMain)` wires IPC channels:
  - `'keyring:list'`: Returns aliases stored in the OS keyring (or the in-memory fallback).
  - `'keyring:add'`: Stores an alias/secret pair.
  - `'keyring:get'`: Retrieves a secret for the provided alias.
  - `'keyring:delete'`: Removes an alias.
- `KeyringManager` methods:
  - `addEntry(alias, secret)` / `getEntry(alias)` / `deleteEntry(alias)` / `listEntries()` coordinate
    with `keytar` when available, otherwise maintain `memoryStore` for development.
  - `generateEphemeralSecret(length)`: Creates random hex strings (useful for temporary passwords).

---

### 5.3 Renderer (React UI)

#### 5.3.1 Entry point
- `renderer/src/main.tsx`: Mounts `<App />` with React Router and Tailwind styles.
- `<App />` (`renderer/src/App.tsx`): Provides navigation across **Dashboard**, **Wallets**, **Safes**,
  **Sandbox**, **Keyring**, **Settings**, and **Wiki Guide** pages while wrapping children with the
  `WalletProvider` and `SafeProvider` contexts.

#### 5.3.2 Contexts
- `WalletProvider` (`renderer/src/context/WalletContext.tsx`): Fetches `/api/wallets` on mount and
  exposes `{ wallets, refresh }`.
- `SafeProvider` (`renderer/src/context/SafeContext.tsx`): Stores the currently connected Safe and a
  setter used by multiple pages.

#### 5.3.3 Pages & key functions
- **Dashboard**: Summarizes wallet count and the active Safe snapshot.
- **Wallets** (`renderer/src/pages/Wallets.tsx`):
  - Handles wallet generation form submission by calling `POST /api/wallets/generate`.
  - Provides a manual refresh button to re-fetch wallet metadata.
- **Safes** (`renderer/src/pages/Safes.tsx`):
  - `handleConnect()`: Calls `POST /api/safes/load` with Safe address + RPC URL; stores the returned
    `SafeState`.
  - `refreshSafe()`: Fetches owners and held transactions, synchronizing the context state.
  - Renders owner and module lists along with currently held transactions (from the hold service).
- **Sandbox** (`renderer/src/pages/Sandbox.tsx`):
  - `handleCallStatic()`: Submits contract simulation parameters to `/api/sandbox/call-static` and
    renders the result.
- **Keyring** (`renderer/src/pages/Keyring.tsx`):
  - `loadEntries()`: Uses `window.safevault.invoke('keyring:list')` to list keyring aliases.
  - `handleReveal(alias)`: Invokes `'keyring:get'` to reveal secrets for display.
- **Settings** (`renderer/src/pages/Settings.tsx`):
  - Loads registration status from `/api/registration`.
  - Handles form submission to register or update licensing information.
- **Wiki Guide** (`renderer/src/pages/WikiGuide.tsx`): Static content that describes best practices
  and references documentation living in `docs/wiki/`.

---

## 6. Using SafeVault — End-to-End Workflows

### 6.1 Wallet Lifecycle
1. Navigate to **Wallets** and generate a wallet, optionally setting an alias or password.
2. Use the backend API directly (`POST /api/wallets/import/*`) if you prefer CLI-driven imports.
3. Export the wallet with `POST /api/wallets/:address/export` to obtain an encrypted JSON keystore.
4. Hidden wallets are stored via the OS keyring when the environment supports `keytar`.

### 6.2 Safe Operations
1. Connect to a Safe on the **Safes** page by providing the Safe address and RPC URL.
2. After loading, manage owners (`/owners` routes) and adjust thresholds (`/threshold`).
3. Enable or disable Safe modules with the `/modules` endpoints.
4. Propose transactions (`/transactions`) — SafeVault will assign a hold if policy is enabled.
5. Toggle holds with `/hold/toggle` and review outstanding holds via `/transactions/held`.
6. Execute transactions (`/transactions/:hash/execute`) after the hold period has elapsed.

### 6.3 Sandbox Simulations
1. Provide RPC URL, contract address, ABI JSON, method name, and arguments on the **Sandbox** page.
2. Submit the form to execute `simulateCallStatic`; review the JSON payload for return data or errors.
3. Optionally call the fork endpoint (`/api/sandbox/fork`) from an HTTP client to broadcast a forked
   transaction using a temporary signer.

### 6.4 Product Registration & Keyring
1. Visit **Settings → Product Registration** to store the license and registration email.
2. Licenses are hashed with `scrypt` and stored locally; re-submitting with a new email updates the
   record if the license key matches the existing hash.
3. Manage OS keyring entries via the **Keyring** page and the IPC bridge; use the `KeyringManager`
   directly from the main process if you need scripts to rotate secrets.

---

## 7. Storage Layout & Security Considerations

- `.safevault/holds.sqlite`: Transaction hold metadata managed by `TransactionHoldService`.
- `.safevault/registration.sqlite`: Product registration details managed by
  `ProductRegistrationService`.
- Encrypted wallet secrets are held in memory for this sample implementation; integrate persistent
  stores carefully if you extend the project.
- Electron preload isolates Node.js APIs; only the `safevault.invoke` surface is exposed to the
  renderer.
- Always validate RPC providers before connecting; SafeVault will call `provider.getNetwork()` during
  `connectToSafe` to ensure connectivity.

---

## 8. Extending SafeVault

- Replace the in-memory wallet store with a secure database or HSM-backed service.
- Integrate the official Gnosis Safe Core SDK inside `safeService.ts` for on-chain execution.
- Expand `Sandbox` to surface `simulateForkTransaction` in the UI and present execution receipts.
- Add background jobs that poll holds, send notifications, or rotate keyring secrets.

---

## 9. Troubleshooting Checklist

| Symptom | Resolution |
| --- | --- |
| Backend fails to start (`MODULE_NOT_FOUND`) | Run `npm install` at the repo root and inside `renderer/`. |
| Wallet calls fail with 500 errors | Ensure the backend console is open to inspect thrown errors from the wallet service. |
| Safe connect fails | Verify the Safe address is checksummed and the RPC endpoint is reachable; inspect backend logs. |
| Keyring errors in browser build | Launch the Electron shell so the preload bridge exposes `window.safevault`. |
| SQLite permission errors | Confirm the current user can create files under the working directory (`.safevault/`). |

---

## 10. Additional Resources

- **Renderer wiki content**: Edit markdown files under `docs/wiki/` to surface new onboarding
  material in the **Wiki Guide** page.
- **Scripts**: Explore `package.json` for linting, testing, and build automation.
- **Issue tracking**: Document known issues or enhancements under `docs/wiki/roadmap.md` (create as
  needed).

SafeVault is designed to streamline Safe administration while keeping sensitive data local. Use this
guide as a reference when onboarding operators, auditing deployments, or extending the platform.
