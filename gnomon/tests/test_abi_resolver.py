import json
import os
import sys
import time
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from gnomon.utils import abi_resolver


@pytest.fixture(autouse=True)
def _isolated_abi_root(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ETHERSCAN_API_KEY", raising=False)
    monkeypatch.delenv("ETHERSCAN_BASE_URL", raising=False)
    monkeypatch.delenv("ETHERSCAN_CHAIN_ID", raising=False)
    abi_resolver._ABI_CACHE.clear()
    abi_resolver._FILE_CACHE.clear()
    abi_resolver._FETCH_ONCE_CACHE.clear()
    yield


def test_resolver_returns_cached_file_without_network_call(monkeypatch):
    chain_id = 1
    address = "0x1111111111111111111111111111111111111111"
    cache_file = Path("abi/address/1") / f"{address}.json"
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps({"abi": [{"name": "transfer", "type": "function"}]}), encoding="utf-8")

    called = False

    def _fail_get(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("network should not be called")

    monkeypatch.setattr(abi_resolver.requests, "get", _fail_get)

    payload = abi_resolver.resolveAbiByAddress(chain_id, address, None)

    assert payload["abi"][0]["name"] == "transfer"
    assert called is False


def test_proxy_resolves_implementation_and_caches_under_original(monkeypatch):
    os.environ["ETHERSCAN_API_KEY"] = "test-key"
    chain_id = 1
    original = "0x2222222222222222222222222222222222222222"
    implementation = "0x3333333333333333333333333333333333333333"

    class _Response:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    called_actions = []

    def _mock_get(url, params, timeout):
        called_actions.append((params["action"], params["address"]))
        if params["action"] == "getsourcecode":
            return _Response(
                {
                    "status": "1",
                    "message": "OK",
                    "result": [{"Implementation": implementation}],
                }
            )
        if params["action"] == "getabi":
            assert params["address"] == implementation
            return _Response(
                {
                    "status": "1",
                    "message": "OK",
                    "result": json.dumps([{"name": "balanceOf", "type": "function"}]),
                }
            )
        raise AssertionError("unexpected action")

    monkeypatch.setattr(abi_resolver.requests, "get", _mock_get)

    payload = abi_resolver.resolveAbiByAddress(chain_id, original, "ERC20")

    assert payload["abi"][0]["name"] == "balanceOf"
    cache_path = Path("abi/address/1") / f"{original}.json"
    assert cache_path.exists()
    assert ("getsourcecode", original) in called_actions
    assert ("getabi", implementation) in called_actions


def test_rate_limiter_prevents_exceeding_limit_under_loop(monkeypatch):
    os.environ["ETHERSCAN_API_KEY"] = "test-key"

    class _Response:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    def _mock_get(url, params, timeout):
        if params["action"] == "getsourcecode":
            return _Response({"status": "1", "message": "OK", "result": [{"Implementation": ""}]})
        return _Response({"status": "1", "message": "OK", "result": json.dumps([{"type": "function"}])})

    monkeypatch.setattr(abi_resolver.requests, "get", _mock_get)

    addresses = [f"0x{i:040x}" for i in range(10, 12)]  # 2 resolves => 4 HTTP calls
    start = time.perf_counter()
    for address in addresses:
        abi_resolver.resolveAbiByAddress(1, address, None)
    elapsed = time.perf_counter() - start

    assert elapsed >= 0.9


def test_meta_file_written_with_required_fields(monkeypatch):
    os.environ["ETHERSCAN_API_KEY"] = "test-key"
    address = "0x4444444444444444444444444444444444444444"

    class _Response:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    def _mock_get(url, params, timeout):
        if params["action"] == "getsourcecode":
            return _Response({"status": "1", "message": "OK", "result": [{"Implementation": ""}]})
        return _Response(
            {
                "status": "1",
                "message": "OK",
                "result": json.dumps([{"name": "approve", "type": "function"}]),
            }
        )

    monkeypatch.setattr(abi_resolver.requests, "get", _mock_get)

    abi_resolver.resolveAbiFileForAddress(1, address, "Token")

    meta_file = Path("abi/address/1") / f"{address}.meta.json"
    assert meta_file.exists()
    meta = json.loads(meta_file.read_text(encoding="utf-8"))

    for field in (
        "chainId",
        "address",
        "abiTargetAddress",
        "isProxy",
        "implementation",
        "abiNameHint",
        "source",
        "fetchedAt",
        "abiSha256",
    ):
        assert field in meta
    assert meta["address"] == address
    assert meta["source"] == "etherscan"


def test_missing_api_key_raises_clear_error():
    address = "0x5555555555555555555555555555555555555555"
    with pytest.raises(RuntimeError, match="Missing ABI and no ETHERSCAN_API_KEY configured"):
        abi_resolver.resolveAbiByAddress(1, address, None)
