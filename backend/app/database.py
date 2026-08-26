from __future__ import annotations

import os
import sqlite3
import tempfile
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path

from .config import Settings

EXPECTED_COLUMNS = {
    "habits": {"id", "name", "start_date"},
    "habit_logs": {"habit_id", "log_date", "status"},
    "habit_notes": {"habit_id", "note_date", "body"},
    "habit_challenges": {
        "id", "habit_id", "start_date", "end_date"
    },
    "habit_archive_periods": {
        "id", "habit_id", "archived_at", "resurrected_at"
    },
}


class DomainError(ValueError):
    pass


class ImportValidationError(DomainError):
    pass


class HabitDatabase:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.path = settings.database_path
        self._replacement_lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.migrate(self.path)

    @contextmanager
    def connect(self, path: Path | None = None) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(path or self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        if path is None or path == self.path:
            connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
        finally:
            connection.close()

    def migrate(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect(path) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS habits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    start_date TEXT NOT NULL,
                    completed_at TEXT,
                    archived_at TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS habit_logs (
                    habit_id INTEGER NOT NULL,
                    log_date TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('done', 'missed')),
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (habit_id, log_date),
                    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS habit_notes (
                    habit_id INTEGER NOT NULL,
                    note_date TEXT NOT NULL,
                    body TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (habit_id, note_date),
                    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS habit_challenges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    habit_id INTEGER NOT NULL,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    completed_at TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS habit_archive_periods (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    habit_id INTEGER NOT NULL,
                    archived_at TEXT NOT NULL,
                    resurrected_at TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS web_schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(log_date);
                CREATE INDEX IF NOT EXISTS idx_habit_notes_date ON habit_notes(note_date);
                CREATE INDEX IF NOT EXISTS idx_archive_periods_habit_dates
                    ON habit_archive_periods(habit_id, archived_at, resurrected_at);
                """
            )
            habit_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(habits)")
            }
            if "completed_at" not in habit_columns:
                connection.execute("ALTER TABLE habits ADD COLUMN completed_at TEXT")
            if "archived_at" not in habit_columns:
                connection.execute("ALTER TABLE habits ADD COLUMN archived_at TEXT")
            self._repair_legacy_completed_at(connection)
            connection.execute(
                "INSERT OR IGNORE INTO web_schema_migrations(version) VALUES (1)"
            )
            connection.execute("PRAGMA optimize")
            connection.commit()

    def _repair_legacy_completed_at(self, connection: sqlite3.Connection) -> None:
        today = self.today().isoformat()
        rows = connection.execute(
            "SELECT id, completed_at, archived_at FROM habits WHERE completed_at IS NOT NULL"
        ).fetchall()
        for row in rows:
            habit_id, completed_at, archived_at = row
            if archived_at is None and completed_at > today:
                connection.execute(
                    """INSERT INTO habit_challenges(habit_id, start_date, end_date)
                       SELECT ?, ?, ? WHERE NOT EXISTS (
                         SELECT 1 FROM habit_challenges
                         WHERE habit_id = ? AND start_date = ? AND end_date = ?
                       )""",
                    (habit_id, today, completed_at, habit_id, today, completed_at),
                )
            elif archived_at is None:
                connection.execute(
                    "UPDATE habits SET archived_at = ? WHERE id = ?",
                    (completed_at, habit_id),
                )
            connection.execute("UPDATE habits SET completed_at = NULL WHERE id = ?", (habit_id,))
        for row in connection.execute(
            "SELECT id, archived_at FROM habits WHERE archived_at IS NOT NULL"
        ):
            connection.execute(
                """INSERT INTO habit_archive_periods(habit_id, archived_at)
                   SELECT ?, ? WHERE NOT EXISTS (
                     SELECT 1 FROM habit_archive_periods
                     WHERE habit_id = ? AND archived_at = ? AND resurrected_at IS NULL
                   )""",
                (row["id"], row["archived_at"], row["id"], row["archived_at"]),
            )

    def today(self) -> date:
        return datetime.now(self.settings.timezone).date()

    @staticmethod
    def parse_day(value: str) -> date:
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise DomainError("Date must use YYYY-MM-DD.") from exc

    @staticmethod
    def _clean_name(name: str) -> str:
        cleaned = " ".join(name.split())
        if not cleaned:
            raise DomainError("Habit names cannot be empty.")
        if len(cleaned) > 200:
            raise DomainError("Habit names cannot exceed 200 characters.")
        return cleaned

    def create_habit(self, name: str, start_date: str) -> dict:
        cleaned = self._clean_name(name)
        start = self.parse_day(start_date)
        with self.connect() as connection, connection:
            cursor = connection.execute(
                "INSERT INTO habits(name, start_date) VALUES (?, ?)",
                (cleaned, start.isoformat()),
            )
            habit_id = cursor.lastrowid
            current = start
            while current < self.today():
                connection.execute(
                    "INSERT INTO habit_logs(habit_id, log_date, status) VALUES (?, ?, 'done')",
                    (habit_id, current.isoformat()),
                )
                current += timedelta(days=1)
        return {"id": habit_id, "name": cleaned, "startDate": start.isoformat()}

    def _active_sql(self) -> str:
        return """h.start_date <= ? AND h.archived_at IS NULL AND NOT EXISTS (
            SELECT 1 FROM habit_archive_periods ap
            WHERE ap.habit_id = h.id AND ap.archived_at <= ?
              AND (ap.resurrected_at IS NULL OR ap.resurrected_at > ?)
        )"""

    def is_active(self, connection: sqlite3.Connection, habit_id: int, day: str) -> bool:
        row = connection.execute(
            f"SELECT EXISTS(SELECT 1 FROM habits h WHERE h.id = ? AND {self._active_sql()})",
            (habit_id, day, day, day),
        ).fetchone()
        return bool(row[0])

    def habits_on(self, day_value: str) -> list[dict]:
        day = self.parse_day(day_value).isoformat()
        with self.connect() as connection:
            rows = connection.execute(
                f"""SELECT h.id, h.name, h.start_date,
                    COALESCE(l.status, 'pending') status,
                    n.habit_id IS NOT NULL has_note
                FROM habits h
                LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.log_date = ?
                LEFT JOIN habit_notes n ON n.habit_id = h.id AND n.note_date = ?
                WHERE {self._active_sql()}
                ORDER BY h.start_date, h.name, h.id""",
                (day, day, day, day, day),
            ).fetchall()
        return [
            {
                "id": row["id"], "name": row["name"], "startDate": row["start_date"],
                "status": row["status"], "currentStreak": self.current_streak(row["id"], day),
                "hasNote": bool(row["has_note"]),
            }
            for row in rows
        ]

    def set_status(self, habit_id: int, day_value: str, status: str) -> None:
        day = self.parse_day(day_value).isoformat()
        if status not in {"pending", "done", "missed"}:
            raise DomainError("Status must be pending, done, or missed.")
        with self.connect() as connection:
            if not self.is_active(connection, habit_id, day):
                raise DomainError("This habit was not active on the selected date.")
            with connection:
                if status == "pending":
                    connection.execute(
                        "DELETE FROM habit_logs WHERE habit_id = ? AND log_date = ?",
                        (habit_id, day),
                    )
                else:
                    connection.execute(
                        """INSERT INTO habit_logs(habit_id, log_date, status, updated_at)
                           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                           ON CONFLICT(habit_id, log_date) DO UPDATE SET
                             status = excluded.status, updated_at = CURRENT_TIMESTAMP""",
                        (habit_id, day, status),
                    )

    def note(self, habit_id: int, day_value: str) -> str:
        day = self.parse_day(day_value).isoformat()
        with self.connect() as connection:
            row = connection.execute(
                "SELECT body FROM habit_notes WHERE habit_id = ? AND note_date = ?",
                (habit_id, day),
            ).fetchone()
        return row["body"] if row else ""

    def save_note(self, habit_id: int, day_value: str, body: str) -> None:
        day = self.parse_day(day_value).isoformat()
        if len(body) > 20_000:
            raise DomainError("Notes cannot exceed 20,000 characters.")
        with self.connect() as connection:
            existing = connection.execute(
                "SELECT 1 FROM habit_notes WHERE habit_id = ? AND note_date = ?",
                (habit_id, day),
            ).fetchone()
            if existing is None and not self.is_active(connection, habit_id, day):
                raise DomainError("This habit was not active on the selected date.")
            with connection:
                if not body.strip():
                    connection.execute(
                        "DELETE FROM habit_notes WHERE habit_id = ? AND note_date = ?",
                        (habit_id, day),
                    )
                else:
                    connection.execute(
                        """INSERT INTO habit_notes(habit_id, note_date, body, updated_at)
                           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                           ON CONFLICT(habit_id, note_date) DO UPDATE SET
                             body = excluded.body, updated_at = CURRENT_TIMESTAMP""",
                        (habit_id, day, body),
                    )

    def streaks(self, habit_id: int, through_value: str) -> list[dict]:
        through = self.parse_day(through_value)
        with self.connect() as connection:
            habit = connection.execute(
                "SELECT start_date FROM habits WHERE id = ?", (habit_id,)
            ).fetchone()
            if habit is None:
                raise DomainError("Habit not found.")
            start_date = date.fromisoformat(habit["start_date"])
            rows = connection.execute(
                """SELECT log_date FROM habit_logs
                   WHERE habit_id = ? AND status = 'done' AND log_date BETWEEN ? AND ?""",
                (habit_id, start_date.isoformat(), through.isoformat()),
            ).fetchall()
        done = {row["log_date"] for row in rows}
        output: list[dict] = []
        streak_start: date | None = None
        current = start_date
        while current <= through:
            if current.isoformat() in done:
                streak_start = streak_start or current
            elif streak_start:
                end = current - timedelta(days=1)
                output.append(self._streak(streak_start, end))
                streak_start = None
            current += timedelta(days=1)
        if streak_start:
            output.append(self._streak(streak_start, through))
        return sorted(output, key=lambda item: (-item["length"], item["startDate"]))

    @staticmethod
    def _streak(start: date, end: date) -> dict:
        return {
            "startDate": start.isoformat(), "endDate": end.isoformat(),
            "length": (end - start).days + 1,
        }

    def current_streak(self, habit_id: int, through_value: str) -> int:
        through = self.parse_day(through_value)
        with self.connect() as connection:
            row = connection.execute(
                "SELECT status FROM habit_logs WHERE habit_id = ? AND log_date = ?",
                (habit_id, through.isoformat()),
            ).fetchone()
        expected_end = through if row and row["status"] == "done" else through - timedelta(days=1)
        match = next(
            (item for item in self.streaks(habit_id, through.isoformat())
             if item["endDate"] == expected_end.isoformat()),
            None,
        )
        return match["length"] if match else 0

    def statistics(self) -> list[dict]:
        through = self.today().isoformat()
        with self.connect() as connection:
            habits = connection.execute(
                "SELECT id, name, start_date FROM habits WHERE archived_at IS NULL ORDER BY start_date, name, id"
            ).fetchall()
            note_counts = dict(connection.execute(
                "SELECT habit_id, COUNT(*) count FROM habit_notes GROUP BY habit_id"
            ).fetchall())
        output = []
        for habit in habits:
            streaks = self.streaks(habit["id"], through)
            output.append({
                "id": habit["id"], "name": habit["name"], "startDate": habit["start_date"],
                "currentStreak": self.current_streak(habit["id"], through),
                "longestStreak": streaks[0] if streaks else None, "streaks": streaks,
                "noteCount": note_counts.get(habit["id"], 0),
            })
        return output

    def month_summary(self, month_value: str) -> list[dict]:
        try:
            month_start = date.fromisoformat(f"{month_value}-01")
        except ValueError as exc:
            raise DomainError("Month must use YYYY-MM.") from exc
        next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        output = []
        current = month_start
        while current < next_month:
            habits = self.habits_on(current.isoformat())
            output.append({
                "date": current.isoformat(),
                "done": sum(item["status"] == "done" for item in habits),
                "missed": sum(item["status"] == "missed" for item in habits),
            })
            current += timedelta(days=1)
        return output

    def unresolved(self) -> list[dict]:
        today = self.today()
        with self.connect() as connection:
            row = connection.execute(
                "SELECT MIN(start_date) earliest FROM habits WHERE archived_at IS NULL"
            ).fetchone()
        if not row or not row["earliest"]:
            return []
        current = date.fromisoformat(row["earliest"])
        output = []
        while current < today:
            pending = sum(item["status"] == "pending" for item in self.habits_on(current.isoformat()))
            if pending:
                output.append({"date": current.isoformat(), "pendingCount": pending})
            current += timedelta(days=1)
        return list(reversed(output))

    def note_summaries(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                """SELECT h.id, h.name, h.start_date, h.archived_at, COUNT(n.habit_id) note_count
                   FROM habits h LEFT JOIN habit_notes n ON n.habit_id = h.id
                   GROUP BY h.id, h.name, h.start_date, h.archived_at
                   ORDER BY h.start_date, h.name, h.id"""
            ).fetchall()
        return [{
            "id": row["id"], "name": row["name"], "startDate": row["start_date"],
            "archived": row["archived_at"] is not None, "noteCount": row["note_count"],
        } for row in rows]

    def notes_for(self, habit_id: int) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                """SELECT n.habit_id, h.name, n.note_date, n.body
                   FROM habit_notes n JOIN habits h ON h.id = n.habit_id
                   WHERE n.habit_id = ? ORDER BY n.note_date DESC""",
                (habit_id,),
            ).fetchall()
        return [{
            "habitId": row["habit_id"], "habitName": row["name"],
            "date": row["note_date"], "body": row["body"],
        } for row in rows]

    def validate_import(self, path: Path) -> None:
        try:
            with self.connect(path) as connection:
                if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise ImportValidationError("The selected database is corrupted.")
                if connection.execute("PRAGMA foreign_key_check").fetchone():
                    raise ImportValidationError("The selected database has invalid relationships.")
                tables = {row[0] for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )}
                for table, expected in EXPECTED_COLUMNS.items():
                    if table not in tables:
                        raise ImportValidationError("The selected file is not a compatible habit database.")
                    columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}
                    if not expected.issubset(columns):
                        raise ImportValidationError(f"The {table} table is missing required columns.")
        except sqlite3.DatabaseError as exc:
            raise ImportValidationError("The selected file is not a valid SQLite database.") from exc

    def import_database(self, upload: bytes, confirmation: str) -> str:
        if confirmation != "IMPORT":
            raise DomainError("Type IMPORT to replace the current database.")
        if len(upload) > self.settings.max_import_bytes:
            raise DomainError("Database files cannot exceed 100 MB.")
        if not upload:
            raise DomainError("Choose a database file.")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._replacement_lock, tempfile.TemporaryDirectory(dir=self.path.parent) as temp_dir:
            staged = Path(temp_dir) / "staged.sqlite3"
            staged.write_bytes(upload)
            self.validate_import(staged)
            self.migrate(staged)
            self.validate_import(staged)
            backups = self.path.parent / "backups"
            backups.mkdir(exist_ok=True)
            stamp = datetime.now(self.settings.timezone).strftime("%Y%m%d-%H%M%S")
            backup = backups / f"pre-import-{stamp}.sqlite3"
            if self.path.exists():
                with self.connect() as source, sqlite3.connect(backup) as destination:
                    source.backup(destination)
            os.replace(staged, self.path)
            for suffix in ("-wal", "-shm"):
                Path(f"{self.path}{suffix}").unlink(missing_ok=True)
        return backup.name
