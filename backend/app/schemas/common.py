from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

T = TypeVar("T")

Direction = Literal["up", "down", "flat", "new", "none"]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int
