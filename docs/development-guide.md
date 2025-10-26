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
| Native build chain | OS specific | Xcode Command Line Tools on macOS, `build-essential` on Linux, or Windows Build Tools to compile `better-sqlite3` and `keytar`. |

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

## 6. Troubleshooting checklist

| Symptom | Suggested fix |
| ------- | -------------- |
| `ModuleNotFoundError: No module named 'cryptography'` | Install the Python dependency with `pip install cryptography`. |
| `python3` not found when validating a license | Ensure Python 3.10+ is installed and available on your `PATH`. Update the preload bridge to point at the correct executable if you use pyenv. |
| `better-sqlite3` fails to compile | Install the platform build tools (Xcode CLI tools, `build-essential`, or Windows Build Tools) before running `npm install` again. |
| Renderer cannot reach the backend | Confirm `npm run dev:backend` is running and the port matches `renderer/src/config/api.ts`. |
| License verification unexpectedly fails | Delete `.safevault/license.env` and re-run activation to ensure the stored token has not been corrupted. |
| Electron window opens without UI in production mode | Run `npm run build:renderer` before launching `npm start` so the packaged assets exist. |

Following these conventions keeps every workstation aligned with the offline
licensing flow and build system that GNOMAN 2.0 expects in production.
