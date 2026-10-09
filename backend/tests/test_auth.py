import pytest
from fastapi import HTTPException

from app.deps import require_roles
from app.models import User

USER = {"name": "Seif", "email": "seif@example.com", "password": "correct-horse-1"}


def register(client, **overrides):
    return client.post("/api/auth/register", json={**USER, **overrides})


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_register_returns_token_and_user(client):
    res = register(client)
    assert res.status_code == 201
    body = res.json()
    assert body["token_type"] == "bearer" and body["access_token"]
    assert body["user"]["email"] == "seif@example.com"
    assert body["user"]["role"] == "user"


def test_register_never_exposes_password_hash(client):
    body = register(client).json()
    assert "password_hash" not in body["user"]


def test_register_duplicate_email_is_rejected_case_insensitively(client):
    assert register(client).status_code == 201
    res = register(client, email="SEIF@Example.com")
    assert res.status_code == 409


def test_register_short_password_is_rejected(client):
    assert register(client, password="short").status_code == 422


def test_register_invalid_email_is_rejected(client):
    assert register(client, email="not-an-email").status_code == 422


def test_register_as_physiatrist_is_allowed(client):
    assert register(client, role="physiatrist").json()["user"]["role"] == "physiatrist"


def test_cannot_register_directly_as_premium_or_unknown_role(client):
    assert register(client, role="premium").status_code == 422
    assert register(client, role="admin").status_code == 422


def test_login_success(client):
    register(client)
    res = client.post("/api/auth/login", json={"email": "seif@example.com", "password": USER["password"]})
    assert res.status_code == 200
    assert res.json()["user"]["name"] == "Seif"


def test_login_wrong_password_and_unknown_email_look_identical(client):
    register(client)
    wrong_pw = client.post("/api/auth/login", json={"email": "seif@example.com", "password": "wrong-password"})
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever123"})
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()


def test_me_requires_a_valid_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=auth_header("garbage")).status_code == 401


def test_me_returns_current_user(client):
    token = register(client).json()["access_token"]
    res = client.get("/api/auth/me", headers=auth_header(token))
    assert res.status_code == 200
    assert res.json()["email"] == "seif@example.com"


def test_dev_set_role_changes_role(client):
    token = register(client).json()["access_token"]
    res = client.post("/api/dev/set-role", json={"role": "premium"}, headers=auth_header(token))
    assert res.status_code == 200 and res.json()["role"] == "premium"
    assert client.get("/api/auth/me", headers=auth_header(token)).json()["role"] == "premium"


def test_dev_set_role_requires_login(client):
    assert client.post("/api/dev/set-role", json={"role": "premium"}).status_code == 401


def test_require_roles_allows_and_blocks():
    check = require_roles("premium")
    premium = User(name="a", email="a@example.com", password_hash="x", role="premium")
    free = User(name="b", email="b@example.com", password_hash="x", role="user")
    assert check(premium) is premium
    with pytest.raises(HTTPException) as err:
        check(free)
    assert err.value.status_code == 403
