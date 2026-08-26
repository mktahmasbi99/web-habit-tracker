from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True)
class Settings:
    database_path: Path
    timezone_name: str
    timezone: ZoneInfo
    max_import_bytes: int = 100 * 1024 * 1024


def load_settings() -> Settings:
    timezone_name = os.environ.get("TZ", "Europe/Warsaw")
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(f"TZ must be a valid IANA timezone; got {timezone_name!r}") from exc
    path = Path(os.environ.get("WEB_HABIT_TRACKER_DB", "/data/habit_tracker.sqlite3"))
    return Settings(database_path=path, timezone_name=timezone_name, timezone=timezone)

