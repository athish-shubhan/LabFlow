import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("labflow")


class FieldValidationError(Exception):
    """A 422 raised from route logic, rendered in the same shape as Pydantic's."""

    def __init__(self, field: str, message: str, location: str = "body"):
        self.field = field
        self.message = message
        self.location = location


def _validation_response(errors: list[dict]) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": "Request validation failed", "errors": errors},
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def handle_request_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = []
        for err in exc.errors():
            location, *path = err["loc"] or ("body",)
            message = err["msg"].removeprefix("Value error, ")
            errors.append({"location": location, "field": ".".join(str(p) for p in path), "message": message})
        return _validation_response(errors)

    @app.exception_handler(FieldValidationError)
    async def handle_field_validation(_: Request, exc: FieldValidationError) -> JSONResponse:
        return _validation_response([{"location": exc.location, "field": exc.field, "message": exc.message}])

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
