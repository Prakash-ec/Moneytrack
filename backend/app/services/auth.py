from datetime import timedelta
from sqlalchemy import or_, update
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
from app.services.errors import ConflictError, NotFoundError

settings = get_settings()


class AuthenticationError(Exception):
    """Raised when authentication credentials are invalid or missing."""


def claim_legacy_records_for_user(db: Session, user_id: int) -> None:
    """Safely associates unowned legacy financial records with the primary user."""
    models_to_claim = [
        Expense,
        ExpenseType,
        BankAccount,
        Income,
        IncomeType,
        AccountTransfer,
        Budget,
        CategoryBudget,
        BalanceSnapshot,
        SecurityAlert,
        NotificationLog,
        UserPreference,
    ]
    for model in models_to_claim:
        db.execute(
            update(model).where(model.user_id.is_(None)).values(user_id=user_id)
        )
    db.commit()


def register_user(db: Session, data: UserCreate) -> tuple[User, str]:
    """Registers a new user, hashes password securely, and handles owner setup."""
    email = data.email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise ConflictError("A user with this email already exists.")

    user_count = db.query(User).count()
    is_first_user = user_count == 0

    user = User(
        email=email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name.strip() if data.full_name else None,
        is_active=True,
        is_superuser=is_first_user,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # If this is the initial instance owner, claim any unowned legacy data
    if is_first_user:
        claim_legacy_records_for_user(db, user.id)

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
    """Checks whether the application has at least one registered user."""
    user_count = db.query(User).count()
    return SetupStatusRead(
        is_configured=user_count > 0,
        user_count=user_count,
    )
