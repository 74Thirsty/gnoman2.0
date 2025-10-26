from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


ROOT = Path(__file__).resolve().parent


def add_padding(value: str) -> str:
    return value + "=" * ((4 - len(value) % 4) % 4)


def decode_base32_token(token: str) -> str | None:
    normalized = token.replace("-", "").replace(" ", "").strip().upper()
    if not normalized:
        return None
    padding = "=" * ((8 - len(normalized) % 8) % 8)
    try:
        decoded = base64.b32decode(normalized + padding, casefold=True)
    except (base64.binascii.Error, ValueError):  # type: ignore[attr-defined]
        return None
    try:
        return decoded.decode("ascii")
    except UnicodeDecodeError:
        return None


def split_token(token: str) -> Tuple[str, str]:
    if "." not in token:
        raise ValueError("Token missing signature separator")
    payload_b64, signature_b64 = token.split(".", 1)
    if not payload_b64 or not signature_b64:
        raise ValueError("Malformed token")
    return payload_b64, signature_b64


def load_public_key(path: Path) -> Ed25519PublicKey:
    key_data = path.read_bytes()
    return serialization.load_pem_public_key(key_data)


def parse_payload(payload: bytes) -> Tuple[str, str, str, int]:
    parts = payload.decode("utf-8").split("|")
    if len(parts) != 4:
        raise ValueError("Unexpected payload format")
    identifier, product, version, expiry_raw = parts
    try:
        expiry = int(expiry_raw)
    except ValueError as exc:
        raise ValueError("Invalid expiry timestamp") from exc
    return identifier, product, version, expiry


def verify_token(token: str, public_key: Ed25519PublicKey, expected_product: str, expected_version: str) -> bool:
    raw_token = decode_base32_token(token) or token
    payload_b64, signature_b64 = split_token(raw_token)

    payload_bytes = base64.urlsafe_b64decode(add_padding(payload_b64))
    signature = base64.urlsafe_b64decode(add_padding(signature_b64))

    identifier, product, version, expiry_ts = parse_payload(payload_bytes)

    if product != expected_product or version != expected_version:
        return False

    now = int(datetime.now(tz=timezone.utc).timestamp())
    if expiry_ts < now:
        return False

    try:
        public_key.verify(signature, payload_bytes)
    except InvalidSignature:
        return False

    # identifier is not used further but verifying ensures canonical payload
    _ = identifier
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify an offline GNOMAN license token")
    parser.add_argument("public_key", help="Path to license_public.pem")
    parser.add_argument("token", help="License token (raw or grouped)")
    parser.add_argument("product", help="Expected product identifier")
    parser.add_argument("version", help="Expected product version")
    args = parser.parse_args()

    key_path = Path(args.public_key)
    if not key_path.is_absolute():
        key_path = (ROOT.parent.parent / key_path).resolve()

    try:
        public_key = load_public_key(key_path)
        is_valid = verify_token(args.token, public_key, args.product, args.version)
    except Exception:
        print("False")
        return

    print("True" if is_valid else "False")


if __name__ == "__main__":
    main()
