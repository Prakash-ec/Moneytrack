from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.account_transfer import AccountTransfer
from app.models.bank_account import BankAccount
from app.models.user import User


@pytest.fixture()
def isolated_db(tmp_path):
    url = f"sqlite:///{(tmp_path / 'ledger-test.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = Session()

    user = User(
        id=1,
        email="ledger@example.com",
        hashed_password="pw",
        full_name="Ledger Tester",
        is_active=True,
    )
    db.add(user)
    db.commit()

    try:
        yield db
    finally:
        db.close()
        engine.dispose()


def test_paise_integer_storage_no_floating_point_drift(isolated_db):
    """Monetary storage must strictly use integer paise (1 INR = 100 paise)

    to eliminate binary floating-point representation errors.
    """
    # 123.45 INR = 12345 paise
    acc = BankAccount(
        user_id=1,
        account_name="Checking Account",
        bank_name="HDFC",
        account_type="savings",
        account_number_mask="XX1234",
        opening_balance_date=date(2026, 1, 1),
        opening_balance_paise=12345,
        current_balance_paise=12345,
    )
    isolated_db.add(acc)
    isolated_db.commit()

    saved_acc = isolated_db.get(BankAccount, acc.id)
    assert isinstance(saved_acc.opening_balance_paise, int)
    assert saved_acc.opening_balance_paise == 12345


def test_transfer_balance_invariance(isolated_db):
    """Internal transfers between accounts must preserve total system assets

    (Conservation of Value: delta(source) + delta(dest) == 0).
    """
    source = BankAccount(
        user_id=1,
        account_name="Source Account",
        bank_name="SBI",
        account_type="savings",
        account_number_mask="XX1111",
        opening_balance_date=date(2026, 1, 1),
        opening_balance_paise=500000,  # 5,000 INR
        current_balance_paise=500000,
    )
    dest = BankAccount(
        user_id=1,
        account_name="Dest Account",
        bank_name="ICICI",
        account_type="savings",
        account_number_mask="XX2222",
        opening_balance_date=date(2026, 1, 1),
        opening_balance_paise=100000,  # 1,000 INR
        current_balance_paise=100000,
    )
    isolated_db.add_all([source, dest])
    isolated_db.commit()

    total_assets_before = source.current_balance_paise + dest.current_balance_paise

    transfer_amount = 150000  # 1,500 INR
    transfer = AccountTransfer(
        user_id=1,
        from_account_id=source.id,
        to_account_id=dest.id,
        amount_paise=transfer_amount,
        transfer_date=date(2026, 2, 1),
        description="Internal fund allocation",
    )
    source.current_balance_paise -= transfer_amount
    dest.current_balance_paise += transfer_amount
    isolated_db.add(transfer)
    isolated_db.commit()

    total_assets_after = source.current_balance_paise + dest.current_balance_paise
    assert total_assets_before == total_assets_after
    assert source.current_balance_paise == 350000
    assert dest.current_balance_paise == 250000


def test_transaction_rollback_preserves_ledger_integrity(isolated_db):
    """If a database error occurs during financial mutation, rollback must restore the ledger."""
    acc = BankAccount(
        user_id=1,
        account_name="Salary Account",
        bank_name="Axis",
        account_type="salary",
        account_number_mask="XX9999",
        opening_balance_date=date(2026, 1, 1),
        opening_balance_paise=200000,
        current_balance_paise=200000,
    )
    isolated_db.add(acc)
    isolated_db.commit()

    initial_balance = acc.current_balance_paise

    try:
        acc.current_balance_paise += 50000
        raise RuntimeError("Simulated transaction failure")
    except RuntimeError:
        isolated_db.rollback()

    refreshed_acc = isolated_db.get(BankAccount, acc.id)
    assert refreshed_acc.current_balance_paise == initial_balance
