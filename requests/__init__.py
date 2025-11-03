"""Minimal requests-compatible shim built on urllib for GNOMAN."""

from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass
class Response:
    body: bytes
    status_code: int
    url: str

    def raise_for_status(self) -> None:
        if 400 <= self.status_code:
            raise HTTPError(self.url, self.status_code, "HTTP Error", hdrs=None, fp=None)

    def json(self):
        return json.loads(self.body.decode("utf-8"))


def get(url: str, timeout: int = 10) -> Response:
    request = Request(url)
    try:
        with urlopen(request, timeout=timeout) as http_response:
            body = http_response.read()
            status = getattr(http_response, "status", 200)
    except HTTPError as exc:
        raise HTTPError(url, exc.code, exc.reason, exc.hdrs, exc.fp) from exc
    except URLError as exc:
        raise ConnectionError(str(exc)) from exc
    return Response(body=body, status_code=status, url=url)
