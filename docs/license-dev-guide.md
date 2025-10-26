# GNOMAN 2.0 License Development Guide

This reference walks through generating, issuing, and validating offline license
tokens for GNOMAN 2.0. All examples assume you run commands from the repository
root (the directory containing `package.json`).

> ℹ️ A mirrored copy of this document lives at
> `docs/wiki/license-dev-guide.md` so the in-app wiki surfaces the same
> instructions. Update both files whenever you make changes.

## 1. Prerequisites

- Python 3.10 or newer
- `pip install cryptography`
- Access to the environment-specific Ed25519 private key (keep it offline)

## 2. Generate a keypair

Run the helper once per environment to mint a fresh Ed25519 keypair:

```bash
python backend/licenses/make_keys.py
```

Outputs:

- `backend/licenses/license_private.pem` – keep offline, never commit.
- `backend/licenses/license_public.pem` – check into source control and ship
  with the application.

## 3. Configure the CLI environment

Copy `.env.example` to `.env` and set `LICENSE_PRIVATE_KEY` to the path of the
private key relative to the repository root. The default value
`backend/licenses/license_private.pem` is resolved automatically.

## 4. Issue a license token

Run the issuer with explicit arguments so the command is copy/paste friendly:

```bash
python backend/licenses/gen_license.py \
  --priv backend/licenses/license_private.pem \
  --id customer-or-workstation \
  --product GNOMAN \
  --version 2.0.0 \
  --days 365
```

- `--priv` overrides the default private key path.
- `--id` can be any identifier useful for auditing (customer, workstation, etc.).
- `--product` and `--version` must match what the application expects.
- `--days` controls the validity window.

The script prints:

- **RAW TOKEN** – base64url payload + signature separated by a dot.
- **HUMAN-FRIENDLY** – Base32 groups separated by dashes for manual entry.

Store the raw token securely. If you need the Base32 form later, you can derive
it by running the same command again or by base32-encoding the raw value with a
short Python snippet.

## 5. Validate a token locally

Confirm a token is still valid before distributing it:

```bash
python -c "import sys; from backend.licenses.verify_license import verify_token; print(verify_token(sys.argv[1], sys.argv[2], 'GNOMAN', '2.0.0'))" backend/licenses/license_public.pem <token>
```

Substitute `<token>` with either representation. A valid token prints `True`;
any failure (bad signature, wrong product/version, expired timestamp) prints
`False`.

## 6. Desktop activation flow

1. Launch the Electron app (`npm run dev:electron`).
2. Enter the raw or Base32 token on the activation screen.
3. The preload bridge executes `verify_license.py` with the checked-in public
   key. Successful validation creates `.safevault/license.env` containing:
   ```
   LICENSE_KEY=<raw token>
   VALIDATED_AT=<unix timestamp>
   ```
4. On subsequent launches the preload re-verifies the stored token. Expired or
   tampered tokens force the user back to the activation screen.

## 7. Backend compatibility endpoint

Automation can continue to call the REST endpoint `POST /api/license`. It
performs the same Ed25519 verification in Node.js and persists metadata to
`.gnoman/license.json`. The renderer no longer depends on this file, but legacy
integrations may still read it.

## 8. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `FileNotFoundError` for the private key | Confirm `LICENSE_PRIVATE_KEY` points at the correct path and that the key lives outside version control. |
| `ModuleNotFoundError: No module named 'cryptography'` | Install the dependency with `pip install cryptography`. |
| Token prints `False` unexpectedly | Decode the payload with `python -c "import base64,sys; payload=sys.argv[1].split('.')[0]; pad='='*((4-len(payload)%4)%4); print(base64.urlsafe_b64decode(payload+pad).decode())" <token>` to confirm the product, version, and expiry are correct. |
| Desktop app refuses a known-good token | Delete `.safevault/license.env` and re-run activation to ensure the cached token has not been modified. |

Following this checklist ensures every issued license aligns with the offline
verification logic that ships with GNOMAN 2.0.
