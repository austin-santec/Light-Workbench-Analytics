from datetime import UTC, timedelta
from enum import StrEnum
from typing import Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas import RunPurpose


class CompletionStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    STOPPED = "stopped"
    FAILED = "failed"


class AnalysisStatus(StrEnum):
    PENDING = "pending"
    INCLUDED = "included"
    EXCLUDED = "excluded"
    SUPERSEDED = "superseded"


class RunQuery(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    started_from: AwareDatetime
    started_before: AwareDatetime
    switch_model: str | None = Field(default=None, min_length=1, max_length=30)
    wavelength_mode: Literal["SM", "MM"] | None = None
    run_purpose: RunPurpose | None = None
    completion_status: CompletionStatus | None = None
    analysis_status: AnalysisStatus | None = None
    # This selects the existing report-service rule, not a final KPI definition.
    selection: Literal["normal_report", "all"] = "normal_report"
    limit: int = Field(default=50, ge=1, le=100, strict=True)
    offset: int = Field(default=0, ge=0, le=1000, strict=True)

    @field_validator("started_from", "started_before")
    @classmethod
    def utc(cls, value: AwareDatetime) -> AwareDatetime:
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def bounded_period(self) -> Self:
        span = self.started_before - self.started_from
        if not timedelta(0) < span <= timedelta(days=31):
            raise ValueError("A positive UTC time window of at most 31 days is required")
        return self


class RunMetadata(BaseModel):
    """Internal read model; serials are sensitive, and this is not an HTTP DTO."""

    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    run_id: int = Field(gt=0)
    assignment_id: int = Field(gt=0)
    unit_id: int = Field(gt=0)
    switch_id: int = Field(gt=0)
    main_board_serial: str = Field(repr=False)
    switch_serial: str = Field(repr=False)
    switch_model: str
    run_number: int = Field(gt=0)
    run_started_at_utc: AwareDatetime
    run_ended_at_utc: AwareDatetime | None
    wavelength_mode: Literal["SM", "MM"]
    completion_status: CompletionStatus
    run_purpose: RunPurpose
    analysis_status: AnalysisStatus
    superseded_by_run_id: int | None = Field(default=None, gt=0)
    front_panel_channel_count: int | None = Field(default=None, gt=0)
    station_number: int | None = Field(default=None, gt=0)


class RunPage(BaseModel):
    model_config = ConfigDict(frozen=True)
    items: tuple[RunMetadata, ...] = Field(repr=False)
    limit: int
    offset: int
    has_more: bool
