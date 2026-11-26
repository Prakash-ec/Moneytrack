from datetime import date
import hashlib
import json
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.security import hash_password
from app.models.bank_account import BankAccount
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.income import Income
from app.models.income_type import IncomeType
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.auth import UserCreate, UserLogin
from app.schemas.expense import ExpenseCreate
from app.schemas.notification_log import NotificationPreferences
from app.schemas.sms_ingest import SmsIngestRequest
from app.schemas.transfer import TransferCreate, TransferUpdate
from app.services.auth import AuthenticationError, authenticate_user, claim_legacy_records_for_user
from app.services.bank_accounts import list_accounts
from app.services.expenses import create_expense
from app.services.exports import expenses_csv, restore_json
from app.services.incomes import list_incomes
from app.services.notifications import get_preferences, update_preferences
from app.services.sms_ingest import ingest_sms_transaction
from app.services.transfers import create_transfer, delete_transfer, update_transfer
from app.services.weekly_report import generate_weekly_report
from pydantic import ValidationError


def _make_user(db: Session, email: str, *, active: bool = True) -> User:
    u = User(
        email=email,
        hashed_password=hash_password("StrongPass123!"),
        full_name=email.split("@")[0],
        is_active=active,
        is_superuser=False,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_c1_expense_idempotency_keys_isolated_per_user(db_session: Session):
    u1 = db_session.get(User, 1)
    assert u1 is not None
    u2 = _make_user(db_session, "user2-c1@example.com")

    t1 = ExpenseType(user_id=u1.id, name="Dining", name_key="dining", icon="utensils", color="#16845B")
    t2 = ExpenseType(user_id=u2.id, name="Dining", name_key="dining", icon="utensils", color="#16845B")
    db_session.add_all([t1, t2])
    db_session.commit()

    shared_key = "same-client-key-001"
    e1, rep1 = create_expense(
        db_session,
        ExpenseCreate(expense_type_id=t1.id, amount_paise=15000, expense_date=date(2026, 1, 15), merchant="Cafe A"),
        user_id=u1.id,
        idempotency_key=shared_key,
    )
    e2, rep2 = create_expense(
        db_session,
        ExpenseCreate(expense_type_id=t2.id, amount_paise=25000, expense_date=date(2026, 1, 15), merchant="Cafe B"),
        user_id=u2.id,
        idempotency_key=shared_key,
    )
    assert rep1 is False
    assert rep2 is False
    assert e1.id != e2.id

    # SMS ingest using the same deterministic key must stay isolated per user
    sms_res = ingest_sms_transaction(
        db_session,
        SmsIngestRequest(
            amount_paise=35000,
            direction="DEBIT",
            merchant_or_payer="User2 Shop",
            transaction_date="2026-01-16",
            body="Debited Rs 350 at User2 Shop",
        ),
        idempotency_key=shared_key,
        user_id=u2.id,
    )
    assert sms_res.replayed is True
    assert sms_res.entity_id == e2.id
    assert sms_res.entity_id != e1.id


def test_c16_sms_ingest_direction_defaults_to_unknown_queued():
    req = SmsIngestRequest(amount_paise=50000, body="Transaction Rs 500 at Vendor")
    assert req.direction == "UNKNOWN"


def test_c16_sms_ingest_unknown_never_auto_posts_debit(db_session: Session):
    req = SmsIngestRequest(amount_paise=50000, body="Ambiguous transaction Rs 500")
    res = ingest_sms_transaction(db_session, req, user_id=1)
    assert res.created is False
    assert res.status == "queued"
    assert res.transaction_type == "queued"


def test_c18_c29_restore_isolates_types_and_deduplicates_transfers(db_session: Session):
    u1 = db_session.get(User, 1)
    assert u1 is not None
    u2 = _make_user(db_session, "user2-restore@example.com")

    u1_type = ExpenseType(
        user_id=u1.id,
        name="SecretPrivateCat",
        name_key="secretprivatecat",
        icon="tag",
        color="#111111",
    )
    u1_inc_type = IncomeType(
        user_id=u1.id,
        name="SecretBonus",
        name_key="secretbonus",
        icon="wallet",
        color="#222222",
    )
    db_session.add_all([u1_type, u1_inc_type])
    db_session.commit()

    backup_payload = {
        "schema_version": 2,
        "expense_types": [{"id": 99, "name": "SecretPrivateCat", "category": "Private"}],
        "income_types": [{"id": 88, "name": "SecretBonus"}],
        "bank_accounts": [
            {"id": 10, "bank_name": "HDFC", "account_name": "Savings", "account_number_mask": "XX1111", "opening_balance_paise": 100000},
            {"id": 11, "bank_name": "ICICI", "account_name": "Checking", "account_number_mask": "XX2222", "opening_balance_paise": 50000},
        ],
        "expenses": [
            {"id": 1, "expense_type_id": 99, "amount_paise": 2000, "expense_date": "2026-01-10", "note": "Lunch"}
        ],
        "incomes": [
            {"id": 2, "income_type_id": 88, "amount_paise": 5000, "income_date": "2026-01-10", "payer": "Employer"}
        ],
        "transfers": [
            {
                "id": 3,
                "from_account_id": 10,
                "to_account_id": 11,
                "amount_paise": 10000,
                "transfer_date": "2026-01-11",
                "bank_reference": "UTR12345",
            }
        ],
    }
    backup_payload["checksum"] = hashlib.sha256(
        json.dumps(backup_payload, sort_keys=True).encode("utf-8")
    ).hexdigest()

    res1 = restore_json(db_session, backup_payload, user_id=u2.id)
    assert res1["restored_transfers"] == 1

    u2_exp = db_session.query(Expense).filter(Expense.user_id == u2.id).one()
    u2_inc = db_session.query(Income).filter(Income.user_id == u2.id).one()
    assert u2_exp.expense_type_id != u1_type.id
    assert u2_inc.income_type_id != u1_inc_type.id

    # Repeat restore must not duplicate transfers
    res2 = restore_json(db_session, backup_payload, user_id=u2.id)
    assert res2["restored_transfers"] == 0


def test_c20_c41_user_preferences_isolated_and_partial_merge(db_session: Session):
    u1 = db_session.get(User, 1)
    assert u1 is not None
    u2 = _make_user(db_session, "user2-prefs@example.com")

    p1 = update_preferences(
        db_session,
        NotificationPreferences(max_alerts_per_day=5, quiet_hours_enabled=True),
        user_id=u1.id,
    )
    p2 = update_preferences(
        db_session,
        NotificationPreferences(max_alerts_per_day=9),
        user_id=u2.id,
    )
    assert p1.max_alerts_per_day == 5
    assert p2.max_alerts_per_day == 9
    assert get_preferences(db_session, user_id=u1.id).max_alerts_per_day == 5

    # Partial update on u1 must preserve previously set quiet_hours_enabled=True
    partial = NotificationPreferences.model_validate({"max_alerts_per_day": 3})
    merged = update_preferences(db_session, partial, user_id=u1.id)
    assert merged.max_alerts_per_day == 3
    assert merged.quiet_hours_enabled is True
    assert db_session.query(UserPreference).count() == 2


def test_c21_weekly_report_handles_bank_accounts(db_session: Session):
    et = ExpenseType(user_id=1, name="Groceries", name_key="groceries", icon="cart", color="#16845B")
    acc = BankAccount(
        user_id=1,
        bank_name="HDFC",
        account_name="Main Savings",
        account_number_mask="XX9090",
        opening_balance_paise=100000,
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=100000,
    )
    db_session.add_all([et, acc])
    db_session.commit()

    exp = Expense(
        user_id=1,
        expense_type_id=et.id,
        account_id=acc.id,
        amount_paise=4500,
        expense_date=date(2026, 1, 14),
        merchant="FreshMart",
    )
    db_session.add(exp)
    db_session.commit()

    report = generate_weekly_report(
        db_session,
        start_date=date(2026, 1, 12),
        end_date=date(2026, 1, 18),
        user_id=1,
    )
    assert report.total_expense_paise == 4500
    assert len(report.account_spending) == 1
    assert report.account_spending[0].account_name == "Main Savings"


def test_c27_c28_system_types_protected_and_preserved_on_claim(db_session: Session):
    sys_exp = ExpenseType(user_id=None, name="Food & Dining", name_key="food & dining", icon="utensils", color="#16845B")
    sys_inc = IncomeType(user_id=None, name="Other Income", name_key="other income", icon="wallet", color="#16845B")
    db_session.add_all([sys_exp, sys_inc])
    db_session.commit()

    claim_legacy_records_for_user(db_session, user_id=1, commit=True)
    db_session.refresh(sys_exp)
    db_session.refresh(sys_inc)
    assert sys_exp.user_id is None
    assert sys_inc.user_id is None


def test_c27_income_type_route_blocks_system_modification(client):
    from app.db.session import get_db
    from app.main import app

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    sys_inc = IncomeType(user_id=None, name="Salary", name_key="salary", icon="briefcase", color="#16845B")
    db.add(sys_inc)
    db.commit()
    sys_id = sys_inc.id
    try:
        next(db_gen)
    except StopIteration:
        pass

    patch_res = client.patch(f"/api/income-types/{sys_id}", json={"name": "Hacked"})
    del_res = client.delete(f"/api/income-types/{sys_id}")
    assert patch_res.status_code == 403
    assert del_res.status_code == 403


def test_c4_zero_reported_balance_accepted(db_session: Session, client):
    acc_res = client.post(
        "/api/bank-accounts",
        json={
            "bank_name": "SBI",
            "account_name": "Zero Bal",
            "account_number_mask": "XX0001",
            "opening_balance_paise": 0,
            "opening_balance_date": "2026-01-01",
        },
    )
    assert acc_res.status_code in (200, 201)
    acc_id = acc_res.json()["id"]

    rep_res = client.post(f"/api/bank-accounts/{acc_id}/report-balance?reported_balance_paise=0")
    assert rep_res.status_code == 200
    assert rep_res.json()["last_reported_balance_paise"] == 0

    listed = client.get("/api/bank-accounts").json()
    assert listed["total_reported_balance_paise"] == 0


def test_c9_p10_atomic_transfer_and_idempotency_replay(db_session: Session):
    a1 = BankAccount(
        user_id=1,
        bank_name="HDFC",
        account_name="A1",
        account_number_mask="XX1001",
        opening_balance_paise=100000,
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=100000,
    )
    a2 = BankAccount(
        user_id=1,
        bank_name="ICICI",
        account_name="A2",
        account_number_mask="XX1002",
        opening_balance_paise=50000,
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=50000,
    )
    db_session.add_all([a1, a2])
    db_session.commit()

    payload = TransferCreate(
        from_account_id=a1.id,
        to_account_id=a2.id,
        amount_paise=25000,
        transfer_date=date(2026, 1, 10),
    )
    tr, replayed = create_transfer(db_session, payload, user_id=1, idempotency_key="tr-key-1")
    assert replayed is False
    db_session.refresh(a1)
    db_session.refresh(a2)
    assert a1.current_balance_paise == 75000
    assert a2.current_balance_paise == 75000

    tr_rep, replayed2 = create_transfer(db_session, payload, user_id=1, idempotency_key="tr-key-1")
    assert replayed2 is True
    assert tr_rep.id == tr.id

    update_transfer(db_session, tr.id, TransferUpdate(amount_paise=10000), user_id=1)
    db_session.refresh(a1)
    db_session.refresh(a2)
    assert a1.current_balance_paise == 90000
    assert a2.current_balance_paise == 60000

    delete_transfer(db_session, tr.id, user_id=1)
    db_session.refresh(a1)
    db_session.refresh(a2)
    assert a1.current_balance_paise == 100000
    assert a2.current_balance_paise == 50000


def test_p15_csv_export_neutralizes_formula_injection(db_session: Session):
    et = ExpenseType(user_id=1, name="Food", name_key="food", icon="utensils", color="#16845B")
    db_session.add(et)
    db_session.commit()
    db_session.add(
        Expense(
            user_id=1,
            expense_type_id=et.id,
            amount_paise=1000,
            expense_date=date(2026, 1, 15),
            merchant="=cmd|' /C calc'!A0",
            note="+SUM(1,2)",
        )
    )
    db_session.commit()

    csv_text, _ = expenses_csv(db_session, user_id=1)
    assert "'=cmd|' /C calc'!A0" in csv_text
    assert "'+SUM(1,2)" in csv_text


def test_p13_p20_password_limit_and_uniform_inactive_login(db_session: Session):
    with pytest.raises(ValidationError):
        UserCreate(email="toolong@example.com", password="x" * 73)

    _make_user(db_session, "inactive-p20@example.com", active=False)
    with pytest.raises(AuthenticationError) as exc_inactive:
        authenticate_user(db_session, UserLogin(email="inactive-p20@example.com", password="StrongPass123!"))
    with pytest.raises(AuthenticationError) as exc_missing:
        authenticate_user(db_session, UserLogin(email="missing-p20@example.com", password="StrongPass123!"))
    assert str(exc_inactive.value) == str(exc_missing.value) == "Invalid email or password."


def test_income_list_schema_exposes_total_paise(db_session: Session):
    it = IncomeType(user_id=1, name="Salary", name_key="salary", icon="briefcase", color="#16845B")
    db_session.add(it)
    db_session.commit()
    db_session.add_all(
        [
            Income(user_id=1, income_type_id=it.id, amount_paise=10000, income_date=date(2026, 1, 10)),
            Income(user_id=1, income_type_id=it.id, amount_paise=20000, income_date=date(2026, 1, 11)),
        ]
    )
    db_session.commit()

    page1 = list_incomes(db_session, page=1, page_size=1, user_id=1)
    assert len(page1.items) == 1
    assert page1.total_paise == 30000
    assert page1.model_dump()["total_paise"] == 30000
