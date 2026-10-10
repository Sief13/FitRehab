from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentUser, DbSession, require_roles
from app.models import CareLink, RehabPlan, RehabPlanItem, RepRecord, User, WorkoutSession
from app.schemas import (
    ItemProgress,
    LinkOut,
    LinkRequest,
    PatientOverview,
    PersonOut,
    PlanCreate,
    PlanItemOut,
    PlanOut,
    SessionDetail,
    SessionOut,
)
from app.stats import compute_user_stats

router = APIRouter(prefix="/api/rehab", tags=["rehabilitation"])

# Patients are free or premium members. Only physiatrists can act on the doctor side.
PatientUser = Annotated[User, Depends(require_roles("user", "premium"))]
DoctorUser = Annotated[User, Depends(require_roles("physiatrist"))]


# ---------------------------------------------------------------- helpers

def _link_out(link: CareLink, viewer: User) -> LinkOut:
    other = link.physiatrist if viewer.id == link.patient_id else link.patient
    return LinkOut(
        id=link.id,
        status=link.status,
        created_at=link.created_at,
        person=PersonOut.model_validate(other),
    )


def _doctor_link(db: DbSession, doctor: User, link_id: int) -> CareLink:
    """The ACTIVE link between this physiatrist and a patient, or 404.

    Everything a physiatrist can do with a patient goes through this check, so a
    physiatrist can never reach data of a patient who has not accepted / has disconnected.
    """
    link = db.scalar(
        select(CareLink).where(
            CareLink.id == link_id,
            CareLink.physiatrist_id == doctor.id,
            CareLink.status == "active",
        )
    )
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return link


def _progress_by_item(db: DbSession, item_ids: list[int]) -> dict[int, ItemProgress]:
    """For each prescribed exercise: how many workouts / reps / average score so far."""
    if not item_ids:
        return {}
    rows = db.execute(
        select(
            WorkoutSession.plan_item_id,
            func.count(func.distinct(WorkoutSession.id)),
            func.count(RepRecord.id),
            func.avg(RepRecord.score),
            func.max(WorkoutSession.started_at),
        )
        .select_from(WorkoutSession)
        .join(RepRecord, RepRecord.session_id == WorkoutSession.id)
        .where(WorkoutSession.plan_item_id.in_(item_ids))
        .group_by(WorkoutSession.plan_item_id)
    ).all()
    return {
        item_id: ItemProgress(
            sessions=sessions,
            total_reps=reps,
            average_score=round(float(avg_score), 1) if avg_score is not None else None,
            last_done_at=last_done,
        )
        for item_id, sessions, reps, avg_score, last_done in rows
    }


def _plans_out(db: DbSession, plans: list[RehabPlan]) -> list[PlanOut]:
    progress = _progress_by_item(db, [item.id for plan in plans for item in plan.items])
    return [
        PlanOut(
            id=plan.id,
            title=plan.title,
            notes=plan.notes,
            is_active=plan.is_active,
            created_at=plan.created_at,
            physiatrist=PersonOut.model_validate(plan.link.physiatrist),
            items=[
                PlanItemOut(
                    id=item.id,
                    exercise=item.exercise,
                    sets=item.sets,
                    reps_per_set=item.reps_per_set,
                    target_score=item.target_score,
                    progress=progress.get(item.id, ItemProgress()),
                )
                for item in plan.items
            ],
        )
        for plan in plans
    ]


# ---------------------------------------------------------------- links (both sides)

@router.get("/links", response_model=list[LinkOut])
def list_links(current_user: CurrentUser, db: DbSession) -> list[LinkOut]:
    """Patients see their physiatrists; physiatrists see their patients and pending requests."""
    column = CareLink.physiatrist_id if current_user.role == "physiatrist" else CareLink.patient_id
    links = db.scalars(select(CareLink).where(column == current_user.id).order_by(CareLink.id.desc()))
    return [_link_out(link, current_user) for link in links]


@router.post("/links", response_model=LinkOut, status_code=status.HTTP_201_CREATED)
def request_link(body: LinkRequest, patient: PatientUser, db: DbSession) -> LinkOut:
    """A patient asks a physiatrist (by email) to follow their rehabilitation."""
    physiatrist = db.scalar(
        select(User).where(User.email == body.physiatrist_email.strip().lower(), User.role == "physiatrist")
    )
    if physiatrist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No physiatrist found with that email")

    duplicate = HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="You already have a request or connection with this physiatrist",
    )
    exists = db.scalar(
        select(CareLink).where(CareLink.patient_id == patient.id, CareLink.physiatrist_id == physiatrist.id)
    )
    if exists is not None:
        raise duplicate

    link = CareLink(patient_id=patient.id, physiatrist_id=physiatrist.id, status="pending")
    db.add(link)
    try:
        db.commit()
    except IntegrityError:  # two identical requests at the same moment
        db.rollback()
        raise duplicate from None
    return _link_out(link, patient)


@router.post("/links/{link_id}/accept", response_model=LinkOut)
def accept_link(link_id: int, doctor: DoctorUser, db: DbSession) -> LinkOut:
    link = db.scalar(
        select(CareLink).where(
            CareLink.id == link_id,
            CareLink.physiatrist_id == doctor.id,
            CareLink.status == "pending",
        )
    )
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    link.status = "active"
    db.commit()
    return _link_out(link, doctor)


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_link(link_id: int, current_user: CurrentUser, db: DbSession) -> Response:
    """Cancel a request, decline one, or disconnect. Either side can do it at any time.

    The plans of this link are deleted with it. The patient's own saved workouts stay.
    """
    link = db.get(CareLink, link_id)
    if link is None or current_user.id not in (link.patient_id, link.physiatrist_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    db.delete(link)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- patient side

@router.get("/my-plans", response_model=list[PlanOut])
def my_plans(patient: PatientUser, db: DbSession) -> list[PlanOut]:
    plans = db.scalars(
        select(RehabPlan)
        .join(CareLink, RehabPlan.link_id == CareLink.id)
        .where(
            CareLink.patient_id == patient.id,
            CareLink.status == "active",
            RehabPlan.is_active.is_(True),
        )
        .order_by(RehabPlan.id.desc())
    )
    return _plans_out(db, list(plans))


# ---------------------------------------------------------------- physiatrist side

@router.get("/patients/{link_id}", response_model=PatientOverview)
def patient_overview(
    link_id: int,
    doctor: DoctorUser,
    db: DbSession,
    tz_offset: int = Query(0, ge=-840, le=840),
    limit: int = Query(20, ge=1, le=100),
) -> PatientOverview:
    link = _doctor_link(db, doctor, link_id)
    active_plan = next((p for p in link.plans if p.is_active), None)
    sessions = db.scalars(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == link.patient_id)
        .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id.desc())
        .limit(limit)
    )
    return PatientOverview(
        link=_link_out(link, doctor),
        stats=compute_user_stats(db, link.patient_id, tz_offset),
        plan=_plans_out(db, [active_plan])[0] if active_plan else None,
        sessions=[SessionOut.model_validate(s) for s in sessions],
    )


@router.get("/patients/{link_id}/sessions/{session_id}", response_model=SessionDetail)
def patient_session(link_id: int, session_id: int, doctor: DoctorUser, db: DbSession) -> WorkoutSession:
    link = _doctor_link(db, doctor, link_id)
    session = db.get(WorkoutSession, session_id)
    if session is None or session.user_id != link.patient_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.post("/patients/{link_id}/plans", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(link_id: int, body: PlanCreate, doctor: DoctorUser, db: DbSession) -> PlanOut:
    """Assigns a new plan. It replaces the current one (which is kept as inactive history)."""
    link = _doctor_link(db, doctor, link_id)
    for old in link.plans:
        old.is_active = False

    plan = RehabPlan(
        link_id=link.id,
        title=body.title,
        notes=body.notes,
        is_active=True,
        items=[
            RehabPlanItem(
                position=position,
                exercise=item.exercise,
                sets=item.sets,
                reps_per_set=item.reps_per_set,
                target_score=item.target_score,
            )
            for position, item in enumerate(body.items)
        ],
    )
    db.add(plan)
    db.commit()
    return _plans_out(db, [plan])[0]
