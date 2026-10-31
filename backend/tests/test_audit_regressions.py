import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from threading import Barrier, Event

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import DomainError, HabitDatabase, ImportValidationError


def test_frontend_fallback_contains_paths(monkeypatch, tmp_path):
    monkeypatch.setenv("WEB_HABIT_TRACKER_DB", str(tmp_path / "api.sqlite3"))
    from app import main

    root = tmp_path / "dist"
    root.mkdir()
    (root / "index.html").write_text("app shell")
    (root / "manifest.webmanifest").write_text("manifest")
    private = tmp_path / "private.txt"
    private.write_text("private server file")
    (root / "link.txt").symlink_to(private)
    monkeypatch.setattr(main, "FRONTEND_DIST", root)
    app = FastAPI()
    app.get("/{full_path:path}")(main.spa_fallback)
    with TestClient(app) as client:
        for path in ("/%2e%2e/private.txt", "/%2f" + str(private), "/link.txt"):
            assert client.get(path).status_code == 404
        assert client.get("/habits/7").text == "app shell"
        response = client.get("/manifest.webmanifest")
        assert response.text == "manifest"
        assert response.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("replacement", ["restore", "import"])
def test_write_during_replacement_waits_for_new_database(store, monkeypatch, replacement):
    today = store.today().isoformat()
    store.create_habit("Original", today)
    backup = store.create_backup()
    gap, release, attempted, saved = Event(), Event(), Event(), Event()
    original = store.create_backup

    def paused_backup(category="on-demand"):
        result = original(category)
        if category in {"pre-restore", "pre-import"}:
            gap.set()
            assert release.wait(5)
        return result

    monkeypatch.setattr(store, "create_backup", paused_backup)

    def replace():
        if replacement == "restore":
            return store.restore_server_backup(backup.name, "RESTORE")
        return store.import_database(backup.read_bytes(), "IMPORT")

    def write():
        attempted.set()
        store.create_habit("Concurrent save", today)
        saved.set()

    with ThreadPoolExecutor(2) as pool:
        replacing = pool.submit(replace)
        try:
            assert gap.wait(5)
            writing = pool.submit(write)
            assert attempted.wait(5)
            assert not saved.wait(0.1)
        finally:
            release.set()
        replacing.result(timeout=5)
        writing.result(timeout=5)
    assert {item["name"] for item in store.habits_on(today)} == {"Original", "Concurrent save"}


def test_replacement_waits_for_open_live_connection(store, monkeypatch):
    backup = store.create_backup()
    attempted, swapped = Event(), Event()
    from app import database
    original = database.os.replace

    def observe_swap(*args):
        swapped.set()
        return original(*args)

    monkeypatch.setattr(database.os, "replace", observe_swap)

    def restore():
        attempted.set()
        store.restore_server_backup(backup.name, "RESTORE")

    with ThreadPoolExecutor(1) as pool:
        with store.connect() as connection:
            connection.execute("BEGIN")
            connection.execute("SELECT * FROM habits").fetchall()
            restoring = pool.submit(restore)
            assert attempted.wait(5)
            assert not swapped.wait(0.1)
        restoring.result(timeout=5)
    assert swapped.is_set()


@pytest.mark.parametrize("column", [
    "habits.start_date", "habits.completed_at", "habits.archived_at",
    "habit_logs.log_date", "habit_notes.note_date", "habit_challenges.start_date",
    "habit_challenges.end_date", "habit_challenges.completed_at",
    "habit_archive_periods.archived_at", "habit_archive_periods.resurrected_at",
])
def test_invalid_legacy_dates_leave_live_database_unchanged(store, tmp_path, column):
    store.create_habit("Keep", store.today().isoformat())
    source = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(source) as connection:
        connection.executescript((Path(__file__).parent / "fixtures/legacy_schema.sql").read_text())
        connection.executescript("""
            INSERT INTO habits(id, name, start_date) VALUES (7, 'Imported', '2024-02-28');
            INSERT INTO habit_logs(habit_id, log_date, status) VALUES (7, '2024-02-29', 'done');
            INSERT INTO habit_notes(habit_id, note_date, body) VALUES (7, '2024-02-29', 'note');
            INSERT INTO habit_challenges(habit_id, start_date, end_date)
                VALUES (7, '2024-02-28', '2024-03-01');
            INSERT INTO habit_archive_periods(habit_id, archived_at) VALUES (7, '2024-03-01');
        """)
        table, field = column.split(".")
        connection.execute(f"UPDATE {table} SET {field} = ?", ("0000-01-01",))
    upload = source.read_bytes()
    with pytest.raises(ImportValidationError, match="invalid date"):
        store.import_database(upload, "IMPORT")
    assert [item["name"] for item in store.habit_summaries()] == ["Keep"]
    assert source.read_bytes() == upload
    assert not store.list_backups()


@pytest.mark.parametrize("table, field, seed", [
    ("timed_activities", "start_date", ""),
    ("timed_activity_entries", "entry_date", "INSERT INTO timed_activity_entries(activity_id, entry_date, minutes) VALUES (1, '2024-02-29', 10)"),
    ("timed_activity_notes", "note_date", "INSERT INTO timed_activity_notes(activity_id, note_date, body) VALUES (1, '2024-02-29', 'note')"),
    ("activity_logs", "start_date", ""),
    ("activity_log_completions", "completion_date", "INSERT INTO activity_log_completions(activity_id, completion_date) VALUES (1, '2024-02-29')"),
])
def test_invalid_web_backup_dates_cannot_be_restored(store, table, field, seed):
    store.create_timed_activity("Study", "2024-02-28")
    store.create_activity_log("Water", "2024-02-28")
    backup = store.create_backup()
    with sqlite3.connect(backup) as connection:
        if seed:
            connection.execute(seed)
        connection.execute(f"UPDATE {table} SET {field} = ?", ("2024-02-30",))
    with pytest.raises(ImportValidationError, match="invalid date"):
        store.restore_server_backup(backup.name, "RESTORE")
    assert store.timed_activity_detail(1)["startDate"] == "2024-02-28"
    assert len(store.list_backups()) == 1


@pytest.mark.parametrize("category", ["daily", "weekly"])
def test_failed_scheduled_backup_retries_after_recovery(store, monkeypatch, category):
    settings = store.backup_settings()
    settings.update(dailyEnabled=category == "daily", weeklyEnabled=category == "weekly")
    store.update_backup_settings(settings)
    first = datetime(2026, 10, 18, 2, tzinfo=store.settings.timezone)
    store.run_scheduled_backups(first)
    due = first + timedelta(days=1 if category == "daily" else 7)
    original = store.create_backup

    def fail(_category):
        raise OSError("Temporary storage failure")

    monkeypatch.setattr(store, "create_backup", fail)
    store.run_scheduled_backups(due)
    assert not store.list_backups()
    assert len(store.system_notifications()) == 1
    monkeypatch.setattr(store, "create_backup", original)
    store.run_scheduled_backups(due + timedelta(minutes=1))
    store.run_scheduled_backups(due + timedelta(minutes=2))
    assert [item["category"] for item in store.list_backups()] == [category]


@pytest.mark.parametrize("operation", ["add", "update"])
def test_duration_capacity_is_atomic_across_connections(store, monkeypatch, operation):
    today = store.today().isoformat()
    activity = store.create_timed_activity("Study", today)["id"]
    store.add_timed_entry(activity, today, 1400 if operation == "add" else 1380)
    entries = [store.add_timed_entry(activity, today, 10)["id"] for _ in range(2)] if operation == "update" else []
    other = HabitDatabase(store.settings)
    transactions = []
    for database in (store, other):
        connect = database.connect

        @contextmanager
        def traced_connect(path=None, connect=connect):
            with connect(path) as connection:
                connection.set_trace_callback(lambda sql: transactions.append(connection.in_transaction)
                    if sql.startswith("SELECT COALESCE(SUM(minutes)") else None)
                yield connection

        monkeypatch.setattr(database, "connect", traced_connect)
    start = Barrier(2)

    def write(index):
        database = (store, other)[index]
        start.wait(timeout=5)
        try:
            if operation == "add":
                database.add_timed_entry(activity, today, 30)
            else:
                database.update_timed_entry(activity, entries[index], 40)
            return "saved"
        except DomainError:
            return "full"

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(write, range(2))) == ["full", "saved"]
    assert transactions and all(transactions)
    assert store.timed_activities_on(today)[0]["dayMinutes"] == 1430


@pytest.mark.parametrize("mode, target", [("countdown", 1), ("pomodoro", None), ("stopwatch", None)])
def test_archived_activity_rejects_live_timers_but_keeps_archive_day_history(store, mode, target):
    today = store.today().isoformat()
    activity = store.create_timed_activity("Study", today)["id"]
    store.add_timed_entry(activity, today, 10)
    store.archive_timed_activity(activity)
    with pytest.raises(DomainError, match="Restore"):
        store.start_timer(activity, mode, target)
    assert store.timed_activities_on(today)[0]["dayMinutes"] == 10
    store.restore_timed_activity(activity)
    assert store.start_timer(activity, mode, target)["status"] == "running"
