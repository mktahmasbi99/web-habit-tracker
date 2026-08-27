# Changelog

All notable changes to this project are documented here.

## Unreleased

- Show the ISO date subtitle only beneath Today, Yesterday, and Tomorrow, avoiding redundant dates beneath ordinary day headings.
- Add downloadable on-demand backups, GUI-configured daily and weekly schedules, retention controls, tagged backup browsing, and failure notifications.
- Add validated server-side and uploaded backup restore, pre-restore safety snapshots, explicit web-backup markers, and confirmed backup deletion.
- Consolidate restore actions into the server backup list and place scheduling plus the legacy importer under Advanced.
- Remove visible navigation captions while retaining accessible names for the icon buttons, and use a circled check for the primary habit view.
- Group the collapsed Backup and restore and Advanced disclosures under a concise Data heading.
- Rename Application to Server time and explain that its timezone and date values are read-only server settings.

## 1.0.0 - 2026-08-26

- Reproduce the implemented iPhone habit-tracking workflows in a responsive web interface.
- Preserve legacy SQLite compatibility with validated, backed-up imports.
- Add timezone-authoritative FastAPI persistence, automated tests, and NAS Docker deployment.
