from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.health import HealthRead

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthRead, summary="Application health")
def health(db: Session = Depends(get_db)) -> HealthRead:
    database = "connected"
    schema_status = "ready"
    current_rev = None
    try:
        db.execute(text("SELECT 1"))
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
        else:
            database = "unavailable"
            schema_status = "unavailable"
    except Exception:
        schema_status = "degraded"

    is_ok = database == "connected" and schema_status == "ready"
    return HealthRead(
        status="ok" if is_ok else "degraded",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        database=database,
        schema_status=schema_status,
        current_revision=current_rev,
    )
