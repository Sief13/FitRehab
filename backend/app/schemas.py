from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.timeutil import as_utc

Role = Literal["user", "premium", "physiatrist"]
# People can sign up as a member or a physiatrist. "premium" is only obtained by upgrading.
RegisterRole = Literal["user", "physiatrist"]
Exercise = Literal["squat", "bicep_curl"]
Percent = Annotated[int, Field(ge=0, le=100)]


# ---------------------------------------------------------------- auth

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: RegisterRole = "user"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------- workout sessions

class RepIn(BaseModel):
    """One rep as measured by the browser. The server assigns the rep numbers itself."""

    score: Percent
    rom: Percent
    posture: Percent
    tempo: Percent
    duration_ms: int = Field(ge=0, le=600_000)
    min_angle: int = Field(ge=0, le=180)


class SessionCreate(BaseModel):
    exercise: Exercise
    started_at: datetime
    duration_sec: int = Field(ge=0, le=86_400)
    reps: list[RepIn] = Field(min_length=1, max_length=500)

    @field_validator("started_at")
    @classmethod
    def _normalize_start(cls, value: datetime) -> datetime:
        value = as_utc(value)
        if value > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError("started_at cannot be in the future")
        return value


class RepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rep_index: int
    score: int
    rom: int
    posture: int
    tempo: int
    duration_ms: int
    min_angle: int


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise: str
    started_at: datetime
    duration_sec: int
    rep_count: int
    avg_score: float
    avg_rom: float
    avg_posture: float
    avg_tempo: float

    @field_validator("started_at")
    @classmethod
    def _label_as_utc(cls, value: datetime) -> datetime:
        # makes the JSON carry a UTC marker ("Z") so the browser converts it to local time correctly
        return as_utc(value)


class SessionDetail(SessionOut):
    reps: list[RepOut]


class StatsOut(BaseModel):
    total_sessions: int
    total_reps: int
    sessions_last_7_days: int
    average_score: float | None  # average over every rep ever recorded; None before the first one
    streak_days: int
