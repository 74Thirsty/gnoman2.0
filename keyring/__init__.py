"""Lightweight keyring stub for GNOMAN tests."""

from typing import Dict, Optional

_STORE: Dict[tuple[str, str], str] = {}


def get_password(service_name: str, username: str) -> Optional[str]:
    return _STORE.get((service_name, username))


def set_password(service_name: str, username: str, password: str) -> None:
    _STORE[(service_name, username)] = password


def delete_password(service_name: str, username: str) -> None:
    _STORE.pop((service_name, username), None)
