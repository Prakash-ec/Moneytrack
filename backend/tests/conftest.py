from collections.abc import Generator
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app

TODAY = date(2026, 1, 15)


@pytest.fixture()
def db_session(tmp_path) -> Generator[Session, None, None]:
    url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestingSessionLocal()
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

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
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
