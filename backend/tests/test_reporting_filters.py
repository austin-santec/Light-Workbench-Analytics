from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.api import _reporting_filter_echo
from app.reporting.channel_activity import compute_channel_activity_boundaries
from app.reporting.failure_kpis import build_failure_kpi_retest_query
from app.reporting.filters import (
    ReportingFilters,
    run_filter_parameters,
    run_filter_predicate,
    unit_matches_filters,
)
from app.reporting.models import (
    ChannelActivityQuery,
    ChannelFailuresQuery,
    FailureKpisQuery,
    FailureWavelengthsQuery,
    RecentFinishedUnitsQuery,
    StationSummaryQuery,
    UnitStatusQuery,
    UnitTestTimeQuery,
)
from app.reporting.repository import (
    build_channel_activity_queries,
    build_channel_failures_queries,
    build_failure_rate_queries,
    build_failure_wavelengths_queries,
    build_station_summary_queries,
)
from app.reporting.unit_status import filter_unit_status_projections
from app.reporting.unit_test_time import filter_finished_unit_records


def test_shared_run_filter_parameters_each_alone_combined_and_null():
    assert ReportingFilters.from_query(ChannelActivityQuery()) == ReportingFilters()
    assert run_filter_parameters(ChannelActivityQuery()) == (None,) * 8
    cases = [
        ({"switch_model": "OSX-100"}, ("OSX-100", "OSX-100", None, None, None, None, None, None)),
        ({"wavelength_mode": "SM"}, (None, None, "SM", "SM", None, None, None, None)),
        ({"channel_count": 48}, (None, None, None, None, 48, 48, None, None)),
        ({"station": 2}, (None, None, None, None, None, None, 2, 2)),
    ]
    for values, expected in cases:
        assert run_filter_parameters(ChannelActivityQuery(**values)) == expected
    combined = ChannelActivityQuery(
        switch_model="OSX-100", wavelength_mode="MM", channel_count=24, station=99
    )
    assert run_filter_parameters(combined) == (
        "OSX-100",
        "OSX-100",
        "MM",
        "MM",
        24,
        24,
        99,
        99,
    )
    predicate = run_filter_predicate()
    assert predicate.count("?") == 8
    assert "s.switch_model" in predicate
    assert "r.wavelength_mode" in predicate
    assert "r.front_panel_channel_count" in predicate
    assert "r.station_number" in predicate


def test_every_run_grain_builder_keeps_unfiltered_sql_and_binds_all_filters():
    boundaries = compute_channel_activity_boundaries(datetime(2026, 11, 24, 17, 0, tzinfo=UTC))
    default = ChannelActivityQuery()
    explicit = ChannelActivityQuery(
        switch_model=None, wavelength_mode=None, channel_count=None, station=None
    )
    assert build_channel_activity_queries(default, boundaries) == build_channel_activity_queries(
        explicit, boundaries
    )
    assert build_failure_rate_queries(default, boundaries) == build_failure_rate_queries(
        explicit, boundaries
    )

    endpoint_queries = (
        (
            build_channel_failures_queries,
            ChannelFailuresQuery(),
            ChannelFailuresQuery(
                switch_model=None, wavelength_mode=None, channel_count=None, station=None
            ),
        ),
        (
            build_failure_wavelengths_queries,
            FailureWavelengthsQuery(),
            FailureWavelengthsQuery(
                switch_model=None, wavelength_mode=None, channel_count=None, station=None
            ),
        ),
        (
            build_station_summary_queries,
            StationSummaryQuery(),
            StationSummaryQuery(
                switch_model=None, wavelength_mode=None, channel_count=None, station=None
            ),
        ),
    )
    for builder, query, explicit_query in endpoint_queries:
        assert builder(query, boundaries) == builder(explicit_query, boundaries)

    window = boundaries.periods["last_30_days"]
    assert build_failure_kpi_retest_query(FailureKpisQuery(), window) == (
        build_failure_kpi_retest_query(
            FailureKpisQuery(
                switch_model=None, wavelength_mode=None, channel_count=None, station=None
            ),
            window,
        )
    )


def test_shared_unit_filter_each_alone_combined_null_and_unfiltered_identity():
    actual = {
        "switch_model": "OSX-100",
        "wavelength_mode": "SM",
        "channel_count": 48,
        "station": 2,
    }
    for field, value in actual.items():
        assert unit_matches_filters(UnitStatusQuery(**{field: value}), **actual)
        null_actual = actual | {field: None}
        assert not unit_matches_filters(UnitStatusQuery(**{field: value}), **null_actual)
    assert unit_matches_filters(UnitStatusQuery(**actual), **actual)
    assert not unit_matches_filters(UnitStatusQuery(**actual), **(actual | {"station": 3}))
    assert unit_matches_filters(UnitStatusQuery(), **dict.fromkeys(actual))

    item = SimpleNamespace(
        switch_model=actual["switch_model"],
        wavelength_mode=actual["wavelength_mode"],
        channel_count=actual["channel_count"],
        station_number=actual["station"],
        status="passing",
        unit_id=1,
    )
    assert filter_unit_status_projections((item,), UnitStatusQuery()) == (item,)
    assert filter_unit_status_projections((item,), UnitStatusQuery(**actual)) == (item,)
    assert filter_unit_status_projections((item,), UnitStatusQuery(station=3)) == ()

    record = SimpleNamespace(unit_id=1, **{key: actual[key] for key in actual if key != "station"})
    assert filter_finished_unit_records((record,), UnitTestTimeQuery(), {}) == (record,)
    assert filter_finished_unit_records(
        (record,), UnitTestTimeQuery(**actual), {1: actual["station"]}
    ) == (record,)
    assert filter_finished_unit_records((record,), UnitTestTimeQuery(station=2), {1: None}) == ()


def test_filter_echo_always_has_exact_keys():
    query = RecentFinishedUnitsQuery(wavelength_mode="SM", channel_count=48)
    assert _reporting_filter_echo(query) == {
        "purpose": ["production"],
        "switch_model": None,
        "wavelength_mode": "SM",
        "channel_count": 48,
        "station": None,
    }


@pytest.mark.parametrize(
    "params",
    [
        {"switch_model": ""},
        {"switch_model": "X" * 31},
        {"wavelength_mode": "XX"},
        {"channel_count": 0},
        {"channel_count": 201},
        {"station": 0},
        {"unknown": "DEMO"},
    ],
)
def test_shared_filter_validation_rejections(client, params):
    assert client.get("/api/v1/reporting/unit-status", params=params).status_code == 422


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/reporting/channel-activity",
        "/api/v1/reporting/failure-rate",
        "/api/v1/reporting/channel-failures",
        "/api/v1/reporting/failure-wavelengths",
        "/api/v1/reporting/failure-kpis",
        "/api/v1/reporting/station-summary",
        "/api/v1/reporting/unit-status",
        "/api/v1/reporting/unit-test-time",
        "/api/v1/reporting/recent-finished-units",
    ],
)
def test_all_filter_endpoints_reject_unknown_params(client, path):
    assert client.get(path, params={"unexpected": "DEMO"}).status_code == 422
