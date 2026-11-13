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


class TimingQuality(StrEnum):
    CONFIRMED = "confirmed"
    CHECKPOINT_ESTIMATE = "checkpoint_estimate"
    PARTIAL = "partial"
    PROVISIONAL = "provisional"
    UNAVAILABLE = "unavailable"


class SampleState(StrEnum):
    NO_DATA = "no_data"
    SMALL_SAMPLE = "small_sample"
    OK = "ok"


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


class ChannelActivityQuery(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    purposes: tuple[RunPurpose, ...] = (RunPurpose.PRODUCTION,)
    wavelength_mode: Literal["SM", "MM"] | None = None
    switch_model: str | None = Field(default=None, min_length=1, max_length=30)

    @field_validator("purposes")
    @classmethod
    def selected_purposes(cls, value: tuple[RunPurpose, ...]) -> tuple[RunPurpose, ...]:
        if not 1 <= len(value) <= len(RunPurpose) or len(set(value)) != len(value):
            raise ValueError("One to four unique purposes are required")
        return value


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


class DurationStatistics(BaseModel):
    model_config = ConfigDict(frozen=True)

    n: int = Field(ge=0)
    mean: float | None
    median: float | None
    p90: float | None
    sample_state: SampleState


class StoppedStatistics(BaseModel):
    model_config = ConfigDict(frozen=True)

    n: int = Field(ge=0)
    mean: float | None
    sample_state: SampleState


class RunActivityMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)

    total_runs: int = Field(ge=0)
    by_run_purpose: dict[RunPurpose, int]
    by_completion_status: dict[CompletionStatus, int]
    open_runs: int = Field(ge=0)
    by_timing_quality: dict[TimingQuality, int]
    active_seconds: DurationStatistics
    elapsed_seconds: DurationStatistics
    stopped_seconds: StoppedStatistics
    flagged_over_90_min: int = Field(ge=0)
    incomplete: bool


class ConfigurationTestTime(BaseModel):
    model_config = ConfigDict(frozen=True)

    switch_model: str = Field(min_length=1, max_length=30)
    wavelength_mode: Literal["SM", "MM"]
    front_panel_channel_count: int | None = Field(default=None, gt=0)
    runs: int = Field(ge=0)
    open_runs: int = Field(ge=0)
    elapsed_seconds: DurationStatistics
    active_seconds: DurationStatistics
    confirmed_timing_runs: int = Field(ge=0)
    unavailable_timing_runs: int = Field(ge=0)
    seconds_per_channel: float | None = Field(default=None, ge=0)
    flagged_over_90_min: int = Field(ge=0)


class TestTimeByConfigurationMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)

    configurations: tuple[ConfigurationTestTime, ...]
    incomplete: bool


class ChannelActivityCounts(BaseModel):
    model_config = ConfigDict(frozen=True)

    channels_tested: int = Field(ge=0)
    attempts: int = Field(ge=0)
    units: int = Field(ge=0)
    runs: int = Field(ge=0)
    extra_candidate_attempts: int = Field(ge=0)
    excluded_unknown_boundary: int = Field(ge=0)


class ChannelActivityMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)

    periods: dict[str, ChannelActivityCounts]
    daily: tuple[ChannelActivityCounts, ...]
    incomplete: bool = False


class ReplacementActivityQuery(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    switch_model: str | None = Field(default=None, min_length=1, max_length=30)


class ReplacementActivityCounts(BaseModel):
    model_config = ConfigDict(frozen=True)

    events: int = Field(ge=0)
    channels_replaced: int = Field(ge=0)
    units: int = Field(ge=0)
    events_per_unit: float | None = Field(default=None, ge=0)
    from_recommendation: int = Field(ge=0)
    related_run_not_current: int = Field(ge=0)


class ReplacementActivityMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)

    periods: dict[str, dict[str, ReplacementActivityCounts]]
    daily: tuple[dict[str, ReplacementActivityCounts], ...]
    administrative_exclusions: int = 0
    incomplete: bool = False
