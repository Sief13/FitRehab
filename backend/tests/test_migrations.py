"""The migrations must build exactly the schema the models describe.

If you change app/models.py and forget to create a migration, test_migrations_match_the_models
fails and tells you what is missing."""

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from app.database import Base

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


def alembic_config(connection=None) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    if connection is not None:
        cfg.attributes["connection"] = connection
    return cfg


@pytest.fixture()
def engine():
    """A completely empty database: SQLite in memory, or PostgreSQL when TEST_DATABASE_URL is set."""
    if TEST_DATABASE_URL:
        eng = create_engine(TEST_DATABASE_URL)
        Base.metadata.drop_all(bind=eng)
        with eng.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
    else:
        eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    yield eng
    if TEST_DATABASE_URL:
        Base.metadata.drop_all(bind=eng)
        with eng.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
    eng.dispose()


def test_there_is_exactly_one_migration_head():
    heads = ScriptDirectory.from_config(alembic_config()).get_heads()
    assert len(heads) == 1, f"migrations have branched: {heads}"


def test_migrations_match_the_models(engine):
    with engine.begin() as conn:
        command.upgrade(alembic_config(conn), "head")
        differences = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert differences == [], f"app/models.py has changes without a migration: {differences}"


def test_every_table_is_created(engine):
    with engine.begin() as conn:
        command.upgrade(alembic_config(conn), "head")
        tables = set(inspect(conn).get_table_names())
    assert set(Base.metadata.tables) <= tables and "alembic_version" in tables


def test_migrations_can_be_undone(engine):
    with engine.begin() as conn:
        cfg = alembic_config(conn)
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "base")
        assert set(inspect(conn).get_table_names()) <= {"alembic_version"}
        command.upgrade(cfg, "head")  # and applied again
        assert "users" in inspect(conn).get_table_names()
