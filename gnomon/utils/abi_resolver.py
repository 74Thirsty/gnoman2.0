"""ABI resolver with address-tethered caching and Etherscan proxy awareness."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

DEFAULT_CHAIN_ID = 1
DEFAULT_ETHERSCAN_BASE_URL = "https://api.etherscan.io/api"
ABI_ROOT = Path("abi")
ADDRESS_ABI_ROOT = ABI_ROOT / "address"
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


class _RateLimiter:
    """Simple sleep-based limiter constrained to 3 calls per second."""

    def __init__(self, max_calls: int = 3, period_seconds: float = 1.0):
        self.max_calls = max_calls
        self.period_seconds = period_seconds
        self._calls: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            sleep_for = 0.0
            with self._lock:
                now = time.monotonic()
                while self._calls and now - self._calls[0] >= self.period_seconds:
                    self._calls.popleft()
                if len(self._calls) < self.max_calls:
                    self._calls.append(now)
                    return
                sleep_for = self.period_seconds - (now - self._calls[0])
            if sleep_for > 0:
                time.sleep(sleep_for)


_RATE_LIMITER = _RateLimiter()
_ABI_CACHE: dict[tuple[int, str], dict[str, Any]] = {}
_FILE_CACHE: dict[tuple[int, str], Path] = {}
_FETCH_ONCE_CACHE: dict[tuple[int, str], bool] = {}


def _normalize_address(address: str) -> str:
    address = address.strip().lower()
    if not address.startswith("0x"):
        raise ValueError(f"Invalid address format: {address}")
    return address


def _address_abi_path(chain_id: int, address: str) -> Path:
    return ADDRESS_ABI_ROOT / str(chain_id) / f"{_normalize_address(address)}.json"


def _address_meta_path(chain_id: int, address: str) -> Path:
    return ADDRESS_ABI_ROOT / str(chain_id) / f"{_normalize_address(address)}.meta.json"


def _read_abi_file(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        parsed = json.load(handle)
    if isinstance(parsed, list):
        return {"abi": parsed}
    if isinstance(parsed, dict) and "abi" in parsed:
        return parsed
    raise ValueError(f"Unexpected ABI payload in {path}")


def _write_address_cache(
    chain_id: int,
    original_address: str,
    abi_payload: dict[str, Any],
    *,
    abi_target_address: str,
    is_proxy: bool,
    implementation: str | None,
    abi_name_hint: str | None,
    source: str,
) -> Path:
    abi_path = _address_abi_path(chain_id, original_address)
    meta_path = _address_meta_path(chain_id, original_address)
    abi_path.parent.mkdir(parents=True, exist_ok=True)

    abi_json_canonical = json.dumps(abi_payload, sort_keys=True, separators=(",", ":"))
    with open(abi_path, "w", encoding="utf-8") as handle:
        json.dump(abi_payload, handle, indent=2)

    metadata = {
        "chainId": chain_id,
        "address": _normalize_address(original_address),
        "abiTargetAddress": _normalize_address(abi_target_address),
        "isProxy": bool(is_proxy),
        "implementation": _normalize_address(implementation) if implementation else None,
        "abiNameHint": abi_name_hint,
        "source": source,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "abiSha256": hashlib.sha256(abi_json_canonical.encode("utf-8")).hexdigest(),
    }

    with open(meta_path, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    return abi_path


def _etherscan_request(action: str, *, chain_id: int, address: str, api_key: str) -> dict[str, Any]:
    _RATE_LIMITER.acquire()
    base_url = os.getenv("ETHERSCAN_BASE_URL", DEFAULT_ETHERSCAN_BASE_URL)
    response = requests.get(
        base_url,
        params={
            "module": "contract",
            "action": action,
            "address": _normalize_address(address),
            "apikey": api_key,
            "chainid": chain_id,
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def _resolve_via_etherscan(chain_id: int, original_address: str, abi_name_hint: str | None) -> Path:
    key = (chain_id, _normalize_address(original_address))
    if key in _FETCH_ONCE_CACHE:
        raise RuntimeError(
            f"ABI fetch already attempted for {original_address} on chain {chain_id} during this run"
        )
    _FETCH_ONCE_CACHE[key] = True

    api_key = os.getenv("ETHERSCAN_API_KEY")
    if not api_key:
        raise RuntimeError("Missing ABI and no ETHERSCAN_API_KEY configured")

    logger.info("ABI cache miss → fetching from Etherscan: %s chainId=%s", original_address, chain_id)

    source_data = _etherscan_request("getsourcecode", chain_id=chain_id, address=original_address, api_key=api_key)
    implementation = None
    is_proxy = False
    source_result = source_data.get("result")
    if isinstance(source_result, list) and source_result:
        implementation = (source_result[0].get("Implementation") or "").strip()
        if implementation and implementation.lower() != ZERO_ADDRESS:
            is_proxy = True

    abi_target = implementation if is_proxy else original_address
    if is_proxy:
        logger.info(
            "Proxy detected → implementation=%s (caching ABI for original address)",
            _normalize_address(abi_target),
        )

    abi_data = _etherscan_request("getabi", chain_id=chain_id, address=abi_target, api_key=api_key)
    status = str(abi_data.get("status", ""))
    result = abi_data.get("result")
    if status != "1" or not isinstance(result, str):
        message = abi_data.get("result") or abi_data.get("message") or "Unknown Etherscan error"
        raise RuntimeError(f"Failed to fetch ABI from Etherscan for {original_address}: {message}")

    try:
        abi = json.loads(result)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid ABI payload returned by Etherscan for {original_address}") from exc

    if not abi:
        raise RuntimeError(f"Failed to fetch ABI from Etherscan for {original_address}: empty ABI response")

    payload = {"abi": abi}
    abi_path = _write_address_cache(
        chain_id,
        original_address,
        payload,
        abi_target_address=abi_target,
        is_proxy=is_proxy,
        implementation=implementation,
        abi_name_hint=abi_name_hint,
        source="etherscan",
    )
    return abi_path


def resolve_abi_file_for_address(chain_id: int, address: str, abi_name_hint: str | None = None) -> Path:
    normalized_address = _normalize_address(address)
    key = (chain_id, normalized_address)

    if key in _FILE_CACHE:
        return _FILE_CACHE[key]

    address_path = _address_abi_path(chain_id, normalized_address)
    if address_path.exists():
        logger.info("ABI cache hit: %s", address_path.as_posix())
        _FILE_CACHE[key] = address_path
        return address_path

    if abi_name_hint:
        for candidate in (ABI_ROOT / f"{abi_name_hint}.json", ABI_ROOT / f"_{abi_name_hint}.json"):
            if candidate.exists():
                payload = _read_abi_file(candidate)
                cache_path = _write_address_cache(
                    chain_id,
                    normalized_address,
                    payload,
                    abi_target_address=normalized_address,
                    is_proxy=False,
                    implementation=None,
                    abi_name_hint=abi_name_hint,
                    source="name-cache",
                )
                _FILE_CACHE[key] = cache_path
                _ABI_CACHE[key] = payload
                return cache_path

    abi_path = _resolve_via_etherscan(chain_id, normalized_address, abi_name_hint)
    _FILE_CACHE[key] = abi_path
    return abi_path


def resolve_abi_by_address(chain_id: int, address: str, abi_name_hint: str | None = None) -> dict[str, Any]:
    normalized_address = _normalize_address(address)
    key = (chain_id, normalized_address)
    if key in _ABI_CACHE:
        return _ABI_CACHE[key]

    abi_file = resolve_abi_file_for_address(chain_id, normalized_address, abi_name_hint)
    payload = _read_abi_file(abi_file)
    _ABI_CACHE[key] = payload
    return payload


# Public API aliases requested in the spec.
def resolveAbiByAddress(chainId: int, address: str, abiNameHint: str | None = None) -> dict[str, Any]:
    return resolve_abi_by_address(chainId, address, abiNameHint)


def resolveAbiFileForAddress(chainId: int, address: str, abiNameHint: str | None = None) -> Path:
    return resolve_abi_file_for_address(chainId, address, abiNameHint)


def get_default_chain_id() -> int:
    value = os.getenv("ETHERSCAN_CHAIN_ID", str(DEFAULT_CHAIN_ID))
    return int(value)
