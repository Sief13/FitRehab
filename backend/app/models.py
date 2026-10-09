from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # "user" (free) | "premium" | "physiatrist"
    role: Mapped[str] = mapped_column(String(20), default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkoutSession(Base):
    """One finished workout: a user doing one exercise for a number of reps."""

    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    exercise: Mapped[str] = mapped_column(String(30))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    duration_sec: Mapped[int]
    # Totals are computed by the server from the reps, never trusted from the browser.
    rep_count: Mapped[int]
    avg_score: Mapped[float]
    avg_rom: Mapped[float]
    avg_posture: Mapped[float]
    avg_tempo: Mapped[float]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    reps: Mapped[list["RepRecord"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="RepRecord.rep_index",
    )


class RepRecord(Base):
    """One scored repetition inside a session."""

    __tablename__ = "rep_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True
    )
    rep_index: Mapped[int]  # 1-based position within the session
    score: Mapped[int]
    rom: Mapped[int]
    posture: Mapped[int]
    tempo: Mapped[int]
    duration_ms: Mapped[int]
    min_angle: Mapped[int]

    session: Mapped["WorkoutSession"] = relationship(back_populates="reps")
