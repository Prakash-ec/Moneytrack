from datetime import date
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.transfer import TransferCreate, TransferList, TransferRead, TransferUpdate
from app.services import transfers as service
from app.services.errors import NotFoundError, ValidationError

router = APIRouter(prefix="/transfers", tags=["Internal Transfers"])


@router.get("", response_model=TransferList, summary="List internal transfers")
def list_transfers(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    account_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransferList:
    return service.list_transfers(
        db,
        start_date=start_date,
        end_date=end_date,
        account_id=account_id,
        user_id=current_user.id,
    )


@router.post("", response_model=TransferRead, status_code=status.HTTP_201_CREATED, summary="Create internal transfer")
def create_transfer(
    payload: TransferCreate,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransferRead:
    try:
        transfer, replayed = service.create_transfer(
            db, payload, idempotency_key=idempotency_key, user_id=current_user.id
        )
        if replayed:
            response.status_code = status.HTTP_200_OK
            response.headers["X-Idempotent-Replay"] = "true"
        return TransferRead.model_validate(transfer)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{transfer_id}", response_model=TransferRead, summary="Get single transfer")
def get_transfer(
    transfer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransferRead:
    transfer = service.get_transfer(db, transfer_id, user_id=current_user.id)
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return TransferRead.model_validate(transfer)


@router.put("/{transfer_id}", response_model=TransferRead, summary="Update internal transfer")
@router.patch("/{transfer_id}", response_model=TransferRead, summary="Patch internal transfer")
def update_transfer(
    transfer_id: int,
    payload: TransferUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransferRead:
    try:
        transfer = service.update_transfer(
            db, transfer_id, payload, user_id=current_user.id
        )
        return TransferRead.model_validate(transfer)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete internal transfer")
def delete_transfer(
    transfer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    try:
        service.delete_transfer(db, transfer_id, user_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
