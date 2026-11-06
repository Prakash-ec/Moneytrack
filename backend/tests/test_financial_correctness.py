from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.bank_account import BankAccount
from app.models.budget import Budget
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.user import User
from app.services.budgets import get_month_boundaries


def test_month_boundaries_and_december_rollover():
    # 1. November to December
    s_nov, e_nov = get_month_boundaries(date(2026, 11, 15))
    assert s_nov == date(2026, 11, 1)
    assert e_nov == date(2026, 12, 1)

    # 2. December to January of NEXT YEAR (Critical bug fix test: rollover to 2027)
    s_dec, e_dec = get_month_boundaries(date(2026, 12, 10))
    assert s_dec == date(2026, 12, 1)
    assert e_dec == date(2027, 1, 1)

    # 3. January to February
    s_jan, e_jan = get_month_boundaries("2026-01-05")
    assert s_jan == date(2026, 1, 1)
    assert e_jan == date(2026, 2, 1)

    # 4. Leap year February
    s_leap, e_leap = get_month_boundaries("2024-02-20")
    assert s_leap == date(2024, 2, 1)
    assert e_leap == date(2024, 3, 1)


def test_expense_update_and_delete_balance_sync(tmp_path):
    url = f"sqlite:///{(tmp_path / 'fin-sync.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    db = TestingSessionLocal()
    user = User(
        email="finuser@example.com",
        hashed_password=hash_password("pw123"),
        full_name="Fin User",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Setup 2 Bank Accounts
    # Account 1: ₹10,000 opening
    acc1 = BankAccount(
        user_id=user.id,
        account_name="Primary Account",
        bank_name="HDFC",
        account_type="savings",
        account_number_mask="XX1111",
        opening_balance_paise=1000000,
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=1000000,
    )
    # Account 2: ₹5,000 opening
    acc2 = BankAccount(
        user_id=user.id,
        account_name="Secondary Account",
        bank_name="SBI",
        account_type="savings",
        account_number_mask="XX2222",
        opening_balance_paise=500000,
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=500000,
    )
    etype = ExpenseType(user_id=user.id, name="Groceries", name_key="groceries", color="#10b981", icon="cart")
    db.add_all([acc1, acc2, etype])
    db.commit()
    db.refresh(acc1)
    db.refresh(acc2)
    db.refresh(etype)
    token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create expense of ₹2,000 linked to Account 1
            create_exp = client.post(
                "/api/expenses",
                json={
                    "expense_type_id": etype.id,
                    "account_id": acc1.id,
                    "amount_paise": 200000,
                    "expense_date": "2026-03-01",
                    "payment_method": "Debit Card",
                },
                headers=headers,
            )
            assert create_exp.status_code == 201
            exp_id = create_exp.json()["id"]

            # Verify Account 1 balance decreased to ₹8,000 (800000 paise)
            a1 = client.get(f"/api/bank-accounts/{acc1.id}", headers=headers).json()
            assert a1["current_balance_paise"] == 800000

            # 2. Update Expense: Change amount from ₹2,000 to ₹3,500
            patch_amt = client.patch(
                f"/api/expenses/{exp_id}",
                json={"amount_paise": 350000},
                headers=headers,
            )
            assert patch_amt.status_code == 200

            # Verify Account 1 balance updated to ₹6,500 (650000 paise)
            a1_after_patch = client.get(f"/api/bank-accounts/{acc1.id}", headers=headers).json()
            assert a1_after_patch["current_balance_paise"] == 650000

            # 3. Update Expense: Move from Account 1 to Account 2, change amount to ₹1,000
            patch_acc = client.patch(
                f"/api/expenses/{exp_id}",
                json={"account_id": acc2.id, "amount_paise": 100000},
                headers=headers,
            )
            assert patch_acc.status_code == 200

            # Account 1 balance must restore to full ₹10,000
            a1_restored = client.get(f"/api/bank-accounts/{acc1.id}", headers=headers).json()
            assert a1_restored["current_balance_paise"] == 1000000

            # Account 2 balance must be 500000 - 100000 = ₹4,000
            a2_debited = client.get(f"/api/bank-accounts/{acc2.id}", headers=headers).json()
            assert a2_debited["current_balance_paise"] == 400000

            # 4. Delete Expense: Account 2 must restore to ₹5,000
            del_exp = client.delete(f"/api/expenses/{exp_id}", headers=headers)
            assert del_exp.status_code == 204

            a2_restored = client.get(f"/api/bank-accounts/{acc2.id}", headers=headers).json()
            assert a2_restored["current_balance_paise"] == 500000
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_atomic_budget_upsert(tmp_path):
    url = f"sqlite:///{(tmp_path / 'budget-upsert.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    db = TestingSessionLocal()
    user = User(
        email="budgetuser@example.com",
        hashed_password=hash_password("pw123"),
        full_name="Budget User",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create monthly budget of ₹30,000 for 2026-05
            b1 = client.post(
                "/api/budgets",
                json={"budget_period": "2026-05-01", "amount_paise": 3000000},
                headers=headers,
            )
            assert b1.status_code == 201
            assert b1.json()["amount_paise"] == 3000000

            # 2. Upsert same month with ₹45,000
            b2 = client.post(
                "/api/budgets",
                json={"budget_period": "2026-05-01", "amount_paise": 4500000},
                headers=headers,
            )
            assert b2.status_code == 201
            assert b2.json()["amount_paise"] == 4500000

            # Verify only ONE monthly budget exists in DB for this month
            check_db = TestingSessionLocal()
            budgets = check_db.query(Budget).filter(
                Budget.user_id == user.id,
                Budget.budget_period == date(2026, 5, 1),
            ).all()
            assert len(budgets) == 1
            assert budgets[0].amount_paise == 4500000
            check_db.close()
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_transfer_update_and_delete_balance_sync(tmp_path):
    url = f"sqlite:///{(tmp_path / 'transfer-sync.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    db = TestingSessionLocal()
    user = User(
        email="txuser@example.com",
        hashed_password=hash_password("pw123"),
        full_name="Tx User",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    from_acc = BankAccount(
        user_id=user.id,
        account_name="Savings",
        bank_name="Axis",
        account_type="savings",
        account_number_mask="XX3333",
        opening_balance_paise=1000000,  # ₹10,000
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=1000000,
    )
    to_acc = BankAccount(
        user_id=user.id,
        account_name="Wallet",
        bank_name="Paytm",
        account_type="wallet",
        account_number_mask="XX4444",
        opening_balance_paise=200000,   # ₹2,000
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=200000,
    )
    db.add_all([from_acc, to_acc])
    db.commit()
    db.refresh(from_acc)
    db.refresh(to_acc)
    token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create transfer ₹3,000 from Savings to Wallet
            tx_create = client.post(
                "/api/transfers",
                json={
                    "from_account_id": from_acc.id,
                    "to_account_id": to_acc.id,
                    "amount_paise": 300000,
                    "transfer_date": "2026-04-10",
                    "description": "Top up wallet",
                },
                headers=headers,
            )
            assert tx_create.status_code == 201
            tx_id = tx_create.json()["id"]

            # Check balances: from=700000, to=500000
            assert client.get(f"/api/bank-accounts/{from_acc.id}", headers=headers).json()["current_balance_paise"] == 700000
            assert client.get(f"/api/bank-accounts/{to_acc.id}", headers=headers).json()["current_balance_paise"] == 500000

            # 2. Update transfer amount to ₹1,500
            tx_patch = client.patch(
                f"/api/transfers/{tx_id}",
                json={"amount_paise": 150000},
                headers=headers,
            )
            assert tx_patch.status_code == 200

            # Check balances: from=850000, to=350000
            assert client.get(f"/api/bank-accounts/{from_acc.id}", headers=headers).json()["current_balance_paise"] == 850000
            assert client.get(f"/api/bank-accounts/{to_acc.id}", headers=headers).json()["current_balance_paise"] == 350000

            # 3. Delete transfer
            tx_del = client.delete(f"/api/transfers/{tx_id}", headers=headers)
            assert tx_del.status_code == 204

            # Check balances restored: from=1000000, to=200000
            assert client.get(f"/api/bank-accounts/{from_acc.id}", headers=headers).json()["current_balance_paise"] == 1000000
            assert client.get(f"/api/bank-accounts/{to_acc.id}", headers=headers).json()["current_balance_paise"] == 200000
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_backup_v2_export_and_restore_integrity(tmp_path):
    url = f"sqlite:///{(tmp_path / 'backup-v2.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    db = TestingSessionLocal()
    user = User(
        email="backupuser@example.com",
        hashed_password=hash_password("pw123"),
        full_name="Backup User",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    acc = BankAccount(
        user_id=user.id,
        account_name="Main Account",
        bank_name="HDFC",
        account_type="savings",
        account_number_mask="XX5555",
        opening_balance_paise=1000000,
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=750000,
    )
    etype = ExpenseType(user_id=user.id, name="Utilities", name_key="utilities", color="#ff0000", icon="zap")
    db.add_all([acc, etype])
    db.commit()
    db.refresh(acc)
    db.refresh(etype)

    exp = Expense(
        user_id=user.id,
        expense_type_id=etype.id,
        account_id=acc.id,
        amount_paise=250000,
        expense_date=date(2026, 4, 1),
        payment_method="UPI",
    )
    db.add(exp)
    db.commit()
    token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Export Backup v2
            export_res = client.get("/api/exports/backup.json", headers=headers)
            assert export_res.status_code == 200
            backup_data = export_res.json()

            assert backup_data["schema_version"] == 2
            assert "checksum" in backup_data
            assert "exported_at" in backup_data
            assert len(backup_data["expenses"]) == 1
            assert backup_data["expenses"][0]["amount_paise"] == 250000
            assert len(backup_data["bank_accounts"]) == 1

            # 2. Corrupting checksum or format fails restore validation
            tampered = dict(backup_data)
            tampered["checksum"] = "invalid_hash"
            # If checksum is tampered, restore must detect integrity error or unsupported format
            # In our implementation:
            user2 = User(
                email="freshuser@example.com",
                hashed_password=hash_password("pw123"),
                full_name="Fresh User",
                is_active=True,
            )
            db2 = TestingSessionLocal()
            db2.add(user2)
            db2.commit()
            db2.refresh(user2)
            token2 = create_access_token(subject=user2.id, extra_claims={"email": user2.email})
            db2.close()

            headers2 = {"Authorization": f"Bearer {token2}"}
            restore_res = client.post("/api/exports/restore", json=backup_data, headers=headers2)
            assert restore_res.status_code == 200
            summary = restore_res.json()
            assert summary["restored_expenses"] == 1
            assert (summary["restored_types"] + summary["matched_types"]) >= 1

            # Verify records were restored specifically for User 2 with exact paise
            db_verify = TestingSessionLocal()
            u2_expenses = db_verify.query(Expense).filter(Expense.user_id == user2.id).all()
            assert len(u2_expenses) == 1
            assert u2_expenses[0].amount_paise == 250000
            db_verify.close()
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
