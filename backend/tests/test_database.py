import sqlite3
from datetime import timedelta

import pytest

from app.database import DomainError, ImportValidationError


def test_empty_database_contains_legacy_tables(store):
    with store.connect() as connection:
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )}
    assert {
        "habits", "habit_logs", "habit_notes", "habit_challenges",
        "habit_archive_periods", "web_schema_migrations",
    }.issubset(tables)


def test_pending_is_no_log_and_status_can_be_undone(store):
    today = store.today().isoformat()
    habit = store.create_habit("Read", today)
    assert store.habits_on(today)[0]["status"] == "pending"
    store.set_status(habit["id"], today, "done")
    assert store.habits_on(today)[0]["status"] == "done"
    store.set_status(habit["id"], today, "pending")
    assert store.habits_on(today)[0]["status"] == "pending"
    with store.connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM habit_logs").fetchone()[0] == 0


def test_past_start_is_backfilled_done(store):
    today = store.today()
    start = today - timedelta(days=2)
    store.create_habit("Walk", start.isoformat())
    assert [
        store.habits_on((start + timedelta(days=offset)).isoformat())[0]["status"]
        for offset in range(3)
    ] == ["done", "done", "pending"]


def test_historical_pending_breaks_current_streak(store):
    today = store.today()
    start = today - timedelta(days=2)
    habit = store.create_habit("Exercise", start.isoformat())
    yesterday = (today - timedelta(days=1)).isoformat()
    store.set_status(habit["id"], yesterday, "pending")
    store.set_status(habit["id"], today.isoformat(), "done")
    assert store.current_streak(habit["id"], today.isoformat()) == 1


def test_unresolved_only_contains_past_pending_dates(store):
    today = store.today()
    start = today - timedelta(days=2)
    habit = store.create_habit("Read", start.isoformat())
    store.set_status(habit["id"], start.isoformat(), "pending")
    assert store.unresolved() == [{"date": start.isoformat(), "pendingCount": 1}]


def test_notes_and_statistics(store):
    today = store.today().isoformat()
    habit = store.create_habit("Journal", today)
    store.set_status(habit["id"], today, "done")
    store.save_note(habit["id"], today, "Clear and useful")
    assert store.note(habit["id"], today) == "Clear and useful"
    assert store.note_summaries()[0]["noteCount"] == 1
    assert store.statistics()[0]["currentStreak"] == 1
    store.save_note(habit["id"], today, "  ")
    assert store.note(habit["id"], today) == ""


def test_inactive_habit_rejects_status_and_new_note(store):
    tomorrow = (store.today() + timedelta(days=1)).isoformat()
    habit = store.create_habit("Later", tomorrow)
    with pytest.raises(DomainError):
        store.set_status(habit["id"], store.today().isoformat(), "done")
    with pytest.raises(DomainError):
        store.save_note(habit["id"], store.today().isoformat(), "No")


def test_month_summary_returns_every_day(store):
    today = store.today()
    habit = store.create_habit("Read", today.isoformat())
    store.set_status(habit["id"], today.isoformat(), "missed")
    summary = store.month_summary(today.strftime("%Y-%m"))
    selected = next(day for day in summary if day["date"] == today.isoformat())
    assert selected == {"date": today.isoformat(), "done": 0, "missed": 1}
    assert len(summary) in {28, 29, 30, 31}


def test_import_requires_confirmation_and_creates_backup(store):
    today = store.today().isoformat()
    store.create_habit("Old", today)
    source = store.path.parent / "source.sqlite3"
    with sqlite3.connect(source) as connection:
        connection.executescript("""
            CREATE TABLE habits (id INTEGER PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL,
              completed_at TEXT, archived_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE habit_logs (habit_id INTEGER NOT NULL, log_date TEXT NOT NULL, status TEXT NOT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(habit_id, log_date),
              FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE);
            CREATE TABLE habit_notes (habit_id INTEGER NOT NULL, note_date TEXT NOT NULL, body TEXT NOT NULL,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(habit_id, note_date),
              FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE);
            CREATE TABLE habit_challenges (id INTEGER PRIMARY KEY, habit_id INTEGER NOT NULL, start_date TEXT NOT NULL,
              end_date TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE);
            CREATE TABLE habit_archive_periods (id INTEGER PRIMARY KEY, habit_id INTEGER NOT NULL,
              archived_at TEXT NOT NULL, resurrected_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE);
            INSERT INTO habits(id, name, start_date) VALUES (7, 'Imported', '2026-01-01');
        """)
    with pytest.raises(DomainError):
        store.import_database(source.read_bytes(), "replace")
    backup = store.import_database(source.read_bytes(), "IMPORT")
    assert backup.startswith("pre-import-")
    assert store.path.parent.joinpath("backups", backup).exists()
    assert store.note_summaries()[0]["name"] == "Imported"


def test_invalid_import_does_not_replace_live_data(store):
    today = store.today().isoformat()
    store.create_habit("Keep", today)
    with pytest.raises(ImportValidationError):
        store.import_database(b"not sqlite", "IMPORT")
    assert store.note_summaries()[0]["name"] == "Keep"

