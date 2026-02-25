# GNOMAN 2.0 Development Guide

This guide documents the authoritative workflow for standing up a GNOMAN 2.0
workstation, exercising the offline licensing stack, and producing builds that
match what ships to customers. Every path is written relative to the repository
root (the directory that contains `package.json`).

> ℹ️ A byte-for-byte copy of this guide lives at
> `docs/wiki/development-guide.md` for the in-app wiki. Whenever you update this
> file, mirror the edits in the wiki directory so desktop users and GitHub
> readers see the same information.

## 1. Tooling prerequisites

| Tool | Required version | Notes |
| ---- | ---------------- | ----- |
| Node.js | 18 LTS | Bundles npm 9, which is required by the build scripts. |
| npm | 9.x | Installed with Node.js. |
| Python | 3.10 or newer | Powers the Ed25519 licensing utilities. |
| pip package | `cryptography` | Install with `pip install cryptography`. |
| Native build chain | OS specific | Xcode Command Line Tools on macOS, `build-essential` on Linux, or Windows Build Tools to compile `better-sqlite3`. The AES keyring runs entirely in user space (no native bindings). |

Clone the repository and install dependencies:

```bash
npm install
(cd renderer && npm install)
```

The root install triggers the renderer install via the `postinstall` hook, but
running both commands explicitly surfaces dependency errors sooner.

## 2. Environment configuration

1. Copy the template to create a working `.env`:
   ```bash
   cp .env.example .env
   ```
2. Adjust variables as needed:
   - `PORT` controls the Express API port (defaults to `4399`).
   - `VITE_DEV_SERVER_URL` points the Electron shell at the renderer dev server
     during development.
   - `LICENSE_PRIVATE_KEY` points to the Ed25519 signing key used by
     `backend/licenses/gen_license.py`. The default
     `backend/licenses/license_private.pem` is resolved relative to the
     repository root. Keep the actual private key outside of source control.

### 2.1 AES keyring management

The backend, main process, and renderer now rely on a unified keyring manager
that can hot-swap between the system keychain, an AES-GCM encrypted file store,
or an in-memory fallback. Use the REST endpoints to administer secrets without
restarting the app:

```bash
# List masked secrets for the active backend
curl http://127.0.0.1:${PORT:-4399}/api/keyring | jq

# Store a secret
curl -X POST http://127.0.0.1:${PORT:-4399}/api/keyring/RPC_URL \
  -H 'Content-Type: application/json' \
  -d '{"value":"https://sepolia.infura.io/v3/..."}'

# Reveal a secret (returns the decrypted payload)
curl http://127.0.0.1:${PORT:-4399}/api/keyring/RPC_URL | jq

# Remove a secret
curl -X DELETE http://127.0.0.1:${PORT:-4399}/api/keyring/RPC_URL

# Inspect the active backend and available backends
curl http://127.0.0.1:${PORT:-4399}/api/keyring/backend | jq

# Switch to another backend and reload configuration in place
curl -X POST http://127.0.0.1:${PORT:-4399}/api/keyring/backend/file
```

When the system keychain is unavailable (for example, inside a sandboxed CI
runner), the manager automatically falls back to the encrypted file store and,
if needed, to the in-memory backend while logging warnings so you know secrets
may not persist between restarts.

## 3. Running the stack locally

Use separate terminals so logs stay readable.

```bash
npm run dev:backend    # Express API at http://localhost:4399
npm run dev:renderer   # Vite dev server at http://localhost:5173
```

If you prefer to start both web stacks together, run `npm run dev`, which wraps
the two commands above with `concurrently`.

Launch the Electron shell after the TypeScript projects finish compiling:

```bash
npm run dev:electron   # Builds backend/main/renderer and opens the desktop window
```

The Electron shell loads the renderer URL in development and the packaged
`dist/renderer/index.html` file after a production build.

## 4. Offline licensing workflows

GNOMAN 2.0 keeps the private key offline and validates tokens locally. The
preload bridge (`main/preload/licenseBridge.ts`) invokes the existing Python
verifier and persists successful validations under `.safevault/license.env`.

### 4.1 Generate an Ed25519 keypair (one-time)

```bash
python backend/licenses/make_keys.py
```

The command writes two files:

- `backend/licenses/license_private.pem` – keep this file offline and untracked.
- `backend/licenses/license_public.pem` – commit this file; it ships with the
  application and is used by the verifier.

### 4.2 Issue a license token

Run the issuer from the repository root so relative paths resolve correctly:

```bash
python backend/licenses/gen_license.py \
  --priv backend/licenses/license_private.pem \
  --id workstation-001 \
  --product GNOMAN \
  --version 2.0.0 \
  --days 365
```

The script prints two representations:

- **RAW TOKEN** – base64url payload and signature separated by a dot.
- **HUMAN-FRIENDLY** – dashed Base32 string that is easier to transcribe.

Either format can be supplied to the desktop client. Store the value somewhere
secure so you do not need to reissue it later.

### 4.3 Validate a token without the UI

Use the Python helper to verify a token directly from the command line. The
verifier returns `True` for a valid token and `False` otherwise.

```bash
python -c "import sys; from backend.licenses.verify_license import verify_token; print(verify_token(sys.argv[1], sys.argv[2], 'GNOMAN', '2.0.0'))" backend/licenses/license_public.pem <token>
```

Replace `<token>` with either the raw token or a Base32 string that decodes to
one. The helper resolves relative paths with respect to the repository root, so
invoking it from other directories works as long as you supply the correct
inputs.

### 4.4 Desktop activation flow

1. Launch the Electron shell (`npm run dev:electron`) and navigate to the
   license screen if it does not appear automatically.
2. Enter either token representation. The preload bridge runs
   `verify_license.py` with the checked-in public key.
3. When verification succeeds, the preload writes `.safevault/license.env` with:
   ```
   LICENSE_KEY=<raw token>
   VALIDATED_AT=<unix timestamp>
   ```
4. On subsequent launches the preload re-verifies the stored token. If it has
   expired or the verification fails, the renderer prompts for a new license.

For headless automation or regression tests, the REST endpoint
`POST /api/license` remains available. It performs the same Ed25519 checks using
Node.js and persists JSON metadata under `.gnoman/license.json` for backwards
compatibility.

## 5. Build, lint, and packaging commands

| Command | Description |
| ------- | ----------- |
| `npm run lint` | Run ESLint across the backend, main process, renderer, and shared modules. |
| `npm run build:backend` | Compile the Express API to `dist/backend`. |
| `npm run build:main` | Compile the Electron main process to `dist/main`. |
| `npm run build:renderer` | Build the renderer UI into `renderer/dist`. |
| `npm run build` | Clean and produce all distributable artifacts (backend, main, renderer). |
| `npm start` | Rebuild and launch the packaged Electron shell. |
| `npm run start:backend` | Run the compiled backend directly from `dist/backend/index.js`. |

Distribution builds live under the `dist/` directory. The `scripts/copyRenderer.js`
helper copies the renderer bundle into `dist/main/` so the packaged Electron app
can load it from disk.

### 5.1 Build order and artifacts

1. `npm run build:backend` outputs compiled Express routes under `dist/backend/`.
2. `npm run build:main` writes the Electron main/preload bundles to `dist/main/`.
3. `npm run build:renderer` emits the renderer bundle to `renderer/dist/`.
4. `npm run copy:backend` and `npm run copy:renderer` move the backend assets and
   renderer bundle into the Electron tree so the packaged shell can load them
   without a dev server.

If you need an end-to-end artifact, `npm run build` runs the full pipeline in the
correct order and clears the previous output directory.

### 5.2 Preflight checks before shipping a build

- Run `npm run lint` to catch TypeScript or React regressions.
- Confirm `npm run build` completes without warnings.
- Launch the compiled backend with `npm run start:backend` and hit
  `GET /api/health` to verify the service bundle is healthy.
- Start the packaged Electron shell with `npm start` to ensure it loads
  `dist/renderer/index.html` and renders the navigation routes.

### 5.3 Renderer-specific build notes

- The renderer build is driven by Vite. If you only need a UI refresh, you can
  run `npm run build:renderer` followed by `npm run copy:renderer` instead of
  rebuilding the backend and main process.
- Set `VITE_GNOMAN_BACKEND_URL` when you want the renderer bundle to point at a
  non-default backend host in production.

### 5.4 Backend-specific build notes

- The Express bundle pulls runtime assets from `backend/licenses/` and
  `backend/abi/`. Keep `npm run copy:backend` in the chain so those assets are
  available in `dist/backend/`.
- When validating a production package, confirm the license verifier can read
  `backend/licenses/license_public.pem` from the compiled output.

## 6. Developer sandbox build-out checklist

Use this checklist when you need to validate the developer sandbox experience
end-to-end before shipping a build.

1. Start the backend (`npm run dev:backend`) and the renderer (`npm run dev:renderer`).
2. Navigate to the Sandbox tab and load a known ABI (ERC-20 or Safe module).
3. Save the ABI with a custom name, then re-select it from the saved list to
   confirm persistence in the current session.
4. Run a contract simulation against a public RPC URL and verify that decoded
   return data, gas estimates, and calldata appear in the Results pane.
5. Start a local fork from the UI (or a remote fork via `forkRpcUrl`) and run
   the same simulation with fork mode enabled to confirm fork routing works.
6. Use the history panel to replay a previous simulation and verify parameters
   rehydrate correctly.
7. Clear history and confirm the log pane resets.

## 7. Troubleshooting checklist

| Symptom | Suggested fix |
| ------- | -------------- |
| `ModuleNotFoundError: No module named 'cryptography'` | Install the Python dependency with `pip install cryptography`. |
| `python3` not found when validating a license | Ensure Python 3.10+ is installed and available on your `PATH`. Update the preload bridge to point at the correct executable if you use pyenv. |
| `better-sqlite3` fails to compile | Install the platform build tools (Xcode CLI tools, `build-essential`, or Windows Build Tools) before running `npm install` again. |
| Renderer cannot reach the backend | Confirm `npm run dev:backend` is running and the port matches the backend base URL configured in `renderer/src/utils/backend.ts`. |
| License verification unexpectedly fails | Delete `.safevault/license.env` and re-run activation to ensure the stored token has not been corrupted. |
| Electron window opens without UI in production mode | Run `npm run build:renderer` before launching `npm start` so the packaged assets exist. |

Following these conventions keeps every workstation aligned with the offline
licensing flow and build system that GNOMAN 2.0 expects in production.
