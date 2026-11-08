import hashlib
from datetime import date
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bank_account import BankAccount
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.income import Income
from app.models.income_type import IncomeType
from app.models.sms_source_message import SmsSourceMessage
from app.models.transaction_evidence import TransactionEvidence
from app.models.user import User
from app.schemas.sms_ingest import SmsIngestRequest
from app.services.sms_ingest import ingest_sms_transaction


def _get_or_create_user(db: Session, email: str = "smsuser@test.com") -> User:
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(email=email, hashed_password="dummy_hash", is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def test_sms_ingest_raw_text_vs_body(db_session: Session):
    db = db_session
    user = _get_or_create_user(db, "rawtext@test.com")

    # Ingest with raw_text only (like Android currently sends)
    payload_raw = SmsIngestRequest(
        amount_paise=1500,
        direction="DEBIT",
        merchant_or_payer="Jio",
        bank_name="SDCCBL",
        account_suffix="1234",
        raw_text="Paid Rs.15 via UPI to Jio on 08-11-2026. Ref: 9876543210",
        reference="9876543210",
    )
    res_raw = ingest_sms_transaction(db, payload_raw, user_id=user.id)
    assert res_raw.created is True
    assert res_raw.transaction_type == "expense"

    expense = db.get(Expense, res_raw.entity_id)
    assert expense is not None
    assert expense.amount_paise == 1500
    assert expense.payment_method == "UPI"
    assert expense.bank_reference == "9876543210"
    assert expense.source == "sms"

    # Ingest with body only
    payload_body = SmsIngestRequest(
        amount_paise=2500,
        direction="DEBIT",
        merchant_or_payer="Swiggy",
        bank_name="HDFC",
        body="Paid Rs.25 via UPI to Swiggy",
    )
    res_body = ingest_sms_transaction(db, payload_body, user_id=user.id)
    assert res_body.created is True
    expense_b = db.get(Expense, res_body.entity_id)
    assert expense_b.payment_method == "UPI"


def test_sms_ingest_reference_cleaning(db_session: Session):
    db = db_session
    user = _get_or_create_user(db, "refclean@test.com")

    # Degenerate "UPI" reference should be cleaned to None
    payload_dirty = SmsIngestRequest(
        amount_paise=5000,
        direction="DEBIT",
        merchant_or_payer="Tea Stall",
        reference="UPI",
        raw_text="Debited INR 50.00 from a/c **1122",
    )
    res_dirty = ingest_sms_transaction(db, payload_dirty, user_id=user.id)
    exp = db.get(Expense, res_dirty.entity_id)
    assert exp.bank_reference is None

    # Legitimate reference should be preserved
    payload_clean = SmsIngestRequest(
        amount_paise=6000,
        direction="CREDIT",
        merchant_or_payer="Employer",
        reference="IMPS/6391029481",
        raw_text="Credited INR 60.00 to a/c **1122 via IMPS/6391029481",
    )
    res_clean = ingest_sms_transaction(db, payload_clean, user_id=user.id)
    inc = db.get(Income, res_clean.entity_id)
    assert inc.bank_reference == "IMPS/6391029481"


def test_sms_ingest_multitenant_isolation(db_session: Session):
    db = db_session
    user_a = _get_or_create_user(db, "userA@test.com")
    user_b = _get_or_create_user(db, "userB@test.com")

    # Create private category for user_a
    type_a = ExpenseType(
        user_id=user_a.id,
        name="Private Gymnastics",
        name_key="private_gymnastics",
        color="#000000",
        icon="dumbbell",
        is_archived=False,
    )
    db.add(type_a)
    db.commit()

    # User B ingests transaction with suggested_category "Gymnastics"
    payload = SmsIngestRequest(
        amount_paise=100000,
        direction="DEBIT",
        suggested_category="Gymnastics",
        merchant_or_payer="Gym Center",
        raw_text="Debited Rs 1000 at Gym",
    )
    res_b = ingest_sms_transaction(db, payload, user_id=user_b.id)
    exp_b = db.get(Expense, res_b.entity_id)

    # Must NOT have been assigned user_a's category!
    assert exp_b.expense_type_id != type_a.id


def test_sms_evidence_recording_and_idempotency(db_session: Session):
    db = db_session
    user = _get_or_create_user(db, "evidence@test.com")

    body_text = "Your a/c XX9988 is debited by Rs 250.00 on 08-Nov-26 via UPI txn 999111"
    payload = SmsIngestRequest(
        amount_paise=25000,
        direction="DEBIT",
        merchant_or_payer="Coffee Shop",
        sender="VM-HDFCBK",
        raw_text=body_text,
        reference="999111",
        received_at=1731050000000,
    )

    # First ingest
    res1 = ingest_sms_transaction(db, payload, idempotency_key="sms-key-001", user_id=user.id)
    assert res1.created is True

    # Verify SmsSourceMessage
    content_hash = hashlib.sha256(body_text.encode("utf-8")).hexdigest()
    source_msg = db.scalar(
        select(SmsSourceMessage).where(
            SmsSourceMessage.user_id == user.id,
            SmsSourceMessage.content_hash == content_hash,
        )
    )
    assert source_msg is not None
    assert source_msg.sender_id == "VM-HDFCBK"
    assert source_msg.received_at_ms == 1731050000000

    # Verify TransactionEvidence
    evidence = db.scalar(
        select(TransactionEvidence).where(
            TransactionEvidence.sms_message_id == source_msg.id,
            TransactionEvidence.expense_id == res1.entity_id,
        )
    )
    assert evidence is not None
    assert evidence.income_id is None
    assert evidence.match_confidence == "HIGH"

    # Replay with same idempotency key
    res2 = ingest_sms_transaction(db, payload, idempotency_key="sms-key-001", user_id=user.id)
    assert res2.replayed is True
    assert res2.id == res1.id


def test_dual_credit_consecutive_ingest(db_session: Session):
    db = db_session
    user = _get_or_create_user(db, "dualcredit@test.com")

    # Transaction 1: Credit 3003.00, Avail Bal: 9140.09
    payload1 = SmsIngestRequest(
        amount_paise=300300,
        direction="CREDIT",
        bank_name="SDCCBL",
        account_suffix="8824",
        available_balance_paise=914009,
        merchant_or_payer="Govt Scheme Installment 1",
        raw_text="A/c *8824 Credited INR 3003.00 on 08-11-26. Bal: INR 9140.09",
        reference="CR/1001",
    )
    res1 = ingest_sms_transaction(db, payload1, idempotency_key="tx-3003-1", user_id=user.id)
    assert res1.created is True

    # Transaction 2: Consecutive Credit 3003.00, Avail Bal: 12143.09
    payload2 = SmsIngestRequest(
        amount_paise=300300,
        direction="CREDIT",
        bank_name="SDCCBL",
        account_suffix="8824",
        available_balance_paise=1214309,
        merchant_or_payer="Govt Scheme Installment 2",
        raw_text="A/c *8824 Credited INR 3003.00 on 08-11-26. Bal: INR 12143.09",
        reference="CR/1002",
    )
    res2 = ingest_sms_transaction(db, payload2, idempotency_key="tx-3003-2", user_id=user.id)
    assert res2.created is True

    # Both must exist as separate entities
    assert res1.entity_id != res2.entity_id

    inc1 = db.get(Income, res1.entity_id)
    inc2 = db.get(Income, res2.entity_id)
    assert inc1.amount_paise == 300300
    assert inc2.amount_paise == 300300
    assert inc1.id != inc2.id

    # Check bank account balance
    acct = db.get(BankAccount, res2.account_id)
    assert acct is not None
    assert acct.last_reported_balance_paise == 1214309


def test_cross_tenant_evidence_isolation(db_session: Session):
    db = db_session
    user_a = _get_or_create_user(db, "tenantA_ev@test.com")
    user_b = _get_or_create_user(db, "tenantB_ev@test.com")

    # User A creates an expense
    payload_a = SmsIngestRequest(
        amount_paise=12000,
        direction="DEBIT",
        merchant_or_payer="Tenant A Store",
        raw_text="Debited 120 from User A",
    )
    res_a = ingest_sms_transaction(db, payload_a, user_id=user_a.id)
    assert res_a.created is True

    # Attempt to record evidence for User B linking to User A's expense
    from app.services.sms_ingest import _record_sms_evidence

    payload_b = SmsIngestRequest(
        amount_paise=12000,
        direction="DEBIT",
        raw_text="Debited 120 spoof attempt",
    )
    # This should be rejected by cross-tenant safety guard
    _record_sms_evidence(
        db,
        user_id=user_b.id,
        payload=payload_b,
        expense_id=res_a.entity_id,
        direction="DEBIT",
    )
    db.commit()

    # Verify no TransactionEvidence was created linking User B's message to User A's expense
    leaked_evidence = db.scalar(
        select(TransactionEvidence).where(
            TransactionEvidence.expense_id == res_a.entity_id,
            TransactionEvidence.user_id == user_b.id,
        )
    )
    assert leaked_evidence is None


def test_cross_tenant_direct_db_constraint_rejection(db_session: Session):
    from sqlalchemy.exc import IntegrityError

    db = db_session
    user_a = _get_or_create_user(db, "direct_tenant_a@test.com")
    user_b = _get_or_create_user(db, "direct_tenant_b@test.com")

    # Create an ExpenseType first to satisfy FK constraint
    exp_type = ExpenseType(name="Direct Type", name_key="direct_type", category="Other", icon="tag", color="#0F766E")
    db.add(exp_type)
    db.commit()
    db.refresh(exp_type)

    # Create expense for User A
    exp_a = Expense(
        user_id=user_a.id,
        expense_type_id=exp_type.id,
        amount_paise=5000,
        expense_date=date.today(),
        merchant="User A Merchant",
    )
    db.add(exp_a)
    db.commit()
    db.refresh(exp_a)

    # Create SMS source message for User B
    sms_b = SmsSourceMessage(
        user_id=user_b.id,
        sender_id="AD-TESTBK",
        content_hash="test-hash-b",
        classification="DEBIT_CONFIRMED",
    )
    db.add(sms_b)
    db.commit()
    db.refresh(sms_b)

    # Now attempt cross-tenant linkage directly at DB level:
    # User B's evidence attempting to claim User A's expense
    bad_evidence = TransactionEvidence(
        user_id=user_b.id,
        sms_message_id=sms_b.id,
        expense_id=exp_a.id,
        evidence_role="PRIMARY_NOTIFICATION",
        match_confidence="HIGH",
    )
    db.add(bad_evidence)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
