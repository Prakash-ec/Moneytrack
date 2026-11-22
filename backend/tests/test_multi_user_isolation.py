"""Multi-User Registration and Strict Database Isolation Tests.

Verifies that new user registration operates cleanly and that every registered
user possesses a completely isolated financial dataset with zero leakage of
custom categories, transactions, bank accounts, balances, budgets, or analytics.
"""

from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.expense_type import ExpenseType
from app.models.income_type import IncomeType
from app.models.user import User
from app.schemas.auth import UserCreate
from app.services.auth import register_user


@pytest.fixture()
def multi_user_db(tmp_path):
    url = f"sqlite:///{(tmp_path / 'multi_user_test.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    with TestingSessionLocal() as session:
        # Seed system categories with user_id = None
        session.add(ExpenseType(name="Groceries", name_key="groceries", user_id=None, is_archived=False))
        session.add(ExpenseType(name="Utilities", name_key="utilities", user_id=None, is_archived=False))
        session.add(IncomeType(name="Salary", name_key="salary", user_id=None, is_archived=False))
        session.commit()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestingSessionLocal
    app.dependency_overrides.clear()
    engine.dispose()


def test_registration_and_multi_user_data_isolation(multi_user_db):
    """Test full multi-user registration flow and strict data partitioning."""
    client = TestClient(app)

    # 1. Check setup status before any user exists
    res = client.get("/api/auth/setup-status")
    assert res.status_code == 200
    assert res.json()["is_configured"] is False
    assert res.json()["allow_registration"] is True

    # 2. Register first user (Alice)
    alice_res = client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "Password123!", "full_name": "Alice Wonder"},
    )
    assert alice_res.status_code == 201
    alice_token = alice_res.json()["access_token"]
    alice_headers = {"Authorization": f"Bearer {alice_token}"}

    # Verify setup status after first user
    res = client.get("/api/auth/setup-status")
    assert res.status_code == 200
    assert res.json()["is_configured"] is True
    assert res.json()["allow_registration"] is True  # Registration is OPEN!

    # 3. Register second user (Bob)
    bob_res = client.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "password": "Password123!", "full_name": "Bob Builder"},
    )
    assert bob_res.status_code == 201
    bob_token = bob_res.json()["access_token"]
    bob_headers = {"Authorization": f"Bearer {bob_token}"}

    # 4. Alice creates a bank account and custom category
    alice_acc_res = client.post(
        "/api/bank-accounts",
        headers=alice_headers,
        json={"bank_name": "HDFC Bank", "account_name": "Alice HDFC", "account_type": "savings", "opening_balance_paise": 500000},
    )
    assert alice_acc_res.status_code in (200, 201), alice_acc_res.text
    alice_acc = alice_acc_res.json()
    assert alice_acc["account_name"] == "Alice HDFC"

    alice_type = client.post(
        "/api/expense-types",
        headers=alice_headers,
        json={"name": "Alice Secret Project", "category": "Other"},
    ).json()
    assert alice_type["name"] == "Alice Secret Project"

    # Alice records an expense
    alice_exp = client.post(
        "/api/expenses",
        headers=alice_headers,
        json={
            "amount_paise": 150000,
            "expense_date": "2026-01-15",
            "expense_type_id": alice_type["id"],
            "bank_account_id": alice_acc["id"],
            "note": "Alice Private Purchase",
        },
    ).json()

    # 5. Bob views his bank accounts -> MUST BE EMPTY
    bob_accs = client.get("/api/bank-accounts", headers=bob_headers).json()
    assert len(bob_accs["items"]) == 0
    assert bob_accs["account_count"] == 0

    # 6. Bob views expenses -> MUST BE EMPTY
    bob_exps = client.get("/api/expenses", headers=bob_headers).json()
    assert bob_exps["total"] == 0
    assert len(bob_exps["items"]) == 0

    # 7. Bob views expense types -> MUST see system types, but NOT Alice's custom type
    bob_types = client.get("/api/expense-types", headers=bob_headers).json()
    type_names = [t["name"] for t in bob_types["items"]]
    assert "Groceries" in type_names
    assert "Utilities" in type_names
    assert "Alice Secret Project" not in type_names

    # 8. Bob checks system category stats -> MUST be 0
    groceries_item = next(t for t in bob_types["items"] if t["name"] == "Groceries")
    assert groceries_item["total_paise"] == 0
    assert groceries_item["transaction_count"] == 0

    # 9. Bob tries to access Alice's expense by ID -> MUST return 404
    bob_get_alice_exp = client.get(f"/api/expenses/{alice_exp['id']}", headers=bob_headers)
    assert bob_get_alice_exp.status_code == 404

    # 10. Bob tries to access Alice's bank account by ID -> MUST return 404
    bob_get_alice_acc = client.get(f"/api/bank-accounts/{alice_acc['id']}", headers=bob_headers)
    assert bob_get_alice_acc.status_code == 404

    # 11. Bob tries to delete or modify Alice's custom category -> MUST fail
    bob_del_type = client.delete(f"/api/expense-types/{alice_type['id']}", headers=bob_headers)
    assert bob_del_type.status_code in (404, 409)

    # 12. Bob creates his own bank account and custom category
    bob_acc_res = client.post(
        "/api/bank-accounts",
        headers=bob_headers,
        json={"bank_name": "ICICI Bank", "account_name": "Bob ICICI", "account_type": "savings", "opening_balance_paise": 200000},
    )
    assert bob_acc_res.status_code in (200, 201), bob_acc_res.text
    bob_acc = bob_acc_res.json()
    assert bob_acc["account_name"] == "Bob ICICI"

    # Alice views bank accounts -> MUST only see Alice HDFC, NOT Bob ICICI
    alice_accs = client.get("/api/bank-accounts", headers=alice_headers).json()
    assert len(alice_accs["items"]) == 1
    assert alice_accs["items"][0]["account_name"] == "Alice HDFC"

    # 13. Verify Analytics Isolation
    alice_analytics = client.get(
        "/api/analytics/summary?start_date=2026-01-01&end_date=2026-01-31",
        headers=alice_headers,
    ).json()
    assert alice_analytics["total_paise"] == 150000
    assert alice_analytics["transaction_count"] == 1

    bob_analytics = client.get(
        "/api/analytics/summary?start_date=2026-01-01&end_date=2026-01-31",
        headers=bob_headers,
    ).json()
    assert bob_analytics["total_paise"] == 0
    assert bob_analytics["transaction_count"] == 0
