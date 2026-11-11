import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture(autouse=True)
def isolated_reporting_environment(monkeypatch):
    import os

    for name in tuple(os.environ):
        if name.startswith("LWA_REPORTING_"):
            monkeypatch.delenv(name)


@pytest.fixture
def application():
    return create_app(Settings(_env_file=None, environment="test"))


@pytest.fixture
def client(application):
    with TestClient(application) as test_client:
        yield test_client
