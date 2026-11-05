import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.__main__ import main
from app.core.config import Settings
from app.main import create_app


def test_default_launcher_is_loopback_without_access_logs(monkeypatch):
    calls = []
    monkeypatch.setattr("app.__main__.uvicorn.run", lambda *args, **kwargs: calls.append(kwargs))
    main()
    assert calls[0]["host"] == "127.0.0.1"
    assert calls[0]["port"] == 8000
    assert calls[0]["access_log"] is False


def test_environment_settings(monkeypatch):
    monkeypatch.setenv("LWA_PORT", "8001")
    monkeypatch.setenv("LWA_APP_NAME", "Demo API")
    monkeypatch.setenv("LWA_LOG_LEVEL", "warning")
    monkeypatch.setenv("LWA_CORS_ORIGINS", '["http://127.0.0.1:5173"]')
    settings = Settings(_env_file=None)
    assert settings.port == 8001
    assert settings.app_name == "Demo API"
    assert settings.log_level == "warning"
    assert settings.cors_origins == ["http://127.0.0.1:5173"]


@pytest.mark.parametrize(
    ("name", "value"),
    [("LWA_HOST", "sensitive-example-value"), ("LWA_CORS_ORIGINS", "sensitive-example-value")],
)
def test_launcher_rejects_invalid_settings_without_echoing_values(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    monkeypatch.setattr("app.__main__.uvicorn.run", lambda *args, **kwargs: pytest.fail("started"))
    with pytest.raises(SystemExit) as error:
        main()
    assert "Invalid local API settings" in str(error.value)
    assert value not in str(error.value)


@pytest.mark.parametrize(
    "values",
    [
        {"host": "0.0.0.0"},
        {"host": "example.com"},
        {"port": 0},
        {"port": 65536},
        {"environment": "production"},
        {"cors_origins": ["*"]},
        {"cors_origins": ["https://example.com:443"]},
        {"cors_origins": ["http://localhost:5173/path"]},
        {"cors_origins": ["http://localhost"]},
    ],
)
def test_invalid_or_external_configuration_rejected(values):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **values)


def test_default_cors_is_absent(client):
    response = client.get("/api/v1/health/live", headers={"Origin": "http://127.0.0.1:5173"})
    assert "access-control-allow-origin" not in response.headers


def test_explicit_cors_only_allows_selected_origin():
    application = create_app(Settings(_env_file=None, cors_origins=["http://127.0.0.1:5173"]))
    with TestClient(application) as client:
        for origin, allowed in [("http://127.0.0.1:5173", True), ("http://localhost:5173", False)]:
            response = client.options(
                "/api/v1/demo/runs",
                headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
            )
            assert (response.status_code == 200) is allowed
            assert ("access-control-allow-origin" in response.headers) is allowed
