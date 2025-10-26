# GNOMAN 2.0 Wiki User Guide

This in-app wiki distills the core workflows and best practices for operating GNOMAN 2.0 securely. Use it as a
quick reference while the desktop application is running.

## Getting started

1. **Start the backend** with `npm run dev:backend`. The renderer expects the API on `http://localhost:4399`.
2. **Launch the renderer** with `npm run dev:renderer` or boot the full Electron shell via
   `npm run dev:electron` to access the keyring bridge.
3. **Activate the license** inside **Settings → Offline License Activation** to validate an Ed25519-signed token
   and persist its metadata under `.gnoman/license.json`.

## Wallet management

- Generate wallets from the **Wallets** tab. Each request calls the backend to create a new key pair,
  encrypt the private key with AES-256-GCM, and return metadata.
- Record the generated password (or provide your own) so you can export the wallet later via the API.
- Hidden wallets are marked for keyring storage; when `keytar` is available, secrets are written to the OS
  keychain instead of disk.

## Safe operations

- Connect to an existing Safe from the **Safes** tab by supplying the Safe address and RPC URL. The backend
  verifies the network before caching owners, modules, and threshold.
- Monitor the **Held Transactions** panel to see proposals subject to the enforced hold period. Hold timers
  persist in `.gnoman/holds.sqlite`.
- Use the backend endpoints to add/remove owners, change thresholds, and manage modules as required by your
  operational policies.

## Sandbox simulations

- The **Sandbox** tab hosts two tools:
  - A quick Safe `callStatic` form for validating guard contracts or Safe modules.
  - An advanced panel (from `modules/sandbox/ui`) that lets you load ABIs, choose functions, provide
    parameters, replay previous simulations, and run against a local fork (defaults to the `anvil` command).
- Simulation results are saved as JSON in `modules/sandbox/logs/` so you can audit or replay them later.

## Keyring & secrets

- The **Keyring** view lists stored aliases via the Electron preload bridge (`window.gnoman`).
- Select **Reveal** to fetch a secret securely from the OS keyring. In development environments without
  `keytar`, GNOMAN 2.0 transparently falls back to an in-memory store so testing can continue.

## Security checklist

- Ensure offline license activation succeeds before managing production Safes.
- Rotate RPC credentials regularly and validate that your fork command (e.g., `anvil`) is patched.
- Keep dependencies updated and review release notes for security advisories.
- Protect the `.gnoman/` directory with OS-level full-disk encryption.

Stay aligned with your organization's procedures by extending this wiki with additional Markdown files under
`docs/wiki/`.
