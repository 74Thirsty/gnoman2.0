import base64
import time
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives import serialization


def b64u_decode(value):
    pad = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + pad)


REPO_ROOT = Path(__file__).resolve().parents[2]


def resolve_repo_path(path):
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    return candidate


def verify_token(pub_path, token, expected_product=None, expected_version=None):
    try:
        payload_b64, sig_b64 = token.split(".")
        payload = b64u_decode(payload_b64)
        sig = b64u_decode(sig_b64)
        pub_file = resolve_repo_path(pub_path)
        with pub_file.open("rb") as handle:
            pub = serialization.load_pem_public_key(handle.read())
        if not isinstance(pub, Ed25519PublicKey):
            raise TypeError("Expected an Ed25519 public key")
        pub.verify(sig, payload)
        identifier, product, version, expiry = payload.decode().split("|")
        if expected_product and product != expected_product:
            return False
        if expected_version and version != expected_version:
            return False
        if int(expiry) < time.time():
            return False
        return True
    except Exception:
        return False
