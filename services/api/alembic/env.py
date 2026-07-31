"""Alembic environment configuration.

Runs in async mode to match the asyncpg/SQLAlchemy async engine used by the API.

Usage:
    # From services/api/ directory:
    alembic revision --autogenerate -m "initial"
    alembic upgrade head
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# ── Import all models so Alembic sees every table ─────────────────────────────
import services.api.app.models  # noqa: F401  (side-effect: registers models on Base.metadata)
from services.api.app.database import Base
from services.api.app.config import settings

# ── Alembic config object ─────────────────────────────────────────────────────
config = context.config

# Override sqlalchemy.url from env var (never read the alembic.ini placeholder)
config.set_main_option("sqlalchemy.url", settings.database_url)

# Interpret the alembic.ini logging config.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ── Offline mode ──────────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (generates SQL script)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online (async) mode ───────────────────────────────────────────────────────

def do_run_migrations(connection) -> None:  # type: ignore[type-arg]
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations through it."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


# ── Entry point ───────────────────────────────────────────────────────────────

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
