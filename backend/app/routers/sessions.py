from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import RehabPlanItem, RepRecord, User, WorkoutSession
from app.schemas import SessionCreate, SessionDetail, SessionOut, StatsOut
from app.stats import compute_user_stats

router = APIRouter(prefix="/api", tags=["sessions"])


def _get_own_session(db: DbSession, user: User, session_id: int) -> WorkoutSession:
    session = db.get(WorkoutSession, session_id)
    # 404 (not 403) for other people's sessions, so ids of other users are not revealed
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


def _check_plan_item(db: DbSession, user: User, body: SessionCreate) -> None:
    """A workout may only be tagged with an exercise from the user's own, active rehab plan."""
    item = db.get(RehabPlanItem, body.plan_item_id) if body.plan_item_id is not None else None
    link = item.plan.link if item is not None else None
    valid = (
        item is not None
        and item.plan.is_active
        and link is not None
        and link.status == "active"
        and link.patient_id == user.id
    )
    if not valid:
        raise HTTPException(
            status_code=422,
            detail="This exercise is not part of your active rehab plan",
        )
    if item.exercise != body.exercise:
        raise HTTPException(
            status_code=422,
            detail="The exercise does not match the prescribed exercise",
        )


@router.post("/sessions", response_model=SessionDetail, status_code=status.HTTP_201_CREATED)
def create_session(body: SessionCreate, current_user: CurrentUser, db: DbSession) -> WorkoutSession:
    if body.plan_item_id is not None:
        _check_plan_item(db, current_user, body)

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
        plan_item_id=body.plan_item_id,
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
    return compute_user_stats(db, current_user.id, tz_offset)
