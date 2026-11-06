from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.sms_ingest import SmsIngestRequest, SmsIngestResponse
from app.services import sms_ingest as service

router = APIRouter(prefix="/sms", tags=["SMS Intelligence"])


@router.post("/ingest", response_model=SmsIngestResponse, summary="Ingest parsed SMS transaction")
def ingest_sms(
    payload: SmsIngestRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SmsIngestResponse:
    return service.ingest_sms_transaction(
        db, payload, idempotency_key=idempotency_key, user_id=current_user.id
    )
