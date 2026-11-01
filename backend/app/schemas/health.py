from typing import Literal

from pydantic import BaseModel


class HealthRead(BaseModel):
    status: Literal["ok", "degraded"]
    app: str
    version: str
    environment: str
    database: Literal["connected", "unavailable"]
