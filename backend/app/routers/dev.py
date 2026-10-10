"""Development-only helpers. This router is only registered when APP_ENV=development.
It lets us preview Premium / Physiatrist screens without paying or being verified.
Never enable it in production."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings
from app.deps import CurrentUser, DbSession
from app.models import User
from app.schemas import Role, UserOut
from app.subscriptions import extend_premium

router = APIRouter(prefix="/api/dev", tags=["dev (development only)"])


class SetRoleRequest(BaseModel):
    role: Role


@router.post("/set-role", response_model=UserOut)
def set_role(body: SetRoleRequest, current_user: CurrentUser, db: DbSession) -> User:
    current_user.role = body.role
    if body.role == "premium":
        # Premium needs a paid period, otherwise it would expire on the very next request
        extend_premium(db, current_user, settings.premium_period_days)
    db.add(current_user)
    db.commit()
    return current_user
