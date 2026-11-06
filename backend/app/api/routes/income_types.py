from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.income_type import IncomeType
from app.models.user import User
from app.schemas.income_type import (
    IncomeTypeCreate,
    IncomeTypeList,
    IncomeTypeRead,
    IncomeTypeUpdate,
)

router = APIRouter(prefix="/income-types", tags=["Income Types"])


@router.get("", response_model=IncomeTypeList, summary="List income types")
def list_income_types(
    include_archived: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncomeTypeList:
    query = (
        select(IncomeType)
        .where(
            or_(
                IncomeType.user_id == current_user.id,
                IncomeType.user_id.is_(None),
            )
        )
        .order_by(IncomeType.name.asc())
    )
    if not include_archived:
        query = query.where(IncomeType.is_archived.is_(False))
    items = list(db.scalars(query).all())
    return IncomeTypeList(
        items=[IncomeTypeRead.model_validate(item) for item in items],
        total=len(items),
    )


@router.post("", response_model=IncomeTypeRead, status_code=status.HTTP_201_CREATED, summary="Create income type")
def create_income_type(
    payload: IncomeTypeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncomeTypeRead:
    name_key = payload.name.strip().lower().replace(" ", "_")
    existing = db.scalar(
        select(IncomeType).where(
            IncomeType.name_key == name_key,
            or_(
                IncomeType.user_id == current_user.id,
                IncomeType.user_id.is_(None),
            ),
        )
    )
    if existing:
        if existing.is_archived:
            existing.is_archived = False
            existing.description = payload.description
            existing.category = payload.category
            existing.color = payload.color
            existing.icon = payload.icon
            db.commit()
            db.refresh(existing)
            return IncomeTypeRead.model_validate(existing)
        raise HTTPException(status_code=400, detail="An income type with this name already exists")

    model = IncomeType(
        user_id=current_user.id,
        name=payload.name.strip(),
        name_key=name_key,
        description=payload.description.strip() if payload.description else None,
        category=payload.category.strip() if payload.category else None,
        color=payload.color,
        icon=payload.icon,
        is_archived=False,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return IncomeTypeRead.model_validate(model)


@router.patch("/{type_id}", response_model=IncomeTypeRead, summary="Update income type")
@router.put("/{type_id}", response_model=IncomeTypeRead, summary="Update income type (PUT)")
def update_income_type(
    type_id: int,
    payload: IncomeTypeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncomeTypeRead:
    model = db.get(IncomeType, type_id)
    if not model:
        raise HTTPException(status_code=404, detail="Income type not found")
    if model.user_id is not None and model.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Income type not found")

    data = payload.model_dump(exclude_unset=True)
    for field, val in data.items():
        setattr(model, field, val)

    db.commit()
    db.refresh(model)
    return IncomeTypeRead.model_validate(model)


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Archive income type")
def delete_income_type(
    type_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    model = db.get(IncomeType, type_id)
    if not model:
        raise HTTPException(status_code=404, detail="Income type not found")
    if model.user_id is not None and model.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Income type not found")
    model.is_archived = True
    db.commit()
