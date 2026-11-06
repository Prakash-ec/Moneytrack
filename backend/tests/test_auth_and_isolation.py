from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import create_access_token, hash_password, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User


def test_password_hashing():
    raw = "SuperSecretPassword123!"
    hashed = hash_password(raw)
    assert hashed != raw
    assert verify_password(raw, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_access_token_creation_and_payload():
    token = create_access_token(subject=42, extra_claims={"email": "user42@example.com"})
    assert isinstance(token, str)
    assert len(token) > 20


def test_auth_registration_and_login_flow(tmp_path):
    url = f"sqlite:///{(tmp_path / 'auth-flow.db').as_posix()}"
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
    try:
        with TestClient(app) as client:
            # 1. Setup status initially should indicate no user exists
            setup_res = client.get("/api/auth/setup-status")
            assert setup_res.status_code == 200
            assert setup_res.json()["is_configured"] is False

            # 2. Register first user
            reg_payload = {
                "email": "firstuser@example.com",
                "password": "StrongPassword999",
                "full_name": "First User",
            }
            reg_res = client.post("/api/auth/register", json=reg_payload)
            assert reg_res.status_code == 201
            reg_data = reg_res.json()
            assert reg_data["user"]["email"] == "firstuser@example.com"
            assert "access_token" in reg_data

            # 3. Setup status now shows initialized
            setup_res2 = client.get("/api/auth/setup-status")
            assert setup_res2.status_code == 200
            assert setup_res2.json()["is_configured"] is True

            # 4. Duplicate registration fails with 409
            dup_res = client.post("/api/auth/register", json=reg_payload)
            assert dup_res.status_code == 409

            # 5. Login with invalid password fails with 401
            bad_login = client.post(
                "/api/auth/login",
                json={"email": "firstuser@example.com", "password": "WrongPassword"},
            )
            assert bad_login.status_code == 401

            # 6. Login with correct password returns token
            login_res = client.post(
                "/api/auth/login",
                json={"email": "firstuser@example.com", "password": "StrongPassword999"},
            )
            assert login_res.status_code == 200
            token = login_res.json()["access_token"]

            # 7. Access /api/auth/me with Bearer token
            me_res = client.get(
                "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
            )
            assert me_res.status_code == 200
            assert me_res.json()["email"] == "firstuser@example.com"
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_unauthenticated_requests_rejected(tmp_path):
    url = f"sqlite:///{(tmp_path / 'auth-reject.db').as_posix()}"
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
    try:
        with TestClient(app) as unauth_client:
            # Endpoints must reject without auth
            assert unauth_client.get("/api/expenses").status_code == 401
            assert unauth_client.post("/api/expenses", json={}).status_code == 401
            assert unauth_client.get("/api/incomes").status_code == 401
            assert unauth_client.get("/api/bank-accounts").status_code == 401
            assert unauth_client.get("/api/transfers").status_code == 401
            assert unauth_client.get("/api/budgets").status_code == 401
            assert unauth_client.get("/api/export/backup.json").status_code == 401
            assert unauth_client.get("/api/security/summary").status_code == 401
            assert unauth_client.get("/api/notifications").status_code == 401
            assert unauth_client.get("/api/reports/weekly").status_code == 401
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_cross_user_isolation(tmp_path):
    url = f"sqlite:///{(tmp_path / 'user-isolation.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    db = TestingSessionLocal()
    # Create User A and User B
    u_a = User(
        email="usera@example.com",
        hashed_password=hash_password("pw_a"),
        full_name="User A",
        is_active=True,
    )
    u_b = User(
        email="userb@example.com",
        hashed_password=hash_password("pw_b"),
        full_name="User B",
        is_active=True,
    )
    db.add_all([u_a, u_b])
    db.commit()
    db.refresh(u_a)
    db.refresh(u_b)
    token_a = create_access_token(subject=u_a.id, extra_claims={"email": u_a.email})
    token_b = create_access_token(subject=u_b.id, extra_claims={"email": u_b.email})
    db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            headers_a = {"Authorization": f"Bearer {token_a}"}
            headers_b = {"Authorization": f"Bearer {token_b}"}

            # 1. User A creates an Expense Type
            t_res = test_client.post(
                "/api/expense-types",
                json={"name": "Travel", "color": "#00ff00", "icon": "bus"},
                headers=headers_a,
            )
            assert t_res.status_code == 201
            type_id = t_res.json()["id"]

            # 2. User A creates a Bank Account
            acc_res = test_client.post(
                "/api/bank-accounts",
                json={
                    "bank_name": "HDFC",
                    "account_name": "User A HDFC",
                    "account_type": "savings",
                    "account_number_mask": "XX1234",
                    "opening_balance_paise": 500000,
                },
                headers=headers_a,
            )
            assert acc_res.status_code == 201
            acc_a_id = acc_res.json()["id"]

            # User B cannot see User A's bank account
            b_accs = test_client.get("/api/bank-accounts", headers=headers_b).json()["items"]
            assert not any(a["id"] == acc_a_id for a in b_accs)

            # 3. User A creates an Expense
            exp_res = test_client.post(
                "/api/expenses",
                json={
                    "expense_type_id": type_id,
                    "account_id": acc_a_id,
                    "amount_paise": 150000,
                    "expense_date": "2026-02-10",
                    "payment_method": "UPI",
                },
                headers=headers_a,
            )
            assert exp_res.status_code == 201
            exp_a_id = exp_res.json()["id"]

            # 4. User B cannot read User A's expense
            b_exp_list = test_client.get("/api/expenses", headers=headers_b).json()["items"]
            assert not any(e["id"] == exp_a_id for e in b_exp_list)

            # 5. User B cannot modify User A's expense (returns 404)
            b_patch = test_client.patch(
                f"/api/expenses/{exp_a_id}",
                json={"amount_paise": 99999},
                headers=headers_b,
            )
            assert b_patch.status_code == 404

            # 6. User B cannot delete User A's expense (returns 404)
            b_del = test_client.delete(f"/api/expenses/{exp_a_id}", headers=headers_b)
            assert b_del.status_code == 404

            # Verify User A's expense is still intact
            a_exp = test_client.get(f"/api/expenses/{exp_a_id}", headers=headers_a)
            assert a_exp.status_code == 200
            assert a_exp.json()["amount_paise"] == 150000
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
