import sqlite3
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _engine_kwargs(database_url: str) -> dict:
    if database_url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True}


engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record) -> None:  # noqa: ANN001
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_sqlite_directory(database_url: str) -> None:
    """Create the parent folder of a file-backed SQLite database, if needed."""
    if not database_url.startswith("sqlite:///"):
        return
    raw_path = database_url.removeprefix("sqlite:///")
    if raw_path in (":memory:", ""):
        return
    Path(raw_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
