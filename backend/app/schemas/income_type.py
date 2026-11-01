from datetime import datetime

from pydantic import BaseModel, Field


class IncomeTypeBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    category: str | None = Field(default=None, max_length=50)
    icon: str = Field(default="wallet", max_length=40)
    color: str = Field(default="#10B981", max_length=7)


class IncomeTypeCreate(IncomeTypeBase):
    pass


class IncomeTypeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    category: str | None = Field(default=None, max_length=50)
    icon: str | None = Field(default=None, max_length=40)
    color: str | None = Field(default=None, max_length=7)
    is_archived: bool | None = None


class IncomeTypeRead(IncomeTypeBase):
    id: int
    name_key: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IncomeTypeList(BaseModel):
    items: list[IncomeTypeRead]
    total: int
