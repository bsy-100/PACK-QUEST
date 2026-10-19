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


def _body(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": {"code": code, "message": message}})


def register(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return _body(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return _body(422, "VALIDATION_ERROR", "입력값이 올바르지 않습니다.")

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        if exc.status_code == 404:
            return _body(404, "NOT_FOUND", "없는 경로입니다.")
        if exc.status_code == 405:
            return _body(405, "METHOD_NOT_ALLOWED", "허용되지 않는 메서드입니다.")
        return _body(exc.status_code, "SERVER_ERROR", str(exc.detail))

    @app.exception_handler(Exception)
    async def unhandled_error(_: Request, exc: Exception):
        logger.exception("처리하지 못한 예외")
        return _body(500, "SERVER_ERROR", "서버 오류가 발생했습니다.")
