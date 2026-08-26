from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import load_settings
from .database import DomainError, HabitDatabase
from .schemas import HabitCreate, NoteUpdate, StatusUpdate

settings = load_settings()
database = HabitDatabase(settings)
app = FastAPI(title="web-habit-tracker API", version="1.0.0")


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
