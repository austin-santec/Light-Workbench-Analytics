"""Transport models, deliberately independent of frontend presentation contracts."""

from datetime import UTC
from enum import StrEnum
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class HealthResponse(BaseModel):
    status: Literal["alive"] = "alive"
    scope: Literal["process_only"] = "process_only"


class SystemInfo(BaseModel):
    service: str
    service_version: str
    api_version: Literal["v1"] = "v1"
    environment: Literal["development", "test"]
    stage: Literal["development_foundation"] = "development_foundation"
    data_source: Literal["not_connected"] = "not_connected"


class RunPurpose(StrEnum):
    PRODUCTION = "production"
    ENGINEERING = "engineering"
    TRAINING = "training"
    CALIBRATION = "calibration"


class DemoModel(StrEnum):
    A = "DEMO-MODEL-A"
    B = "DEMO-MODEL-B"


class DemoRun(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str = Field(pattern=r"^DEMO-RUN-\d{4}$")
    unit_id: str = Field(pattern=r"^DEMO-UNIT-\d{4}$")
    switch_id: str = Field(pattern=r"^DEMO-SWITCH-\d{4}$")
    model: DemoModel
    purpose: RunPurpose
    started_at: AwareDatetime

    @field_validator("started_at")
    @classmethod
    def normalize_utc(cls, value: AwareDatetime) -> AwareDatetime:
        return value.astimezone(UTC)


class DemoRunQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purpose: RunPurpose | None = None
    model: DemoModel | None = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=10000)


class Pagination(BaseModel):
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0, le=10000)
    total: int = Field(ge=0)
    has_more: bool


class DemoRunsResponse(BaseModel):
    synthetic: Literal[True] = True
    items: list[DemoRun]
    pagination: Pagination


class ErrorDetail(BaseModel):
    field: str
    code: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorBody
