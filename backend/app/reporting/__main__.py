"""Local opt-in diagnostic. Prints states/counts only, never source records."""

import argparse
import json
import sys

from pydantic import ValidationError
from pydantic_settings import SettingsError

from app.reporting.adapter import ReportingError, SqlServerAdapter
from app.reporting.config import ReportingSettings
from app.reporting.models import RunQuery
from app.reporting.repository import SqlServerReportingRepository


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Connect only after target approval")
    parser.add_argument(
        "--runs", action="store_true", help="Read one bounded page; print count only"
    )
    parser.add_argument("--started-from")
    parser.add_argument("--started-before")
    args = parser.parse_args(argv)
    try:
        settings = ReportingSettings()
        if not settings.enabled:
            result = {"reporting": "disabled"}
        elif not args.verify:
            result = {"reporting": "configured_not_verified"}
        else:
            query = None
            if args.runs:
                query = RunQuery(started_from=args.started_from, started_before=args.started_before)
            repository = SqlServerReportingRepository(SqlServerAdapter(settings))
            if query is None:
                repository.check_schema()
                result = {"reporting": "compatible"}
            else:
                page = repository.list_runs(query)
                result = {
                    "reporting": "compatible",
                    "returned_count": len(page.items),
                    "has_more": page.has_more,
                }
        print(json.dumps(result))
        return 0
    except (ValidationError, SettingsError):
        print(json.dumps({"reporting": "configured_not_verified", "code": "configuration_invalid"}))
    except ReportingError as exc:
        state = (
            "incompatible"
            if exc.code in {"schema_incompatible", "target_mismatch"}
            else "unavailable"
        )
        print(json.dumps({"reporting": state, "code": exc.code}))
    return 2


if __name__ == "__main__":
    sys.exit(main())
