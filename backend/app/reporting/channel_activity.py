from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from types import MappingProxyType
from zoneinfo import ZoneInfo

PACIFIC_TIMEZONE_NAME = "America/Los_Angeles"
PACIFIC_TIMEZONE = ZoneInfo(PACIFIC_TIMEZONE_NAME)
PERIOD_KEYS = ("today", "yesterday", "this_week", "last_30_days")


@dataclass(frozen=True)
class ActivityWindow:
    start_utc: datetime
    end_utc: datetime
    partial: bool
    local_date: date | None = None


@dataclass(frozen=True)
class ChannelActivityBoundaries:
    extracted_at_utc: datetime
    periods: Mapping[str, ActivityWindow]
    daily: tuple[ActivityWindow, ...]


def _local_midnight_utc(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=PACIFIC_TIMEZONE).astimezone(UTC)


def compute_channel_activity_boundaries(extracted_at: datetime) -> ChannelActivityBoundaries:
    """Return Pacific calendar windows as UTC instants for one extraction time."""
    if extracted_at.tzinfo is None or extracted_at.utcoffset() is None:
        raise ValueError("An aware extraction time is required")
    extracted_at_utc = extracted_at.astimezone(UTC)
    # SQL timestamps are DATETIME2(3); keep response and bound-query T identical.
    extracted_at_utc = extracted_at_utc.replace(
        microsecond=(extracted_at_utc.microsecond // 1000) * 1000
    )
    local_now = extracted_at_utc.astimezone(PACIFIC_TIMEZONE)
    today = local_now.date()
    today_start = _local_midnight_utc(today)
    yesterday_start = _local_midnight_utc(today - timedelta(days=1))
    week_start = _local_midnight_utc(today - timedelta(days=today.weekday()))
    last_30_start = _local_midnight_utc(today - timedelta(days=30))

    periods = MappingProxyType(
        {
            "today": ActivityWindow(today_start, extracted_at_utc, True),
            "yesterday": ActivityWindow(yesterday_start, today_start, False),
            "this_week": ActivityWindow(week_start, extracted_at_utc, True),
            "last_30_days": ActivityWindow(last_30_start, today_start, False),
        }
    )
    daily = tuple(
        ActivityWindow(
            start_utc=_local_midnight_utc(day),
            end_utc=(
                extracted_at_utc if day == today else _local_midnight_utc(day + timedelta(days=1))
            ),
            partial=day == today,
            local_date=day,
        )
        for day in (today - timedelta(days=offset) for offset in range(30, -1, -1))
    )
    return ChannelActivityBoundaries(
        extracted_at_utc=extracted_at_utc,
        periods=periods,
        daily=daily,
    )
