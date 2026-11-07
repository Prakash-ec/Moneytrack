from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.health import DatabaseHealthRead, HealthRead

router = APIRouter(tags=["Health"])


def _check_db_status(db: Session) -> tuple[str, str, bool, str | None]:
    """Execute non-destructive connectivity and schema checks without exposing credentials."""
    database = "connected"
    schema_status = "ready"
    is_connected = False
    current_rev = None
    try:
        db.execute(text("SELECT 1"))
        is_connected = True
        try:
            rev_row = db.execute(text("SELECT version_num FROM alembic_version")).first()
            current_rev = rev_row[0] if rev_row else None
        except Exception:
            current_rev = None

        # Verify core application schema readiness
        db.execute(text("SELECT 1 FROM expense_types LIMIT 1"))
    except SQLAlchemyError as exc:
        err_msg = str(exc).lower()
        if "no such table" in err_msg or "does not exist" in err_msg or "undefined_table" in err_msg:
            database = "connected"
            schema_status = "degraded"
            is_connected = True
        else:
            database = "unavailable"
            schema_status = "unavailable"
            is_connected = False
    except Exception:
        database = "unavailable"
        schema_status = "unavailable"
        is_connected = False

    return database, schema_status, is_connected, current_rev


@router.get("/health", response_model=HealthRead, summary="Application health")
def health(db: Session = Depends(get_db)) -> HealthRead:
    database, schema_status, is_connected, current_rev = _check_db_status(db)
    is_ok = is_connected and schema_status == "ready"
    return HealthRead(
        status="ok" if is_ok else "degraded",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        database=database if is_connected else "unavailable",
        provider=settings.database_provider,
        dialect=settings.database_dialect,
        schema_status=schema_status,
        current_revision=current_rev,
    )


@router.get("/health/db", response_model=DatabaseHealthRead, summary="Database health and provider status")
def database_health(db: Session = Depends(get_db)) -> DatabaseHealthRead:
    """Secure database status endpoint reporting only database provider and connection status.
    Never exposes connection string or credentials.
    """
    _, schema_status, is_connected, _ = _check_db_status(db)
    status_label = "connected" if is_connected and schema_status == "ready" else ("degraded" if is_connected else "unavailable")
    return DatabaseHealthRead(
        status=status_label,
        provider=settings.database_provider,
        dialect=settings.database_dialect,
        connected=is_connected,
        schema_status=schema_status,
    )
