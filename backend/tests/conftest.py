from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.config import Settings
from app.database import HabitDatabase


@pytest.fixture
def store(tmp_path: Path) -> HabitDatabase:
    settings = Settings(
        database_path=tmp_path / "habit_tracker.sqlite3",
        timezone_name="Europe/Warsaw",
        timezone=ZoneInfo("Europe/Warsaw"),
    )
    return HabitDatabase(settings)

