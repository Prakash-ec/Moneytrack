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
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        database = "unavailable"
    return HealthRead(
        status="ok" if database == "connected" else "degraded",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        database=database,
    )
