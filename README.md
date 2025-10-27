![Sheen Banner](https://raw.githubusercontent.com/74Thirsty/74Thirsty/main/assets/gnoman.svg)

GNOMAN 2.0 is a cross-platform Electron desktop application that combines a local Express API with a React
renderer to manage Gnosis Safe workflows from a single secured workspace. The project is written entirely
in TypeScript and ships with tooling for simulating Safe transactions, managing wallets, and enforcing
offline license policies before operators can act on production Safes.

## Graphical-first operations

The graphical client is the primary control plane. Every historic `gnoman` CLI capability now maps to a
dedicated UI workflow—keyring management, wallet administration, Safe tooling, sandbox orchestration, and
configuration live behind buttons, panels, and activity feeds. The CLI continues to exist for legacy
automation, but receives no new features and is treated as a fallback transport only.

## Tech stack

- **Electron 28** for the desktop shell, preload isolation, and IPC keyring bridge (`main/`).
- **Electron 28** for the desktop shell, preload isolation, and IPC keyring bridge (`main/`). Legacy IPC
  handlers remain for backwards compatibility but all user journeys originate in the renderer.
- **Express** with TypeScript for the local API that powers wallet, Safe, sandbox, and license flows
  (`backend/`).
- **React + Tailwind (Vite)** for the renderer UI (`renderer/`).
- **Better SQLite3** for persisting transaction holds and vanity job history under a local
  `.gnoman/` directory.
- **Ethers v6** for wallet creation, encryption, and contract simulation utilities.

## Repository layout

```
/ (root)
├── backend/              # Express API, services, and route handlers
├── main/                 # Electron entrypoint, preload, and AES keyring integration
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
@@ -155,47 +163,48 @@ The sandbox writes JSON logs to `modules/sandbox/logs/` and coordinates optional

Validated tokens are re-verified at startup through the preload bridge and persist as a simple
`.safevault/license.env` file that contains the raw token and a timestamp indicating when the
desktop client last confirmed the signature. The REST endpoint continues to mirror metadata to
`.gnoman/license.json` for legacy automation that reads the old format.

### Offline license workflow (developer tooling)

| Purpose | Command | Output |
| --- | --- | --- |
| Generate keypair (one-time) | `python backend/licenses/make_keys.py` | `license_private.pem`, `license_public.pem` |
| Generate license token | `python backend/licenses/gen_license.py --id "Customer"` | Signed token (raw + Base32) |
| Embed public key | Ship the checked-in `backend/licenses/license_public.pem` alongside the backend build | Used by verifier |
| Validate offline | `python -c "from backend.licenses.verify_license import verify_token; print(verify_token('backend/licenses/license_public.pem', '<token>', 'GNOMAN', '2.0.0'))"` | Prints `True`/`False` |

## Desktop application features

- **Dashboard** – high-level overview of stored wallets and the currently connected Safe.
- **Wallets** – generate encrypted wallets with optional aliases, hidden flag, and password overrides, then
  list stored metadata.
- **Safes** – connect to a Safe, review owners/modules, audit hold policy summaries, and monitor queued
  transactions with live countdowns.
- **Sandbox** – switch between the legacy Safe callStatic form and the advanced sandbox panel powered by
  `modules/sandbox/ui`. Upload or paste ABIs, choose functions, provide parameters, replay historical
  simulations, and manage an optional local fork.
- **Keyring** – interact with the Electron IPC bridge (`window.gnoman`) to list and reveal secrets stored
  in the AES keyring service (with a logged warning and in-memory fallback when the `keyring` module is unavailable).
- **Keyring** – encrypt, reveal, switch, and audit secrets directly inside the UI. Requests flow through
  the local REST API so every operation is recorded in the on-screen activity log. The CLI bridge remains
  available for legacy scripts but no longer surfaces new behavior.
- **Settings** – activate offline licensing, configure global hold defaults, launch vanity generators, and
  jump to the in-app wiki.
- **Wiki Guide** – render Markdown documentation from `docs/wiki` directly inside the renderer.

## Data directories & security

- Transaction-hold records and vanity job ledgers are stored under `.gnoman/` in the project working
  directory (`holds.sqlite`, `vanity-jobs.json`), while validated license tokens live in
  `.safevault/license.env`.
- Sandbox logs persist to `modules/sandbox/logs/` for replay and auditing purposes.
- Wallet private keys stay encrypted in-memory using AES-256-GCM with PBKDF2 key derivation. Exported
  keystores require the caller-supplied password.
- The Electron preload exposes a minimal `window.gnoman.invoke` surface to keep privileged operations
  isolated from the renderer context.

## Documentation

Additional guides live under `docs/`. Start with `docs/user-guide.md` for a comprehensive walkthrough,
`docs/license-dev-guide.md` for offline licensing workflows, and `docs/wiki/` for content surfaced in the
in-app knowledge base.
