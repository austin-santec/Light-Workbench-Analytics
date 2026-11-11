from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import router
from app.core.config import Settings
from app.core.errors import register_error_handlers
from app.schemas import ErrorResponse


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings if settings is not None else Settings()
    application = FastAPI(
        title=settings.app_name,
        version=__version__,
        description=(
            "Local development API. Reporting is opt-in, aggregate-only, and disabled by default."
        ),
        redoc_url=None,
        responses={
            404: {"model": ErrorResponse},
            405: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            500: {"model": ErrorResponse},
        },
    )
    application.state.settings = settings
    register_error_handlers(application)
    if settings.cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=False,
            allow_methods=["GET"],
            allow_headers=["Accept"],
        )
    application.include_router(router)
    return application


app = create_app()
