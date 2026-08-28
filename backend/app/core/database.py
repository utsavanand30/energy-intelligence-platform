"""
Database engine setup.

Handles three URL formats transparently:

  1. Local dev       : postgresql://user:pass@localhost:5432/energy_db
  2. Render          : postgresql://user:pass@host/db  (injected by Render)
  3. Neon.tech       : postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
                       or the older  postgres://  prefix

The engine adds SSL kwargs automatically when the URL contains a Neon host
or when sslmode=require is already in the query string.
"""
import os
from urllib.parse import urlparse, urlunparse, urlencode, parse_qs

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


def _normalise_db_url(raw: str) -> tuple[str, dict]:
    """
    Return (url_string, connect_args) suitable for SQLAlchemy.

    - Converts  postgres://  →  postgresql://
    - Adds  sslmode=require  for Neon hosts
    - Returns connect_args with ssl context for psycopg2
    """
    # Normalise scheme
    url = raw.replace("postgres://", "postgresql://", 1)

    parsed = urlparse(url)
    hostname = parsed.hostname or ""

    connect_args: dict = {}

    # Neon hostnames end with .neon.tech or contain "neon"
    is_neon = "neon.tech" in hostname or "neon" in hostname

    if is_neon:
        # psycopg2 needs sslmode in connect_args, not in the URL query string
        connect_args["sslmode"] = "require"

    return url, connect_args


_db_url, _connect_args = _normalise_db_url(settings.DATABASE_URL)

engine = create_engine(
    _db_url,
    connect_args=_connect_args,
    pool_pre_ping=True,       # drops stale connections automatically
    pool_size=5,              # keep low for free-tier (nano instance, 256 MB RAM)
    max_overflow=10,
    pool_recycle=300,         # recycle connections every 5 min (Neon serverless)
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
