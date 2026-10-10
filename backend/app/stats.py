from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import RepRecord, WorkoutSession
from app.schemas import StatsOut
from app.timeutil import as_utc


def compute_streak(active_days: set[date], today: date) -> int:
    """Number of consecutive days with a workout, ending today or yesterday.

    A streak is still alive if you trained yesterday but haven't trained yet today.
    """
    day = today if today in active_days else today - timedelta(days=1)
    streak = 0
    while day in active_days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def compute_user_stats(db: Session, user_id: int, tz_offset: int = 0) -> StatsOut:
    """Dashboard numbers for one user. `tz_offset` = minutes EAST of UTC (Egypt: 120 or 180)."""
    total_sessions, total_reps = db.execute(
        select(func.count(WorkoutSession.id), func.coalesce(func.sum(WorkoutSession.rep_count), 0)).where(
            WorkoutSession.user_id == user_id
        )
    ).one()

    average_score = db.scalar(
        select(func.avg(RepRecord.score))
        .join(WorkoutSession, RepRecord.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user_id)
    )

    # "Days" depend on the user's time zone, so shift every start time before taking its date.
    shift = timedelta(minutes=tz_offset)
    local_days = [
        (as_utc(s) + shift).date()
        for s in db.scalars(select(WorkoutSession.started_at).where(WorkoutSession.user_id == user_id))
    ]
    today = (datetime.now(timezone.utc) + shift).date()
    week_start = today - timedelta(days=6)  # today and the 6 days before it
    sessions_last_7_days = sum(1 for d in local_days if week_start <= d <= today)

    return StatsOut(
        total_sessions=total_sessions,
        total_reps=int(total_reps),
        sessions_last_7_days=sessions_last_7_days,
        average_score=round(average_score, 1) if average_score is not None else None,
        streak_days=compute_streak(set(local_days), today),
    )
