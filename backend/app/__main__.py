import struct
import sys

import uvicorn
from pydantic import ValidationError
from pydantic_settings import SettingsError

from app.core.config import Settings


def main() -> None:
    if sys.version_info < (3, 12) or struct.calcsize("P") != 8:
        raise SystemExit("Use Python 3.12+ with a conventional 64-bit runtime.")
    try:
        settings = Settings()
    except ValidationError as exc:
        # Do not print settings values when rejecting a local configuration.
        fields = ", ".join(".".join(map(str, item["loc"])) for item in exc.errors())
        raise SystemExit(f"Invalid local API settings: {fields}") from None
    except SettingsError:
        raise SystemExit(
            "Invalid local API settings; check the LWA_ configuration format."
        ) from None
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        access_log=False,  # Default access logs would echo query values.
    )


if __name__ == "__main__":
    main()
