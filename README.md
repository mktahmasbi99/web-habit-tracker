# web-habit-tracker

`web-habit-tracker` is a private, single-user habit tracker for a NAS. It is the canonical successor to the discontinued SwiftUI `iHabitTracker` app and the legacy `terminal-habit-tracker` project.

The interface is mobile-first and keeps the iPhone app's visual language: system-style light and dark colors, rounded grouped surfaces, a blue accent, and green/orange/red habit states. All browsers use one SQLite database stored on the server.

## Implemented in v1

- Today and historical date navigation with a Monday-first calendar
- Daily habit creation from any selected date
- Pending, Done, and Missed status controls
- Current, longest, and historical streak statistics
- Per-habit, per-day notes plus a notes index and history
- Unresolved past-date notifications inside the app
- Validated import of compatible terminal/iPhone SQLite databases
- Automatic safety backup before an imported database replaces live data
- Responsive phone and desktop layouts with light and dark appearance
- Docker image and NAS Compose deployment

## Status rules

- Every habit is daily in v1.
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

The backup list tags Daily, Weekly, and On-demand backups. Pre-import and Pre-restore safety snapshots are hidden by default behind **Show safety backups** and share a retention limit of eight. Every backup can be downloaded, restored, or deleted. Restore requires typing `RESTORE`, validates and migrates a staged copy, preserves the current schedule settings, creates a safety snapshot, and then atomically replaces live data. Delete requires typing `DELETE`.

The collapsed **More** section below the server backup list accepts uploaded backups produced by this web application. Web backups contain an explicit application and format marker. At the bottom of Advanced, the collapsed **Import legacy database** section accepts a compatible legacy SQLite database. Legacy import validates database integrity and schema, requires typing `IMPORT`, migrates a staged copy, creates a safety backup, and atomically swaps the staged database into place. Uploaded source files are never changed.

Scheduled backup failures appear as dismissible in-app system notifications. The server also logs failures; if storage is too full or unwritable to persist the notification, it is retained in memory when possible.

Imported data becomes authoritative. There is no synchronization with either legacy application.

## Roadmap

- Habit rename, archive, resurrection, and protected deletion
- Challenges with inclusive dates and progress
- Installable Progressive Web App packaging for iPhone and desktop
- Carefully scoped browser push notifications
- Custom schedules and measurements only after their behavior is specified

PWA support will remain server-backed and require connectivity to the NAS through Tailscale; Tailscale Serve HTTPS is the preferred future setup.

## License

MIT
