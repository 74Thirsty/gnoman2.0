"""Safe manager utilities for persisting and reloading Safe state."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Optional

SAFE_STATE_PATH = Path("state/gnosis_safe_state.json")


def _normalize_owners(raw_owners: Any) -> list[str]:
    if raw_owners is None:
        return []
    if callable(raw_owners):
        raw_owners = raw_owners()
    if isinstance(raw_owners, dict):
        raw_owners = list(raw_owners.values())
    if isinstance(raw_owners, str):
        return [raw_owners]
    if isinstance(raw_owners, Iterable):
        return [str(owner) for owner in raw_owners]
    return []


def _extract_threshold(safe_instance: Any) -> int:
    threshold = None
    if hasattr(safe_instance, "getThreshold"):
        threshold = safe_instance.getThreshold()
    elif hasattr(safe_instance, "threshold"):
        attr = safe_instance.threshold
        threshold = attr() if callable(attr) else attr
    if threshold is None:
        raise ValueError("Safe instance does not expose a threshold value")
    return int(threshold)


def persist_safe_state(safe_instance: Any) -> Dict[str, Any]:
    """Persist the current Safe metadata to disk.

    Parameters
    ----------
    safe_instance: Any
        Object exposing ``address``, ``owners`` (method or iterable) and
        ``getThreshold`` or ``threshold``.
    """

    if safe_instance is None:
        raise ValueError("Safe instance is required to persist state")

    address = getattr(safe_instance, "address", None)
    if callable(address):  # defensive: handle SDKs exposing callables
        address = address()
    if not address:
        raise ValueError("Safe instance is missing an address")

    owners = _normalize_owners(getattr(safe_instance, "owners", None))
    if len(owners) < 3:
        raise ValueError("Safe must have at least three owners before persisting")

    threshold = _extract_threshold(safe_instance)

    SAFE_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {"address": str(address), "owners": owners, "threshold": threshold}
    with open(SAFE_STATE_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
    print("[SafeManager] Safe state persisted successfully.")
    return data


def load_persisted_safe() -> Dict[str, Any]:
    if not SAFE_STATE_PATH.exists():
        raise RuntimeError("Safe state file missing.")
    with open(SAFE_STATE_PATH, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    owners = data.get("owners") or []
    if len(owners) < 3:
        raise ValueError("Invalid Safe state — missing or incomplete owners.")
    print(f"[SafeManager] Loaded Safe with owners: {owners}")
    return data


class SafeManager:
    """Utility orchestrating Safe persistence and retrieval."""

    def __init__(self, safe_factory: Callable[..., Any]):
        self._safe_factory = safe_factory
        self._safe_instance: Optional[Any] = None

    @property
    def safe(self) -> Any:
        if self._safe_instance is None:
            raise RuntimeError("Safe has not been initialised. Call `load_safe`." )
        return self._safe_instance

    def load_safe(self, *factory_args: Any, **factory_kwargs: Any) -> Any:
        """Instantiate a Safe instance and persist its state immediately."""
        safe_instance = self._safe_factory(*factory_args, **factory_kwargs)
        self._safe_instance = safe_instance
        persist_safe_state(safe_instance)
        return safe_instance

    def refresh_state(self) -> Dict[str, Any]:
        """Persist the currently tracked Safe instance again and return the cache."""
        if self._safe_instance is None:
            raise RuntimeError("Safe has not been initialised.")
        return persist_safe_state(self._safe_instance)

    def get_cached_state(self) -> Dict[str, Any]:
        """Load Safe metadata from the persisted cache on disk."""
        return load_persisted_safe()
