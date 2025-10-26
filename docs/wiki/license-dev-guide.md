# GNOMAN 2.0 License Development Guide

This reference collects every command required to mint and validate offline licenses while working on GNOMAN 2.0.
All paths are resolved **relative to the repository root** (the directory that contains `package.json`).

> ℹ️ A GitHub-friendly copy of this document lives at `docs/license-dev-guide.md`. Keep both files in sync so contributors and
> in-app wiki readers see the same instructions.

## 1. Prerequisites

- Python 3.10+ with `pip`
- The [`cryptography`](https://cryptography.io/) package installed in the active environment
- Access to the Ed25519 private key that signs development or production licenses

Install the Python dependency once:

```bash
pip install cryptography
```

## 2. Generate a signing keypair (one-time per environment)

Run the helper from the `backend/licenses/` directory when you need a fresh keypair:

```bash
python backend/licenses/make_keys.py
```

The script writes two PEM files:

- `backend/licenses/license_private.pem` – keep this offline and never commit it
- `backend/licenses/license_public.pem` – check this exact path into the repository; the backend loads `backend/licenses/license_public.pem` at runtime, so ship that file alongside the compiled server build

## 3. Configure environment variables

Start the backend once (`npm run dev:backend`, `npm run dev`, or `npm run start:backend`) and GNOMAN will generate `.env` automatically.
If the private key has not been captured yet **and** the process is attached to an interactive terminal, the startup sequence prompts for the PEM contents, writes the file to
`backend/licenses/license_private.pem`, and records the relative path in `.env`. You can delete `.env` to trigger the prompt again when
rotating keys. When the backend launches without a TTY (for example, when started from Electron), it skips the prompt, logs a reminder to configure `LICENSE_PRIVATE_KEY`, and continues running so the desktop UI can validate tokens. Supply the variable manually before issuing licenses from scripts. The value still resolves relative to the project root, so leave it at the default unless you intentionally move the
private key.

## 4. Issue a license token

Run the issuer from the repository root. The example below shows a single-line command with explicit arguments so the syntax is
copy/paste safe:

```bash
python backend/licenses/gen_license.py \
  --priv backend/licenses/license_private.pem \
  --id customer-identifier \
  --product GNOMAN \
  --version 2.0.0 \
  --days 365
```

- `--priv` (optional) – private key path relative to the repository root (overrides `LICENSE_PRIVATE_KEY`)
- `--id` – opaque identifier you can use for auditing (e.g., customer, workstation, or account name)
- `--product` – product string baked into the payload (`GNOMAN` by default)
- `--version` – semantic version string expected by the verifier (`2.0.0` by default)
- `--days` – license validity window in days (365 by default)

The script prints two formats:

- `RAW TOKEN` – the base64url payload and signature separated by a dot; persist this exact string in the backend database
- `HUMAN-FRIENDLY` – grouped base32 characters that are easier to communicate to customers

## 5. Validate tokens locally

You can validate an issued token without starting the UI. The verifier also resolves public key paths relative to the repo root:

```bash
python backend/licenses/verify_license.py backend/licenses/license_public.pem "base64url.payload.base64url.signature"
```

> ✅ Tip: the verifier resolves relative paths from the repository root, so you can omit directories if you run the command from `backend/licenses/`.

A successful validation returns `True`. If the signature, product, version, or expiry fails inspection, the script returns `False`.

For end-to-end testing with the desktop client:

1. Start the backend (`npm run dev:backend`).
2. Start the renderer (`npm run dev:renderer`) or the Electron shell (`npm run dev:electron`).
3. Open **Settings → Offline License Activation**, paste either token format, and submit.
4. On success, the normalized token persists to `.gnoman/license.json` for reuse.

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `FileNotFoundError` when issuing or verifying | Double-check the private/public key path. Relative paths are joined with the repository root, so `backend/licenses/license_private.pem` works from any directory. |
| `Expected an Ed25519 private/public key` | Ensure you generated the keypair with `make_keys.py` and are not pointing to a different algorithm. |
| Token validates locally but fails in the UI | Confirm the backend is using the same public key file bundled with the build and restart the server to reload environment changes. |
| `False` from `verify_license.py` | Inspect the token payload for the expected `product` and `version`, and confirm the expiry timestamp has not passed. |

## 7. Security considerations

- Store `license_private.pem` in an offline vault with limited access.
- Rotate keypairs per environment (development, staging, production) and reissue affected licenses when rotating.
- Maintain an encrypted ledger that tracks `id`, `product`, `version`, and expiry for every issued license.
- Audit backend logs for repeated activation failures which may indicate tampering attempts.

Keeping the repository-relative conventions documented here ensures every developer can create and validate licenses without
guesswork, regardless of their working directory.
