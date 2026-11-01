from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    app_name: str = "MoneyTrack"
    app_version: str = "1.0.0"
    environment: str = "development"
    api_prefix: str = "/api"

    # Default is a local SQLite file stored in backend/data. Override with
    # DATABASE_URL (for example a PostgreSQL DSN) without touching code.
    database_url: str = f"sqlite:///{(DATA_DIR / 'moneytrack.db').as_posix()}"

    # Comma-separated browser and mobile app origins allowed to call the API directly.
    # Capacitor on Android serves from https://localhost; Capacitor on iOS serves from capacitor://localhost.
    cors_origins: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "https://localhost,"
        "http://localhost,"
        "capacitor://localhost"
    )

    # Optional: mount the built frontend from frontend/dist when present.
    serve_frontend: bool = True

    # Groq vision (image analysis) configuration.
    # GROQ_API_KEY must be set in backend/.env (never committed). GROQ_MODEL selects
    # the image-capable model; default is the official Qwen vision model available
    # on Groq at the time of implementation.
    groq_api_key: str | None = None
    # Secondary Groq account key used only as a fallback when the primary key
    # is rate-limited or temporarily unavailable. Never sent to the frontend.
    groq_api_key_fallback: str | None = None
    groq_model: str = "qwen/qwen3.8-27b"

    # Backend-only Groq request timeout (seconds). Kept short so a slow/unavailable
    # AI call falls back to local Tesseract OCR without blocking the user.
    groq_request_timeout: float = 20.0

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        configured = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if "*" in configured:
            return ["*"]
        # Mandatory Capacitor mobile and local origins required by MoneyTrack
        essential_origins = [
            "https://localhost",
            "http://localhost",
            "capacitor://localhost",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
        origins = list(configured)
        for origin in essential_origins:
            if origin not in origins:
                origins.append(origin)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
