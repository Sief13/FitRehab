from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Subscription, User
from app.timeutil import as_utc


def get_premium_until(db: Session, user: User) -> datetime | None:
    """When the user's Premium ends, or None if they are not currently Premium."""
    if user.role != "premium":
        return None
    sub = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if sub is None:
        return None
    end = as_utc(sub.current_period_end)
    return end if end > datetime.now(timezone.utc) else None


def sync_premium_status(db: Session, user: User) -> None:
    """Downgrades a Premium user whose paid period has ended.

    Called whenever a user is loaded, so no background job is needed: the first request
    after the period ends puts the account back to Free.
    """
    if user.role == "premium" and get_premium_until(db, user) is None:
        user.role = "user"
        db.commit()


def extend_premium(db: Session, user: User, days: int) -> datetime:
    """Adds `days` of Premium. Renewing early adds on top of the time that is left.
    The caller commits."""
    now = datetime.now(timezone.utc)
    sub = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    start = max(now, as_utc(sub.current_period_end)) if sub is not None else now
    end = start + timedelta(days=days)

    if sub is None:
        db.add(Subscription(user_id=user.id, current_period_end=end))
    else:
        sub.current_period_end = end
    if user.role == "user":
        user.role = "premium"
    return end
