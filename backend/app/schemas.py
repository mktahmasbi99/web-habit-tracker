from typing import Literal

from pydantic import BaseModel, Field


class HabitCreate(BaseModel):
    name: str
    startDate: str


class HabitRename(BaseModel):
    name: str


class HabitDelete(BaseModel):
    confirmation: str


class StatusUpdate(BaseModel):
    status: Literal["pending", "done", "missed"]


class NoteUpdate(BaseModel):
    body: str = Field(max_length=20_000)


class TimedEntryUpdate(BaseModel):
    minutes: int = Field(ge=1, le=1440)


class BackupSettingsUpdate(BaseModel):
    dailyEnabled: bool
    dailyTime: str
    dailyRetention: int = Field(ge=1, le=365)
    weeklyEnabled: bool
    weeklyDay: int = Field(ge=0, le=6)
    weeklyTime: str
    weeklyRetention: int = Field(ge=1, le=365)


class BackupAction(BaseModel):
    filename: str
    confirmation: str


class BackupDelete(BaseModel):
    confirmation: str
