from datetime import date
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.transfer import TransferCreate, TransferList, TransferRead
from app.services import transfers as service
from app.services.errors import ValidationError

router = APIRouter(prefix="/transfers", tags=["Internal Transfers"])


@router.get("", response_model=TransferList, summary="List internal transfers")
def list_transfers(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    account_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> TransferList:
    return service.list_transfers(
        db, start_date=start_date, end_date=end_date, account_id=account_id
    )


@router.post("", response_model=TransferRead, status_code=status.HTTP_201_CREATED, summary="Create internal transfer")
def create_transfer(
    payload: TransferCreate,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
) -> TransferRead:
    try:
        transfer, replayed = service.create_transfer(
            db, payload, idempotency_key=idempotency_key
        )
        if replayed:
            response.status_code = status.HTTP_200_OK
            response.headers["X-Idempotent-Replay"] = "true"
        return TransferRead.model_validate(transfer)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
