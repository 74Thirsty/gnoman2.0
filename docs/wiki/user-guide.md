# SafeVault Wiki User Guide

Welcome to the SafeVault user guide. This wiki outlines the workflows that keep Safe owners in
control of their assets while maintaining strong operational security.

## Getting Started

1. **Install dependencies** using `npm install` at the repository root and within `renderer/`.
2. **Start the backend** with `npm run dev:backend` to unlock wallet and Safe orchestration APIs.
3. **Launch the renderer** with `npm run dev:renderer` or boot the Electron shell via
   `npm run dev:electron`.
4. **Register your product license** inside the application under **Settings → Product Registration**
   to enforce organization-wide compliance policies.

## Wallet Management

- Generate, import, and export wallets from the **Wallets** tab. Secrets are encrypted with
  AES-256-GCM before touching disk.
- Use the vanity search tools to derive predictable addresses without revealing mnemonic phrases.
- Store aliases and metadata securely through the **Keyring** page, which leverages the host
  operating system keyring when available.

## Safe Operations

- Review Safe owners, thresholds, and modules inside the **Safes** dashboard.
- Toggle the 24-hour transaction hold policy to force human-in-the-loop approvals for
  high-impact operations.
- Exercise the **Sandbox** for deterministic `callStatic` simulations before broadcasting any
  transaction bundle.

## Security Checklist

- Validate workstation compliance by confirming product registration upon first launch.
- Rotate RPC credentials regularly and audit all connected services.
- Keep application dependencies patched and monitor release notes for security advisories.
- Protect the `.safevault/` directory with OS-level full disk encryption.

## Need More Help?

Enhance this wiki with organization-specific procedures by adding Markdown files to `docs/wiki/`.
Share PRs with your operations team to keep everyone aligned on SafeVault best practices.
