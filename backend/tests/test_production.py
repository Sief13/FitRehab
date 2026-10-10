"""Production-mode behaviour: hidden docs, no dev tools, and the CloudFront-only origin check."""

from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app


def production_client(monkeypatch, origin_secret="") -> TestClient:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "origin_secret", origin_secret)
    return TestClient(create_app())


def test_docs_and_dev_tools_exist_in_development(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_docs_and_dev_tools_are_absent_in_production(monkeypatch):
    prod = production_client(monkeypatch)
    assert prod.get("/docs").status_code == 404
    assert prod.get("/redoc").status_code == 404
    assert prod.get("/openapi.json").status_code == 404
    assert prod.post("/api/dev/set-role", json={"role": "premium"}).status_code == 404
    assert prod.get("/api/health").json() == {"status": "ok"}


def test_without_an_origin_secret_every_request_is_allowed(monkeypatch):
    prod = production_client(monkeypatch, origin_secret="")
    assert prod.get("/api/auth/me").status_code == 401  # reaches the app (and is not logged in)


def test_requests_must_carry_the_origin_secret_when_one_is_configured(monkeypatch):
    prod = production_client(monkeypatch, origin_secret="s3cret-value")

    assert prod.get("/api/auth/me").status_code == 403  # no header: blocked before reaching the app
    assert prod.get("/api/auth/me", headers={"X-Origin-Verify": "wrong"}).status_code == 403
    assert prod.get("/api/auth/me", headers={"X-Origin-Verify": "s3cret-value"}).status_code == 401  # allowed through
    assert prod.post("/api/auth/login", json={"email": "a@example.com", "password": "x"}).status_code == 403


def test_health_check_works_without_the_secret(monkeypatch):
    prod = production_client(monkeypatch, origin_secret="s3cret-value")
    assert prod.get("/api/health").status_code == 200
