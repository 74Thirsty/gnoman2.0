import base64
import time
import argparse
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization


def b64u(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def canonical(identifier, product, version, expiry):
    return f"{identifier}|{product}|{version}|{expiry}".encode()


def sign_payload(priv_path, identifier, product, version, expiry):
    priv = serialization.load_pem_private_key(open(priv_path, "rb").read(), password=None)
    if not isinstance(priv, Ed25519PrivateKey):
        raise TypeError("Expected an Ed25519 private key")
    payload = canonical(identifier, product, version, expiry)
    sig = priv.sign(payload)
    return f"{b64u(payload)}.{b64u(sig)}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--priv", default="license_private.pem")
    parser.add_argument("--id", required=True)
    parser.add_argument("--product", default="GNOMAN")
    parser.add_argument("--version", default="2.0.0")
    parser.add_argument("--days", type=int, default=365)
    args = parser.parse_args()

    expiry = int(time.time()) + args.days * 86400
    token = sign_payload(args.priv, args.id, args.product, args.version, expiry)
    print("RAW TOKEN:
", token)
    b32 = base64.b32encode(token.encode()).decode().rstrip("=")
    grouped = "-".join([b32[i:i + 5] for i in range(0, len(b32), 5)])
    print("
HUMAN-FRIENDLY:
", grouped)
