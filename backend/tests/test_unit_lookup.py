"""Offline unit lookup tests. No test opens a database connection."""

import json
import re
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.unit_lookup import (
    ANALYSES_SQL,
    ASSIGNMENT_SQL,
    CHANNEL_MAP_SQL,
    EXTRA_PORTS_SQL,
    HARDWARE_LIST_CAP,
    REPLACEMENTS_SQL,
    RUN_CHANNEL_ROW_CAP,
    RUN_CHANNELS_SQL,
    RUN_SQL,
    SEARCH_UNITS_SQL,
    SPARES_SQL,
    UNIT_ASSIGNMENTS_SQL,
    UNIT_RUN_CAP,
    UNIT_RUNS_SQL,
    UNIT_SEARCH_LIMIT,
    UNIT_SQL,
    build_recommendations_query,
    classify_losses,
    escape_like,
    get_assignment_hardware,
    get_run_channels,
    get_unit_detail,
    parse_limit_snapshot,
    search_units,
)
from app.schemas import ChannelAttempt


def limit_json(**changes):
    values = {
        "model": "OSX-150",
        "profile_name": "DEMO profile",
        "revision": "DEMO-1",
        "too_good_below_db": 0.5,
        "warning_enabled": True,
        "warning_above_db": 2.25,
        "fail_above_db": 2.5,
        "wavelength_mode": "SM",
        "minimum_replacement_improvement_db": 0.2,
    }
    return json.dumps(values | changes)


class ScriptedCursor:
    def __init__(self, results):
        self.results = results
        self.calls = []
        self.current = []

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        result = self.results.get(sql, [])
        self.current = result(params) if callable(result) else result
        return self

    def fetchone(self):
        return self.current[0] if self.current else None

    def fetchmany(self, count):
        return self.current[:count]


def unit_run_row(run_id=1, *, snapshot=None):
    return (
        run_id,
        2,
        run_id,
        datetime(2026, 11, 1, 12),
        datetime(2026, 11, 1, 13),
        "DEMO operator",
        4,
        "SM",
        "DEMO band",
        48,
        "DEMO-PART",
        "DEMO-APP",
        "complete",
        "production",
        "included",
        None,
        None,
        limit_json() if snapshot is None else snapshot,
        "confirmed",
        1_000,
        2_000,
        1_000,
        1,
        1,
        0,
        1,
        0,
    )


def test_search_escapes_like_metacharacters_and_caps_at_twenty():
    text = "DEMO%_[~"
    pattern = escape_like(text)
    assert pattern == "%DEMO~%~_~[~~%"
    rows = [
        (
            index,
            f"DEMO-UNIT-{index:04d}",
            None,
            None,
            None,
            None,
            datetime(2026, 11, 1, 12),
            1,
        )
        for index in range(1, UNIT_SEARCH_LIMIT + 2)
    ]
    cursor = ScriptedCursor({SEARCH_UNITS_SQL: rows})
    result = search_units(cursor, text)
    assert len(result["items"]) == UNIT_SEARCH_LIMIT
    assert result["has_more"] is True
    assert cursor.calls == [(SEARCH_UNITS_SQL, (pattern, pattern))]
    assert SEARCH_UNITS_SQL.count("?") == 2
    assert "TOP (21)" in SEARCH_UNITS_SQL and "ESCAPE '~'" in SEARCH_UNITS_SQL


def test_unit_unknown_and_run_cap_with_strict_limit_parsing():
    assert get_unit_detail(ScriptedCursor({UNIT_SQL: []}), 404) is None
    cursor = ScriptedCursor(
        {
            UNIT_SQL: [
                (
                    1,
                    "DEMO-UNIT-0001",
                    "DEMO-PART",
                    "DEMO-MODEL",
                    48,
                    datetime(2026, 1, 1),
                    datetime(2026, 1, 2),
                )
            ],
            UNIT_ASSIGNMENTS_SQL: [],
            UNIT_RUNS_SQL: [unit_run_row(index) for index in range(1, UNIT_RUN_CAP + 2)],
        }
    )
    result = get_unit_detail(cursor, 1)
    assert len(result["runs"]) == UNIT_RUN_CAP
    assert result["has_more"] is True
    assert result["runs"][0]["limits"] == {
        "model": "OSX-150",
        "wavelength_mode": "SM",
        "too_good_below_db": Decimal("0.5000"),
        "warning_enabled": True,
        "warning_above_db": Decimal("2.2500"),
        "fail_above_db": Decimal("2.5000"),
    }


@pytest.mark.parametrize(
    "raw",
    [None, "{bad json", "[]", "{}", limit_json(model="unknown"), limit_json(revision="")],
)
def test_missing_or_malformed_limits_are_null(raw):
    assert parse_limit_snapshot(raw, "SM") is None


def test_source_classification_semantics_include_exact_boundaries():
    limits = parse_limit_snapshot(limit_json(), "SM")
    assert classify_losses(Decimal("2.2500"), Decimal("1.0000"), limits) == "pass"
    assert classify_losses(Decimal("2.2501"), Decimal("1.0000"), limits) == "warning"
    assert classify_losses(Decimal("2.5000"), Decimal("1.0000"), limits) == "warning"
    assert classify_losses(Decimal("2.5001"), Decimal("1.0000"), limits) == "fail"
    assert classify_losses(Decimal("0.4999"), Decimal("1.0000"), limits) == "too_good"
    assert classify_losses(Decimal("1.0000"), Decimal("1.0000"), None) == "unknown"


def test_loss_decimals_serialize_as_json_numbers_at_four_decimal_precision():
    attempt = ChannelAttempt(
        measurement_id=1,
        logical_channel=1,
        physical_port=1,
        attempt_number=1,
        wavelength_1_nm=1310,
        wavelength_1_il_db=Decimal("1.23456"),
        wavelength_2_nm=1550,
        wavelength_2_il_db=Decimal("2.0000"),
        written_at_utc="2026-11-01T00:00:00Z",
        written_by="DEMO operator",
        is_current=True,
        classification="pass",
        classification_rule="strict >, run limit snapshot",
    )
    payload = json.loads(attempt.model_dump_json())
    assert payload["wavelength_1_il_db"] == 1.2346
    assert payload["wavelength_2_il_db"] == 2.0
    assert isinstance(payload["wavelength_1_il_db"], float)


def test_channel_attempts_preserve_order_and_mark_only_view_choice_current():
    rows = [
        (
            10,
            1,
            1,
            1,
            1310,
            Decimal("2.5000"),
            1550,
            Decimal("1.0000"),
            datetime(2026, 11, 1, 12),
            "DEMO operator",
            0,
            "logical_channel",
        ),
        (
            11,
            1,
            1,
            2,
            1310,
            Decimal("2.5001"),
            1550,
            Decimal("1.0000"),
            datetime(2026, 11, 1, 13),
            "DEMO operator",
            1,
            "logical_channel",
        ),
        (
            12,
            None,
            49,
            1,
            1310,
            Decimal("1.0000"),
            1550,
            Decimal("1.0000"),
            datetime(2026, 11, 1, 14),
            "DEMO operator",
            1,
            "extra_candidate",
        ),
    ]
    cursor = ScriptedCursor(
        {
            RUN_SQL: [(7, "SM", limit_json())],
            RUN_CHANNELS_SQL: rows,
        }
    )
    result = get_run_channels(cursor, 7)
    assert [item["attempt_number"] for item in result["logical_channels"]] == [1, 2]
    assert [item["is_current"] for item in result["logical_channels"]] == [False, True]
    assert result["logical_channels"][0]["classification"] is None
    assert result["logical_channels"][1]["classification"] == "fail"
    assert result["extra_candidates"][0]["classification"] == "pass"
    assert cursor.calls[-1][1] == (7, "logical_channel", "extra_candidate")
    assert "ORDER BY CASE" in RUN_CHANNELS_SQL and "measurement.attempt_number" in RUN_CHANNELS_SQL


def test_channel_cap_sets_incomplete():
    row = (
        1,
        1,
        1,
        1,
        1310,
        Decimal("1.0000"),
        1550,
        Decimal("1.0000"),
        datetime(2026, 11, 1),
        "DEMO operator",
        1,
        "logical_channel",
    )
    rows = [((index,) + row[1:]) for index in range(1, RUN_CHANNEL_ROW_CAP + 2)]
    result = get_run_channels(
        ScriptedCursor({RUN_SQL: [(1, "SM", limit_json())], RUN_CHANNELS_SQL: rows}), 1
    )
    assert result["incomplete"] is True
    assert len(result["logical_channels"]) == RUN_CHANNEL_ROW_CAP


def hardware_results(*, channel_rows=None):
    recommendation_sql, _ = build_recommendations_query((100,))
    return {
        ASSIGNMENT_SQL: [(9,)],
        CHANNEL_MAP_SQL: channel_rows
        if channel_rows is not None
        else [(1, 1, 51, 1, datetime(2026, 11, 2))],
        REPLACEMENTS_SQL: [
            (
                20,
                1,
                1,
                51,
                "DEMO reason",
                "DEMO operator",
                datetime(2026, 11, 2),
                7,
                200,
                "DEMO notes",
            )
        ],
        EXTRA_PORTS_SQL: [
            (
                52,
                1310,
                Decimal("1.1000"),
                1550,
                Decimal("1.2000"),
                2,
                7,
                datetime(2026, 11, 3),
                "included",
            )
        ],
        # SQL already projects the latest event per port.
        SPARES_SQL: [(30, 52, "undesignated", "DEMO operator", datetime(2026, 11, 4))],
        ANALYSES_SQL: [(100, 7, datetime(2026, 11, 5), "DEMO operator", "optimized")],
        recommendation_sql: [
            (
                200,
                100,
                1,
                "required",
                1,
                1,
                51,
                Decimal("2.6000"),
                Decimal("2.5000"),
                Decimal("1.1000"),
                Decimal("1.2000"),
                Decimal("2.6000"),
                Decimal("1.2000"),
                Decimal("1.4000"),
                1,
            ),
            (
                201,
                100,
                2,
                "optional",
                2,
                2,
                52,
                Decimal("2.0000"),
                Decimal("2.0000"),
                Decimal("1.0000"),
                Decimal("1.0000"),
                Decimal("2.0000"),
                Decimal("1.0000"),
                Decimal("1.0000"),
                0,
            ),
        ],
    }


def test_hardware_used_flags_latest_spare_and_decimal_values():
    result = get_assignment_hardware(ScriptedCursor(hardware_results()), 9)
    recommendations = result["analyses"][0]["recommendations"]
    assert [item["used"] for item in recommendations] == [True, False]
    assert result["spares"] == [
        {
            "spare_event_id": 30,
            "physical_port": 52,
            "action": "undesignated",
            "recorded_by": "DEMO operator",
            "recorded_at_utc": datetime(2026, 11, 4, tzinfo=UTC),
        }
    ]
    assert recommendations[0]["improvement_db"] == Decimal("1.4000")
    assert "PARTITION BY spare.physical_port" in SPARES_SQL
    assert "spare.recorded_at_utc DESC, spare.spare_event_id DESC" in SPARES_SQL


def test_hardware_caps_set_one_incomplete_flag():
    rows = [(index, index, index, 0, None) for index in range(1, HARDWARE_LIST_CAP + 2)]
    result = get_assignment_hardware(ScriptedCursor(hardware_results(channel_rows=rows)), 9)
    assert result["incomplete"] is True
    assert len(result["channel_map"]) == HARDWARE_LIST_CAP


def test_every_lookup_statement_is_fixed_read_only_and_explicitly_projected():
    recommendation_sql, params = build_recommendations_query((100, 101))
    assert params == (100, 101)
    assert recommendation_sql.count("?") == 2
    for sql in (
        SEARCH_UNITS_SQL,
        UNIT_SQL,
        UNIT_ASSIGNMENTS_SQL,
        UNIT_RUNS_SQL,
        RUN_SQL,
        RUN_CHANNELS_SQL,
        ASSIGNMENT_SQL,
        CHANNEL_MAP_SQL,
        REPLACEMENTS_SQL,
        EXTRA_PORTS_SQL,
        SPARES_SQL,
        ANALYSES_SQL,
        recommendation_sql,
    ):
        assert sql.lstrip().startswith("SELECT")
        unquoted = re.sub(r"'(?:''|[^'])*'", "''", sql)
        assert not re.search(
            r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE)\b",
            unquoted,
            re.I,
        )
        assert not re.search(r"SELECT\s+\*|\bINTO\b", unquoted, re.I)


class FakeLookupRepository:
    def __init__(self, *, error=None):
        self.error = error
        self.search_text = None

    def _result(self):
        if self.error:
            raise self.error
        return None

    def search_units(self, text):
        if self.error:
            raise self.error
        self.search_text = text
        return {"items": [], "has_more": False}

    def get_unit_detail(self, _unit_id):
        return self._result()

    def get_run_channels(self, _run_id):
        return self._result()

    def get_assignment_hardware(self, _assignment_id):
        return self._result()


@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/units/search?q=DEMO",
        "/api/v1/units/1",
        "/api/v1/runs/1/channels",
        "/api/v1/assignments/1/hardware",
    ],
)
def test_all_lookup_routes_are_not_connected_by_default(client, url):
    response = client.get(url)
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}


@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/units/search?q=DEMO",
        "/api/v1/units/1",
        "/api/v1/runs/1/channels",
        "/api/v1/assignments/1/hardware",
    ],
)
def test_all_lookup_failures_are_exact_sanitized_503(application, url):
    repository = FakeLookupRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        repository=repository, tls="verified"
    )
    with TestClient(application) as client:
        response = client.get(url)
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}


@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/units/999",
        "/api/v1/runs/999/channels",
        "/api/v1/assignments/999/hardware",
    ],
)
def test_connected_unknown_lookup_resources_use_standard_404(application, url):
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        repository=FakeLookupRepository(), tls="verified"
    )
    with TestClient(application) as client:
        response = client.get(url)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize("value", ["x", "x" * 101])
def test_search_validation_does_not_echo_input(client, value):
    response = client.get("/api/v1/units/search", params={"q": value})
    assert response.status_code == 422
    assert value not in response.text


def test_search_trims_before_length_validation(client):
    response = client.get("/api/v1/units/search", params={"q": " "})
    assert response.status_code == 422


def test_search_passes_trimmed_text_to_repository(application):
    repository = FakeLookupRepository()
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        repository=repository, tls="verified"
    )
    with TestClient(application) as client:
        response = client.get("/api/v1/units/search", params={"q": "  DEMO  "})
    assert response.status_code == 200
    assert response.json() == {
        "data_source": "test_database",
        "tls": "verified",
        "items": [],
        "has_more": False,
    }
    assert repository.search_text == "DEMO"
