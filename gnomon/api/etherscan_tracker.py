"""
Etherscan Tracker Integration for GNOMAN
Tracks Safe transactions and performs lookup queries.
"""

import json
import time
from pathlib import Path

import requests
from keyring import get_password

SAFE_STATE_PATH = Path("state/gnosis_safe_state.json")
LOG_PATH = Path("logs/safe_tx_log.json")
ETHERSCAN_API_KEY = get_password("AES", "ETHERSCAN_API_KEY")
ETHERSCAN_BASE_URL = "https://api.etherscan.io/api"
POLL_INTERVAL = 30  # seconds

if not ETHERSCAN_API_KEY:
    raise RuntimeError("ETHERSCAN_API_KEY is not configured in the keyring.")


def get_safe_address() -> str:
    with open(SAFE_STATE_PATH, encoding="utf-8") as handle:
        data = json.load(handle)
    return data["address"]


def load_safe_state() -> dict:
    if not SAFE_STATE_PATH.exists():
        raise RuntimeError("Safe state missing — persistence failure detected.")
    with open(SAFE_STATE_PATH, encoding="utf-8") as handle:
        state = json.load(handle)
    if not state.get("owners") or len(state["owners"]) < 3:
        raise ValueError("Safe loaded without correct owner list (3 required).")
    return state


def fetch_transactions(address: str):
    url = (
        f"{ETHERSCAN_BASE_URL}?module=account&action=txlist&address={address}"
        f"&apikey={ETHERSCAN_API_KEY}"
    )
    response = requests.get(url, timeout=20)
    response.raise_for_status()
    data = response.json()
    if data["status"] != "1":
        raise ValueError(f"Etherscan error: {data['message']}")
    return data["result"]


def track_safe_transactions():
    safe = load_safe_state()
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[EtherscanTracker] Tracking transactions for Safe: {safe['address']}")
    while True:
        txs = fetch_transactions(safe["address"])
        with open(LOG_PATH, "w", encoding="utf-8") as handle:
            json.dump(txs, handle, indent=2)
        print(f"[EtherscanTracker] {len(txs)} transactions logged.")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    track_safe_transactions()
