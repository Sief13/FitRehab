from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
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


class CareLink(Base):
    """A relationship between one patient and one physiatrist.

    The patient sends the request ("pending"); the physiatrist accepts it ("active").
    Only an active link lets the physiatrist see the patient's workouts or assign plans.
    Either side can end the link at any time by deleting it.
    """

    __tablename__ = "care_links"
    __table_args__ = (UniqueConstraint("patient_id", "physiatrist_id", name="uq_care_link_pair"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    physiatrist_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="pending")  # "pending" | "active"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    patient: Mapped["User"] = relationship(foreign_keys=[patient_id])
    physiatrist: Mapped["User"] = relationship(foreign_keys=[physiatrist_id])
    plans: Mapped[list["RehabPlan"]] = relationship(
        back_populates="link", cascade="all, delete-orphan", order_by="RehabPlan.id"
    )


class RehabPlan(Base):
    """An exercise plan a physiatrist assigns to a patient. Only one plan per link is active."""

    __tablename__ = "rehab_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    link_id: Mapped[int] = mapped_column(ForeignKey("care_links.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    notes: Mapped[str] = mapped_column(String(1000), default="")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    link: Mapped["CareLink"] = relationship(back_populates="plans")
    items: Mapped[list["RehabPlanItem"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="RehabPlanItem.position"
    )


class RehabPlanItem(Base):
    """One prescribed exercise inside a plan, e.g. 3 sets of 10 squats with a target score of 80."""

    __tablename__ = "rehab_plan_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("rehab_plans.id", ondelete="CASCADE"), index=True)
    position: Mapped[int]
    exercise: Mapped[str] = mapped_column(String(30))
    sets: Mapped[int]
    reps_per_set: Mapped[int]
    target_score: Mapped[int]

    plan: Mapped["RehabPlan"] = relationship(back_populates="items")


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
    # Set when the workout was done to fulfil a prescribed rehab exercise
    plan_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("rehab_plan_items.id", ondelete="SET NULL"), index=True, default=None
    )

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
