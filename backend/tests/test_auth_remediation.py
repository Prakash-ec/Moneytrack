import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.db.base import Base
from app.models.expense_type import ExpenseType
from app.models.income_type import IncomeType
from app.schemas.auth import UserCreate
from app.services.auth import (
    get_setup_status,
    register_user,
)
from app.services.errors import ConflictError


def test_production_secret_key_validation():
    pg_url = "postgresql://user:pass@localhost:5432/db"
    # 1. In production with missing secret -> must raise ValueError
    with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR"):
        Settings(environment="production", database_url=pg_url, secret_key="")

    # 2. In production with short secret -> must raise ValueError
    with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR"):
        Settings(environment="production", database_url=pg_url, secret_key="short-key")

    # 3. In production with known placeholder -> must raise ValueError
    with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR"):
        Settings(
            environment="production",
            database_url=pg_url,
            secret_key="moneytrack-insecure-default-change-in-production-secret-key-32chars",
        )

    # 4. In production with strong secret -> succeeds
    strong_key = "a-very-strong-and-secure-production-secret-key-64chars-long-abcdef123456"
    s = Settings(
        environment="production",
        database_url=pg_url,
        secret_key=strong_key,
    )
    assert s.secret_key == strong_key

    # 5. In development with no secret -> applies safe local dev fallback
    dev_s = Settings(environment="development", database_url="sqlite:///dummy.db", secret_key="")
    assert "moneytrack-dev" in dev_s.secret_key


def test_registration_policy_and_system_types(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        # Seed 1 system default expense type and 1 custom legacy expense type
        db.add(ExpenseType(name="Groceries", name_key="groceries", user_id=None))
        db.add(ExpenseType(name="Custom Project", name_key="custom_project", user_id=None))

        # Seed 1 system default income type and 1 custom legacy income type
        db.add(IncomeType(name="Salary", name_key="salary", user_id=None))
        db.add(IncomeType(name="Consulting Corp", name_key="consulting_corp", user_id=None))
        db.commit()

        # Initial setup status: is_configured=False, allow_registration=True
        status1 = get_setup_status(db)
        assert status1.is_configured is False
        assert status1.allow_registration is True

        # First user registers
        user1, token1 = register_user(
            db, UserCreate(email="owner@example.com", password="StrongPassword123!")
        )
        assert user1.is_superuser is True

        # Verify system categories were NOT claimed, but custom categories WERE claimed
        groceries = db.query(ExpenseType).filter_by(name_key="groceries").first()
        custom_exp = db.query(ExpenseType).filter_by(name_key="custom_project").first()
        salary = db.query(IncomeType).filter_by(name_key="salary").first()
        custom_inc = db.query(IncomeType).filter_by(name_key="consulting_corp").first()

        assert groceries.user_id is None, "System default expense type must remain user_id=None"
        assert custom_exp.user_id == user1.id, "Custom legacy expense type must be claimed by owner"
        assert salary.user_id is None, "System default income type must remain user_id=None"
        assert custom_inc.user_id == user1.id, "Custom legacy income type must be claimed by owner"

        # Setup status now: is_configured=True, allow_registration=False (by default)
        status2 = get_setup_status(db)
        assert status2.is_configured is True
        assert status2.allow_registration is False

        # Attempt second user registration when allow_registration is False -> ConflictError
        with pytest.raises(ConflictError, match="Registration is disabled"):
            register_user(
                db, UserCreate(email="attacker@example.com", password="AttackerPassword123!")
            )

        # Now simulate allow_registration=True
        from app.core.config import get_settings
        monkeypatch.setattr(get_settings(), "allow_registration", True)

        status3 = get_setup_status(db)
        assert status3.allow_registration is True

        user2, token2 = register_user(
            db, UserCreate(email="user2@example.com", password="SecondPassword123!")
        )
        assert user2.is_superuser is False
        assert user2.email == "user2@example.com"
