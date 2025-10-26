from __future__ import annotations

import argparse
import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
DEFAULT_PRIVATE_KEY = ROOT / "license_private.pem"


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def normalize_private_key_path(path: str | None) -> Path:
    if path is None:
        return DEFAULT_PRIVATE_KEY
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = (REPO_ROOT / candidate).resolve()
    return candidate


def load_private_key(path: Path) -> Ed25519PrivateKey:
    key_data = path.read_bytes()
    return serialization.load_pem_private_key(key_data, password=None)


def build_payload(identifier: str, product: str, version: str, days: int) -> str:
    expiry = datetime.now(tz=timezone.utc) + timedelta(days=days)
    expiry_ts = int(expiry.timestamp())
    return "|".join([identifier, product, version, str(expiry_ts)])


def format_human(token: str) -> str:
    encoded = base64.b32encode(token.encode("ascii")).decode("ascii")
    normalized = encoded.rstrip("=")
    chunks = [normalized[i : i + 5] for i in range(0, len(normalized), 5)]
    return "-".join(chunks)


def issue_license(identifier: str, product: str, version: str, days: int, key_path: Path) -> None:
    private_key = load_private_key(key_path)
    payload = build_payload(identifier, product, version, days)
    payload_bytes = payload.encode("utf-8")
    signature = private_key.sign(payload_bytes)

    raw_token = f"{b64url_encode(payload_bytes)}.{b64url_encode(signature)}"
    human = format_human(raw_token)

    print("RAW TOKEN:")
    print(raw_token)
    print()
    print("HUMAN-FRIENDLY:")
    print(human)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate an offline GNOMAN license token")
    parser.add_argument("--priv", dest="private_key", help="Relative or absolute path to private key")
    parser.add_argument("--id", required=True, dest="identifier", help="License identifier")
    parser.add_argument("--product", default="GNOMAN", help="Product identifier")
    parser.add_argument("--version", default="2.0.0", help="Product version")
    parser.add_argument("--days", type=int, default=365, help="Number of days until expiry")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    key_path = normalize_private_key_path(args.private_key)
    issue_license(args.identifier, args.product, args.version, args.days, key_path)


if __name__ == "__main__":
    main()
