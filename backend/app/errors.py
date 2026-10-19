"""명세 "오류 형식": 모든 오류를 {"detail": {"code", "message"}}로 보낸다."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def _body(request: Request, status: int, code: str, message: str) -> JSONResponse:
    request.state.error_code = code  # 요청 로그(app/logs.py) 끝에 붙인다.
    return JSONResponse(status_code=status, content={"detail": {"code": code, "message": message}})


def register(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(request: Request, exc: ApiError):
        return _body(request, exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return _body(request, 422, "VALIDATION_ERROR", "입력값이 올바르지 않습니다.")

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404:
            return _body(request, 404, "NOT_FOUND", "없는 경로입니다.")
        if exc.status_code == 405:
            return _body(request, 405, "METHOD_NOT_ALLOWED", "허용되지 않는 메서드입니다.")
        return _body(request, exc.status_code, "SERVER_ERROR", str(exc.detail))

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception):
        logger.exception("처리하지 못한 예외")
        return _body(request, 500, "SERVER_ERROR", "서버 오류가 발생했습니다.")
