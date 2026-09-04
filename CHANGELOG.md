# Changelog

All notable changes to this project are documented here.

## Unreleased

- Add an expanded-by-default, preference-preserving Timed activities section with multiple duration sessions, hours-and-minutes entry, per-day 24-hour validation, selected-day and running weekly totals, Monday-first history navigation, and per-activity daily notes.
- Add dedicated timed-activity persistence and APIs without changing the five legacy tables or the done/missed compatibility contract.
- Put timed entries before the weekly and selected-day statistics, keep notes last, and make note saving update the open sheet immediately with visible progress and confirmation.
- Add a dedicated Management tab with active and archived Daily habits and Timed activities, remembered disclosure states, full-screen timed-activity details, rename, archive, restore, and protected permanent deletion.
- Include timed activities and their note counts in the Notes tab under a collapsed Timed activities disclosure.
- Use a clearer Settings-style Management icon, move all timed day/week figures and weekly breakdowns into Stats, simplify Today cards and logging sheets, and add inline timed-activity renaming from the logging sheet.
- Keep the confirmed timed-note state visibly blue and labelled “Saved!” until the text changes.
- Add a reusable full-screen note view with read-only display, explicit editing controls, ordinary delete confirmation, direct URLs, and a clear missing-note state.
- Replace the Notes history dialog with the selected note immediately, then restore that history dialog when the note closes.
- Add habit Management under More with active and archived disclosures, full-screen reusable habit details, inline rename, archive, confirmed restore, archive-period streak and note history, and confirmed permanent deletion.
- Add pre-delete snapshots to the existing shared eight-backup safety retention pool and abort deletion if the snapshot cannot be created.
- Preserve the Management disclosure state and scroll position when habit details close through X or browser Back.
- Keep the legacy `resurrected_at` database column for import compatibility while using Restore consistently in user-facing copy and documentation.
- Replace plain Management subgroup captions with collapsible disclosure rows for Daily habits and Timed activities under both Active and Archived.
- Add daily-habit-style note buttons to timed activity cards and reuse the full-screen note read, edit, delete, history, and direct-URL workflow.
- Organize Notes under collapsible Daily habits and Timed activities disclosures with category note totals; Daily habits opens by default.
- Remove note editing from the timed activity entry sheet; timed notes remain available from each activity card and the Notes section.
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
