import copy
import hashlib
import json
import threading
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bank_account import BankAccount
from app.models.budget import Budget, CategoryBudget
from app.models.expense_type import ExpenseType
from app.models.income_type import IncomeType
from app.models.user import User
from app.schemas.auth import UserCreate
from app.schemas.income import IncomeCreate
from app.services import auth as auth_service
from app.services import exports as export_service
from app.services import incomes as income_service
from app.services.errors import NotFoundError, ValidationError


@pytest.fixture
def test_user(db_session: Session) -> User:
    user = User(
        email="test_user_p92@example.com",
        hashed_password="hashed_password_123",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# =============================================================================
# 1. P1-1: Backup & Restore Integrity Tests
# =============================================================================

def test_backup_json_v2_has_checksum_and_category_budgets(db_session: Session, test_user: User):
    uid = test_user.id
    # Create budget and category budget for user
    b = Budget(user_id=uid, budget_period=date(2026, 11, 1), amount_paise=5000000)
    cb = CategoryBudget(user_id=uid, budget_period=date(2026, 11, 1), category="Food", amount_paise=2000000)
    db_session.add_all([b, cb])
    db_session.commit()

    backup = export_service.backup_json(db_session, user_id=uid, version=2)
    assert backup["schema_version"] == 2
    assert "checksum" in backup
    assert isinstance(backup["checksum"], str)
    assert len(backup["checksum"]) == 64
    assert len(backup["category_budgets"]) >= 1

    # Verify checksum matches recalculated SHA-256
    backup_copy = {k: v for k, v in backup.items() if k != "checksum"}
    expected_hash = hashlib.sha256(json.dumps(backup_copy, sort_keys=True).encode("utf-8")).hexdigest()
    assert backup["checksum"] == expected_hash


def test_restore_json_v2_valid_restores_category_budgets(db_session: Session, test_user: User):
    uid = test_user.id
    b = Budget(user_id=uid, budget_period=date(2026, 12, 1), amount_paise=6000000)
    cb = CategoryBudget(user_id=uid, budget_period=date(2026, 12, 1), category="Travel", amount_paise=1500000)
    db_session.add_all([b, cb])
    db_session.commit()

    backup = export_service.backup_json(db_session, user_id=uid, version=2)

    # Delete local category budget and restore from backup
    db_session.delete(cb)
    db_session.commit()
    assert db_session.scalar(select(CategoryBudget).where(CategoryBudget.user_id == uid, CategoryBudget.category == "Travel")) is None

    result = export_service.restore_json(db_session, backup, user_id=uid)
    assert result["restored_category_budgets"] == 1

    restored = db_session.scalar(select(CategoryBudget).where(CategoryBudget.user_id == uid, CategoryBudget.category == "Travel"))
    assert restored is not None
    assert restored.amount_paise == 1500000


def test_restore_json_v2_tampered_payload_rejected(db_session: Session, test_user: User):
    uid = test_user.id
    backup = export_service.backup_json(db_session, user_id=uid, version=2)

    # Tamper with the backup data without updating checksum
    tampered = copy.deepcopy(backup)
    tampered["application_version"] = "99.9.9"

    with pytest.raises(ValidationError, match="checksum verification failed"):
        export_service.restore_json(db_session, tampered, user_id=uid)


def test_restore_json_v2_missing_checksum_rejected(db_session: Session, test_user: User):
    uid = test_user.id
    backup = export_service.backup_json(db_session, user_id=uid, version=2)
    del backup["checksum"]

    with pytest.raises(ValidationError, match="checksum is missing"):
        export_service.restore_json(db_session, backup, user_id=uid)


def test_restore_json_v1_backward_compatibility(db_session: Session, test_user: User):
    uid = test_user.id
    v1_backup = {
        "schema_version": 1,
        "application": "MoneyTrack",
        "application_version": "1.0.0",
        "expense_types": [
            {
                "id": 888,
                "name": "Cloud Backup V1",
                "category": "Utilities",
                "icon": "cloud",
                "color": "#6366F1",
                "is_archived": False,
            }
        ],
        "expenses": [],
    }
    # V1 backups without checksum are permitted for backward compatibility
    result = export_service.restore_json(db_session, v1_backup, user_id=uid, allowed_versions=(1, 2))
    assert result["restored_types"] == 1


# =============================================================================
# 2. P1-2: Income IDOR Protection Tests
# =============================================================================

def test_create_income_own_account_and_system_type(db_session: Session, test_user: User):
    uid = test_user.id
    # User's own bank account
    acc = BankAccount(
        user_id=uid,
        bank_name="HDFC",
        account_name="Savings",
        account_type="savings",
        account_number_mask="*1234",
        opening_balance_paise=100000,
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=100000,
    )
    # System global income type (user_id is None)
    sys_type = IncomeType(
        user_id=None,
        name="Salary",
        name_key="salary",
        category="Income",
        icon="wallet",
        color="#10B981",
    )
    db_session.add_all([acc, sys_type])
    db_session.commit()

    payload = IncomeCreate(
        income_type_id=sys_type.id,
        account_id=acc.id,
        amount_paise=5000000,
        income_date=date(2026, 11, 5),
        payer="Employer Inc",
    )
    income, replayed = income_service.create_income(db_session, payload, user_id=uid)
    assert income.id is not None
    assert income.user_id == uid
    assert not replayed


def test_create_income_rejects_victim_bank_account(db_session: Session, test_user: User):
    uid_attacker = test_user.id
    # Victim user and account
    victim = User(
        email="victim_income@example.com",
        hashed_password="hashed_password_123",
        is_active=True,
    )
    db_session.add(victim)
    db_session.flush()

    victim_acc = BankAccount(
        user_id=victim.id,
        bank_name="ICICI",
        account_name="Victim Savings",
        account_type="savings",
        account_number_mask="*9999",
        opening_balance_paise=1000000,
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=1000000,
    )
    sys_type = db_session.scalar(select(IncomeType).where(IncomeType.name_key == "salary"))
    if not sys_type:
        sys_type = IncomeType(user_id=None, name="Salary", name_key="salary", category="Income", icon="wallet", color="#10B981")
        db_session.add(sys_type)
    db_session.add(victim_acc)
    db_session.commit()

    initial_victim_balance = victim_acc.current_balance_paise

    payload = IncomeCreate(
        income_type_id=sys_type.id,
        account_id=victim_acc.id,
        amount_paise=7000000,
        income_date=date(2026, 11, 5),
    )

    # Must raise NotFoundError (HTTP 404) without leaking account existence
    with pytest.raises(NotFoundError, match="Bank account not found"):
        income_service.create_income(db_session, payload, user_id=uid_attacker)

    # Verify victim's bank balance was NEVER touched
    db_session.refresh(victim_acc)
    assert victim_acc.current_balance_paise == initial_victim_balance


def test_create_income_rejects_victim_custom_income_type(db_session: Session, test_user: User):
    uid_attacker = test_user.id
    victim = User(email="victim_type@example.com", hashed_password="hashed_password_123", is_active=True)
    db_session.add(victim)
    db_session.flush()

    victim_type = IncomeType(
        user_id=victim.id,
        name="Victim Royalty",
        name_key="victim_royalty",
        category="Income",
        icon="crown",
        color="#F59E0B",
    )
    db_session.add(victim_type)
    db_session.commit()

    payload = IncomeCreate(
        income_type_id=victim_type.id,
        amount_paise=100000,
        income_date=date(2026, 11, 5),
    )
    with pytest.raises(NotFoundError, match="Income type not found"):
        income_service.create_income(db_session, payload, user_id=uid_attacker)


# =============================================================================
# 3. P1-4: Migration 0008 Multi-Tenant Unique Constraints Tests
# =============================================================================

def test_multi_user_budget_uniqueness_coexistence(db_session: Session):
    u1 = User(email="budget_user1@example.com", hashed_password="pw1", is_active=True)
    u2 = User(email="budget_user2@example.com", hashed_password="pw2", is_active=True)
    db_session.add_all([u1, u2])
    db_session.flush()

    period = date(2026, 11, 1)
    b1 = Budget(user_id=u1.id, budget_period=period, amount_paise=4000000)
    b2 = Budget(user_id=u2.id, budget_period=period, amount_paise=6000000)
    db_session.add_all([b1, b2])
    db_session.commit()

    assert b1.id is not None
    assert b2.id is not None


def test_multi_user_category_budget_uniqueness_coexistence(db_session: Session):
    u1 = User(email="cat_user1@example.com", hashed_password="pw1", is_active=True)
    u2 = User(email="cat_user2@example.com", hashed_password="pw2", is_active=True)
    db_session.add_all([u1, u2])
    db_session.flush()

    period = date(2026, 11, 1)
    cb1 = CategoryBudget(user_id=u1.id, budget_period=period, category="Dining", amount_paise=2000000)
    cb2 = CategoryBudget(user_id=u2.id, budget_period=period, category="Dining", amount_paise=3000000)
    db_session.add_all([cb1, cb2])
    db_session.commit()

    assert cb1.id is not None
    assert cb2.id is not None


def test_multi_user_custom_type_name_key_coexistence(db_session: Session):
    u1 = User(email="type_user1@example.com", hashed_password="pw1", is_active=True)
    u2 = User(email="type_user2@example.com", hashed_password="pw2", is_active=True)
    db_session.add_all([u1, u2])
    db_session.flush()

    et1 = ExpenseType(user_id=u1.id, name="Fitness & Gym", name_key="fitness_&_gym", category="Health")
    et2 = ExpenseType(user_id=u2.id, name="Fitness & Gym", name_key="fitness_&_gym", category="Sports")
    db_session.add_all([et1, et2])
    db_session.commit()

    assert et1.id is not None
    assert et2.id is not None


# =============================================================================
# 4. P2-2: Concurrent First-Admin Registration Tests
# =============================================================================

def test_atomic_first_admin_registration_concurrency(db_session: Session):
    # Ensure clean users table
    db_session.query(User).delete()
    db_session.commit()

    results = []
    errors = []

    def attempt_registration(email: str):
        with Session(db_session.bind) as session:
            try:
                user, token = auth_service.register_user(
                    session,
                    UserCreate(email=email, password="ValidPassword123!", full_name="Admin")
                )
                results.append((user.email, user.is_superuser))
            except Exception as e:
                errors.append(str(e))

    # Simulate two simultaneous bootstrap registration attempts
    t1 = threading.Thread(target=attempt_registration, args=("admin1@example.com",))
    t2 = threading.Thread(target=attempt_registration, args=("admin2@example.com",))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Exactly one user must succeed as initial superuser
    assert len(results) == 1
    assert results[0][1] is True  # is_superuser == True
    # The second registration attempt must be rejected (Registration disabled)
    assert len(errors) == 1
    assert "Registration is disabled" in errors[0]
