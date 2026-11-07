from typing import Literal

from pydantic import BaseModel


class DatabaseHealthRead(BaseModel):
    status: Literal["connected", "unavailable", "degraded"]
    provider: Literal["neon", "postgresql", "sqlite", "unknown"]
    dialect: Literal["postgresql", "sqlite", "unknown"]
    connected: bool
    schema_status: Literal["ready", "degraded", "unavailable"] = "ready"


class HealthRead(BaseModel):
    status: Literal["ok", "degraded"]
    app: str
    version: str
    environment: str
    database: Literal["connected", "unavailable"]
    provider: Literal["neon", "postgresql", "sqlite", "unknown"] = "sqlite"
    dialect: Literal["postgresql", "sqlite", "unknown"] = "sqlite"
    schema_status: Literal["ready", "degraded", "unavailable"] = "ready"
    current_revision: str | None = None
