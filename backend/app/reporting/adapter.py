import importlib
import logging
import re
import struct
from contextlib import contextmanager

from app.reporting.config import ReportingSettings

logger = logging.getLogger("lwa.reporting")


class ReportingError(RuntimeError):
    """Sanitized code only; raw driver errors never cross this boundary."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(f"Reporting operation failed: {code}")


def _driver():
    if struct.calcsize("P") != 8:
        raise ReportingError("driver_unavailable")
    try:
        driver = importlib.import_module("pyodbc")
        # Separate short-lived connections; set before this adapter's first connect.
        driver.pooling = False
        if "ODBC Driver 18 for SQL Server" not in driver.drivers():
            raise ReportingError("driver_unavailable")
        return driver
    except (ImportError, OSError):
        raise ReportingError("driver_unavailable") from None


def _quoted(value: str) -> str:
    return "{" + value.replace("}", "}}") + "}"


def _connection_string(settings: ReportingSettings) -> str:
    values = {
        "DRIVER": "ODBC Driver 18 for SQL Server",
        "SERVER": f"tcp:{settings.server},{settings.port}",
        "DATABASE": settings.database,
        "Encrypt": "yes",
        "TrustServerCertificate": "no",
        "ApplicationIntent": "ReadOnly",
        "APP": "Light Workbench Analytics Reporting",
    }
    if settings.authentication == "windows":
        values["Trusted_Connection"] = "yes"
    else:
        values["UID"] = settings.username.get_secret_value()
        values["PWD"] = settings.password.get_secret_value()
    return ";".join(f"{key}={_quoted(value)}" for key, value in values.items()) + ";"


def _error_code(exc: Exception, phase: str) -> str:
    # Inspect only for classification; never print driver arguments/native messages.
    state = str(exc.args[0]) if exc.args else ""
    if state in {"HYT00", "HYT01"}:
        return "connection_timeout" if phase == "connect" else "query_timeout"
    if state == "28000":
        return "authentication_failed"
    if state == "42501" or any(re.search(r"\((?:229|230)\)", str(arg)) for arg in exc.args):
        return "permission_denied"
    if state in {"42S02", "42S22", "S0002", "S0022"}:
        return "schema_incompatible"
    return "connection_unavailable" if phase == "connect" else "read_failed"


class SqlServerAdapter:
    def __init__(self, settings: ReportingSettings, *, load_driver=_driver):
        self.settings = ReportingSettings.model_validate(settings.model_dump())
        self._load_driver = load_driver

    @contextmanager
    def cursor(self):
        if not self.settings.enabled:
            raise ReportingError("disabled")
        connection = cursor = None
        phase = "connect"
        primary_error = None
        try:
            driver = self._load_driver()
            connection = driver.connect(
                _connection_string(self.settings),
                timeout=self.settings.connection_timeout_seconds,
                readonly=True,
                autocommit=True,
            )
            phase = "query"
            connection.timeout = self.settings.query_timeout_seconds
            cursor = connection.cursor()
            yield cursor
        except ReportingError as exc:
            primary_error = exc
            raise
        except Exception as exc:
            primary_error = ReportingError(_error_code(exc, phase))
            logger.warning("Reporting failure code=%s phase=%s", primary_error.code, phase)
            raise primary_error from None
        finally:
            cleanup_failed = False
            for resource in (cursor, connection):
                if resource is not None:
                    try:
                        resource.close()
                    except Exception:
                        cleanup_failed = True
                        logger.warning("Reporting failure code=cleanup_failed")
            if cleanup_failed and primary_error is None:
                raise ReportingError("cleanup_failed") from None
