# web-habit-tracker

`web-habit-tracker` is a private, single-user habit tracker for a NAS. It is the canonical successor to the discontinued SwiftUI `iHabitTracker` app and the legacy `terminal-habit-tracker` project.

The interface is mobile-first and keeps the iPhone app's visual language: system-style light and dark colors, rounded grouped surfaces, a blue accent, and green/orange/red habit states. All browsers use one SQLite database stored on the server.

## Implemented in v1

- Today and historical date navigation with a Monday-first calendar
- Daily habit creation from any selected date
- Pending, Done, and Missed status controls
- Expandable Timed activities with clock-labelled selected-day totals on cards and entry sheets, prominent hours-and-minutes session logging, Monday-through-selected-day running totals, weekly history, and per-activity daily notes
- Current, longest, and historical streak statistics
- Per-habit, per-day notes with full-screen read, edit, and delete controls, direct note URLs, plus a notes index and history; press Ctrl+Enter while editing to save and exit
- Habit management with rename, reversible archive and restore, period-scoped history, and protected permanent deletion
- Dedicated Management navigation divided into active and archived Daily habits and Timed activities
- Unresolved past-date notifications inside the app
- Validated import of compatible terminal/iPhone SQLite databases
- Automatic safety backup before an imported database replaces live data
- Responsive phone and desktop layouts with light and dark appearance
- Docker image and NAS Compose deployment

## Status rules

- Daily habits use binary Done, Missed, and Pending states. Timed activities are observational and never imply success or failure.
- A missing timed-activity entry means zero. Multiple sessions can be logged per day, use whole minutes, and may total at most 24 hours per activity per day.
- Timed entries and notes can be changed on any active date through today; future dates reject them.
- Pending is the default and is represented by no saved log row.
- Any date can be changed or undone.
- Historical Pending and Missed days break a streak.
- Current streaks count consecutive explicit Done days through today, or through yesterday when today is not Done.
- Creating a habit with a past start date marks the earlier dates Done through yesterday, matching the legacy behavior.
- Only past unresolved dates appear in Notifications.

## Run for development

```sh
python3 -m venv .venv
.venv/bin/pip install -e "./backend[dev]"
cd frontend && npm install && npm run build && cd ..
TZ=Europe/Warsaw WEB_HABIT_TRACKER_DB=/tmp/web-habit-tracker.sqlite3 \
  .venv/bin/uvicorn app.main:app --app-dir backend --reload --port 8000
```

Open `http://localhost:8000`.

## Docker and Tailscale

```sh
docker compose -f deploy/docker-compose.nas.yml up -d
```

Open `http://<nas-tailscale-name-or-ip>:8000`. Tailscale controls private-network access; the app intentionally has no account or login. Runtime data lives in the mounted `data/` directory and survives restarts and upgrades.

The deployer controls the calendar timezone through `TZ`. Compose uses `Europe/Warsaw` only when `TZ` is absent. See [deploy/README.md](deploy/README.md).

## Backup and restore

The More tab creates downloadable on-demand SQLite backups and manages server-side backups stored in `/data/backups`. Daily backups are enabled by default at 01:00 with seven retained; weekly backups run Sunday at 01:00 with eight retained. Schedule, weekday, enable, and retention controls live under Advanced, use the configured `TZ`, and require saving together. When the server misses a scheduled run, it creates one catch-up backup after returning.

The backup list tags Daily, Weekly, and On-demand backups. Pre-import, Pre-restore, and Pre-delete safety snapshots are hidden by default behind **Show safety backups** and share a retention limit of eight. Every backup can be downloaded, restored, or deleted. Restore requires typing `RESTORE`, validates and migrates a staged copy, preserves the current schedule settings, creates a safety snapshot, and then atomically replaces live data. Permanently deleting a habit also requires typing `DELETE` and creates a safety snapshot immediately before removal; deletion stops if that snapshot cannot be created.

Habit Management lives on More. Active habits are expanded by default and archived habits are collapsed by default. Habits can also be opened directly from the main daily view. Opening a habit provides rename, archive or restore, and protected deletion actions. Archive preserves logs and notes, treats the archive date as the final active day, and records each active period. Restore uses a normal confirmation, begins on the server-authoritative current date, and does not backfill the inactive gap. Returning from habit details preserves the disclosure state and list position until a full reload.

The collapsed **More** section below the server backup list accepts uploaded backups produced by this web application. Web backups contain an explicit application and format marker. At the bottom of Advanced, the collapsed **Import legacy database** section accepts a compatible legacy SQLite database. Legacy import validates database integrity and schema, requires typing `IMPORT`, migrates a staged copy, creates a safety backup, and atomically swaps the staged database into place. Uploaded source files are never changed.

Scheduled backup failures appear as dismissible in-app system notifications. The server also logs failures; if storage is too full or unwritable to persist the notification, it is retained in memory when possible.

Imported data becomes authoritative. There is no synchronization with either legacy application.

## Roadmap

- Challenges with inclusive dates and progress
- Installable Progressive Web App packaging for iPhone and desktop
- Carefully scoped browser push notifications
- User-configurable server timezone changes with explicit date-boundary behavior
- Custom schedules and non-duration measurements only after their behavior is specified

PWA support will remain server-backed and require connectivity to the NAS through Tailscale; Tailscale Serve HTTPS is the preferred future setup.

## License

MIT
