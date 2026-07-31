"""Async SQLAlchemy engine, session factory, and ORM Base.

All SQLAlchemy models must inherit from ``Base`` defined here so that
Alembic can discover and migrate them.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from services.api.app.config import settings

# ── Engine ────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=False,           # set True to log SQL in development
    pool_pre_ping=True,   # verify connections before use
)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── ORM Base ──────────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """All SQLAlchemy models inherit from this class."""
