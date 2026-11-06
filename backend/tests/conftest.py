from collections.abc import Generator
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_current_user, get_current_user_optional
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User

TODAY = date(2026, 1, 15)


@pytest.fixture(autouse=True)
def isolate_test_environment(monkeypatch):
    """Ensure no real external network calls occur during testing."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "groq_api_key", None)
    monkeypatch.setattr(settings, "keep_alive_enabled", False)


@pytest.fixture()
def db_session(tmp_path) -> Generator[Session, None, None]:
    url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestingSessionLocal()
    user = User(
        id=1,
        email="test@example.com",
        hashed_password="mock_hashed_pw",
        full_name="Test User",
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(tmp_path) -> Generator[TestClient, None, None]:
    url = f"sqlite:///{(tmp_path / 'api-test.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    seed_db = TestingSessionLocal()
    user = User(
        id=1,
        email="test@example.com",
        hashed_password="mock_hashed_pw",
        full_name="Test User",
        is_active=True,
        is_superuser=False,
    )
    seed_db.add(user)
    seed_db.commit()
    seed_db.close()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user():
        db = TestingSessionLocal()
        try:
            return db.get(User, 1)
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_current_user_optional] = override_get_current_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture()
def make_type(client: TestClient):
    def factory(**overrides: Any) -> dict:
        payload = {
            "name": "Food",
            "description": None,
            "category": "Food",
            "icon": "utensils",
            "color": "#0F766E",
        }
        payload.update(overrides)
        response = client.post("/api/expense-types", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return factory


@pytest.fixture()
def make_expense(client: TestClient):
    def factory(type_id: int, **overrides: Any) -> dict:
        payload = {
            "expense_type_id": type_id,
            "amount_paise": 39900,
            "expense_date": "2026-01-15",
            "note": None,
            "payment_method": "UPI",
            "merchant": None,
        }
        payload.update(overrides)
        response = client.post("/api/expenses", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return factory


@pytest.fixture()
def make_income_type(client: TestClient):
    def factory(**overrides: Any) -> dict:
        payload = {
            "name": "Salary",
            "description": None,
            "category": "Earned",
            "icon": "briefcase",
            "color": "#10B981",
        }
        payload.update(overrides)
        response = client.post("/api/income-types", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return factory
