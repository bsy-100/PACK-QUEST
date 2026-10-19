"""공유 코드·토큰 생성, 사용자 IP, 요청 제한."""

import hashlib
import re
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from app.errors import ApiError

# 명세 "공유 코드": 0, O, 1, I, L 제외
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LENGTH = 8
_CODE_RE = re.compile(f"[{CODE_ALPHABET}]{{{CODE_LENGTH}}}")


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(code: str) -> str | None:
    """대문자로 바꾼 코드. 형식이 틀리면 None."""
    code = code.upper()
    return code if _CODE_RE.fullmatch(code) else None


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def client_ip(request: Request) -> str:
    # 명세 "요청 제한": CloudFront-Viewer-Address에서 포트(마지막 콜론 뒤)를 뗀다.
    viewer = request.headers.get("cloudfront-viewer-address")
    if viewer:
        return viewer.rsplit(":", 1)[0]
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """IP당 1분 슬라이딩 윈도. 메모리 방식이라 uvicorn worker 1개 전제."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def __call__(self, request: Request) -> None:
        ip = client_ip(request)
        now = time.monotonic()
        with self._lock:
            hits = self._hits[ip]
            while hits and now - hits[0] > 60:
                hits.popleft()
            if len(hits) >= self.per_minute:
                raise ApiError(429, "RATE_LIMITED", "요청이 너무 많습니다.")
            hits.append(now)


create_trip_limit = RateLimiter(10)
join_trip_limit = RateLimiter(60)
