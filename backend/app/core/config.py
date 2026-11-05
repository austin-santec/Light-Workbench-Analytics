from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="LWA_", env_file=".env", env_file_encoding="utf-8", extra="forbid"
    )

    app_name: str = Field(
        default="Light Workbench Analytics API",
        min_length=1,
        max_length=80,
        pattern=r"^[A-Za-z0-9 ._-]+$",
    )
    environment: Literal["development", "test"] = "development"
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"
    host: Literal["127.0.0.1", "::1"] = "127.0.0.1"
    port: int = Field(default=8000, ge=1024, le=65535)
    cors_origins: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("cors_origins")
    @classmethod
    def explicit_local_origins(cls, origins: list[str]) -> list[str]:
        for origin in origins:
            url = urlsplit(origin)
            if (
                url.scheme not in {"http", "https"}
                or url.hostname not in {"localhost", "127.0.0.1", "::1"}
                or url.username is not None
                or url.password is not None
                or url.path
                or url.query
                or url.fragment
                or url.port is None
            ):
                raise ValueError("CORS origins must be explicit loopback origins with ports")
        return list(dict.fromkeys(origins))
