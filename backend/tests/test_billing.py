from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import get_db
from app.main import app
from app.models import Subscription, User

GOOD_CARD = {"card_number": "4242 4242 4242 4242", "exp_month": 12, "exp_year": 2099, "cvc": "123", "cardholder": "Test User"}


def register(client, email="member@example.com", role="user") -> dict[str, str]:
    res = client.post(
        "/api/auth/register",
        json={"name": "Member", "email": email, "password": "correct-horse-1", "role": role},
    )
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def checkout(client, headers) -> str:
    res = client.post("/api/billing/checkout", headers=headers)
    assert res.status_code == 201
    return res.json()["checkout_id"]


def pay(client, headers, checkout_id, **card):
    return client.post(f"/api/billing/checkout/{checkout_id}/pay", json={**GOOD_CARD, **card}, headers=headers)


def me(client, headers):
    return client.get("/api/auth/me", headers=headers).json()


def db_session():
    """A database session on the same in-memory database the test client uses."""
    return next(app.dependency_overrides[get_db]())


# ---------------------------------------------------------------- checkout

def test_billing_endpoints_need_login_and_a_member_role(client):
    assert client.get("/api/billing/status").status_code == 401
    assert client.post("/api/billing/checkout").status_code == 401
    doctor = register(client, "dr@example.com", role="physiatrist")
    assert client.post("/api/billing/checkout", headers=doctor).status_code == 403
    assert client.get("/api/billing/status", headers=doctor).status_code == 403


def test_status_for_a_free_member(client):
    h = register(client)
    body = client.get("/api/billing/status", headers=h).json()
    assert body["role"] == "user" and body["is_premium"] is False and body["premium_until"] is None
    assert body["price_cents"] == 14900 and body["currency"] == "EGP" and body["period_days"] == 30


def test_the_server_sets_the_price_not_the_browser(client):
    h = register(client)
    info = client.get(f"/api/billing/checkout/{checkout(client, h)}", headers=h).json()
    assert info["amount_cents"] == 14900 and info["currency"] == "EGP" and info["status"] == "pending"
    assert "Premium" in info["description"]


def test_a_checkout_belongs_to_one_user(client):
    alice, bob = register(client, "alice@example.com"), register(client, "bob@example.com")
    cid = checkout(client, alice)
    assert client.get(f"/api/billing/checkout/{cid}", headers=bob).status_code == 404
    assert pay(client, bob, cid).status_code == 404
    assert me(client, alice)["role"] == "user"  # bob's attempt changed nothing


# ---------------------------------------------------------------- paying

def test_successful_payment_makes_the_user_premium(client):
    h = register(client)
    res = pay(client, h, checkout(client, h))
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == "premium"
    until = datetime.fromisoformat(body["premium_until"].replace("Z", "+00:00"))
    assert timedelta(days=29, hours=23) < until - datetime.now(timezone.utc) <= timedelta(days=30)

    assert me(client, h)["role"] == "premium"
    status = client.get("/api/billing/status", headers=h).json()
    assert status["is_premium"] is True and status["premium_until"].endswith("Z")

    history = client.get("/api/billing/payments", headers=h).json()
    assert len(history) == 1 and history[0]["status"] == "paid" and history[0]["card_last4"] == "4242"
    assert "card_number" not in str(history)


def test_declined_card_keeps_the_user_free_and_the_checkout_open(client):
    h = register(client)
    cid = checkout(client, h)
    declined = pay(client, h, cid, card_number="4000 0000 0000 0002")
    assert declined.status_code == 402 and "declined" in declined.json()["detail"]
    assert pay(client, h, cid, card_number="4000000000009995").json()["detail"] == "Your card has insufficient funds."
    assert me(client, h)["role"] == "user"
    assert client.get(f"/api/billing/checkout/{cid}", headers=h).json()["status"] == "pending"
    assert client.get("/api/billing/payments", headers=h).json() == []

    assert pay(client, h, cid).status_code == 200  # a good card on the same checkout works
    assert me(client, h)["role"] == "premium"


def test_only_test_cards_are_accepted_and_nothing_is_stored(client):
    h = register(client)
    cid = checkout(client, h)
    res = pay(client, h, cid, card_number="4111 1111 1111 1111")
    assert res.status_code == 422 and "test card" in res.json()["detail"]
    assert me(client, h)["role"] == "user"
    payment_row = client.get(f"/api/billing/checkout/{cid}", headers=h).json()
    assert payment_row["status"] == "pending"


def test_card_validation(client):
    h = register(client)
    cid = checkout(client, h)
    assert pay(client, h, cid, exp_month=1, exp_year=2020).status_code == 422
    assert pay(client, h, cid, exp_month=13).status_code == 422
    assert pay(client, h, cid, cvc="12").status_code == 422
    assert pay(client, h, cid, cvc="abcd").status_code == 422
    assert pay(client, h, cid, cardholder="").status_code == 422
    assert pay(client, h, cid, exp_month=1, exp_year=99).status_code == 200  # two-digit year, Jan 2099


def test_a_checkout_can_only_be_paid_once(client):
    h = register(client)
    cid = checkout(client, h)
    assert pay(client, h, cid).status_code == 200
    assert pay(client, h, cid).status_code == 409
    assert len(client.get("/api/billing/payments", headers=h).json()) == 1


def test_renewing_adds_time_on_top_of_what_is_left(client):
    h = register(client)
    first = datetime.fromisoformat(pay(client, h, checkout(client, h)).json()["premium_until"].replace("Z", "+00:00"))
    second = datetime.fromisoformat(pay(client, h, checkout(client, h)).json()["premium_until"].replace("Z", "+00:00"))
    assert second - first == timedelta(days=30)
    assert me(client, h)["role"] == "premium"


# ---------------------------------------------------------------- expiry

def _expire_subscription(client, email="member@example.com"):
    db = db_session()
    try:
        user = db.scalar(select(User).where(User.email == email))
        sub = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
        sub.current_period_end = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()


def test_premium_ends_when_the_paid_period_ends(client):
    h = register(client)
    pay(client, h, checkout(client, h))
    assert client.get("/api/plans/monthly", headers=h).status_code == 200

    _expire_subscription(client)
    assert client.get("/api/plans/monthly", headers=h).status_code == 403  # downgraded on this request
    assert me(client, h)["role"] == "user"
    assert client.get("/api/billing/status", headers=h).json()["is_premium"] is False


def test_login_after_expiry_shows_a_free_account(client):
    h = register(client)
    pay(client, h, checkout(client, h))
    _expire_subscription(client)
    res = client.post("/api/auth/login", json={"email": "member@example.com", "password": "correct-horse-1"})
    assert res.json()["user"]["role"] == "user"


def test_buying_again_after_expiry_restores_premium(client):
    h = register(client)
    pay(client, h, checkout(client, h))
    _expire_subscription(client)
    assert me(client, h)["role"] == "user"
    pay(client, h, checkout(client, h))
    assert me(client, h)["role"] == "premium"


def test_dev_role_switch_to_premium_gets_a_paid_period(client):
    h = register(client)
    client.post("/api/dev/set-role", json={"role": "premium"}, headers=h)
    assert me(client, h)["role"] == "premium"  # not downgraded on the next request
    assert client.get("/api/plans/monthly", headers=h).status_code == 200
