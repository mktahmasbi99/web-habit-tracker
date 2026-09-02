# Changelog

All notable changes to this project are documented here.

## Unreleased

- Add a reusable full-screen note view with read-only display, explicit editing controls, ordinary delete confirmation, direct URLs, and a clear missing-note state.
- Replace the Notes history dialog with the selected note immediately, then restore that history dialog when the note closes.
- Add habit Management under More with active and archived disclosures, full-screen reusable habit details, inline rename, archive, confirmed restore, archive-period streak and note history, and confirmed permanent deletion.
- Add pre-delete snapshots to the existing shared eight-backup safety retention pool and abort deletion if the snapshot cannot be created.
- Preserve the Management disclosure state and scroll position when habit details close through X or browser Back.
- Keep the legacy `resurrected_at` database column for import compatibility while using Restore consistently in user-facing copy and documentation.
- Open habit details from the full daily habit card and simplify habit restoration to a normal confirmation without typed input.
- Backfill newly created habits that start in the past as Done from their start date through yesterday.
- Add Ctrl+Enter as a keyboard shortcut for saving an open note editor.
- Show the ISO date subtitle only beneath Today, Yesterday, and Tomorrow, avoiding redundant dates beneath ordinary day headings.
- Add downloadable on-demand backups, GUI-configured daily and weekly schedules, retention controls, tagged backup browsing, and failure notifications.
- Add validated server-side and uploaded backup restore, pre-restore safety snapshots, explicit web-backup markers, and confirmed backup deletion.
- Consolidate restore actions into the server backup list and place scheduling plus the legacy importer under Advanced.
- Remove visible navigation captions while retaining accessible names for the icon buttons, and use a circled check for the primary habit view.
- Group the collapsed Backup and restore and Advanced disclosures under a concise Data heading.
- Rename Application to Server time and explain that its timezone and date values are read-only server settings.
- Record user-configurable server timezone changes as planned future work.

## 1.0.0 - 2026-08-26

- Reproduce the implemented iPhone habit-tracking workflows in a responsive web interface.
- Preserve legacy SQLite compatibility with validated, backed-up imports.
- Add timezone-authoritative FastAPI persistence, automated tests, and NAS Docker deployment.
