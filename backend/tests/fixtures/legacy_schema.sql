-- Legacy iHabitTracker HabitStore.swift terminal-schema-v1, retained as an independent import fixture.
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
