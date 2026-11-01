def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert data["app"] == "MoneyTrack"
    assert data["version"]


def test_openapi_schema_is_available(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/expenses" in paths
    assert "/api/analytics/summary" in paths
