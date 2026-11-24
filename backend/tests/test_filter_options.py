import re
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import compute_channel_activity_boundaries
from app.reporting.filter_options import (
    FILTER_OPTION_CAP,
    FILTER_OPTIONS_SQL,
    FilterOptionsMetrics,
    build_filter_options_query,
    summarize_filter_options,
)
from app.reporting.models import FilterOptionsQuery

EXTRACTED_AT = datetime(2026, 11, 24, 17, 0, tzinfo=UTC)


def test_sql_is_one_bounded_parameterized_accepted_activity_read():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    sql, params = build_filter_options_query(
        FilterOptionsQuery(purposes=("production", "engineering")),
        boundaries.periods["last_30_days"],
    )
    window = boundaries.periods["last_30_days"]
    assert sql == FILTER_OPTIONS_SQL
    assert params == (
        window.start_utc.replace(tzinfo=None),
        window.end_utc.replace(tzinfo=None),
        "production",
        "engineering",
        "engineering",
        "engineering",
    )
    assert sql.count(f"TOP ({FILTER_OPTION_CAP + 1})") == 4
    assert sql.count("GROUP BY") == 4
    assert "m.measurement_role = 'logical_channel'" in sql
    assert "m.logical_channel <= r.front_panel_channel_count" in sql
    assert "SELECT DISTINCT r.run_id" in sql
    assert "SELECT *" not in sql.upper()
    assert not re.search(
        r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE|INTO)\b",
        re.sub(r"'(?:''|[^'])*'", "''", sql),
        re.I,
    )


def test_summary_sorts_omits_nulls_and_accepts_empty():
    rows = [
        ("station", "99"),
        ("station", "1"),
        ("channel_count", "48"),
        ("channel_count", "24"),
        ("wavelength_mode", "SM"),
        ("wavelength_mode", "MM"),
        ("switch_model", "OSX-150"),
        ("switch_model", "OSX-100"),
    ]
    result = summarize_filter_options(rows)
    assert result == FilterOptionsMetrics(
        switch_models=("OSX-100", "OSX-150"),
        wavelength_modes=("MM", "SM"),
        channel_counts=(24, 48),
        stations=(1, 99),
        incomplete=False,
    )
    assert summarize_filter_options([]) == FilterOptionsMetrics((), (), (), (), False)


def test_summary_overflow_sets_incomplete_and_caps_each_list():
    rows = [("station", str(value)) for value in range(1, FILTER_OPTION_CAP + 2)]
    result = summarize_filter_options(rows)
    assert result.incomplete is True
    assert len(result.stations) == FILTER_OPTION_CAP
    assert list(result.stations) == sorted(result.stations)


class FakeRepository:
    def __init__(self, result=None, error: ReportingError | None = None):
        self.result = result
        self.error = error
        self.query = None

    def get_filter_options(self, query, boundaries):
        self.query = query
        if self.error is not None:
            raise self.error
        return self.result


def test_endpoint_not_connected_connected_validation_and_sanitized_503(client, application):
    response = client.get("/api/v1/reporting/filter-options")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}

    metrics = FilterOptionsMetrics(("OSX-100",), ("MM", "SM"), (24, 48), (1, 99), False)
    fake = FakeRepository(metrics)
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "encrypted_unverified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as connected:
        response = connected.get(
            "/api/v1/reporting/filter-options",
            params=[("purpose", "production"), ("purpose", "engineering")],
        )
        assert (
            connected.get(
                "/api/v1/reporting/filter-options", params={"unknown": "DEMO"}
            ).status_code
            == 422
        )
        assert (
            connected.get(
                "/api/v1/reporting/filter-options",
                params=[("purpose", "production"), ("purpose", "production")],
            ).status_code
            == 422
        )
    assert response.status_code == 200
    body = response.json()
    assert body["filters"] == {"purpose": ["production", "engineering"]}
    assert body["period"]["key"] == "last_30_days"
    assert body["switch_models"] == ["OSX-100"]
    assert body["wavelength_modes"] == ["MM", "SM"]
    assert body["channel_counts"] == [24, 48]
    assert body["stations"] == [1, 99]
    assert body["incomplete"] is False

    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        FakeRepository(error=ReportingError("query_failed")), "verified"
    )
    with TestClient(application) as failed:
        failure = failed.get("/api/v1/reporting/filter-options")
    assert failure.status_code == 503
    assert failure.json() == {"code": "query_failed"}
