from contextlib import contextmanager
from datetime import timedelta
from time import perf_counter

import pytest


def _seed_long_history(store) -> None:
    today = store.today()
    start = today - timedelta(days=365 * 5)
    with store.connect() as connection, connection:
        connection.executemany(
            "INSERT INTO habits(name, start_date) VALUES (?, ?)",
            [(f"Habit {number:02}", start.isoformat()) for number in range(50)],
        )
        habit_ids = [row[0] for row in connection.execute("SELECT id FROM habits ORDER BY id")]
        logs = []
        current = start
        while current <= today:
            for habit_id in habit_ids:
                if (current.toordinal() + habit_id) % 5 == 0:
                    logs.append((habit_id, current.isoformat(), "done"))
                elif (current.toordinal() + habit_id) % 29 == 0:
                    logs.append((habit_id, current.isoformat(), "missed"))
            current += timedelta(days=1)
        connection.executemany(
            "INSERT INTO habit_logs(habit_id, log_date, status) VALUES (?, ?, ?)", logs
        )
        connection.execute(
            "INSERT INTO habit_archive_periods(habit_id, archived_at, resurrected_at) VALUES (?, ?, ?)",
            (habit_ids[0], (today - timedelta(days=700)).isoformat(), (today - timedelta(days=500)).isoformat()),
        )


@pytest.mark.performance
def test_long_history_queries_are_bounded_and_fast(store, monkeypatch):
    _seed_long_history(store)
    statements: list[str] = []
    original_connect = store.connect

    @contextmanager
    def traced_connect(path=None):
        with original_connect(path) as connection:
            connection.set_trace_callback(statements.append)
            yield connection

    monkeypatch.setattr(store, "connect", traced_connect)
    month = store.today().strftime("%Y-%m")
    for operation in (
        lambda: store.month_summary(month),
        store.unresolved,
        store.statistics,
        lambda: store.habits_on(store.today().isoformat()),
    ):
        statements.clear()
        started = perf_counter()
        result = operation()
        elapsed = perf_counter() - started
        assert result
        assert elapsed < 3
        assert len(statements) <= 4
