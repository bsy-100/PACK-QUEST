"""데모용 로그(PRD 데모 시나리오: 서버에서 API 요청 로그가 쌓이는 것을 보여준다).

- 요청 한 줄:  14:03:05  PUT     /api/trips/K7M3QX9P/items/10/assignee  409  10ms  203.0.113.7  ITEM_TAKEN
- 사건 한 줄:  14:03:05  * 여행 생성 K7M3QX9P | 해외·비행기·1~2박·여름 | 주최자 승연 | 추천 50개
5초 폴링(GET 200)은 30명이면 초당 6줄이라 숨긴다. 토큰은 절대 남기지 않는다.
"""

import logging
import sys
import time
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Request

from app.security import client_ip

KST = timezone(timedelta(hours=9))

LABELS = {
    "domestic": "국내", "overseas": "해외",
    "plane": "비행기", "car": "자동차", "train": "기차",
    "day": "당일", "short": "1~2박", "long": "3박 이상",
    "spring_fall": "봄·가을", "summer": "여름", "winter": "겨울",
}


class _KstFormatter(logging.Formatter):
    # 서버 시간대가 UTC여도 발표 화면에는 한국 시각으로 보이게 한다.
    def formatTime(self, record, datefmt=None):
        return datetime.fromtimestamp(record.created, KST).strftime("%H:%M:%S")


logger = logging.getLogger("packquest")
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(_KstFormatter("%(asctime)s  %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def event(message: str, *args) -> None:
    logger.info("* " + message, *args)


def label(*codes: str) -> str:
    return "·".join(LABELS.get(c, c) for c in codes)


def register(app: FastAPI) -> None:
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            _request_line(request, 500, start)
            raise
        if not (request.method == "GET" and response.status_code == 200):
            _request_line(request, response.status_code, start)
        return response


def _request_line(request: Request, status: int, start: float) -> None:
    ms = (time.perf_counter() - start) * 1000
    code = getattr(request.state, "error_code", "")
    logger.info(
        "%-6s  %-40s %3d  %5.0fms  %-15s %s", request.method, request.url.path, status, ms, client_ip(request), code
    )
