from typing import Annotated, Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Host = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$")]
Database = Annotated[str, Field(pattern=r"^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$")]


class ReportingSettings(BaseSettings):
    # Environment only: never read the production application's settings or a DSN.
    model_config = SettingsConfigDict(
        env_prefix="LWA_REPORTING_", extra="forbid", frozen=True, hide_input_in_errors=True
    )

    enabled: bool = False
    target_kind: Literal["nonproduction"] | None = None
    identity_kind: Literal["dedicated_readonly"] | None = None
    approval_reference: str | None = Field(default=None, min_length=1, max_length=100, repr=False)
    server: Host | None = Field(default=None, repr=False)
    port: int = Field(default=1433, ge=1, le=65535, repr=False)
    database: Database | None = Field(default=None, repr=False)
    approved_server: Host | None = Field(default=None, repr=False)
    approved_port: int | None = Field(default=None, ge=1, le=65535, repr=False)
    approved_database: Database | None = Field(default=None, repr=False)
    authentication: Literal["windows", "sql"] = "windows"
    username: SecretStr | None = Field(default=None, repr=False)
    password: SecretStr | None = Field(default=None, repr=False)
    trust_server_certificate: bool = False
    connection_timeout_seconds: int = Field(default=5, ge=1, le=15)
    query_timeout_seconds: int = Field(default=10, ge=1, le=30)

    @model_validator(mode="after")
    def require_explicit_approval(self) -> Self:
        if self.trust_server_certificate and self.target_kind != "nonproduction":
            raise ValueError(
                "Trusting the server certificate requires a declared non-production target"
            )
        if self.authentication == "windows" and (self.username or self.password):
            raise ValueError("Windows authentication must not supply SQL credentials")
        if self.authentication == "sql" and not all(
            value is not None and value.get_secret_value().strip()
            for value in (self.username, self.password)
        ):
            raise ValueError("SQL authentication requires explicit credentials")
        if self.enabled:
            if not all(
                (
                    self.target_kind,
                    self.identity_kind,
                    self.approval_reference and self.approval_reference.strip(),
                    self.server,
                    self.database,
                    self.approved_server,
                    self.approved_port,
                    self.approved_database,
                )
            ):
                raise ValueError("Reporting requires an explicitly approved non-production target")
            if (
                self.server.casefold() != self.approved_server.casefold()
                or self.port != self.approved_port
                or self.database != self.approved_database
            ):
                raise ValueError("Configured target does not match the approved target")
        return self
