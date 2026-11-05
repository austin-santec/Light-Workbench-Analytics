import logging

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import __version__
from app.schemas import DemoRun, DemoRunsResponse, ErrorResponse, HealthResponse, SystemInfo


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
    assert set(spec["paths"]) == {"/api/v1/health/live", "/api/v1/system/info", "/api/v1/demo/runs"}
    operation = spec["paths"]["/api/v1/demo/runs"]["get"]
    assert {p["name"] for p in operation["parameters"]} == {"purpose", "model", "limit", "offset"}
    for code in ["404", "405", "422", "500"]:
        assert operation["responses"][code]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ErrorResponse"
        }
    assert client.get("/docs").status_code == 200
