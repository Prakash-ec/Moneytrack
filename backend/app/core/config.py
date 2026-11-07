from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    app_name: str = "MoneyTrack"
    app_version: str = "1.0.0"
    environment: str = "development"
    api_prefix: str = "/api"
    port: int = 8000
    host: str = "0.0.0.0"

    # Default is a local SQLite file stored in backend/data. Override with
    # DATABASE_URL (for example a PostgreSQL DSN on Neon or Render) without touching code.
    database_url: str = f"sqlite:///{(DATA_DIR / 'moneytrack.db').as_posix()}"

    # Comma-separated browser and mobile app origins allowed to call the API directly.
    # Accepts either CORS_ORIGINS or ALLOWED_ORIGINS environment variable.
    # Capacitor on Android serves from https://localhost; Capacitor on iOS serves from capacitor://localhost.
    cors_origins: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "https://localhost,"
        "http://localhost,"
        "capacitor://localhost,"
        "https://moneytrack-frontend.onrender.com,"
        "https://moneytrack-frontend-g5is.onrender.com,"
        "https://moneytrack-frontend-bujt.onrender.com"
    )
    allowed_origins: str | None = None
    cors_origin_regex: str | None = r"^https:\/\/moneytrack-frontend.*\.onrender\.com$"

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

    # Keep-alive configuration to prevent container idle sleep on Render Free Tier.
    keep_alive_enabled: bool = True
    keep_alive_interval_minutes: int = 12
    keep_alive_url: str | None = None

    # Authentication and security configuration
    secret_key: str = ""
    access_token_expire_minutes: int = 60 * 24 * 30  # 30 days
    auth_required: bool = True
    allow_registration: bool = False

    # SQL performance profiling (development-only, disabled by default in production)
    sql_profiling_enabled: bool = False
    slow_query_threshold_ms: float = 50.0

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        is_prod = self.environment.lower() in ("production", "prod") or not self.is_sqlite
        known_placeholders = {
            "moneytrack-insecure-default-change-in-production-secret-key-32chars",
            "changeme",
            "secret",
            "secret-key",
            "your-secret-key-here",
            "replace-with-a-secure-secret-key",
            "development",
            "password",
            "test-secret",
        }
        stripped_key = (self.secret_key or "").strip()

        if is_prod:
            if not stripped_key or len(stripped_key) < 32 or stripped_key.lower() in known_placeholders:
                raise ValueError(
                    "CRITICAL SECURITY CONFIGURATION ERROR: A strong, cryptographically secure SECRET_KEY "
                    "(minimum 32 characters) must be configured in production environments. "
                    "Set the SECRET_KEY environment variable in your production host settings."
                )
        else:
            # Local development or testing fallback
            if not stripped_key or stripped_key.lower() in known_placeholders:
                self.secret_key = "moneytrack-dev-insecure-local-only-key-32characters-minimum"
        return self

    @property
    def sqlalchemy_database_url(self) -> str:
        """Normalized database URL for SQLAlchemy engine and Alembic migrations.

        PostgreSQL URLs (e.g. from Neon or Render) starting with 'postgres://' or
        'postgresql://' are safely rewritten to 'postgresql+psycopg2://' to guarantee
        the correct driver is always used.
        """
        raw = self.database_url.strip()
        if raw.startswith("postgres://"):
            return raw.replace("postgres://", "postgresql+psycopg2://", 1)
        if raw.startswith("postgresql://") and not raw.startswith("postgresql+"):
            return raw.replace("postgresql://", "postgresql+psycopg2://", 1)
        return raw

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.strip().startswith("sqlite")

    @property
    def cors_origin_list(self) -> list[str]:
        raw_origins = self.allowed_origins or self.cors_origins
        configured = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
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
