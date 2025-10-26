from __future__ import annotations

from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parent
PRIVATE_KEY_PATH = ROOT / "license_private.pem"
PUBLIC_KEY_PATH = ROOT / "license_public.pem"


def write_file(path: Path, data: bytes) -> None:
    path.write_bytes(data)


def generate_keypair() -> None:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    write_file(PRIVATE_KEY_PATH, private_bytes)
    write_file(PUBLIC_KEY_PATH, public_bytes)

    print(f"Private key written to {PRIVATE_KEY_PATH}")
    print(f"Public key written to {PUBLIC_KEY_PATH}")


if __name__ == "__main__":
    generate_keypair()
