import sqlite3
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.config import Settings
from app.database import DomainError, HabitDatabase, ImportValidationError


def test_empty_database_contains_legacy_tables(store):
    with store.connect() as connection:
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )}
    assert {
        "habits", "habit_logs", "habit_notes", "habit_challenges",
        "habit_archive_periods", "web_schema_migrations", "web_app_settings",
        "timed_activity_timers", "timed_activity_timer_segments",
    }.issubset(tables)


def test_countdown_splits_at_local_midnight_and_cancel_discards(store):
    start = datetime(2026, 9, 17, 21, 50, tzinfo=UTC)  # 23:50 in Warsaw
    activity = store.create_timed_activity("Offline", "2026-09-17")
    timer = store.start_timer(activity["id"], "countdown", 25, start)
    assert timer["remainingSeconds"] == 1500
    with pytest.raises(DomainError, match="live timer"):
        store.add_timed_entry(activity["id"], "2026-09-17", 1)

    store.reconcile_timers(start + timedelta(minutes=25))
    with store.connect() as connection:
        rows = connection.execute(
            "SELECT entry_date, minutes FROM timed_activity_entries ORDER BY entry_date"
        ).fetchall()
    assert [(row["entry_date"], row["minutes"]) for row in rows] == [
        ("2026-09-17", 10), ("2026-09-18", 15),
    ]

    later = datetime(2026, 9, 18, 10, tzinfo=UTC)
    timer = store.start_timer(activity["id"], "countdown", 60, later)
    store.cancel_timer(activity["id"], timer["revision"], later + timedelta(minutes=1))
    assert store.timer_states(later)["timers"] == []


def test_timer_minute_allocation_is_deterministic_across_dst(store):
    tied = store._split_timer_minutes([
        (datetime(2026, 9, 17, 21, 59, 30, tzinfo=UTC),
         datetime(2026, 9, 17, 22, 0, 30, tzinfo=UTC))
    ], 1)
    assert tied == {"2026-09-17": 1}

    spring = store._split_timer_minutes([
        (datetime(2026, 3, 28, 22, 30, tzinfo=UTC),
         datetime(2026, 3, 29, 22, 30, tzinfo=UTC))
    ], 1440)
    assert spring == {"2026-03-28": 30, "2026-03-29": 1380, "2026-03-30": 30}


def test_pomodoro_pause_resume_break_and_reset(store):
    start = datetime(2026, 9, 17, 10, tzinfo=UTC)
    activity = store.create_timed_activity("Study", "2026-09-17")
    timer = store.start_timer(activity["id"], "pomodoro", None, start)
    paused = store.pause_timer(activity["id"], timer["revision"], start + timedelta(minutes=3))
    assert paused["status"] == "paused"
    assert paused["elapsedSeconds"] == 180

    store.resume_timer(
        activity["id"], paused["revision"], start + timedelta(minutes=20)
    )
    store.reconcile_timers(start + timedelta(minutes=42))
    state = store.timer_states(start + timedelta(minutes=42))["timers"][0]
    assert state["phase"] == "short_break"
    assert store.timed_activities_on("2026-09-17")[0]["dayMinutes"] == 25

    store.reconcile_timers(start + timedelta(minutes=47))
    ready = store.timer_states(start + timedelta(minutes=47))["timers"][0]
    assert ready["phase"] == "ready_focus"
    assert ready["focusNumber"] == 2
    running = store.start_timer_focus(activity["id"], ready["revision"], start + timedelta(minutes=48))
    store.cancel_timer(activity["id"], running["revision"], start + timedelta(minutes=49))
    assert store.timed_activities_on("2026-09-17")[0]["dayMinutes"] == 25


def test_timers_are_concurrent_per_activity_and_block_archive(store):
    now = datetime(2026, 9, 17, 10, tzinfo=UTC)
    study = store.create_timed_activity("Study", "2026-09-17")
    offline = store.create_timed_activity("Offline", "2026-09-17")
    first = store.start_timer(study["id"], "pomodoro", None, now)
    store.start_timer(offline["id"], "countdown", 60, now)
    assert len(store.timer_states(now)["timers"]) == 2
    with pytest.raises(DomainError, match="already has"):
        store.start_timer(study["id"], "countdown", 10, now)
    with pytest.raises(DomainError, match="Cancel the live timer"):
        store.archive_timed_activity(study["id"])
    store.cancel_timer(study["id"], first["revision"], now + timedelta(minutes=1))


def test_fourth_pomodoro_uses_long_break(store):
    now = datetime(2026, 9, 17, 10, tzinfo=UTC)
    activity = store.create_timed_activity("Study", "2026-09-17")
    store.start_timer(activity["id"], "pomodoro", None, now)
    with store.connect() as connection:
        connection.execute(
            "UPDATE timed_activity_timers SET focus_number = 4 WHERE activity_id = ?",
            (activity["id"],),
        )
        connection.commit()
    store.reconcile_timers(now + timedelta(minutes=25))
    state = store.timer_states(now + timedelta(minutes=25))["timers"][0]
    assert state["phase"] == "long_break"
    assert state["targetMinutes"] == 15


def test_restoring_backup_discards_unfinished_timer(store):
    now = datetime.now(UTC)
    activity = store.create_timed_activity("Study", store.today().isoformat())
    store.start_timer(activity["id"], "pomodoro", None, now)
    backup = store.create_backup()
    assert store.timer_states(now)["timers"]
    store.restore_server_backup(backup.name, "RESTORE")
    assert store.timer_states(now)["timers"] == []


def test_theme_is_a_shared_database_setting(store):
    assert store.theme() == "system"
    assert store.update_theme("noir") == "noir"
    assert store.update_theme("retro") == "retro"
    with pytest.raises(DomainError, match="supported theme"):
        store.update_theme("arcade")


def test_theme_migration_reverts_retired_setting_to_system(tmp_path):
    path = tmp_path / "theme-v7.sqlite3"
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE web_schema_migrations (version INTEGER PRIMARY KEY);
            INSERT INTO web_schema_migrations(version) VALUES (7);
            CREATE TABLE web_app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                theme TEXT NOT NULL DEFAULT 'system'
                    CHECK (theme IN ('system', 'arcade', 'crt', 'neon', 'desert', 'cartridge', 'noir', 'retro')),
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO web_app_settings(id, theme, updated_at)
                VALUES (1, 'cartridge', '2026-09-12 12:00:00');
            """
        )
    settings = Settings(
        database_path=path,
        timezone_name="Europe/Warsaw",
        timezone=ZoneInfo("Europe/Warsaw"),
    )
    migrated = HabitDatabase(settings)
    assert migrated.theme() == "system"
    with migrated.connect() as connection:
        definition = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'web_app_settings'"
        ).fetchone()[0]
        assert "'noir'" in definition
        assert "'retro'" in definition
        assert "'cartridge'" not in definition
        assert connection.execute(
            "SELECT updated_at FROM web_app_settings WHERE id = 1"
        ).fetchone()[0] == "2026-09-12 12:00:00"
    assert migrated.update_theme("noir") == "noir"


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
    habit = store.create_habit("Walk", start.isoformat())
    assert [
        store.habits_on((start + timedelta(days=offset)).isoformat())[0]["status"]
        for offset in range(3)
    ] == ["done", "done", "pending"]
    with store.connect() as connection:
        logs = connection.execute(
            "SELECT log_date, status FROM habit_logs WHERE habit_id = ? ORDER BY log_date",
            (habit["id"],),
        ).fetchall()
    assert [(row["log_date"], row["status"]) for row in logs] == [
        (start.isoformat(), "done"),
        ((today - timedelta(days=1)).isoformat(), "done"),
    ]


def test_today_and_future_starts_are_not_backfilled(store):
    today = store.today()
    store.create_habit("Today", today.isoformat())
    store.create_habit("Later", (today + timedelta(days=1)).isoformat())
    with store.connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM habit_logs").fetchone()[0] == 0


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


def test_month_and_unresolved_respect_archived_gaps(store):
    today = store.today()
    start = today - timedelta(days=4)
    archived = today - timedelta(days=3)
    restored = today - timedelta(days=1)
    habit = store.create_habit("Read", start.isoformat())
    with store.connect() as connection, connection:
        connection.execute(
            "INSERT INTO habit_archive_periods(habit_id, archived_at, resurrected_at) VALUES (?, ?, ?)",
            (habit["id"], archived.isoformat(), restored.isoformat()),
        )
    for day in (start, archived, restored):
        store.set_status(habit["id"], day.isoformat(), "pending")
    unresolved_dates = {item["date"] for item in store.unresolved()}
    assert {start.isoformat(), archived.isoformat(), restored.isoformat()}.issubset(unresolved_dates)
    assert (archived + timedelta(days=1)).isoformat() not in unresolved_dates
    summary = {item["date"]: item for item in store.month_summary(today.strftime("%Y-%m"))}
    assert summary[archived.isoformat()] == {"date": archived.isoformat(), "done": 0, "missed": 0}


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


def test_activity_log_is_observational_with_date_notes_and_lifecycle(store):
    today = store.today()
    yesterday = (today - timedelta(days=1)).isoformat()
    item = store.create_activity_log("Clean filter", yesterday)
    assert store.activity_logs_on(today.isoformat())[0]["lastCompletedDate"] is None
    store.set_activity_log_completion(item["id"], yesterday, True)
    store.save_activity_log_note(item["id"], today.isoformat(), "Water parameters normal")
    card = store.activity_logs_on(today.isoformat())[0]
    assert card["lastCompletedDate"] == yesterday
    assert card["completed"] is False
    assert card["hasNote"] is True
    month = store.activity_log_month(item["id"], today.strftime("%Y-%m"))
    assert next(day for day in month["days"] if day["date"] == yesterday)["completed"] is True
    assert next(day for day in month["days"] if day["date"] == today.isoformat())["hasNote"] is True
    with pytest.raises(DomainError):
        store.set_activity_log_completion(item["id"], (today + timedelta(days=1)).isoformat(), True)
    store.archive_activity_log(item["id"])
    assert store.activity_log_detail(item["id"])["archived"] is True
    store.restore_activity_log(item["id"])
    assert store.activity_log_detail(item["id"])["archived"] is False


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


def test_backup_defaults_and_on_demand_marker(store):
    assert store.backup_settings() == {
        "dailyEnabled": True, "dailyTime": "01:00", "dailyRetention": 7,
        "weeklyEnabled": True, "weeklyDay": 6, "weeklyTime": "01:00",
        "weeklyRetention": 8, "safetyRetention": 8,
    }
    store.create_habit("Read", store.today().isoformat())
    backup = store.create_backup()
    assert backup.exists()
    assert store.list_backups()[0]["category"] == "on-demand"
    with sqlite3.connect(backup) as connection:
        assert connection.execute(
            "SELECT app_id, format_version, category FROM web_backup_metadata"
        ).fetchone() == ("web-habit-tracker", 1, "on-demand")


def test_restore_validates_backup_and_preserves_schedule(store):
    today = store.today().isoformat()
    store.create_habit("Before", today)
    backup = store.create_backup()
    settings = store.backup_settings()
    settings.update({"dailyTime": "02:30", "dailyRetention": 3})
    store.update_backup_settings(settings)
    store.create_habit("After", today)

    safety = store.restore_server_backup(backup.name, "RESTORE")

    assert safety.startswith("pre-restore-")
    assert [item["name"] for item in store.note_summaries()] == ["Before"]
    assert store.backup_settings()["dailyTime"] == "02:30"
    assert store.backup_settings()["dailyRetention"] == 3


def test_scheduled_backup_catches_up_once(store):
    settings = store.backup_settings()
    settings["weeklyEnabled"] = False
    store.update_backup_settings(settings)
    first = datetime(2026, 8, 27, 2, 0, tzinfo=store.settings.timezone)
    store.run_scheduled_backups(first)
    assert not store.list_backups()

    store.run_scheduled_backups(first + timedelta(days=1))
    assert [item["category"] for item in store.list_backups()] == ["daily"]
    store.run_scheduled_backups(first + timedelta(days=1, hours=1))
    assert len(store.list_backups()) == 1


def test_delete_requires_confirmation(store):
    backup = store.create_backup()
    with pytest.raises(DomainError):
        store.delete_backup(backup.name, "no")
    store.delete_backup(backup.name, "DELETE")
    assert not backup.exists()


def test_habit_lifecycle_preserves_history_and_uses_pre_delete_backup(store):
    today = store.today()
    start = today - timedelta(days=2)
    habit = store.create_habit("  Read daily  ", start.isoformat())
    store.save_note(habit["id"], start.isoformat(), "First day")

    renamed = store.rename_habit(habit["id"], "Morning reading")
    assert renamed["name"] == "Morning reading"

    corrected_start = start - timedelta(days=1)
    updated = store.update_habit(habit["id"], "Morning reading", corrected_start.isoformat())
    assert updated["startDate"] == corrected_start.isoformat()
    assert updated["noteCount"] == 1

    archived = store.archive_habit(habit["id"])
    assert archived["archived"] is True
    assert archived["latestActiveRange"] == {
        "startDate": corrected_start.isoformat(), "endDate": today.isoformat(),
    }
    assert store.habits_on(today.isoformat())[0]["id"] == habit["id"]
    assert store.habits_on((today + timedelta(days=1)).isoformat()) == []

    restored = store.restore_habit(habit["id"])
    assert restored["archived"] is False
    assert store.habits_on(today.isoformat())[0]["id"] == habit["id"]
    periods = store.archive_periods(habit["id"])
    assert periods[0]["notes"][0]["body"] == "First day"

    with pytest.raises(DomainError, match="DELETE"):
        store.delete_habit(habit["id"], "delete")
    backup_name = store.delete_habit(habit["id"], "DELETE")
    assert backup_name.startswith("pre-delete-")
    assert store.habit_summaries() == []
    backup = store.path.parent / "backups" / backup_name
    with sqlite3.connect(backup) as connection:
        assert connection.execute("SELECT name FROM habits").fetchone()[0] == "Morning reading"


def test_pre_delete_backups_share_safety_retention(store):
    with store.connect() as connection:
        connection.execute("UPDATE web_backup_settings SET safety_retention = 2 WHERE id = 1")
        connection.commit()
    for name in ("One", "Two", "Three"):
        habit = store.create_habit(name, store.today().isoformat())
        store.delete_habit(habit["id"], "DELETE")
    safety = [item for item in store.list_backups() if item["safety"]]
    assert len(safety) == 2
    assert all(item["category"] == "pre-delete" for item in safety)
