import threading
from typing import Any

from sqlalchemy import text, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.account_transfer import AccountTransfer
from app.models.balance_snapshot import BalanceSnapshot
from app.models.bank_account import BankAccount
from app.models.budget import Budget, CategoryBudget
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.income import Income
from app.models.income_type import IncomeType
from app.models.notification_log import NotificationLog
from app.models.security_alert import SecurityAlert
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.auth import SetupStatusRead, UserCreate, UserLogin
from app.services.errors import ConflictError

settings = get_settings()


SYSTEM_EXPENSE_TYPE_KEYS = {
    "food_&_dining",
    "groceries",
    "transportation",
    "fuel",
    "utilities",
    "mobile_recharge",
    "shopping",
    "medical",
    "entertainment",
    "rent_&_maintenance",
    "education",
    "other",
}

SYSTEM_INCOME_TYPE_KEYS = {
    "other_income",
    "salary",
    "freelance",
    "investment",
    "investments",
    "business",
    "rental",
    "gift",
    "refunds",
    "other",
}


class AuthenticationError(Exception):
    """Raised when authentication credentials are invalid or missing."""


def claim_legacy_records_for_user(db: Session, user_id: int, commit: bool = True) -> None:
    """Safely associates unowned legacy financial records with the primary user.
    Preserves system default expense and income categories with user_id=None
    so they remain accessible as templates across all users.
    """
    # 1. ExpenseType: only claim custom types, leave default system types unowned (shared)
    db.execute(
        update(ExpenseType)
        .where(
            ExpenseType.user_id.is_(None),
            ExpenseType.name_key.notin_(SYSTEM_EXPENSE_TYPE_KEYS),
        )
        .values(user_id=user_id)
    )

    # 2. IncomeType: only claim custom types, leave default system types unowned (shared)
    db.execute(
        update(IncomeType)
        .where(
            IncomeType.user_id.is_(None),
            IncomeType.name_key.notin_(SYSTEM_INCOME_TYPE_KEYS),
        )
        .values(user_id=user_id)
    )

    # 3. User-owned financial and ledger models
    standard_models: list[Any] = [
        Expense,
        BankAccount,
        Income,
        AccountTransfer,
        Budget,
        CategoryBudget,
        BalanceSnapshot,
        SecurityAlert,
        NotificationLog,
        UserPreference,
    ]
    for model in standard_models:
        db.execute(
            update(model).where(model.user_id.is_(None)).values(user_id=user_id)
        )
    if commit:
        db.commit()


_bootstrap_lock = threading.Lock()


def register_user(db: Session, data: UserCreate) -> tuple[User, str]:
    """Registers a new user, hashes password securely, and handles owner setup.
    Registration policy:
    - First user can always register (instance bootstrap).
    - Subsequent registrations require settings.allow_registration == True.
    - User creation and legacy data adoption execute atomically in a single transaction.
    - Concurrency is protected via PostgreSQL advisory lock and process threading lock.
    """
    with _bootstrap_lock:
        if db.bind and db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(84729103)"))

        user_count = db.query(User).count()
        is_first_user = user_count == 0

        current_settings = get_settings()
        if not is_first_user and not current_settings.allow_registration:
            raise ConflictError("Registration is disabled on this instance.")

        email = data.email.strip().lower()
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise ConflictError("A user with this email already exists.")

        user = User(
            email=email,
            hashed_password=hash_password(data.password),
            full_name=data.full_name.strip() if data.full_name else None,
            is_active=True,
            is_superuser=is_first_user,
        )
        db.add(user)
        db.flush()  # Generate user.id within current transaction

        # If this is the initial instance owner, claim any unowned legacy data atomically
        if is_first_user:
            claim_legacy_records_for_user(db, user.id, commit=False)

        db.commit()
        db.refresh(user)

        token = create_access_token(subject=user.id)
        return user, token


def authenticate_user(db: Session, data: UserLogin) -> tuple[User, str]:
    """Verifies user credentials and generates a signed JWT access token."""
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise AuthenticationError("Invalid email or password.")
    if not user.is_active:
        raise AuthenticationError("User account is inactive.")

    token = create_access_token(subject=user.id)
    return user, token


def get_setup_status(db: Session) -> SetupStatusRead:
    """Checks whether the application has at least one registered user and whether registration is allowed."""
    user_count = db.query(User).count()
    current_settings = get_settings()
    allow_reg = True if user_count == 0 else current_settings.allow_registration
    return SetupStatusRead(
        is_configured=user_count > 0,
        user_count=user_count,
        allow_registration=allow_reg,
    )
