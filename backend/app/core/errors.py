import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.schemas import ErrorBody, ErrorDetail, ErrorResponse

logger = logging.getLogger("lwa.errors")


def error_response(
    status: int,
    code: str,
    message: str,
    details: list[ErrorDetail] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(error=ErrorBody(code=code, message=message, details=details or []))
    return JSONResponse(status_code=status, content=body.model_dump(), headers=headers)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        # Do not echo supplied values, Pydantic context, or exception messages.
        details = [
            ErrorDetail(field=".".join(map(str, item["loc"])), code=item["type"])
            for item in exc.errors()
        ]
        return error_response(422, "validation_error", "Request parameters are invalid.", details)

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException):
        code, message = {
            404: ("not_found", "Resource not found."),
            405: ("method_not_allowed", "Method not allowed."),
        }.get(exc.status_code, ("http_error", "Request could not be completed."))
        return error_response(exc.status_code, code, message, headers=exc.headers)

    @app.middleware("http")
    async def internal_error(request: Request, call_next):
        # Catch before ServerErrorMiddleware can re-raise to Uvicorn, whose default
        # traceback logging would include the original exception's sensitive text.
        try:
            return await call_next(request)
        except Exception as exc:
            return log_internal_error(exc)


def log_internal_error(exc: Exception) -> JSONResponse:
    # Preserve stack locations/type for local diagnosis, without exception text,
    # request bodies, URLs/query values, source lines, or local variables.
    frames = traceback.extract_tb(exc.__traceback__)
    locations = " -> ".join(f"{frame.filename}:{frame.lineno}:{frame.name}" for frame in frames)
    logger.error("Unhandled %s at %s", type(exc).__name__, locations)
    return error_response(500, "internal_error", "An internal error occurred.")
