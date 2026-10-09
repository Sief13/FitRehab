from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import RepRecord, User, WorkoutSession
from app.schemas import SessionCreate, SessionDetail, SessionOut, StatsOut
from app.timeutil import as_utc

router = APIRouter(prefix="/api", tags=["sessions"])


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


def _get_own_session(db: DbSession, user: User, session_id: int) -> WorkoutSession:
    session = db.get(WorkoutSession, session_id)
    # 404 (not 403) for other people's sessions, so ids of other users are not revealed
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.post("/sessions", response_model=SessionDetail, status_code=status.HTTP_201_CREATED)
def create_session(body: SessionCreate, current_user: CurrentUser, db: DbSession) -> WorkoutSession:
    reps = body.reps
    n = len(reps)

    def avg(values: list[int]) -> float:
        return round(sum(values) / n, 1)

    session = WorkoutSession(
        user_id=current_user.id,
        exercise=body.exercise,
        started_at=body.started_at,
        duration_sec=body.duration_sec,
        rep_count=n,
        avg_score=avg([r.score for r in reps]),
        avg_rom=avg([r.rom for r in reps]),
        avg_posture=avg([r.posture for r in reps]),
        avg_tempo=avg([r.tempo for r in reps]),
        reps=[
            RepRecord(
                rep_index=i,
                score=r.score,
                rom=r.rom,
                posture=r.posture,
                tempo=r.tempo,
                duration_ms=r.duration_ms,
                min_angle=r.min_angle,
            )
            for i, r in enumerate(reps, start=1)
        ],
    )
    db.add(session)
    db.commit()
    return session


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[WorkoutSession]:
    stmt = (
        select(WorkoutSession)
        .where(WorkoutSession.user_id == current_user.id)
        .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt))


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: int, current_user: CurrentUser, db: DbSession) -> WorkoutSession:
    return _get_own_session(db, current_user, session_id)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int, current_user: CurrentUser, db: DbSession) -> Response:
    db.delete(_get_own_session(db, current_user, session_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/stats", response_model=StatsOut)
def get_stats(
    current_user: CurrentUser,
    db: DbSession,
    # minutes EAST of UTC, i.e. -new Date().getTimezoneOffset() in the browser (Egypt: 120 or 180)
    tz_offset: int = Query(0, ge=-840, le=840),
) -> StatsOut:
    uid = current_user.id

    total_sessions, total_reps = db.execute(
        select(func.count(WorkoutSession.id), func.coalesce(func.sum(WorkoutSession.rep_count), 0)).where(
            WorkoutSession.user_id == uid
        )
    ).one()

    average_score = db.scalar(
        select(func.avg(RepRecord.score))
        .join(WorkoutSession, RepRecord.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == uid)
    )

    # "Days" depend on the user's time zone, so shift every start time before taking its date.
    shift = timedelta(minutes=tz_offset)
    local_days = [
        (as_utc(s) + shift).date()
        for s in db.scalars(select(WorkoutSession.started_at).where(WorkoutSession.user_id == uid))
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
