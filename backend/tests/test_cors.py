import pytest
from fastapi.testclient import TestClient


def test_cors_get_health_allowed_origin(client: TestClient):
    """GET /api/health from Capacitor Android WebView origin includes CORS header."""
    response = client.get("/api/health", headers={"Origin": "https://localhost"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://localhost"


def test_cors_options_preflight_health(client: TestClient):
    """OPTIONS preflight for GET /api/health from https://localhost succeeds."""
    response = client.options(
        "/api/health",
        headers={
            "Origin": "https://localhost",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://localhost"
    allow_methods = response.headers.get("access-control-allow-methods", "")
    assert "GET" in allow_methods


def test_cors_options_preflight_post_with_custom_headers(client: TestClient):
    """OPTIONS preflight for POST /api/expenses with JSON Content-Type and X-Idempotency-Key."""
    response = client.options(
        "/api/expenses",
        headers={
            "Origin": "https://localhost",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type, X-Idempotency-Key",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://localhost"
    allow_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "content-type" in allow_headers
    assert "x-idempotency-key" in allow_headers


def test_cors_capacitor_scheme_origin(client: TestClient):
    """Capacitor iOS/native scheme origin (capacitor://localhost) is allowed."""
    response = client.get("/api/health", headers={"Origin": "capacitor://localhost"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "capacitor://localhost"


def test_cors_disallowed_origin(client: TestClient):
    """Unauthorized external origins are rejected on preflight."""
    response = client.options(
        "/api/expenses",
        headers={
            "Origin": "https://unauthorized-attacker.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    # CORSMiddleware responds with 400 Bad Request for disallowed preflights
    assert response.status_code == 400
    assert response.headers.get("access-control-allow-origin") is None
