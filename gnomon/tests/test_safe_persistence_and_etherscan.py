import json
import sys
import types
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if "keyring" not in sys.modules:
    keyring_stub = types.ModuleType("keyring")
    _store: dict[tuple[str, str], str] = {}

    def get_password(service_name: str, username: str):
        return _store.get((service_name, username))

    def set_password(service_name: str, username: str, password: str):
        _store[(service_name, username)] = password

    def delete_password(service_name: str, username: str):
        _store.pop((service_name, username), None)

    keyring_stub.get_password = get_password
    keyring_stub.set_password = set_password
    keyring_stub.delete_password = delete_password
    sys.modules["keyring"] = keyring_stub

from keyring import delete_password, set_password

# Configure the keyring stub before importing the tracker module.
set_password("gnoman", "ETHERSCAN_API_KEY", "dummy-test-key")

from gnomon.api import etherscan_tracker
from gnomon.api.etherscan_tracker import (
    fetch_transactions,
    get_etherscan_api_key,
    load_safe_state,
    SAFE_STATE_PATH,
)


@pytest.fixture(autouse=True)
def cleanup_state_file():
    SAFE_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    yield
    if SAFE_STATE_PATH.exists():
        SAFE_STATE_PATH.unlink()
    delete_password("gnoman", "ETHERSCAN_API_KEY")


def _write_state_file(address: str = "0xSAFE", owners=None, threshold: int = 2):
    owners = owners or ["0x1", "0x2", "0x3"]
    SAFE_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SAFE_STATE_PATH, "w", encoding="utf-8") as handle:
        json.dump({"address": address, "owners": owners, "threshold": threshold}, handle, indent=2)


def test_safe_persistence_and_tx_lookup(monkeypatch):
    assert get_etherscan_api_key() == "dummy-test-key"

    _write_state_file()

    state = load_safe_state()
    assert "owners" in state and len(state["owners"]) == 3

    dummy_response = {
        "status": "1",
        "message": "OK",
        "result": [
            {"hash": "0xabc", "value": "0x0"},
            {"hash": "0xdef", "value": "0x0"},
        ],
    }

    class _StubResponse:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    def _mock_get(url, timeout):
        assert state["address"] in url
        assert get_etherscan_api_key() in url
        return _StubResponse(dummy_response)

    monkeypatch.setattr(etherscan_tracker.requests, "get", _mock_get)

    txs = fetch_transactions(state["address"])
    assert isinstance(txs, list)
    assert all("hash" in tx for tx in txs)
    print("[TEST] ✅ Safe persistence and Etherscan lookup verified.")
