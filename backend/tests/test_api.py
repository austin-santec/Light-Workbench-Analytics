import logging

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import __version__
from app.api import ReportingAccess, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.models import (
    ConfigurationTestTime,
    DurationStatistics,
    RunActivityMetrics,
    SampleState,
    StoppedStatistics,
    TimingQuality,
)
from app.reporting.models import (
    TestTimeByConfigurationMetrics as ConfigurationTimingMetrics,
)
from app.schemas import (
    DemoRun,
    DemoRunsResponse,
    ErrorResponse,
    HealthResponse,
    RunActivityConnectedResponse,
    SystemInfo,
)
from app.schemas import (
    TestTimeByConfigurationConnectedResponse as ConfigurationTimingResponse,
)


class FakeActivityRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.queries = []

    def get_run_activity(self, query):
        self.queries.append(query)
        if self.error is not None:
            raise self.error
        return self.result

    def get_test_time_by_configuration(self, query):
        self.queries.append(query)
        if self.error is not None:
            raise self.error
        return self.result


def activity_metrics():
    return RunActivityMetrics(
        total_runs=3,
        by_run_purpose={
            purpose: int(purpose == "engineering") * 3
            for purpose in ["production", "engineering", "training", "calibration"]
        },
        by_completion_status={
            "in_progress": 1,
            "complete": 2,
            "stopped": 0,
            "failed": 0,
        },
        open_runs=1,
        by_timing_quality={
            quality: int(quality == TimingQuality.CONFIRMED) * 2 for quality in TimingQuality
        },
        active_seconds=DurationStatistics(
            n=2, mean=15, median=15, p90=20, sample_state=SampleState.SMALL_SAMPLE
        ),
        elapsed_seconds=DurationStatistics(
            n=2, mean=30, median=30, p90=40, sample_state=SampleState.SMALL_SAMPLE
        ),
        stopped_seconds=StoppedStatistics(n=2, mean=15, sample_state=SampleState.SMALL_SAMPLE),
        flagged_over_90_min=0,
        incomplete=False,
    )


def configuration_metrics():
    statistics = DurationStatistics(
        n=2, mean=30, median=30, p90=40, sample_state=SampleState.SMALL_SAMPLE
    )
    return ConfigurationTimingMetrics(
        incomplete=False,
        configurations=(
            ConfigurationTestTime(
                switch_model="OSX-150",
                wavelength_mode="SM",
                front_panel_channel_count=48,
                runs=2,
                open_runs=1,
                elapsed_seconds=statistics,
                active_seconds=statistics,
                confirmed_timing_runs=2,
                unavailable_timing_runs=0,
                seconds_per_channel=0.625,
                flagged_over_90_min=0,
            ),
        ),
    )


def test_startup_health_and_system_info(client):
    health = client.get("/api/v1/health/live")
    assert health.status_code == 200
    assert HealthResponse.model_validate(health.json()).scope == "process_only"
    info = client.get("/api/v1/system/info")
    assert info.status_code == 200
    model = SystemInfo.model_validate(info.json())
    assert model.service_version == __version__
    assert model.environment == "test"
    assert model.stage == "development_foundation"
    assert model.data_source == "not_connected"
    assert set(info.json()) == {
        "service",
        "service_version",
        "api_version",
        "environment",
        "stage",
        "data_source",
    }


def test_demo_is_deterministic_typed_and_separate_from_units(client):
    response = client.get("/api/v1/demo/runs")
    assert response.status_code == 200
    assert response.json() == client.get("/api/v1/demo/runs").json()
    model = DemoRunsResponse.model_validate(response.json())
    assert model.synthetic is True
    assert len(model.items) == model.pagination.total == 6
    assert len({run.unit_id for run in model.items}) < len(model.items)
    assert all(run.run_id.startswith("DEMO-") for run in model.items)
    assert all(item["started_at"].endswith("Z") for item in response.json()["items"])
    assert [run.started_at for run in model.items] == sorted(
        (run.started_at for run in model.items), reverse=True
    )


def test_filter_before_pagination_and_intersection(client):
    result = client.get(
        "/api/v1/demo/runs",
        params={"purpose": "production", "model": "DEMO-MODEL-A", "limit": 1, "offset": 1},
    ).json()
    assert result["pagination"] == {"limit": 1, "offset": 1, "total": 2, "has_more": False}
    assert [run["run_id"] for run in result["items"]] == ["DEMO-RUN-0004"]
    empty = client.get(
        "/api/v1/demo/runs", params={"purpose": "calibration", "model": "DEMO-MODEL-A"}
    ).json()
    assert empty["items"] == []
    assert empty["pagination"]["total"] == 0


@pytest.mark.parametrize(
    ("query", "count", "has_more"),
    [
        ({"limit": 1}, 1, True),
        ({"limit": 100}, 6, False),
        ({"offset": 6}, 0, False),
        ({"offset": 10000}, 0, False),
        ({"limit": 2, "offset": 4}, 2, False),
    ],
)
def test_pagination_boundaries(client, query, count, has_more):
    response = client.get("/api/v1/demo/runs", params=query)
    assert response.status_code == 200
    result = DemoRunsResponse.model_validate(response.json())
    assert len(result.items) == count
    assert result.pagination.total == 6
    assert result.pagination.has_more is has_more


@pytest.mark.parametrize(
    "query",
    [
        {"limit": 0},
        {"limit": 101},
        {"limit": "one"},
        {"limit": "1.5"},
        {"offset": -1},
        {"offset": 10001},
        {"offset": "no"},
        {"purpose": "unknown"},
        {"model": "real-model"},
        {"unrecognized": "example"},
    ],
)
def test_invalid_parameters_have_consistent_errors(client, query):
    response = client.get("/api/v1/demo/runs", params=query)
    assert response.status_code == 422
    error = ErrorResponse.model_validate(response.json()).error
    assert error.code == "validation_error"
    assert error.details
    assert error.details[0].field.startswith("query.")
    assert all(set(detail) == {"field", "code"} for detail in response.json()["error"]["details"])


def test_run_activity_disabled_or_not_configured_returns_only_not_connected(client, monkeypatch):
    params = {
        "started_from": "2026-11-01T00:00:00Z",
        "started_before": "2026-11-02T00:00:00Z",
    }
    assert client.get("/api/v1/reporting/run-activity", params=params).json() == {
        "data_source": "not_connected"
    }
    monkeypatch.setenv("LWA_REPORTING_ENABLED", "true")
    assert client.get("/api/v1/reporting/run-activity", params=params).json() == {
        "data_source": "not_connected"
    }


@pytest.mark.parametrize(
    "params",
    [
        {"started_from": "2026-11-01T00:00:00", "started_before": "2026-11-02T00:00:00Z"},
        {"started_from": "2026-11-02T00:00:00Z", "started_before": "2026-11-01T00:00:00Z"},
        {"started_from": "2026-11-01T00:00:00Z", "started_before": "2026-12-03T00:00:00Z"},
        {
            "started_from": "2026-11-01T00:00:00Z",
            "started_before": "2026-11-02T00:00:00Z",
            "wavelength_mode": "XX",
        },
        {
            "started_from": "2026-11-01T00:00:00Z",
            "started_before": "2026-11-02T00:00:00Z",
            "purpose": "unknown",
        },
        {
            "started_from": "2026-11-01T00:00:00Z",
            "started_before": "2026-11-02T00:00:00Z",
            "switch_model": "x" * 31,
        },
    ],
)
def test_run_activity_window_and_filters_are_sanitized_422(client, params):
    response = client.get("/api/v1/reporting/run-activity", params=params)
    assert response.status_code == 422
    assert ErrorResponse.model_validate(response.json()).error.code == "validation_error"
    assert not any(str(value) in response.text for value in params.values())


def test_run_activity_connected_contract_echoes_utc_filters_and_only_aggregates(application):
    fake = FakeActivityRepository(activity_metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        repository=fake, tls="verified"
    )
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/run-activity",
            params={
                "started_from": "2026-11-01T01:00:00+01:00",
                "started_before": "2026-11-02T01:00:00+01:00",
                "purpose": "engineering",
                "wavelength_mode": "SM",
                "switch_model": "DEMO-MODEL-A",
            },
        )
    assert response.status_code == 200
    result = RunActivityConnectedResponse.model_validate(response.json())
    assert result.data_source == "test_database" and result.tls == "verified"
    assert response.json()["window"] == {
        "started_from": "2026-11-01T00:00:00Z",
        "started_before": "2026-11-02T00:00:00Z",
    }
    assert response.json()["filters"] == {
        "purpose": "engineering",
        "wavelength_mode": "SM",
        "switch_model": "DEMO-MODEL-A",
    }
    assert result.runs.count_basis == "runs_started_in_window_not_units"
    assert result.runs.total == 3 and result.timing.open_runs == 1
    assert fake.queries[0].selection == "all"
    assert not any(
        forbidden in response.text.lower()
        for forbidden in ["serial", "operator", "run_id", "station"]
    )


def test_run_activity_reporting_failure_is_exact_sanitized_503(application, caplog):
    fake = FakeActivityRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        repository=fake, tls="encrypted_unverified"
    )
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/run-activity",
            params={
                "started_from": "2026-11-01T00:00:00Z",
                "started_before": "2026-11-02T00:00:00Z",
            },
        )
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}
    assert "encrypted_unverified" not in response.text


def test_configuration_timing_disabled_returns_only_not_connected(client):
    response = client.get(
        "/api/v1/reporting/test-time-by-configuration",
        params={
            "started_from": "2026-11-01T00:00:00Z",
            "started_before": "2026-11-02T00:00:00Z",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}


def test_configuration_timing_connected_contract_and_filters(application):
    fake = FakeActivityRepository(configuration_metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        repository=fake, tls="verified"
    )
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/test-time-by-configuration",
            params={
                "started_from": "2026-11-01T01:00:00+01:00",
                "started_before": "2026-11-02T01:00:00+01:00",
                "purpose": "engineering",
                "wavelength_mode": "SM",
            },
        )
    assert response.status_code == 200
    result = ConfigurationTimingResponse.model_validate(response.json())
    assert result.data_source == "test_database" and result.tls == "verified"
    assert response.json()["window"] == {
        "started_from": "2026-11-01T00:00:00Z",
        "started_before": "2026-11-02T00:00:00Z",
    }
    assert response.json()["filters"] == {
        "purpose": "engineering",
        "wavelength_mode": "SM",
    }
    assert result.configurations[0].front_panel_channel_count == 48
    assert result.configurations[0].seconds_per_channel == 0.625
    assert fake.queries[0].selection == "all"
    assert fake.queries[0].switch_model is None
    assert not any(
        forbidden in response.text.lower()
        for forbidden in ["serial", "operator", "run_id", "station"]
    )


@pytest.mark.parametrize(
    "params",
    [
        {"started_from": "2026-11-01T00:00:00", "started_before": "2026-11-02T00:00:00Z"},
        {
            "started_from": "2026-11-01T00:00:00Z",
            "started_before": "2026-12-03T00:00:00Z",
        },
        {
            "started_from": "2026-11-01T00:00:00Z",
            "started_before": "2026-11-02T00:00:00Z",
            "purpose": "unknown",
        },
        {
            "started_from": "2026-11-01T00:00:00Z",
            "started_before": "2026-11-02T00:00:00Z",
            "wavelength_mode": "XX",
        },
        {
            "started_from": "2026-11-01T00:00:00Z",
            "started_before": "2026-11-02T00:00:00Z",
            "switch_model": "not-a-filter",
        },
    ],
)
def test_configuration_timing_query_validation_is_sanitized(client, params):
    response = client.get("/api/v1/reporting/test-time-by-configuration", params=params)
    assert response.status_code == 422
    assert ErrorResponse.model_validate(response.json()).error.code == "validation_error"
    assert not any(str(value) in response.text for value in params.values())


def test_configuration_timing_reporting_failure_is_exact_sanitized_503(application):
    fake = FakeActivityRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        repository=fake, tls="encrypted_unverified"
    )
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/test-time-by-configuration",
            params={
                "started_from": "2026-11-01T00:00:00Z",
                "started_before": "2026-11-02T00:00:00Z",
            },
        )
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}
    assert "encrypted_unverified" not in response.text


@pytest.mark.parametrize("url", ["/", "/api/v1/unknown", "/api/v1/demo/runs/DEMO-RUN-9999"])
def test_unknown_resource(client, url):
    response = client.get(url)
    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "not_found", "message": "Resource not found.", "details": []}
    }


def test_wrong_method_and_validation_do_not_echo_input(client):
    response = client.post("/api/v1/demo/runs")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"
    assert "GET" in response.headers["allow"]
    sentinel = "sensitive-example-value"
    response = client.get("/api/v1/demo/runs", params={"purpose": sentinel})
    assert sentinel not in response.text


def test_unhandled_errors_are_sanitized_and_locally_diagnosable(application, caplog):
    @application.get("/test-only-error")
    def fail():
        raise RuntimeError("sensitive-example-value")

    # Default raise_server_exceptions=True also proves the error does not escape
    # the application boundary into Uvicorn's unsanitized traceback logger.
    with TestClient(application) as client:
        with caplog.at_level(logging.ERROR, logger="lwa.errors"):
            response = client.get("/test-only-error?private=sensitive-example-value")
    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "An internal error occurred.", "details": []}
    }
    assert "RuntimeError" in caplog.text
    assert "test_api.py" in caplog.text
    assert "fail" in caplog.text
    assert "sensitive-example-value" not in response.text + caplog.text


def test_response_validation_failure_is_an_internal_error(application, caplog):
    @application.get("/test-only-invalid-response", response_model=HealthResponse)
    def invalid_response():
        return {"status": "sensitive-example-value"}

    with TestClient(application) as client:
        with caplog.at_level(logging.ERROR, logger="lwa.errors"):
            response = client.get("/test-only-invalid-response")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "ResponseValidationError" in caplog.text
    assert "sensitive-example-value" not in caplog.text + response.text


def test_demo_schema_rejects_real_identifiers_and_naive_timestamps(client):
    example = client.get("/api/v1/demo/runs").json()["items"][0]
    for change in [{"run_id": "12345"}, {"started_at": "2026-11-05T14:00:00"}]:
        with pytest.raises(ValidationError):
            DemoRun.model_validate(example | change)
    normalized = DemoRun.model_validate(example | {"started_at": "2026-11-05T15:00:00+01:00"})
    assert normalized.model_dump(mode="json")["started_at"] == "2026-11-05T14:00:00Z"


def test_openapi_matches_error_and_query_contracts(client):
    spec = client.get("/openapi.json").json()
    assert set(spec["paths"]) == {
        "/api/v1/assignments/{assignment_id}/hardware",
        "/api/v1/health/live",
        "/api/v1/system/info",
        "/api/v1/demo/runs",
        "/api/v1/reporting/run-activity",
        "/api/v1/reporting/channel-activity",
        "/api/v1/reporting/replacement-activity",
        "/api/v1/reporting/test-time-by-configuration",
        "/api/v1/runs/{run_id}/channels",
        "/api/v1/units/search",
        "/api/v1/units/{unit_id}",
    }
    operation = spec["paths"]["/api/v1/demo/runs"]["get"]
    assert {p["name"] for p in operation["parameters"]} == {"purpose", "model", "limit", "offset"}
    for code in ["404", "405", "422", "500"]:
        assert operation["responses"][code]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ErrorResponse"
        }
    assert client.get("/docs").status_code == 200
    reporting = spec["paths"]["/api/v1/reporting/run-activity"]["get"]
    assert {parameter["name"] for parameter in reporting["parameters"]} == {
        "started_from",
        "started_before",
        "purpose",
        "wavelength_mode",
        "switch_model",
    }
    assert reporting["responses"]["503"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ReportingFailureResponse"
    }
    channel_activity = spec["paths"]["/api/v1/reporting/channel-activity"]["get"]
    assert {parameter["name"] for parameter in channel_activity["parameters"]} == {
        "purpose",
        "wavelength_mode",
        "switch_model",
    }
    assert channel_activity["responses"]["503"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ReportingFailureResponse"
    }
    replacement_activity = spec["paths"]["/api/v1/reporting/replacement-activity"]["get"]
    assert {parameter["name"] for parameter in replacement_activity["parameters"]} == {
        "switch_model"
    }
    assert replacement_activity["responses"]["503"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ReportingFailureResponse"
    }
    configuration = spec["paths"]["/api/v1/reporting/test-time-by-configuration"]["get"]
    assert {parameter["name"] for parameter in configuration["parameters"]} == {
        "started_from",
        "started_before",
        "purpose",
        "wavelength_mode",
    }
    assert configuration["responses"]["503"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ReportingFailureResponse"
    }
