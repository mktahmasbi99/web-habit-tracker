from typing import Literal

from pydantic import BaseModel, Field


class HabitCreate(BaseModel):
    name: str
    startDate: str


class StatusUpdate(BaseModel):
    status: Literal["pending", "done", "missed"]


class NoteUpdate(BaseModel):
    body: str = Field(max_length=20_000)

