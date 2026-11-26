import pytest
from app.core.config import Settings


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert data["app"] == "MoneyTrack"
    assert data["version"]
    assert "provider" in data
    assert data["provider"] in ("sqlite", "neon", "postgresql")
    assert "dialect" in data
    # Ensure no connection string or credentials leaked
    assert "password" not in str(data).lower()
    assert "sqlite:///" not in str(data).lower()
    assert "postgresql://" not in str(data).lower()


def test_database_health_endpoint(client):
    response = client.get("/api/health/db")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("connected", "degraded")
    assert data["connected"] is True
    assert data["provider"] in ("sqlite", "neon", "postgresql")
    assert data["dialect"] in ("sqlite", "postgresql")
    assert "schema_status" in data
    # Security verification: never leak connection string, credentials, or host
    assert "url" not in data
    assert "password" not in str(data).lower()
    assert "connection_string" not in data


def test_root_database_health_endpoint(client):
    response = client.get("/health/db")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("connected", "degraded")
    assert data["connected"] is True
    assert data["provider"] in ("sqlite", "neon", "postgresql")


def test_production_never_falls_back_to_sqlite(monkeypatch):
    """Enforce that production environments reject SQLite startup and never silently fall back."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("NEON_DATABASE_URL", raising=False)

    with pytest.raises(ValueError, match="Production environment cannot use SQLite"):
        Settings()


def test_neon_database_url_configuration(monkeypatch):
    """Verify that NEON_DATABASE_URL configures local development to connect to Neon."""
    monkeypatch.setenv("ENVIRONMENT", "development")
    fake_neon_url = "postgresql://neondb_owner:dummy_secret@ep-cool-sample.us-east-2.aws.neon.tech/neondb?sslmode=require"
    monkeypatch.setenv("NEON_DATABASE_URL", fake_neon_url)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    s = Settings()
    assert s.is_neon is True
    assert s.database_provider == "neon"
    assert s.database_dialect == "postgresql"
    assert "psycopg2" in s.sqlalchemy_database_url


def test_openapi_schema_is_available(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/expenses" in paths
    assert "/api/analytics/summary" in paths
    assert "/api/health/db" in paths
    assert "/api/health/live" in paths


def test_keep_alive_disabled_by_default(monkeypatch):
    """Ensure no background keep-alive task is enabled by default."""
    monkeypatch.delenv("KEEP_ALIVE_ENABLED", raising=False)
    s = Settings()
    assert s.keep_alive_enabled is False


def test_liveness_endpoints_execute_zero_database_queries(client, monkeypatch):
    """Ensure /health, /health/live, and /api/health/live never query the database."""
    import app.db.session as session_mod

    def fail_if_db_touched():
        raise AssertionError("Liveness endpoint must not open a database session")

    monkeypatch.setattr(session_mod, "SessionLocal", fail_if_db_touched)

    for path in ("/health", "/health/live", "/api/health/live"):
        res = client.get(path)
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        assert body["check"] == "liveness"


def test_postgresql_pool_kwargs_conservative_for_serverless():
    from app.db.session import _engine_kwargs

    kwargs = _engine_kwargs("postgresql+psycopg2://user:pass@host/db?sslmode=require")
    assert kwargs["pool_pre_ping"] is True
    assert kwargs["pool_size"] <= 5
    assert kwargs["max_overflow"] <= 5
    assert 0 < kwargs["pool_recycle"] < 300
    assert kwargs["pool_timeout"] == 30


def test_no_cron_keep_alive_workflow_present():
    from pathlib import Path

    workflows_dir = Path(__file__).resolve().parents[2] / ".github" / "workflows"
    assert not (workflows_dir / "keep_alive.yml").exists()
    for wf in workflows_dir.glob("*.y*ml"):
        content = wf.read_text(encoding="utf-8")
        assert "schedule:" not in content
        assert "*/12 * * * *" not in content
