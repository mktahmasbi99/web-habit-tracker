"""Portable fixtures for the daily-habit behavior inherited from HabitStore.swift."""
import json
import sqlite3
from dataclasses import replace
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app import database

CASES = json.loads((Path(__file__).parent / "fixtures/legacy_contract.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_legacy_daily_contract(store, monkeypatch, case):
    monkeypatch.setattr(store, "today", lambda: date.fromisoformat(case["today"]))
    habit = store.create_habit(case["name"], case["start"])
    for day, status in case["statuses"].items():
        store.set_status(habit["id"], day, status)
    assert store.current_streak(habit["id"], case["today"]) == case["expected_current"]
    assert store.statistics()[0]["longestStreak"]["length"] == case["expected_longest"]
    # Future daily statuses stay editable, including undo to absent-row Pending.
    store.set_status(habit["id"], "2024-03-03", "done")
    store.set_status(habit["id"], "2024-03-03", "pending")
    with store.connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM habit_logs WHERE log_date = ?", ("2024-03-03",)).fetchone()[0] == 0


@pytest.mark.parametrize("zone,instant,expected", [
    ("Europe/Warsaw", "2024-02-28T23:30:00+00:00", "2024-02-29"),
    ("America/Los_Angeles", "2024-03-01T00:30:00+00:00", "2024-02-29"),
    ("Europe/Warsaw", "2024-03-31T22:30:00+00:00", "2024-04-01"),
    ("Europe/Warsaw", "2024-10-27T23:30:00+00:00", "2024-10-28"),
])
def test_server_date_uses_iana_zone(store, monkeypatch, zone, instant, expected):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.fromisoformat(instant).astimezone(tz or timezone.utc)
    monkeypatch.setattr(database, "datetime", Clock)
    store.settings = replace(store.settings, timezone_name=zone, timezone=ZoneInfo(zone))
    assert store.today().isoformat() == expected


def test_representative_legacy_import_preserves_history(store, tmp_path):
    source = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(source) as legacy:
        legacy.executescript((Path(__file__).parent / "fixtures/legacy_schema.sql").read_text())
        legacy.execute("INSERT INTO habits(id, name, start_date) VALUES (7, 'Legacy journal', '2024-02-28')")
        legacy.executemany("INSERT INTO habit_logs(habit_id, log_date, status) VALUES (7, ?, ?)", [("2024-02-28", "done"), ("2024-02-29", "missed"), ("2024-03-02", "done")])
        legacy.execute("INSERT INTO habit_notes(habit_id, note_date, body) VALUES (7, '2024-02-29', 'Leap day 📖')")
    original = source.read_bytes()
    store.import_database(original, "IMPORT")
    assert source.read_bytes() == original
    assert store.note(7, "2024-02-29") == "Leap day 📖"
    assert store.habits_on("2024-03-01")[0]["status"] == "pending"
    assert store.current_streak(7, "2024-03-02") == 1
