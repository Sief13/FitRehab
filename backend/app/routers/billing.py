import secrets
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update

from app.config import settings
from app.deps import DbSession, require_roles
from app.models import Payment, User
from app.payments import NotATestCard, charge_sandbox_card
from app.schemas import (
    BillingStatus,
    CheckoutCreated,
    CheckoutInfo,
    PayRequest,
    PayResult,
    PaymentOut,
    UserOut,
)
from app.subscriptions import extend_premium, get_premium_until

router = APIRouter(prefix="/api/billing", tags=["billing"])

# Free and Premium members can pay. Physiatrists do not buy Premium.
MemberUser = Annotated[User, Depends(require_roles("user", "premium"))]

DESCRIPTION = "FitRehab Premium: {days} days"


def _own_payment(db: DbSession, user: User, checkout_id: str) -> Payment:
    payment = db.scalar(select(Payment).where(Payment.checkout_id == checkout_id, Payment.user_id == user.id))
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkout not found")
    return payment


@router.get("/status", response_model=BillingStatus)
def billing_status(user: MemberUser, db: DbSession) -> BillingStatus:
    premium_until = get_premium_until(db, user)
    return BillingStatus(
        role=user.role,
        is_premium=premium_until is not None,
        premium_until=premium_until,
        price_cents=settings.premium_price_cents,
        currency=settings.premium_currency,
        period_days=settings.premium_period_days,
    )


@router.post("/checkout", response_model=CheckoutCreated, status_code=status.HTTP_201_CREATED)
def create_checkout(user: MemberUser, db: DbSession) -> CheckoutCreated:
    """Step 1 of paying: the server decides the price and creates a checkout. The browser
    then opens the checkout page for it. The browser can never choose the amount."""
    payment = Payment(
        user_id=user.id,
        checkout_id=secrets.token_urlsafe(24),
        description=DESCRIPTION.format(days=settings.premium_period_days),
        amount_cents=settings.premium_price_cents,
        currency=settings.premium_currency,
    )
    db.add(payment)
    db.commit()
    return CheckoutCreated(checkout_id=payment.checkout_id)


@router.get("/checkout/{checkout_id}", response_model=CheckoutInfo)
def get_checkout(checkout_id: str, user: MemberUser, db: DbSession) -> CheckoutInfo:
    payment = _own_payment(db, user, checkout_id)
    return CheckoutInfo(
        checkout_id=payment.checkout_id,
        description=payment.description,
        amount_cents=payment.amount_cents,
        currency=payment.currency,
        status=payment.status,
    )


@router.post("/checkout/{checkout_id}/pay", response_model=PayResult)
def pay(checkout_id: str, body: PayRequest, user: MemberUser, db: DbSession) -> PayResult:
    """Step 2: the (sandbox) card payment. On success the account becomes Premium."""
    payment = _own_payment(db, user, checkout_id)
    if payment.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This checkout has already been paid")

    # basic card checks (the same ones a real checkout page does)
    now = datetime.now(timezone.utc)
    year = body.exp_year + 2000 if body.exp_year < 100 else body.exp_year
    if (year, body.exp_month) < (now.year, now.month):
        raise HTTPException(status_code=422, detail="This card has expired")

    try:
        charge = charge_sandbox_card(body.card_number)
    except NotATestCard as err:
        raise HTTPException(status_code=422, detail=str(err)) from None

    if not charge.ok:
        payment.failure_reason = charge.failure
        db.commit()
        # 402 Payment Required: the checkout stays open so the user can try another card
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=charge.failure)

    # Mark as paid only if it is STILL pending. Two simultaneous requests cannot both win,
    # so a double click can never give two periods of Premium.
    claimed = db.execute(
        update(Payment)
        .where(Payment.id == payment.id, Payment.status == "pending")
        .values(status="paid", paid_at=now, card_last4=charge.last4, failure_reason=None)
    )
    if claimed.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This checkout has already been paid")

    premium_until = extend_premium(db, user, settings.premium_period_days)
    db.commit()
    return PayResult(user=UserOut.model_validate(user), premium_until=premium_until)


@router.get("/payments", response_model=list[PaymentOut])
def payment_history(user: MemberUser, db: DbSession) -> list[Payment]:
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.user_id == user.id, Payment.status == "paid")
            .order_by(Payment.id.desc())
        )
    )

