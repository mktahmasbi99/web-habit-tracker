# Contributor Guide for Coding Agents

## Product contract

`web-habit-tracker` is the canonical, maintained habit tracker. It is a private-network, single-user web app with no application login. The server-side SQLite database is authoritative; browsers must never store habit data as the source of truth.

The behavior implemented by the legacy iPhone app is the v1 compatibility contract. Pending is represented by no `habit_logs` row, all dates remain editable, a historical Pending or Missed day breaks a streak, and a newly created habit with a past start date receives Done logs through yesterday.

## Architecture

- `backend/`: FastAPI, Python standard-library SQLite, migrations, API, import safety.
- `frontend/`: React, TypeScript, Vite, responsive UI.
- `deploy/`: NAS Docker Compose reference and operator documentation.
- `/data/habit_tracker.sqlite3`: runtime database in the container; never commit it.

Keep the five legacy tables compatible: `habits`, `habit_logs`, `habit_notes`, `habit_challenges`, and `habit_archive_periods`. Add changes through numbered migrations. Validate imported databases before replacing live data.

## Commands

Backend: `python3 -m pytest backend/tests -q`

Frontend: `cd frontend && npm test -- --run && npm run typecheck && npm run build`

Local server: build the frontend, then run `python3 -m uvicorn app.main:app --app-dir backend --reload --port 8000`.

## Engineering rules

- Dates crossing midnight must use the configured IANA `TZ`, not a browser timezone or naive server clock.
- Use parameterized SQL, transactions for writes, foreign keys, and a busy timeout.
- Add indexes only for real query paths and retain import compatibility.
- Maintain keyboard access, visible focus, touch targets, reduced motion, light/dark themes, and current browser support.
- Keep UI copy in English and calendars Monday-first.
- Do not add accounts, public exposure, cloud synchronization, PWA behavior, or roadmap features without an explicit scope change.
- Never commit secrets, environment files, databases, backups, imported files, runtime volumes, or generated coverage/build output.
- Update tests, README, and CHANGELOG when behavior changes.

## Git

Use focused commits. Repository changes authored by Codex use `Codex <267193182+codex@users.noreply.github.com>`. Do not rewrite or discard a contributor's unrelated work.

