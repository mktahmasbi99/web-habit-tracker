# web-habit-tracker

**NOTE: THIS PROJECT IS VIBE CODED AND MAINLY EXISTS TO SCRATCH A PERSONAL ITCH.**

`web-habit-tracker` is a private, single-user habit tracker for a NAS. It is the canonical successor to the discontinued SwiftUI `iHabitTracker` app and the legacy `terminal-habit-tracker` project.

The interface is mobile-first and keeps the iPhone app's visual language: system-style light and dark colors, rounded grouped surfaces, a blue accent, and green/orange/red habit states. All browsers use one SQLite database stored on the server.

## Implemented in v1

- Today and historical date navigation with a Monday-first calendar
- Daily habit creation from any selected date
- Pending, Done, and Missed status controls
- Expandable Timed activities with clock-labelled selected-day totals on cards and entry sheets, prominent hours-and-minutes session logging, Monday-through-selected-day running totals and weekly history in each activity sheet, and per-activity daily notes
- Expandable Activity log for observational records such as maintenance and care: each item shows when it was last done, has a monthly completion calendar, and supports notes on completed or uncompleted dates without streaks, schedules, or reminders
- Current streaks beside each daily habit, plus current, longest, and historical streak statistics in each habit sheet
- Per-habit, per-day notes with full-screen read, edit, and delete controls, direct note URLs, plus a notes index and history; press Ctrl+Enter or Cmd+Enter while editing to save and exit
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

Habit Management lives on the Manage tab. Active habits are expanded by default and archived habits are collapsed by default. Habits can also be opened directly from the main daily view. Opening a habit provides rename, archive or restore, and protected deletion actions. Archive preserves logs and notes, treats the archive date as the final active day, and records each active period. Restore uses a normal confirmation, begins on the server-authoritative current date, and does not backfill the inactive gap. Returning from habit details preserves the disclosure state and list position until a full reload.

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

## Phone behavior and verification

The app refreshes the server date and daily data on foregrounding, reconnection,
page restoration, and every 30 seconds while visible. A selection following Today
advances with the server day; an explicitly selected historical date stays selected.
Open timed-entry sheets keep their original date. The server's configured IANA `TZ`
remains authoritative even when the phone travels to another timezone.

Daily navigation cancels obsolete reads. A pending status write disables the other
status buttons for that habit/date and displays Saving. Reads have a 15-second
deadline and recoverable loading errors; startup, daily lists, calendar, and detail
screens offer Retry. Writes are never retried automatically. If connectivity is lost
after submitting a duration entry, check the server's entries before submitting again.

Timed-entry fields start blank and show `0` only as a placeholder. The Minutes field
accepts a total duration through 1,440 minutes; when it loses focus, the app converts
valid totals to the corresponding hours-and-minutes fields (for example, `100` becomes
`1h 40m`).

Sheets use native modal dialogs, contain keyboard focus, restore focus on dismissal,
and support Escape and browser Back, including nested confirmations. Timed-management
details have direct URLs. Note editing asks before discarding unsaved changes through
Close or Back, and requests the browser's unload warning on reload or exit. Drafts
remain in memory across reconnects; they are not durable browser storage and cannot
survive a terminated browser process. Explicit Cancel discards the edit.

Navigation stays along the bottom on short landscape screens. Touch controls target
44 CSS pixels; form controls use at least 16px text, calendar states include accessible
summaries, and layouts account for safe areas and the visible keyboard viewport.
Pinch zoom, system light/dark appearance, and reduced motion remain supported.

Run frontend unit tests, type checking, build, and lint as follows:

```sh
cd frontend
npm test -- --run
npm run typecheck
npm run build
npm run lint
```

Playwright includes desktop Chromium, Android, narrow and landscape Chromium,
and portrait/narrow/landscape WebKit profiles. E2E tests create and delete test data:
run them only against an isolated server with a temporary database, never a live NAS
database. Set `E2E_BASE_URL` to that server's URL; the default is localhost:8000.

```sh
E2E_BASE_URL=http://127.0.0.1:8765 npm run test:e2e
```

Portable daily-contract cases and an independent copy of the legacy five-table schema
live in `backend/tests/fixtures`. Backend tests cover leap-day gaps, Pending/Missed
streak boundaries, future daily edits, IANA timezone/DST boundaries, and legacy import
preservation without modifying the source database.

Before a phone release, verify on an actual iPhone and Android phone: software-keyboard
open/close and rotation, browser toolbar expansion, safe areas, VoiceOver/TalkBack,
200% text, swipe Back with an unsaved note, overnight resume, and SQLite backup
save-to-Files/upload. Browser emulation does not establish those native-device behaviors.
