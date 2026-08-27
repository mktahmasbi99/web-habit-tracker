from __future__ import annotations

import asyncio
import sqlite3
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import load_settings
from .database import DomainError, HabitDatabase
from .schemas import (
    BackupAction,
    BackupDelete,
    BackupSettingsUpdate,
    HabitCreate,
    NoteUpdate,
    StatusUpdate,
)

settings = load_settings()
database = HabitDatabase(settings)


async def backup_scheduler() -> None:
    while True:
        try:
            await asyncio.to_thread(database.run_scheduled_backups)
        except (DomainError, OSError, sqlite3.Error) as exc:
            database._record_backup_failure("scheduled", exc)
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(backup_scheduler())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="web-habit-tracker API", version="1.0.0", lifespan=lifespan)


@app.exception_handler(DomainError)
async def domain_error_handler(_, exc: DomainError):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
def config() -> dict[str, str]:
    return {"today": database.today().isoformat(), "timezone": settings.timezone_name}


@app.get("/api/days/{day}/habits")
def day_habits(day: str) -> list[dict]:
    return database.habits_on(day)


@app.post("/api/habits", status_code=201)
def create_habit(payload: HabitCreate) -> dict:
    return database.create_habit(payload.name, payload.startDate)


@app.put("/api/habits/{habit_id}/days/{day}/status", status_code=204)
def update_status(habit_id: int, day: str, payload: StatusUpdate) -> None:
    database.set_status(habit_id, day, payload.status)


@app.get("/api/habits/{habit_id}/days/{day}/note")
def get_note(habit_id: int, day: str) -> dict[str, str]:
    return {"body": database.note(habit_id, day)}


@app.put("/api/habits/{habit_id}/days/{day}/note", status_code=204)
def update_note(habit_id: int, day: str, payload: NoteUpdate) -> None:
    database.save_note(habit_id, day, payload.body)


@app.get("/api/months/{month}")
def month_summary(month: str) -> list[dict]:
    return database.month_summary(month)


@app.get("/api/statistics")
def statistics() -> list[dict]:
    return database.statistics()


@app.get("/api/notes")
def note_summaries() -> list[dict]:
    return database.note_summaries()


@app.get("/api/habits/{habit_id}/notes")
def habit_notes(habit_id: int) -> list[dict]:
    return database.notes_for(habit_id)


@app.get("/api/unresolved")
def unresolved() -> list[dict]:
    return database.unresolved()


@app.get("/api/system-notifications")
def system_notifications() -> list[dict]:
    return database.system_notifications()


@app.delete("/api/system-notifications/{notification_id}", status_code=204)
def dismiss_system_notification(notification_id: int) -> None:
    database.dismiss_system_notification(notification_id)


@app.get("/api/backups")
def backups() -> list[dict]:
    return database.list_backups()


@app.post("/api/backups")
def create_backup() -> FileResponse:
    path = database.create_backup()
    return FileResponse(path, filename=path.name, media_type="application/vnd.sqlite3")


@app.get("/api/backups/settings")
def backup_settings() -> dict:
    return database.backup_settings()


@app.put("/api/backups/settings")
def update_backup_settings(payload: BackupSettingsUpdate) -> dict:
    return database.update_backup_settings(payload.model_dump())


@app.get("/api/backups/{filename}/download")
def download_backup(filename: str) -> FileResponse:
    path = database.backup_path(filename)
    return FileResponse(path, filename=path.name, media_type="application/vnd.sqlite3")


@app.post("/api/backups/restore")
def restore_server_backup(payload: BackupAction) -> dict[str, str]:
    safety = database.restore_server_backup(payload.filename, payload.confirmation)
    return {"status": "restored", "backup": safety}


@app.post("/api/backups/restore-upload")
async def restore_uploaded_backup(
    backup_file: Annotated[UploadFile, File()], confirmation: Annotated[str, Form()]
) -> dict[str, str]:
    if not backup_file.filename:
        raise HTTPException(status_code=400, detail="Choose a backup file.")
    content = await backup_file.read(settings.max_import_bytes + 1)
    safety = database.restore_uploaded_backup(content, confirmation)
    return {"status": "restored", "backup": safety}


@app.delete("/api/backups/{filename}", status_code=204)
def delete_backup(filename: str, payload: BackupDelete) -> None:
    database.delete_backup(filename, payload.confirmation)


@app.post("/api/import")
async def import_database(
    database_file: Annotated[UploadFile, File()], confirmation: Annotated[str, Form()]
) -> dict[str, str]:
    if not database_file.filename:
        raise HTTPException(status_code=400, detail="Choose a database file.")
    content = await database_file.read(settings.max_import_bytes + 1)
    backup = database.import_database(content, confirmation)
    return {"status": "imported", "backup": backup}


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
