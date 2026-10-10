import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import close_all_sessions, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

# Set TEST_DATABASE_URL to run the whole suite on PostgreSQL (the production database),
# e.g. postgresql+psycopg://user:password@localhost:5432/fitrehab_test
# Without it, every test uses a fresh in-memory SQLite database.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture()
def client():
    """A test client backed by an empty database for every test."""
    if TEST_DATABASE_URL:
        engine = create_engine(TEST_DATABASE_URL)
        Base.metadata.drop_all(bind=engine)
    else:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # No `with` block on purpose: it would run the startup code on the real database.
    yield TestClient(app)
    app.dependency_overrides.clear()
    close_all_sessions()  # a session left open by a test would keep locks on PostgreSQL
    engine.dispose()
