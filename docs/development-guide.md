# GNOMAN 2.0 Developer Guide

This guide documents the day-to-day workflows for building, testing, and distributing the GNOMAN 2.0
desktop application. Every path is relative to the repository root (the directory that contains
`package.json`).

> ℹ️ The in-app wiki renders a synchronized copy at `docs/wiki/development-guide.md`. Update both files
> whenever you change this guide so GitHub readers and desktop users see the same instructions.

## 1. Provision your environment

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Node.js | 18.x LTS | Bundles npm 9. Earlier releases are unsupported. |
| npm | 9.x | Used by all build and dev scripts. |
| Python | 3.10+ | Required for the Ed25519 licensing scripts. |
| pip packages | `cryptography` | Install globally or within a virtualenv: `pip install cryptography`. |
| SQLite toolchain | OS dependent | Needed the first time `better-sqlite3` compiles native bindings. |

Clone the repository and install dependencies:

```bash
npm install
(cd renderer && npm install)
```

## 2. Configure local secrets

1. Copy the environment template: `cp .env.example .env`.
2. If you own a development private key, place it somewhere outside of source control and set the
   `LICENSE_PRIVATE_KEY` entry to the relative path (defaults to `backend/licenses/license_private.pem`).
3. Generate a fresh keypair when you need one: `python backend/licenses/make_keys.py`.
   - Keep `license_private.pem` offline.
   - Commit only `backend/licenses/license_public.pem`.

## 3. Issue a development license

Create a time-bound license for your workstation:

```bash
python backend/licenses/gen_license.py \
  --priv backend/licenses/license_private.pem \
  --id dev-workstation \
  --product GNOMAN \
  --version 2.0.0 \
  --days 90
```

The script prints:

- **RAW TOKEN** – the base64url payload + signature used internally by the verifier.
- **HUMAN-FRIENDLY** – a dashed Base32 representation suitable for manual entry.

Persist either format in a password manager so you can reactivate the client later without
regenerating a key.

## 4. Run the application

Open three terminals so you can watch logs independently:

```bash
npm run dev:backend    # Express API on http://localhost:4399
npm run dev:renderer   # Vite dev server on http://localhost:5173
npm run dev:electron   # Builds all TypeScript projects and launches the desktop shell
```

The preload bridge (see `main/preload/licenseBridge.ts`) exposes a `window.safevault` helper that the
renderer uses to validate tokens without leaving the machine.

### Loading a saved license

When you validate a token successfully, the preload writes `.safevault/license.env` containing:

```
LICENSE_KEY=<raw token>
VALIDATED_AT=<unix timestamp>
```

On every boot the preload re-runs `verify_license.py` against `license_public.pem`. If the signature or
expiry fails, the renderer falls back to the activation screen.

## 5. Validate licenses from the command line

You can test licenses without launching the UI:

```bash
python -c "from backend.licenses.verify_license import verify_token; print(verify_token('backend/licenses/license_public.pem', '<token>', 'GNOMAN', '2.0.0'))"
```

A successful verification prints `True`. Any mismatch (signature, product, version, expiry) prints
`False`.

## 6. Linting, testing, and builds

| Command | Description |
| ------- | ----------- |
| `npm run lint` | Run ESLint across backend, main, renderer, and shared modules. |
| `npm test` | Execute the Jest-based backend smoke tests in `tests/`. |
| `npm run build:backend` | Compile the Express API to `dist/backend`. |
| `npm run build:main` | Compile the Electron main process to `dist/main`. |
| `npm run build:renderer` | Build the renderer UI into `renderer/dist`. |
| `npm run build` | Produce all distributable artifacts in one command. |

Build outputs use TypeScript project references (see `tsconfig*.json`). If a build fails with missing
references, run `npm run clean` and re-trigger the build.

## 7. Packaging tips

- The Electron entry point lives at `dist/main/main.js` after `npm run build`.
- The renderer build targets `renderer/dist`. The desktop shell copies these assets into
  `dist/main/index.html` during packaging.
- License assets ship with the application: include `backend/licenses/license_public.pem` and
  `.safevault/` (empty) in the installer, but never bundle `license_private.pem`.
- The preload is configured in `main/main.ts` (`BrowserWindow` → `preload: path.join(__dirname, "preload/index.js")`).

## 8. Troubleshooting checklist

| Symptom | Fix |
| ------- | --- |
| `better-sqlite3` fails to install | Ensure build tools are available (Xcode CLI tools on macOS, `build-essential` on Linux, or the Windows Build Tools package). |
| Renderer cannot reach the backend | Confirm `npm run dev:backend` is running and that the API port (default `4399`) matches `renderer/src/config/api.ts`. |
| License validation fails unexpectedly | Delete `.safevault/license.env` and re-run activation with a freshly generated token to confirm the stored value has not been corrupted. |
| Electron window opens without UI | Make sure `npm run dev:renderer` compiled successfully or run `npm run build:renderer` before launching Electron. |
| Python scripts cannot find keys | Provide absolute paths or run commands from the repository root so the helper utilities can resolve relative paths. |

With these practices in place, any contributor can spin up the GNOMAN 2.0 toolchain, validate the
offline licensing flow, and produce distributable builds without guessing how the pieces fit together.
