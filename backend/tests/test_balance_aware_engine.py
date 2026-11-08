from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.balance_snapshot import BalanceSnapshot
from app.models.bank_account import BankAccount
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.income import Income
from app.models.transaction_evidence import TransactionEvidence
from app.models.transaction_reversal import TransactionReversal
from app.models.user import User
from app.schemas.sms_ingest import SmsIngestRequest
from app.services.bank_accounts import recalculate_account_balance
from app.services.sms_ingest import ingest_sms_transaction


def _create_test_user_and_account(
    db: Session,
    email: str = "engine_user@test.com",
    bank_name: str = "HDFC",
    account_suffix: str = "4375",
    initial_balance_paise: int = 100000,  # ₹1,000.00
) -> tuple[User, BankAccount]:
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(
            email=email,
            hashed_password="mock_password",
            full_name="Engine Test User",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    account = BankAccount(
        user_id=user.id,
        bank_name=bank_name,
        account_name=f"{bank_name} Savings",
        account_type="savings",
        account_number_mask=f"XX{account_suffix}",
        currency="INR",
        opening_balance_paise=initial_balance_paise,
        opening_balance_date=date(2026, 1, 1),
        current_balance_paise=initial_balance_paise,
        last_reported_balance_paise=initial_balance_paise,
        last_reported_at=datetime(2026, 1, 1, 10, 0, 0, tzinfo=UTC),
        reconciliation_status="matched",
        color="#1D4ED8",
        icon="building",
        is_archived=False,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return user, account


def _get_metrics(db: Session, user_id: int, account_id: int):
    expenses = list(
        db.scalars(
            select(Expense).where(Expense.user_id == user_id, Expense.account_id == account_id)
        ).all()
    )
    incomes = list(
        db.scalars(
            select(Income).where(Income.user_id == user_id, Income.account_id == account_id)
        ).all()
    )
    total_expense_paise = sum(e.amount_paise for e in expenses)
    total_income_paise = sum(i.amount_paise for i in incomes)
    account = db.get(BankAccount, account_id)
    snapshots = list(
        db.scalars(select(BalanceSnapshot).where(BalanceSnapshot.account_id == account_id)).all()
    )
    evidence_links = list(
        db.scalars(select(TransactionEvidence).where(TransactionEvidence.user_id == user_id)).all()
    )
    return {
        "expense_count": len(expenses),
        "income_count": len(incomes),
        "total_expense_paise": total_expense_paise,
        "total_income_paise": total_income_paise,
        "current_balance_paise": account.current_balance_paise,
        "last_reported_balance_paise": account.last_reported_balance_paise,
        "snapshot_count": len(snapshots),
        "evidence_count": len(evidence_links),
        "account": account,
        "snapshots": snapshots,
    }


# =============================================================================
# 1. One ₹10 debit and 100 duplicate SMS messages
# =============================================================================
def test_1_one_10_debit_and_100_duplicates(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test1@test.com", initial_balance_paise=100000
    )  # ₹1,000

    payload = SmsIngestRequest(
        amount_paise=1000,  # ₹10
        direction="DEBIT",
        merchant_or_payer="Chai Point",
        bank_name="HDFC",
        account_suffix="4375",
        reference="DEBIT10_REF",
        available_balance_paise=99000,  # ₹990
        raw_text="Debited INR 10.00 from HDFC a/c **4375 on 08-11-2026. Avl Bal INR 990.00. Ref DEBIT10_REF",
    )

    # Initial genuine SMS
    resp1 = ingest_sms_transaction(db, payload, user_id=user.id)
    assert resp1.created is True
    assert resp1.replayed is False
    assert resp1.status == "created"

    # Ingest 100 duplicate SMS messages
    for _i in range(100):
        dup_resp = ingest_sms_transaction(db, payload, user_id=user.id)
        assert dup_resp.created is False
        assert dup_resp.replayed is True
        assert dup_resp.status == "replayed"

    m = _get_metrics(db, user.id, account.id)
    assert m["expense_count"] == 1
    assert m["income_count"] == 0
    assert m["total_expense_paise"] == 1000
    assert m["current_balance_paise"] == 99000
    assert m["last_reported_balance_paise"] == 99000
    assert m["evidence_count"] >= 1


# =============================================================================
# 2. One ₹10 credit and 100 duplicate SMS messages
# =============================================================================
def test_2_one_10_credit_and_100_duplicates(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test2@test.com", initial_balance_paise=100000
    )  # ₹1,000

    payload = SmsIngestRequest(
        amount_paise=1000,  # ₹10
        direction="CREDIT",
        merchant_or_payer="Friend",
        bank_name="HDFC",
        account_suffix="4375",
        reference="CREDIT10_REF",
        available_balance_paise=101000,  # ₹1,010
        raw_text="Credited INR 10.00 to HDFC a/c **4375 on 08-11-2026. Avl Bal INR 1010.00. Ref CREDIT10_REF",
    )

    resp1 = ingest_sms_transaction(db, payload, user_id=user.id)
    assert resp1.created is True
    assert resp1.replayed is False

    for _ in range(100):
        dup_resp = ingest_sms_transaction(db, payload, user_id=user.id)
        assert dup_resp.created is False
        assert dup_resp.replayed is True

    m = _get_metrics(db, user.id, account.id)
    assert m["income_count"] == 1
    assert m["expense_count"] == 0
    assert m["total_income_paise"] == 1000
    assert m["current_balance_paise"] == 101000
    assert m["last_reported_balance_paise"] == 101000


# =============================================================================
# 3. Two distinct ₹10 debits
# =============================================================================
def test_3_two_distinct_10_debits(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test3@test.com", initial_balance_paise=100000
    )

    p1 = SmsIngestRequest(
        amount_paise=1000,
        direction="DEBIT",
        merchant_or_payer="Shop A",
        bank_name="HDFC",
        account_suffix="4375",
        reference="REF_DEBIT_A",
        available_balance_paise=99000,
        raw_text="Debited INR 10.00 Ref REF_DEBIT_A. Avl Bal 990.00",
    )
    p2 = SmsIngestRequest(
        amount_paise=1000,
        direction="DEBIT",
        merchant_or_payer="Shop B",
        bank_name="HDFC",
        account_suffix="4375",
        reference="REF_DEBIT_B",
        available_balance_paise=98000,
        raw_text="Debited INR 10.00 Ref REF_DEBIT_B. Avl Bal 980.00",
    )

    r1 = ingest_sms_transaction(db, p1, user_id=user.id)
    r2 = ingest_sms_transaction(db, p2, user_id=user.id)
    assert r1.created is True and r2.created is True
    assert r1.entity_id != r2.entity_id

    m = _get_metrics(db, user.id, account.id)
    assert m["expense_count"] == 2
    assert m["total_expense_paise"] == 2000
    assert m["current_balance_paise"] == 98000


# =============================================================================
# 4. Two distinct ₹10 credits
# =============================================================================
def test_4_two_distinct_10_credits(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test4@test.com", initial_balance_paise=100000
    )

    p1 = SmsIngestRequest(
        amount_paise=1000,
        direction="CREDIT",
        merchant_or_payer="Sender A",
        bank_name="HDFC",
        account_suffix="4375",
        reference="REF_CREDIT_A",
        available_balance_paise=101000,
        raw_text="Credited INR 10.00 Ref REF_CREDIT_A. Avl Bal 1010.00",
    )
    p2 = SmsIngestRequest(
        amount_paise=1000,
        direction="CREDIT",
        merchant_or_payer="Sender B",
        bank_name="HDFC",
        account_suffix="4375",
        reference="REF_CREDIT_B",
        available_balance_paise=102000,
        raw_text="Credited INR 10.00 Ref REF_CREDIT_B. Avl Bal 1020.00",
    )

    r1 = ingest_sms_transaction(db, p1, user_id=user.id)
    r2 = ingest_sms_transaction(db, p2, user_id=user.id)
    assert r1.created is True and r2.created is True

    m = _get_metrics(db, user.id, account.id)
    assert m["income_count"] == 2
    assert m["total_income_paise"] == 2000
    assert m["current_balance_paise"] == 102000


# =============================================================================
# 5. One ₹3,003 credit and repeated duplicates
# =============================================================================
def test_5_one_3003_credit_and_repeated_duplicates(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test5@test.com", initial_balance_paise=914009
    )  # ₹9,140.09

    payload = SmsIngestRequest(
        amount_paise=300300,  # ₹3,003.00
        direction="CREDIT",
        merchant_or_payer="Employer",
        bank_name="HDFC",
        account_suffix="4375",
        reference="SALARY_3003_REF",
        available_balance_paise=1214309,  # ₹12,143.09
        raw_text="Account **4375 credited for INR 3003.00 on 08-Nov-26. Total Bal: INR 12143.09. Ref SALARY_3003_REF",
    )

    resp1 = ingest_sms_transaction(db, payload, user_id=user.id)
    assert resp1.created is True
    assert resp1.current_calculated_balance_paise == 1214309

    for _ in range(25):
        dup_resp = ingest_sms_transaction(db, payload, user_id=user.id)
        assert dup_resp.created is False
        assert dup_resp.replayed is True

    m = _get_metrics(db, user.id, account.id)
    assert m["income_count"] == 1
    assert m["total_income_paise"] == 300300
    assert m["current_balance_paise"] == 1214309
    assert m["last_reported_balance_paise"] == 1214309


# =============================================================================
# 6. Two genuine ₹3,003 credits (Section D scenario)
# =============================================================================
def test_6_two_genuine_3003_credits(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test6@test.com", initial_balance_paise=914009
    )

    msg1 = SmsIngestRequest(
        amount_paise=300300,
        direction="CREDIT",
        merchant_or_payer="Client 1",
        bank_name="HDFC",
        account_suffix="4375",
        reference="CR_3003_A",
        available_balance_paise=1214309,
        raw_text="Credited INR 3003.00 Ref CR_3003_A. Balance INR 12143.09",
    )

    # 1. First genuine credit
    r1 = ingest_sms_transaction(db, msg1, user_id=user.id)
    assert r1.created is True

    # 2. Duplicate of first message
    dup1 = ingest_sms_transaction(db, msg1, user_id=user.id)
    assert dup1.created is False and dup1.replayed is True

    # 3. Another duplicate of first message
    dup2 = ingest_sms_transaction(db, msg1, user_id=user.id)
    assert dup2.created is False and dup2.replayed is True

    # 4. Second genuine ₹3,003 credit with balance ₹15,146.09 (or progression)
    msg2 = SmsIngestRequest(
        amount_paise=300300,
        direction="CREDIT",
        merchant_or_payer="Client 2",
        bank_name="HDFC",
        account_suffix="4375",
        reference="CR_3003_B",
        available_balance_paise=1514609,
        raw_text="Credited INR 3003.00 Ref CR_3003_B. Balance INR 15146.09",
    )
    r2 = ingest_sms_transaction(db, msg2, user_id=user.id)
    assert r2.created is True

    # 5. Duplicate of second message
    dup3 = ingest_sms_transaction(db, msg2, user_id=user.id)
    assert dup3.created is False and dup3.replayed is True

    m = _get_metrics(db, user.id, account.id)
    assert m["income_count"] == 2
    assert m["total_income_paise"] == 600600
    assert m["current_balance_paise"] == 1514609
    assert m["last_reported_balance_paise"] == 1514609


# =============================================================================
# 7. Duplicate message with updated balance wording
# =============================================================================
def test_7_duplicate_with_updated_balance_wording(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test7@test.com", initial_balance_paise=500000
    )

    p1 = SmsIngestRequest(
        amount_paise=50000,
        direction="DEBIT",
        merchant_or_payer="Supermarket",
        bank_name="HDFC",
        account_suffix="4375",
        reference="TXN_WORDING_1",
        available_balance_paise=450000,
        raw_text="Rs.500.00 debited from A/c **4375. Avail Bal: Rs 4500.00. Ref TXN_WORDING_1",
    )
    r1 = ingest_sms_transaction(db, p1, user_id=user.id)
    assert r1.created is True

    # Slightly different wording from bank CBS alert for same reference & amount
    p2 = SmsIngestRequest(
        amount_paise=50000,
        direction="DEBIT",
        merchant_or_payer="Supermarket",
        bank_name="HDFC",
        account_suffix="4375",
        reference="TXN_WORDING_1",
        available_balance_paise=450000,
        raw_text="Your account 4375 has been debited for INR 500.00. Updated balance is INR 4500.00. Ref TXN_WORDING_1",
    )
    r2 = ingest_sms_transaction(db, p2, user_id=user.id)
    assert r2.created is False
    assert r2.replayed is True

    m = _get_metrics(db, user.id, account.id)
    assert m["expense_count"] == 1
    assert m["total_expense_paise"] == 50000
    assert m["current_balance_paise"] == 450000


# =============================================================================
# 8. Same reference with conflicting amount
# =============================================================================
def test_8_same_reference_with_conflicting_amount(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test8@test.com", initial_balance_paise=500000
    )

    p1 = SmsIngestRequest(
        amount_paise=50000,  # ₹500
        direction="DEBIT",
        merchant_or_payer="Merchant",
        bank_name="HDFC",
        account_suffix="4375",
        reference="CONFLICT_REF_1",
        available_balance_paise=450000,
        raw_text="Debited INR 500 Ref CONFLICT_REF_1",
    )
    r1 = ingest_sms_transaction(db, p1, user_id=user.id)
    assert r1.created is True

    # Same reference but conflicting amount (₹600 instead of ₹500)
    p2 = SmsIngestRequest(
        amount_paise=60000,  # ₹600
        direction="DEBIT",
        merchant_or_payer="Merchant",
        bank_name="HDFC",
        account_suffix="4375",
        reference="CONFLICT_REF_1",
        available_balance_paise=440000,
        raw_text="Debited INR 600 Ref CONFLICT_REF_1",
    )
    r2 = ingest_sms_transaction(db, p2, user_id=user.id)
    assert r2.created is False
    assert r2.status == "conflict_review"

    m = _get_metrics(db, user.id, account.id)
    assert m["expense_count"] == 1  # Unsafe ledger entry was not created
    assert m["total_expense_paise"] == 50000


# =============================================================================
# 9. Same amount with different references
# =============================================================================
def test_9_same_amount_with_different_references(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test9@test.com", initial_balance_paise=500000
    )

    p1 = SmsIngestRequest(
        amount_paise=50000,
        direction="DEBIT",
        merchant_or_payer="Vendor 1",
        bank_name="HDFC",
        account_suffix="4375",
        reference="UNIQUE_REF_AAA",
        available_balance_paise=450000,
        raw_text="Debited 500 Ref UNIQUE_REF_AAA",
    )
    p2 = SmsIngestRequest(
        amount_paise=50000,
        direction="DEBIT",
        merchant_or_payer="Vendor 2",
        bank_name="HDFC",
        account_suffix="4375",
        reference="UNIQUE_REF_BBB",
        available_balance_paise=400000,
        raw_text="Debited 500 Ref UNIQUE_REF_BBB",
    )

    r1 = ingest_sms_transaction(db, p1, user_id=user.id)
    r2 = ingest_sms_transaction(db, p2, user_id=user.id)
    assert r1.created is True and r2.created is True
    assert r1.entity_id != r2.entity_id

    m = _get_metrics(db, user.id, account.id)
    assert m["expense_count"] == 2
    assert m["total_expense_paise"] == 100000


# =============================================================================
# 10. Delayed duplicate message
# =============================================================================
def test_10_delayed_duplicate_message(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test10@test.com", initial_balance_paise=500000
    )

    p = SmsIngestRequest(
        amount_paise=25000,
        direction="DEBIT",
        merchant_or_payer="Fuel Station",
        bank_name="HDFC",
        account_suffix="4375",
        reference="FUEL_REF_10",
        available_balance_paise=475000,
        raw_text="Debited INR 250.00 at Fuel Station Ref FUEL_REF_10",
    )
    r1 = ingest_sms_transaction(db, p, user_id=user.id)
    assert r1.created is True

    # Simulate message arriving again 2 days later with delayed timestamp
    p_delayed = p.model_copy(
        update={
            "effective_timestamp_ms": int(
                (datetime.now(UTC) + timedelta(days=2)).timestamp() * 1000
            )
        }
    )
    r2 = ingest_sms_transaction(db, p_delayed, user_id=user.id)
    assert r2.created is False
    assert r2.replayed is True

    m = _get_metrics(db, user.id, account.id)
    assert m["expense_count"] == 1
    assert m["current_balance_paise"] == 475000


# =============================================================================
# 11. Out-of-order balance snapshots
# =============================================================================
def test_11_out_of_order_balance_snapshots(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test11@test.com", initial_balance_paise=500000
    )

    time_1200 = datetime(2026, 11, 8, 12, 0, 0, tzinfo=UTC)
    time_1230 = datetime(2026, 11, 8, 12, 30, 0, tzinfo=UTC)

    # Newer message (12:30) arrives first with balance ₹4,500
    p_newer = SmsIngestRequest(
        amount_paise=50000,
        direction="DEBIT",
        merchant_or_payer="Merchant B",
        bank_name="HDFC",
        account_suffix="4375",
        reference="REF_1230",
        available_balance_paise=450000,
        transaction_time=time_1230.isoformat(),
        raw_text="Debited 500 at 12:30 Ref REF_1230 Bal 4500",
    )
    r1 = ingest_sms_transaction(db, p_newer, user_id=user.id)
    assert r1.created is True

    # Older delayed message (12:00) arrives second with balance ₹5,000
    p_older = SmsIngestRequest(
        amount_paise=20000,
        direction="CREDIT",
        merchant_or_payer="Friend",
        bank_name="HDFC",
        account_suffix="4375",
        reference="REF_1200",
        available_balance_paise=500000,
        transaction_time=time_1200.isoformat(),
        raw_text="Credited 200 at 12:00 Ref REF_1200 Bal 5000",
    )
    r2 = ingest_sms_transaction(db, p_older, user_id=user.id)
    assert r2.created is True

    # Verify that the older snapshot did not overwrite account.last_reported_balance_paise
    db.refresh(account)
    assert account.last_reported_balance_paise == 450000  # Newer snapshot preserved!
    assert account.last_reported_at == time_1230


# =============================================================================
# 12. Intervening debit
# =============================================================================
def test_12_intervening_debit(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test12@test.com", initial_balance_paise=100000
    )

    # Credit 1: ₹1,000
    p1 = SmsIngestRequest(
        amount_paise=100000,
        direction="CREDIT",
        reference="CR1",
        raw_text="CR1 1000",
        bank_name="HDFC",
        account_suffix="4375",
    )
    ingest_sms_transaction(db, p1, user_id=user.id)

    # Intervening Debit: ₹200
    p2 = SmsIngestRequest(
        amount_paise=20000,
        direction="DEBIT",
        reference="DR_INTERVENE",
        raw_text="DR 200",
        bank_name="HDFC",
        account_suffix="4375",
    )
    ingest_sms_transaction(db, p2, user_id=user.id)

    # Credit 2: ₹500
    p3 = SmsIngestRequest(
        amount_paise=50000,
        direction="CREDIT",
        reference="CR2",
        raw_text="CR2 500",
        bank_name="HDFC",
        account_suffix="4375",
    )
    ingest_sms_transaction(db, p3, user_id=user.id)

    m = _get_metrics(db, user.id, account.id)
    assert m["income_count"] == 2
    assert m["expense_count"] == 1
    # Initial 1000 + 1000 - 200 + 500 = 2300 (230,000 paise)
    assert m["current_balance_paise"] == 230000


# =============================================================================
# 13. Intervening credit
# =============================================================================
def test_13_intervening_credit(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test13@test.com", initial_balance_paise=100000
    )

    # Debit 1: ₹300
    p1 = SmsIngestRequest(
        amount_paise=30000,
        direction="DEBIT",
        reference="DR1",
        raw_text="DR1 300",
        bank_name="HDFC",
        account_suffix="4375",
    )
    ingest_sms_transaction(db, p1, user_id=user.id)

    # Intervening Credit: ₹1,000
    p2 = SmsIngestRequest(
        amount_paise=100000,
        direction="CREDIT",
        reference="CR_INTERVENE",
        raw_text="CR 1000",
        bank_name="HDFC",
        account_suffix="4375",
    )
    ingest_sms_transaction(db, p2, user_id=user.id)

    m = _get_metrics(db, user.id, account.id)
    assert m["income_count"] == 1
    assert m["expense_count"] == 1
    # 1000 - 300 + 1000 = 1700 (170,000 paise)
    assert m["current_balance_paise"] == 170000


# =============================================================================
# 14. Available balance versus ledger balance
# =============================================================================
def test_14_available_vs_ledger_balance(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test14@test.com", initial_balance_paise=1000000
    )

    p = SmsIngestRequest(
        amount_paise=50000,
        direction="DEBIT",
        bank_name="HDFC",
        account_suffix="4375",
        reference="REF_BAL_TYPES",
        available_balance_paise=950000,
        ledger_balance_paise=1000000,
        balance_type="AVAILABLE",
        raw_text="Debited 500. Avail Bal 9500. Ledger Bal 10000",
    )
    r = ingest_sms_transaction(db, p, user_id=user.id)
    assert r.created is True

    # Verify snapshot records balance_type="AVAILABLE"
    snapshots = list(
        db.scalars(select(BalanceSnapshot).where(BalanceSnapshot.account_id == account.id)).all()
    )
    assert any(s.balance_type == "AVAILABLE" for s in snapshots)


# =============================================================================
# 15. Manual transaction later confirmed by SMS
# =============================================================================
def test_15_manual_transaction_later_confirmed_by_sms(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test15@test.com", initial_balance_paise=500000
    )

    # User manually records coffee expense for ₹250
    exp_type = db.scalar(select(ExpenseType).where(ExpenseType.user_id == user.id))
    if not exp_type:
        exp_type = ExpenseType(
            user_id=user.id,
            name="Dining",
            name_key="dining",
            color="#F59E0B",
            icon="coffee",
            is_archived=False,
        )
        db.add(exp_type)
        db.commit()

    manual_exp = Expense(
        user_id=user.id,
        account_id=account.id,
        expense_type_id=exp_type.id,
        amount_paise=25000,  # ₹250
        expense_date=date.today(),
        merchant="Starbucks",
        note="Manual coffee",
        source="manual",
    )
    db.add(manual_exp)
    db.commit()
    recalculate_account_balance(db, account.id)

    bal_after_manual = account.current_balance_paise
    assert bal_after_manual == 475000  # 5000 - 250 = 4750

    # Bank SMS arrives later for the same ₹250 debit at Starbucks
    sms_payload = SmsIngestRequest(
        amount_paise=25000,
        direction="DEBIT",
        merchant_or_payer="Starbucks",
        bank_name="HDFC",
        account_suffix="4375",
        reference="UPI/STARBUCKS/123",
        available_balance_paise=475000,
        raw_text="Debited INR 250.00 to Starbucks on 08-11-2026. Ref UPI/STARBUCKS/123",
    )
    resp = ingest_sms_transaction(db, sms_payload, user_id=user.id)
    assert resp.created is False
    assert resp.replayed is True
    assert resp.status == "matched_manual"
    assert resp.entity_id == manual_exp.id

    # Financial ledger count must remain 1, balance must remain 475,000 paise (not debited twice!)
    m = _get_metrics(db, user.id, account.id)
    assert m["expense_count"] == 1
    assert m["total_expense_paise"] == 25000
    assert m["current_balance_paise"] == 475000


# =============================================================================
# 16. Backend replay
# =============================================================================
def test_16_backend_replay(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test16@test.com", initial_balance_paise=500000
    )

    payload = SmsIngestRequest(
        amount_paise=15000,
        direction="DEBIT",
        merchant_or_payer="Uber",
        bank_name="HDFC",
        account_suffix="4375",
        reference="UBER_RIDE_16",
        raw_text="Debited 150 at Uber Ref UBER_RIDE_16",
    )
    r1 = ingest_sms_transaction(db, payload, idempotency_key="IDEMP_REPLAY_16", user_id=user.id)
    assert r1.created is True

    # Replay request with identical idempotency key
    r2 = ingest_sms_transaction(db, payload, idempotency_key="IDEMP_REPLAY_16", user_id=user.id)
    assert r2.created is False
    assert r2.replayed is True
    assert r2.id == r1.id


# =============================================================================
# 17. Queue retry
# =============================================================================
def test_17_queue_retry(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test17@test.com", initial_balance_paise=500000
    )

    payload = SmsIngestRequest(
        amount_paise=35000,
        direction="CREDIT",
        merchant_or_payer="Consulting",
        bank_name="HDFC",
        account_suffix="4375",
        reference="CONSULT_17",
        idempotency_key="QUEUE_RETRY_UUID_17",
        raw_text="Credited 350 Ref CONSULT_17",
    )
    r1 = ingest_sms_transaction(db, payload, user_id=user.id)
    assert r1.created is True

    # Background worker retry
    r2 = ingest_sms_transaction(db, payload, user_id=user.id)
    assert r2.created is False
    assert r2.replayed is True


# =============================================================================
# 18. Application restart (survival across fresh sessions)
# =============================================================================
def test_18_application_restart(tmp_path):
    db_file = tmp_path / "restart_test.db"
    url = f"sqlite:///{db_file.as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionMaker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    # Session 1: Process SMS
    session1 = SessionMaker()
    user, account = _create_test_user_and_account(
        session1, "restart@test.com", initial_balance_paise=500000
    )
    p = SmsIngestRequest(
        amount_paise=12000,
        direction="DEBIT",
        bank_name="HDFC",
        account_suffix="4375",
        reference="RESTART_REF_18",
        raw_text="Debited 120 Ref RESTART_REF_18",
    )
    r1 = ingest_sms_transaction(session1, p, user_id=user.id)
    assert r1.created is True
    session1.close()
    engine.dispose()

    # Session 2: "Restarted" app with fresh engine & session
    fresh_engine = create_engine(url, connect_args={"check_same_thread": False})
    FreshSessionMaker = sessionmaker(bind=fresh_engine, autoflush=False, expire_on_commit=False)
    session2 = FreshSessionMaker()

    r2 = ingest_sms_transaction(session2, p, user_id=user.id)
    assert r2.created is False
    assert r2.replayed is True
    m = _get_metrics(session2, user.id, account.id)
    assert m["expense_count"] == 1
    session2.close()
    fresh_engine.dispose()


# =============================================================================
# 19. Concurrent duplicate processing
# =============================================================================
def test_19_concurrent_duplicate_processing(tmp_path):
    db_file = tmp_path / "concurrent_test.db"
    url = f"sqlite:///{db_file.as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionMaker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    seed_session = SessionMaker()
    user, account = _create_test_user_and_account(
        seed_session, "concurrent@test.com", initial_balance_paise=500000
    )
    seed_session.close()

    payload = SmsIngestRequest(
        amount_paise=75000,
        direction="DEBIT",
        bank_name="HDFC",
        account_suffix="4375",
        reference="CONCURRENT_REF_19",
        idempotency_key="CONCURRENT_KEY_19",
        raw_text="Debited 750 Ref CONCURRENT_REF_19",
    )

    def worker():
        session = SessionMaker()
        try:
            return ingest_sms_transaction(session, payload, user_id=user.id)
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(lambda _: worker(), range(5)))

    created_count = sum(1 for r in results if r.created)
    replayed_count = sum(1 for r in results if r.replayed)
    assert created_count == 1
    assert replayed_count == 4

    verify_session = SessionMaker()
    m = _get_metrics(verify_session, user.id, account.id)
    assert m["expense_count"] == 1
    verify_session.close()
    engine.dispose()


# =============================================================================
# 20. Duplicate SMS after device restart
# =============================================================================
def test_20_duplicate_sms_after_device_restart(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test20@test.com", initial_balance_paise=500000
    )

    # Process original SMS
    p = SmsIngestRequest(
        amount_paise=40000,
        direction="DEBIT",
        bank_name="HDFC",
        account_suffix="4375",
        reference="DEV_RESTART_REF_20",
        raw_text="Debited 400 Ref DEV_RESTART_REF_20",
    )
    r1 = ingest_sms_transaction(db, p, user_id=user.id)
    assert r1.created is True

    # Simulate phone restarting and re-delivering cached SMS broadcast
    r2 = ingest_sms_transaction(db, p, user_id=user.id)
    assert r2.created is False
    assert r2.replayed is True


# =============================================================================
# 21. Missing transaction reference
# =============================================================================
def test_21_missing_transaction_reference(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test21@test.com", initial_balance_paise=500000
    )

    p = SmsIngestRequest(
        amount_paise=1500,
        direction="DEBIT",
        bank_name="HDFC",
        account_suffix="4375",
        reference=None,  # Missing reference
        available_balance_paise=498500,
        raw_text="Rs.15 debited from a/c 4375 on 08-Nov-26. Avl Bal 4985.00",
    )
    r1 = ingest_sms_transaction(db, p, user_id=user.id)
    assert r1.created is True

    # Duplicate of message with no reference
    r2 = ingest_sms_transaction(db, p, user_id=user.id)
    assert r2.created is False
    assert r2.replayed is True


# =============================================================================
# 22. Missing balance
# =============================================================================
def test_22_missing_balance(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test22@test.com", initial_balance_paise=500000
    )

    p = SmsIngestRequest(
        amount_paise=30000,
        direction="DEBIT",
        bank_name="HDFC",
        account_suffix="4375",
        reference="NO_BAL_REF_22",
        available_balance_paise=None,  # Missing balance
        raw_text="Debited 300 to Merchant. Ref NO_BAL_REF_22",
    )
    r = ingest_sms_transaction(db, p, user_id=user.id)
    assert r.created is True
    assert r.available_balance_recorded is False

    # Financial delta is still applied correctly: 500,000 - 30,000 = 470,000
    m = _get_metrics(db, user.id, account.id)
    assert m["current_balance_paise"] == 470000


# =============================================================================
# 23. Multiple accounts with identical suffixes
# =============================================================================
def test_23_multiple_accounts_identical_suffixes(db_session: Session):
    db = db_session
    user = db.scalar(select(User).where(User.email == "test23@test.com"))
    if not user:
        user = User(email="test23@test.com", hashed_password="pw", is_active=True)
        db.add(user)
        db.commit()

    # User has both HDFC ending in 4375 and ICICI ending in 4375
    hdfc_acc = BankAccount(
        user_id=user.id,
        bank_name="HDFC",
        account_name="HDFC Savings",
        account_type="savings",
        account_number_mask="XX4375",
        opening_balance_date=date(2026, 1, 1),
        opening_balance_paise=100000,
        current_balance_paise=100000,
    )
    icici_acc = BankAccount(
        user_id=user.id,
        bank_name="ICICI",
        account_name="ICICI Salary",
        account_type="salary",
        account_number_mask="XX4375",
        opening_balance_date=date(2026, 1, 1),
        opening_balance_paise=200000,
        current_balance_paise=200000,
    )
    db.add_all([hdfc_acc, icici_acc])
    db.commit()

    # SMS for ICICI ..4375
    p_icici = SmsIngestRequest(
        amount_paise=50000,
        direction="DEBIT",
        bank_name="ICICI",
        account_suffix="4375",
        reference="ICICI_TXN_23",
        raw_text="ICICI Bank: Debited 500 from a/c 4375. Ref ICICI_TXN_23",
    )
    r = ingest_sms_transaction(db, p_icici, user_id=user.id)
    assert r.created is True
    assert r.account_id == icici_acc.id

    # Verify ICICI balance debited, HDFC balance completely untouched
    db.refresh(icici_acc)
    db.refresh(hdfc_acc)
    assert icici_acc.current_balance_paise == 150000
    assert hdfc_acc.current_balance_paise == 100000


# =============================================================================
# 24. Refund and reversal
# =============================================================================
def test_24_refund_and_reversal(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test24@test.com", initial_balance_paise=500000
    )

    # Initial debit: ₹500 (50,000 paise)
    p_debit = SmsIngestRequest(
        amount_paise=50000,
        direction="DEBIT",
        bank_name="HDFC",
        account_suffix="4375",
        merchant_or_payer="Amazon",
        reference="ORDER_PAY_24",
        raw_text="Debited 500 for Amazon Order Ref ORDER_PAY_24",
    )
    r1 = ingest_sms_transaction(db, p_debit, user_id=user.id)
    assert r1.created is True

    orig_exp = db.get(Expense, r1.id)
    assert orig_exp is not None
    assert orig_exp.net_amount_paise == 50000

    # Partial refund 1: ₹200 (20,000 paise)
    from app.services.reversals import record_expense_refund

    rev1 = record_expense_refund(
        db,
        user_id=user.id,
        original_expense_id=orig_exp.id,
        refund_amount_paise=20000,
        reversal_reference="REF_PARTIAL_1",
        reason="Item returned",
    )
    db.commit()
    db.refresh(orig_exp)
    assert rev1.reversal_type == "PARTIAL_REFUND"
    assert rev1.status == "COMPLETED"
    assert orig_exp.net_amount_paise == 30000  # ₹300 remaining

    # Duplicate of partial refund 1: should return existing without doubling
    rev1_dup = record_expense_refund(
        db,
        user_id=user.id,
        original_expense_id=orig_exp.id,
        refund_amount_paise=20000,
        reversal_reference="REF_PARTIAL_1",
    )
    assert rev1_dup.id == rev1.id
    db.refresh(orig_exp)
    assert orig_exp.net_amount_paise == 30000

    # Partial refund 2: ₹100 (10,000 paise)
    rev2 = record_expense_refund(
        db,
        user_id=user.id,
        original_expense_id=orig_exp.id,
        refund_amount_paise=10000,
        reversal_reference="REF_PARTIAL_2",
    )
    db.commit()
    db.refresh(orig_exp)
    assert rev2.reversal_type == "PARTIAL_REFUND"
    assert orig_exp.net_amount_paise == 20000  # ₹200 remaining

    # Final refund of remaining ₹200 (20,000 paise)
    rev3 = record_expense_refund(
        db,
        user_id=user.id,
        original_expense_id=orig_exp.id,
        refund_amount_paise=20000,
        reversal_reference="REF_FINAL",
    )
    db.commit()
    db.refresh(orig_exp)
    assert rev3.reversal_type == "FULL_REFUND"
    assert orig_exp.net_amount_paise == 0  # Fully refunded

    # Attempted excess refund of ₹50: must be flagged as PENDING_REVIEW and not exceed original
    rev_excess = record_expense_refund(
        db,
        user_id=user.id,
        original_expense_id=orig_exp.id,
        refund_amount_paise=5000,
        reversal_reference="REF_EXCESS",
    )
    assert rev_excess.status == "PENDING_REVIEW"
    db.refresh(orig_exp)
    assert orig_exp.net_amount_paise == 0


# =============================================================================
# 25. Balance snapshot older than latest known snapshot
# =============================================================================
def test_25_snapshot_older_than_latest_known(db_session: Session):
    db = db_session
    user, account = _create_test_user_and_account(
        db, "test25@test.com", initial_balance_paise=500000
    )

    t_now = datetime(2026, 11, 8, 15, 0, 0, tzinfo=UTC)
    t_past = datetime(2026, 11, 8, 10, 0, 0, tzinfo=UTC)

    # Latest snapshot arrives first
    p_now = SmsIngestRequest(
        amount_paise=10000,
        direction="DEBIT",
        bank_name="HDFC",
        account_suffix="4375",
        reference="TXN_LATEST_25",
        available_balance_paise=490000,
        transaction_time=t_now.isoformat(),
        raw_text="Debited 100 at 15:00 Ref TXN_LATEST_25 Bal 4900",
    )
    r1 = ingest_sms_transaction(db, p_now, user_id=user.id)
    assert r1.created is True
    db.refresh(account)
    assert account.last_reported_balance_paise == 490000

    # Past snapshot arrives later (delayed notification)
    p_past = SmsIngestRequest(
        amount_paise=5000,
        direction="DEBIT",
        bank_name="HDFC",
        account_suffix="4375",
        reference="TXN_PAST_25",
        available_balance_paise=495000,
        transaction_time=t_past.isoformat(),
        raw_text="Debited 50 at 10:00 Ref TXN_PAST_25 Bal 4950",
    )
    r2 = ingest_sms_transaction(db, p_past, user_id=user.id)
    assert r2.created is True

    # Account latest reported balance must NOT regress to the older value 495,000!
    db.refresh(account)
    assert account.last_reported_balance_paise == 490000
    assert account.last_reported_at == t_now
