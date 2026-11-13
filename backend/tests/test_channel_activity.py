"""Offline channel-activity tests. No test opens a database connection."""

import re
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import PERIOD_KEYS, compute_channel_activity_boundaries
from app.reporting.models import (
    ChannelActivityCounts,
    ChannelActivityMetrics,
    ChannelActivityQuery,
)
from app.reporting.repository import (
    CHANNEL_ACTIVITY_DAILY_SQL,
    CHANNEL_ACTIVITY_PERIOD_SQL,
    build_channel_activity_queries,
    summarize_channel_activity,
)
from app.schemas import ChannelActivityConnectedResponse, ErrorResponse

EXTRACTED_AT = datetime(2026, 11, 13, 20, tzinfo=UTC)


def counts(value: int) -> ChannelActivityCounts:
    return ChannelActivityCounts(
        channels_tested=value,
        attempts=value + 1,
        units=1,
        runs=1,
        extra_candidate_attempts=2,
        excluded_unknown_boundary=3,
    )


def metrics() -> ChannelActivityMetrics:
    return ChannelActivityMetrics(
        periods={key: counts(index + 1) for index, key in enumerate(PERIOD_KEYS)},
        daily=tuple(counts(index) for index in range(31)),
        incomplete=False,
    )


class FakeChannelActivityRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_channel_activity(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error is not None:
            raise self.error
        return self.result


def test_normal_pacific_boundaries_and_30_complete_dates_plus_today():
    result = compute_channel_activity_boundaries(EXTRACTED_AT)
    assert result.extracted_at_utc == EXTRACTED_AT
    assert result.periods["today"].start_utc == datetime(2026, 11, 13, 8, tzinfo=UTC)
    assert result.periods["today"].end_utc == EXTRACTED_AT
    assert result.periods["yesterday"].start_utc == datetime(2026, 11, 12, 8, tzinfo=UTC)
    assert result.periods["last_30_days"].start_utc == datetime(2026, 10, 14, 7, tzinfo=UTC)
    assert result.periods["last_30_days"].end_utc == datetime(2026, 11, 13, 8, tzinfo=UTC)
    assert len(result.daily) == 31
    assert result.daily[0].local_date.isoformat() == "2026-10-14"
    assert result.daily[-1].local_date.isoformat() == "2026-11-13"
    assert [window.partial for window in result.daily] == [False] * 30 + [True]


@pytest.mark.parametrize(
    ("extracted_at", "transition_date", "hours"),
    [
        (datetime(2026, 3, 9, 19, tzinfo=UTC), "2026-03-08", 23),
        (datetime(2026, 11, 2, 20, tzinfo=UTC), "2026-11-01", 25),
    ],
)
def test_daily_boundaries_follow_both_dst_transitions(extracted_at, transition_date, hours):
    result = compute_channel_activity_boundaries(extracted_at)
    window = next(day for day in result.daily if day.local_date.isoformat() == transition_date)
    assert window.end_utc - window.start_utc == timedelta(hours=hours)


def test_monday_starts_a_new_week_and_sunday_uses_the_previous_monday():
    monday = compute_channel_activity_boundaries(datetime(2026, 11, 9, 20, tzinfo=UTC))
    sunday = compute_channel_activity_boundaries(datetime(2026, 11, 15, 20, tzinfo=UTC))
    expected = datetime(2026, 11, 9, 8, tzinfo=UTC)
    assert monday.periods["this_week"].start_utc == expected
    assert sunday.periods["this_week"].start_utc == expected


def test_exact_local_midnight_produces_an_empty_partial_today_window():
    midnight = datetime(2026, 11, 13, 8, tzinfo=UTC)
    result = compute_channel_activity_boundaries(midnight)
    assert result.periods["today"].start_utc == result.periods["today"].end_utc == midnight
    assert result.daily[-1].start_utc == result.daily[-1].end_utc == midnight
    assert result.daily[-1].partial is True


def test_channel_query_rejects_empty_duplicate_and_invalid_filters():
    for changes in [
        {"purposes": ()},
        {"purposes": ("production", "production")},
        {"purposes": ("unknown",)},
        {"wavelength_mode": "XX"},
        {"switch_model": "x" * 31},
    ]:
        with pytest.raises(ValidationError):
            ChannelActivityQuery(**changes)


def test_sql_is_fixed_bounded_parameterized_read_only_and_uses_exact_pair_distinct():
    injection = "DEMO' OR 1=1--"
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    query = ChannelActivityQuery(
        purposes=("production", "engineering"),
        wavelength_mode="SM",
        switch_model=injection,
    )
    period_query, daily_query = build_channel_activity_queries(query, boundaries)
    for (sql, params), windows in [(period_query, 4), (daily_query, 31)]:
        assert sql in {CHANNEL_ACTIVITY_PERIOD_SQL, CHANNEL_ACTIVITY_DAILY_SQL}
        assert injection not in sql and injection in params
        assert sql.count("?") == len(params) == windows * 3 + 10
        assert "m.written_at_utc >= w.start_utc" in sql
        assert "m.written_at_utc < w.end_utc" in sql
        assert "WHERE m.written_at_utc >= ? AND m.written_at_utc < ?" in sql
        assert "SELECT DISTINCT window_ordinal, unit_id, logical_channel" in sql
        assert "COUNT_BIG(*) AS channels_tested" in sql
        assert "CONCAT" not in sql and "+ logical_channel" not in sql
        assert "AT TIME ZONE" not in sql
        unquoted = re.sub(r"'[^']*'", "", sql)
        assert not re.search(
            r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE|INTO)\b",
            unquoted,
            re.I,
        )
    assert period_query[1][-8:] == (
        "production",
        "engineering",
        "engineering",
        "engineering",
        "SM",
        "SM",
        injection,
        injection,
    )


def test_sql_contains_every_population_a_and_exclusion_predicate():
    sql = CHANNEL_ACTIVITY_PERIOD_SQL
    for predicate in [
        "r.analysis_status NOT IN ('excluded', 'superseded')",
        "r.superseded_by_run_id IS NULL",
        "r.run_purpose IN (?, ?, ?, ?)",
        "measurement_role = 'logical_channel'",
        "front_panel_channel_count > 0",
        "logical_channel >= 1",
        "logical_channel <= front_panel_channel_count",
        "measurement_role = 'extra_candidate'",
        "physical_port > front_panel_channel_count",
        "front_panel_channel_count IS NULL",
        "logical_channel IS NULL",
    ]:
        assert predicate in sql
    assert "completion_status" not in sql
    assert "attempt_number" not in sql


def test_synthetic_population_oracle_covers_distinctness_attempts_and_exclusions():
    rows = [
        # id, date, unit, run, role, logical, physical, N, purpose, mode, model, status, pointer
        (
            1,
            1,
            10,
            100,
            "logical_channel",
            1,
            1,
            2,
            "production",
            "SM",
            "DEMO-MODEL-A",
            "included",
            None,
        ),
        (
            2,
            1,
            10,
            100,
            "logical_channel",
            1,
            1,
            2,
            "production",
            "SM",
            "DEMO-MODEL-A",
            "pending",
            None,
        ),
        (
            3,
            2,
            10,
            102,
            "logical_channel",
            1,
            1,
            2,
            "production",
            "SM",
            "DEMO-MODEL-A",
            "included",
            None,
        ),
        (
            4,
            2,
            10,
            102,
            "logical_channel",
            2,
            2,
            None,
            "production",
            "SM",
            "DEMO-MODEL-A",
            "included",
            None,
        ),
        (
            5,
            2,
            10,
            102,
            "logical_channel",
            3,
            3,
            2,
            "production",
            "SM",
            "DEMO-MODEL-A",
            "included",
            None,
        ),
        (
            6,
            2,
            10,
            102,
            "extra_candidate",
            None,
            3,
            2,
            "production",
            "SM",
            "DEMO-MODEL-A",
            "included",
            None,
        ),
        (
            7,
            2,
            10,
            103,
            "logical_channel",
            2,
            2,
            2,
            "production",
            "SM",
            "DEMO-MODEL-A",
            "excluded",
            None,
        ),
        (
            8,
            2,
            10,
            104,
            "logical_channel",
            2,
            2,
            2,
            "production",
            "SM",
            "DEMO-MODEL-A",
            "included",
            999,
        ),
        (
            9,
            2,
            11,
            105,
            "logical_channel",
            1,
            1,
            2,
            "engineering",
            "MM",
            "DEMO-MODEL-B",
            "included",
            None,
        ),
    ]

    def aggregate(selected, dates=(1, 2), mode=None, model=None):
        eligible = [
            row
            for row in rows
            if row[1] in dates
            and row[8] in selected
            and row[11] not in {"excluded", "superseded"}
            and row[12] is None
            and (mode is None or row[9] == mode)
            and (model is None or row[10] == model)
        ]
        valid = [
            row
            for row in eligible
            if row[4] == "logical_channel" and row[7] and row[5] and 1 <= row[5] <= row[7]
        ]
        return {
            "channels": len({(row[2], row[5]) for row in valid}),
            "attempts": len({row[0] for row in valid}),
            "units": len({row[2] for row in valid}),
            "runs": len({row[3] for row in valid}),
            "extras": len(
                {
                    row[0]
                    for row in eligible
                    if row[4] == "extra_candidate" and row[7] and row[6] > row[7]
                }
            ),
            "excluded": len(
                {
                    row[0]
                    for row in eligible
                    if row[4] == "logical_channel"
                    and (not row[7] or not row[5] or row[5] < 1 or row[5] > row[7])
                }
            ),
        }

    assert aggregate({"production"}) == {
        "channels": 1,
        "attempts": 3,
        "units": 1,
        "runs": 2,
        "extras": 1,
        "excluded": 2,
    }
    assert aggregate({"production"}, dates=(1,))["channels"] == 1
    assert aggregate({"production"}, dates=(2,))["channels"] == 1
    assert aggregate({"production", "engineering"})["channels"] == 2
    assert aggregate({"engineering"}, mode="MM", model="DEMO-MODEL-B")["channels"] == 1
    assert aggregate({"engineering"}, mode="SM")["channels"] == 0


def test_result_rows_are_strict_and_period_totals_are_independent_of_daily_rows():
    period_rows = [(index, 10 + index, 20, 3, 4, 5, 6) for index in range(4)]
    daily_rows = [(index, 10, 20, 3, 4, 5, 6) for index in range(31)]
    result = summarize_channel_activity(period_rows, daily_rows)
    assert result.periods["last_30_days"].channels_tested == 13
    assert sum(day.channels_tested for day in result.daily[:30]) == 300
    for invalid in [period_rows[:-1], [(*period_rows[0][:-1], -1), *period_rows[1:]]]:
        with pytest.raises(ReportingError, match="schema_incompatible"):
            summarize_channel_activity(invalid, daily_rows)


def test_channel_activity_disabled_returns_only_not_connected(client):
    response = client.get("/api/v1/reporting/channel-activity")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}


def test_channel_activity_connected_contract_and_repeated_purposes(application):
    fake = FakeChannelActivityRepository(metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/channel-activity",
            params=[
                ("purpose", "production"),
                ("purpose", "engineering"),
                ("wavelength_mode", "SM"),
                ("switch_model", "DEMO-MODEL-A"),
            ],
        )
    assert response.status_code == 200
    result = ChannelActivityConnectedResponse.model_validate(response.json())
    assert result.timezone == "America/Los_Angeles"
    assert result.filters.purpose == ["production", "engineering"]
    assert result.periods["today"].partial is True
    assert result.periods["last_30_days"].partial is False
    assert len(result.daily) == 31 and result.daily[-1].partial is True
    query, boundaries = fake.calls[0]
    assert query.purposes == ("production", "engineering")
    assert boundaries.extracted_at_utc == EXTRACTED_AT


@pytest.mark.parametrize(
    "params",
    [
        [("purpose", "production"), ("purpose", "production")],
        {"purpose": "unknown"},
        {"wavelength_mode": "XX"},
        {"switch_model": "x" * 31},
        {"unknown": "DEMO"},
    ],
)
def test_channel_activity_validation_is_sanitized(client, params):
    response = client.get("/api/v1/reporting/channel-activity", params=params)
    assert response.status_code == 422
    assert ErrorResponse.model_validate(response.json()).error.code == "validation_error"
    assert "DEMO" not in response.text


def test_channel_activity_failure_is_exact_sanitized_503(application):
    fake = FakeChannelActivityRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "encrypted_unverified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/channel-activity")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}
    assert "encrypted_unverified" not in response.text
