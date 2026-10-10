from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app import models  # noqa: F401  (importing registers the tables on Base.metadata)
from app.config import settings
from app.database import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# What "the models say the database should look like": autogenerate compares against this
target_metadata = Base.metadata


def _configure_and_run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        # SQLite cannot ALTER most things in place; "batch mode" rebuilds the table instead
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    """`alembic upgrade head --sql`: prints the SQL instead of running it."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:  # the tests hand over an already open connection
        _configure_and_run(connection)
        return

    # The URL comes from the app settings (DATABASE_URL), so it is defined in one place only.
    engine = engine_from_config(
        {"sqlalchemy.url": settings.database_url}, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with engine.connect() as connection:
        _configure_and_run(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
