from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends

from app.adaptive import build_monthly_plan, collect_exercise_stats
from app.deps import DbSession, require_roles
from app.models import User
from app.schemas import MonthlyPlanOut

router = APIRouter(prefix="/api/plans", tags=["premium plan"])

PremiumUser = Annotated[User, Depends(require_roles("premium"))]


@router.get("/monthly", response_model=MonthlyPlanOut)
def monthly_plan(user: PremiumUser, db: DbSession) -> MonthlyPlanOut:
    """A 4-week plan built from the user's own workouts of the last 30 days (Premium only)."""
    now = datetime.now(timezone.utc)
    return build_monthly_plan(collect_exercise_stats(db, user.id, now), now)
