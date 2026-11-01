from typing import Literal

from pydantic import BaseModel


class HealthRead(BaseModel):
    status: Literal["ok", "degraded"]
    app: str
    version: str
    environment: str
    database: Literal["connected", "unavailable"]
    schema_status: Literal["ready", "degraded", "unavailable"] = "ready"
    current_revision: str | None = None
