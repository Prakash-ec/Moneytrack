import hashlib
import logging
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.bank_account import BankAccount
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.idempotency_key import ExpenseIdempotencyKey
from app.models.income import Income
from app.models.income_type import IncomeType
from app.models.sms_source_message import SmsSourceMessage
from app.models.transaction_evidence import TransactionEvidence
from app.schemas.expense import ExpenseCreate
from app.schemas.income import IncomeCreate
from app.schemas.sms_ingest import SmsIngestRequest, SmsIngestResponse
from app.services.bank_accounts import (
    find_account_by_identifier,
    recalculate_account_balance,
    reconcile_account_to_reported,
    record_reported_balance,
)
from app.services.expenses import create_expense
from app.services.incomes import create_income

logger = logging.getLogger(__name__)


def _clean_ref(raw_ref: str | None) -> str | None:
    if not raw_ref:
        return None
    ref = raw_ref.strip()
    if ref.upper() in {"UPI", "NA", "N/A", "REF", "TXN", "NONE", "NULL", "UNKNOWN"}:
        return None
    return ref


def _get_or_create_source_message(
    db: Session,
    *,
    user_id: int | None,
    payload: SmsIngestRequest,
    direction: str = "DEBIT",
) -> SmsSourceMessage | None:
    if not user_id:
        return None
    body = payload.effective_body or ""
    content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest() if body else None

    source_msg = None
    if content_hash:
        source_msg = db.scalar(
            select(SmsSourceMessage).where(
                SmsSourceMessage.user_id == user_id,
                SmsSourceMessage.content_hash == content_hash,
            )
        )
    if not source_msg:
        source_msg = SmsSourceMessage(
            user_id=user_id,
            sender_id=(payload.sender or payload.bank_name or "SMS")[:50],
            received_at_ms=payload.effective_timestamp_ms,
            content_hash=content_hash,
            classification=getattr(payload, "classification", None)
            or ("BANK_CREDIT" if direction == "CREDIT" else "BANK_DEBIT"),
            parser_version="v2.0",
            evidence_summary=f"Ingested {direction} of {payload.amount_paise} paise from {payload.bank_name or 'Bank'}",
            processing_status="PROCESSED",
        )
        try:
            with db.begin_nested():
                db.add(source_msg)
                db.flush()
        except IntegrityError:
            if content_hash:
                source_msg = db.scalar(
                    select(SmsSourceMessage).where(
                        SmsSourceMessage.user_id == user_id,
                        SmsSourceMessage.content_hash == content_hash,
                    )
                )
    return source_msg


def _record_sms_evidence(
    db: Session,
    *,
    user_id: int | None,
    payload: SmsIngestRequest,
    expense_id: int | None = None,
    income_id: int | None = None,
    direction: str = "DEBIT",
) -> SmsSourceMessage | None:
    if not user_id:
        return None
    try:
        # Cross-tenant defensive check
        if expense_id:
            exp_check = db.scalar(
                select(Expense.id).where(Expense.id == expense_id, Expense.user_id == user_id)
            )
            if not exp_check:
                logger.error(
                    "Cross-tenant evidence rejection: expense %s does not belong to user %s",
                    expense_id,
                    user_id,
                )
                return None
        elif income_id:
            inc_check = db.scalar(
                select(Income.id).where(Income.id == income_id, Income.user_id == user_id)
            )
            if not inc_check:
                logger.error(
                    "Cross-tenant evidence rejection: income %s does not belong to user %s",
                    income_id,
                    user_id,
                )
                return None

        source_msg = _get_or_create_source_message(
            db, user_id=user_id, payload=payload, direction=direction
        )
        if not source_msg:
            return None

        evidence_exists = None
        if expense_id:
            evidence_exists = db.scalar(
                select(TransactionEvidence).where(
                    TransactionEvidence.sms_message_id == source_msg.id,
                    TransactionEvidence.expense_id == expense_id,
                )
            )
        elif income_id:
            evidence_exists = db.scalar(
                select(TransactionEvidence).where(
                    TransactionEvidence.sms_message_id == source_msg.id,
                    TransactionEvidence.income_id == income_id,
                )
            )

        if not evidence_exists and (expense_id or income_id):
            evidence = TransactionEvidence(
                user_id=user_id,
                sms_message_id=source_msg.id,
                expense_id=expense_id,
                income_id=income_id,
                evidence_role="PRIMARY_NOTIFICATION",
                reconciliation_layer=getattr(payload, "reconciliation_layer", None) or "LAYER_B",
                match_confidence=getattr(payload, "confidence", None) or "HIGH",
            )
            try:
                with db.begin_nested():
                    db.add(evidence)
                    db.flush()
            except IntegrityError:
                pass
        return source_msg
    except Exception as exc:
        logger.warning("Could not record SMS evidence: %s", exc)
        return None


def ingest_sms_transaction(
    db: Session,
    payload: SmsIngestRequest,
    idempotency_key: str | None = None,
    user_id: int | None = None,
) -> SmsIngestResponse:
    # 1. Parse transaction direction
    raw_direction = (payload.direction or "").upper().strip()
    if raw_direction in ("CREDIT", "INFLOW", "DEPOSIT"):
        direction = "CREDIT"
    elif raw_direction in ("DEBIT", "OUTFLOW", "SPENT", "PAID"):
        direction = "DEBIT"
    else:
        return SmsIngestResponse(
            created=False,
            replayed=False,
            status="queued",
            transaction_type="queued",
            message="Ambiguous transaction direction; preserved for manual review.",
        )

    # Parse transaction date and timestamps
    txn_date = date.today()
    if payload.transaction_date:
        try:
            txn_date = date.fromisoformat(payload.transaction_date)
        except ValueError:
            txn_date = date.today()

    txn_time: datetime | None = None
    if payload.transaction_time:
        try:
            txn_time = datetime.fromisoformat(payload.transaction_time)
            if txn_time.tzinfo is None:
                txn_time = txn_time.replace(tzinfo=UTC)
        except ValueError:
            pass

    reception_time: datetime | None = None
    if payload.effective_timestamp_ms:
        try:
            reception_time = datetime.fromtimestamp(payload.effective_timestamp_ms / 1000.0, tz=UTC)
            if not txn_time:
                txn_time = reception_time
        except Exception:
            pass

    if not txn_time:
        txn_time = datetime.combine(txn_date, datetime.min.time(), tzinfo=UTC)

    # 2. Match bank account or auto-create if new
    account = find_account_by_identifier(
        db, suffix=payload.account_suffix, bank_name=payload.bank_name, user_id=user_id
    )
    if not account and user_id is not None and (payload.account_suffix or payload.bank_name):
        bank_label = (payload.bank_name or "Bank").strip()
        mask = f"XX{payload.account_suffix}" if payload.account_suffix else "XX0000"
        acct_name = (
            f"{bank_label} (..{payload.account_suffix})"
            if payload.account_suffix
            else f"{bank_label} Account"
        )

        existing = db.scalar(
            select(BankAccount).where(
                BankAccount.user_id == user_id,
                BankAccount.is_archived.is_(False),
                (BankAccount.account_number_mask == mask) | (BankAccount.account_name == acct_name),
            )
        )
        if existing:
            account = existing
        else:
            reported = payload.available_balance_paise
            if reported is not None:
                if direction == "DEBIT":
                    opening_bal = reported + payload.amount_paise
                else:
                    opening_bal = reported - payload.amount_paise
            else:
                opening_bal = 0

            account = BankAccount(
                user_id=user_id,
                bank_name=bank_label,
                account_name=acct_name,
                account_type="savings",
                account_number_mask=mask,
                currency=payload.currency or "INR",
                opening_balance_paise=opening_bal,
                opening_balance_date=txn_date,
                current_balance_paise=opening_bal,
                last_reported_balance_paise=reported,
                last_reported_at=txn_time,
                reconciliation_status="matched" if reported is not None else "unreconciled",
                color="#1D4ED8",
                icon="building",
                is_archived=False,
            )
            db.add(account)
            db.commit()
            db.refresh(account)

    account_id = account.id if account else None
    account_name = account.account_name if account else None

    clean_ref = _clean_ref(payload.reference)
    effective_key = idempotency_key or payload.idempotency_key
    effective_body = payload.effective_body or ""
    content_hash = (
        hashlib.sha256(effective_body.encode("utf-8")).hexdigest() if effective_body else None
    )

    # -------------------------------------------------------------------------
    # DEDUPLICATION & RECONCILIATION LAYERS
    # -------------------------------------------------------------------------

    # --- LAYER 1A: Idempotency Key Check ---
    if effective_key:
        if direction == "DEBIT":
            existing_key = db.scalar(
                select(ExpenseIdempotencyKey).where(
                    ExpenseIdempotencyKey.idempotency_key == effective_key
                )
            )
            if existing_key:
                exp = db.get(Expense, existing_key.expense_id)
                if exp:
                    return SmsIngestResponse(
                        created=False,
                        replayed=True,
                        status="replayed",
                        transaction_type="expense",
                        id=exp.id,
                        entity_id=exp.id,
                        account_id=account.id if account else exp.account_id,
                        account_name=account_name,
                        available_balance_recorded=False,
                        current_calculated_balance_paise=account.current_balance_paise
                        if account
                        else None,
                        last_reported_balance_paise=account.last_reported_balance_paise
                        if account
                        else None,
                        reconciliation_status=account.reconciliation_status if account else None,
                        message="Transaction replayed (idempotent key).",
                    )
        elif direction == "CREDIT":
            stmt = select(Income).where(Income.idempotency_key == effective_key)
            if user_id is not None:
                stmt = stmt.where(Income.user_id == user_id)
            existing_inc = db.scalar(stmt)
            if existing_inc:
                return SmsIngestResponse(
                    created=False,
                    replayed=True,
                    status="replayed",
                    transaction_type="income",
                    id=existing_inc.id,
                    entity_id=existing_inc.id,
                    account_id=account.id if account else existing_inc.account_id,
                    account_name=account_name,
                    available_balance_recorded=False,
                    current_calculated_balance_paise=account.current_balance_paise
                    if account
                    else None,
                    last_reported_balance_paise=account.last_reported_balance_paise
                    if account
                    else None,
                    reconciliation_status=account.reconciliation_status if account else None,
                    message="Transaction replayed (idempotent key).",
                )

    # --- LAYER 1B: Exact SMS Content Hash Check (Layer A) ---
    if content_hash and user_id is not None:
        source_msg = db.scalar(
            select(SmsSourceMessage).where(
                SmsSourceMessage.user_id == user_id,
                SmsSourceMessage.content_hash == content_hash,
            )
        )
        if source_msg:
            # Check existing evidence links
            evidence = db.scalar(
                select(TransactionEvidence).where(
                    TransactionEvidence.sms_message_id == source_msg.id
                )
            )
            if evidence:
                if evidence.expense_id:
                    exp = db.get(Expense, evidence.expense_id)
                    if exp:
                        return SmsIngestResponse(
                            created=False,
                            replayed=True,
                            status="replayed",
                            transaction_type="expense",
                            id=exp.id,
                            entity_id=exp.id,
                            account_id=account.id if account else exp.account_id,
                            account_name=account_name,
                            available_balance_recorded=False,
                            current_calculated_balance_paise=account.current_balance_paise
                            if account
                            else None,
                            last_reported_balance_paise=account.last_reported_balance_paise
                            if account
                            else None,
                            reconciliation_status=account.reconciliation_status
                            if account
                            else None,
                            message="Transaction replayed (duplicate SMS content hash).",
                        )
                elif evidence.income_id:
                    inc = db.get(Income, evidence.income_id)
                    if inc:
                        return SmsIngestResponse(
                            created=False,
                            replayed=True,
                            status="replayed",
                            transaction_type="income",
                            id=inc.id,
                            entity_id=inc.id,
                            account_id=account.id if account else inc.account_id,
                            account_name=account_name,
                            available_balance_recorded=False,
                            current_calculated_balance_paise=account.current_balance_paise
                            if account
                            else None,
                            last_reported_balance_paise=account.last_reported_balance_paise
                            if account
                            else None,
                            reconciliation_status=account.reconciliation_status
                            if account
                            else None,
                            message="Transaction replayed (duplicate SMS content hash).",
                        )

    # --- LAYER 2: Transaction Reference / UTR Matching & Conflict Detection (Layer B) ---
    if clean_ref and user_id is not None:
        if direction == "DEBIT":
            existing_exp = db.scalar(
                select(Expense).where(
                    Expense.user_id == user_id,
                    Expense.bank_reference == clean_ref,
                )
            )
            if existing_exp:
                # Conflict Check: same reference with conflicting amount (Test 8)
                if existing_exp.amount_paise != payload.amount_paise:
                    logger.warning(
                        "Conflicting amount for reference %s: existing %s vs incoming %s",
                        clean_ref,
                        existing_exp.amount_paise,
                        payload.amount_paise,
                    )
                    return SmsIngestResponse(
                        created=False,
                        replayed=False,
                        status="conflict_review",
                        transaction_type="queued",
                        id=existing_exp.id,
                        entity_id=existing_exp.id,
                        account_id=account.id if account else existing_exp.account_id,
                        account_name=account_name,
                        available_balance_recorded=False,
                        current_calculated_balance_paise=account.current_balance_paise
                        if account
                        else None,
                        last_reported_balance_paise=account.last_reported_balance_paise
                        if account
                        else None,
                        reconciliation_status=account.reconciliation_status if account else None,
                        message=f"Conflicting amount ({payload.amount_paise} vs {existing_exp.amount_paise} paise) for existing reference {clean_ref}; preserved for manual review.",
                    )
                else:
                    # Legitimate same reference and matching amount -> exact same financial event!
                    _record_sms_evidence(
                        db,
                        user_id=user_id,
                        payload=payload,
                        expense_id=existing_exp.id,
                        direction="DEBIT",
                    )
                    db.commit()
                    return SmsIngestResponse(
                        created=False,
                        replayed=True,
                        status="replayed",
                        transaction_type="expense",
                        id=existing_exp.id,
                        entity_id=existing_exp.id,
                        account_id=account.id if account else existing_exp.account_id,
                        account_name=account_name,
                        available_balance_recorded=False,
                        current_calculated_balance_paise=account.current_balance_paise
                        if account
                        else None,
                        last_reported_balance_paise=account.last_reported_balance_paise
                        if account
                        else None,
                        reconciliation_status=account.reconciliation_status if account else None,
                        message=f"Transaction replayed (matched reference {clean_ref}).",
                    )
        elif direction == "CREDIT":
            existing_inc = db.scalar(
                select(Income).where(
                    Income.user_id == user_id,
                    Income.bank_reference == clean_ref,
                )
            )
            if existing_inc:
                # Conflict Check: same reference with conflicting amount (Test 8)
                if existing_inc.amount_paise != payload.amount_paise:
                    logger.warning(
                        "Conflicting amount for reference %s: existing %s vs incoming %s",
                        clean_ref,
                        existing_inc.amount_paise,
                        payload.amount_paise,
                    )
                    return SmsIngestResponse(
                        created=False,
                        replayed=False,
                        status="conflict_review",
                        transaction_type="queued",
                        id=existing_inc.id,
                        entity_id=existing_inc.id,
                        account_id=account.id if account else existing_inc.account_id,
                        account_name=account_name,
                        available_balance_recorded=False,
                        current_calculated_balance_paise=account.current_balance_paise
                        if account
                        else None,
                        last_reported_balance_paise=account.last_reported_balance_paise
                        if account
                        else None,
                        reconciliation_status=account.reconciliation_status if account else None,
                        message=f"Conflicting amount ({payload.amount_paise} vs {existing_inc.amount_paise} paise) for existing reference {clean_ref}; preserved for manual review.",
                    )
                else:
                    # Legitimate same reference and matching amount -> exact same financial event!
                    _record_sms_evidence(
                        db,
                        user_id=user_id,
                        payload=payload,
                        income_id=existing_inc.id,
                        direction="CREDIT",
                    )
                    db.commit()
                    return SmsIngestResponse(
                        created=False,
                        replayed=True,
                        status="replayed",
                        transaction_type="income",
                        id=existing_inc.id,
                        entity_id=existing_inc.id,
                        account_id=account.id if account else existing_inc.account_id,
                        account_name=account_name,
                        available_balance_recorded=False,
                        current_calculated_balance_paise=account.current_balance_paise
                        if account
                        else None,
                        last_reported_balance_paise=account.last_reported_balance_paise
                        if account
                        else None,
                        reconciliation_status=account.reconciliation_status if account else None,
                        message=f"Transaction replayed (matched reference {clean_ref}).",
                    )

    # --- LAYER 3: Reconciling Existing Manual Transactions (Test 15) ---
    if user_id is not None:
        if direction == "DEBIT":
            stmt = select(Expense).where(
                Expense.user_id == user_id,
                Expense.amount_paise == payload.amount_paise,
                Expense.source == "manual",
                Expense.expense_date == txn_date,
            )
            if account_id:
                stmt = stmt.where(
                    (Expense.account_id == account_id) | (Expense.account_id.is_(None))
                )
            manual_expenses = list(db.scalars(stmt).all())
            unlinked_manual = [e for e in manual_expenses if not e.sms_evidence]
            if unlinked_manual:
                matched_exp = unlinked_manual[0]
                if clean_ref and not matched_exp.bank_reference:
                    matched_exp.bank_reference = clean_ref
                if account_id and matched_exp.account_id is None:
                    matched_exp.account_id = account_id
                if payload.merchant_or_payer and not matched_exp.merchant:
                    matched_exp.merchant = payload.merchant_or_payer

                _record_sms_evidence(
                    db,
                    user_id=user_id,
                    payload=payload,
                    expense_id=matched_exp.id,
                    direction="DEBIT",
                )

                if (
                    account
                    and payload.available_balance_paise is not None
                    and payload.available_balance_paise > 0
                ):
                    record_reported_balance(
                        db,
                        account.id,
                        payload.available_balance_paise,
                        source="sms",
                        user_id=user_id,
                        reported_at=txn_time,
                        balance_type=payload.balance_type or "AVAILABLE",
                        currency=payload.currency or "INR",
                        confidence=payload.confidence or "HIGH",
                        source_evidence=effective_body,
                    )
                db.commit()
                current_bal = recalculate_account_balance(db, account.id) if account else None
                return SmsIngestResponse(
                    created=False,
                    replayed=True,
                    status="matched_manual",
                    transaction_type="expense",
                    id=matched_exp.id,
                    entity_id=matched_exp.id,
                    account_id=account.id if account else None,
                    account_name=account_name,
                    available_balance_recorded=payload.available_balance_paise is not None,
                    current_calculated_balance_paise=current_bal,
                    last_reported_balance_paise=account.last_reported_balance_paise
                    if account
                    else None,
                    reconciliation_status=account.reconciliation_status if account else None,
                    message="Matched and reconciled with existing manual expense.",
                )

        elif direction == "CREDIT":
            stmt = select(Income).where(
                Income.user_id == user_id,
                Income.amount_paise == payload.amount_paise,
                Income.source == "manual",
                Income.income_date == txn_date,
            )
            if account_id:
                stmt = stmt.where((Income.account_id == account_id) | (Income.account_id.is_(None)))
            manual_incomes = list(db.scalars(stmt).all())
            unlinked_manual_inc = [inc for inc in manual_incomes if not inc.sms_evidence]
            if unlinked_manual_inc:
                matched_inc = unlinked_manual_inc[0]
                if clean_ref and not matched_inc.bank_reference:
                    matched_inc.bank_reference = clean_ref
                if account_id and matched_inc.account_id is None:
                    matched_inc.account_id = account_id
                if payload.merchant_or_payer and not matched_inc.payer:
                    matched_inc.payer = payload.merchant_or_payer

                _record_sms_evidence(
                    db,
                    user_id=user_id,
                    payload=payload,
                    income_id=matched_inc.id,
                    direction="CREDIT",
                )

                if (
                    account
                    and payload.available_balance_paise is not None
                    and payload.available_balance_paise > 0
                ):
                    record_reported_balance(
                        db,
                        account.id,
                        payload.available_balance_paise,
                        source="sms",
                        user_id=user_id,
                        reported_at=txn_time,
                        balance_type=payload.balance_type or "AVAILABLE",
                        currency=payload.currency or "INR",
                        confidence=payload.confidence or "HIGH",
                        source_evidence=effective_body,
                    )
                db.commit()
                current_bal = recalculate_account_balance(db, account.id) if account else None
                return SmsIngestResponse(
                    created=False,
                    replayed=True,
                    status="matched_manual",
                    transaction_type="income",
                    id=matched_inc.id,
                    entity_id=matched_inc.id,
                    account_id=account.id if account else None,
                    account_name=account_name,
                    available_balance_recorded=payload.available_balance_paise is not None,
                    current_calculated_balance_paise=current_bal,
                    last_reported_balance_paise=account.last_reported_balance_paise
                    if account
                    else None,
                    reconciliation_status=account.reconciliation_status if account else None,
                    message="Matched and reconciled with existing manual income.",
                )

    # --- LAYER 4: Dual-Notification & Balance Progression (Layers C & E) ---
    # Check if a recent transaction exists for the same account, date, and amount
    if account and user_id is not None:
        if direction == "DEBIT":
            recent_exp_query = select(Expense).where(
                Expense.user_id == user_id,
                Expense.account_id == account.id,
                Expense.amount_paise == payload.amount_paise,
                Expense.expense_date == txn_date,
            )
            candidates = list(db.scalars(recent_exp_query).all())
            for ex in candidates:
                # 1. Distinct references -> separate transactions (Test 9)
                ex_ref = _clean_ref(ex.bank_reference)
                if clean_ref and ex_ref and clean_ref != ex_ref:
                    continue  # Distinct transactions; do not merge

                # 2. Chronological balance progression check (Layer E):
                # If incoming balance differs from account's reported balance by the amount, they are consecutive!
                if (
                    payload.available_balance_paise is not None
                    and account.last_reported_balance_paise is not None
                ):
                    delta = abs(
                        payload.available_balance_paise - account.last_reported_balance_paise
                    )
                    if delta == payload.amount_paise:
                        continue  # Verified distinct consecutive transaction!

                # Otherwise, if references match or one is missing: reconcile dual notification (Layer C) or wording variation (Test 7)
                if not clean_ref or not ex_ref or clean_ref == ex_ref:
                    _record_sms_evidence(
                        db,
                        user_id=user_id,
                        payload=payload,
                        expense_id=ex.id,
                        direction="DEBIT",
                    )
                    if clean_ref and not ex.bank_reference:
                        ex.bank_reference = clean_ref
                    if (
                        payload.available_balance_paise is not None
                        and payload.available_balance_paise > 0
                    ):
                        record_reported_balance(
                            db,
                            account.id,
                            payload.available_balance_paise,
                            source="sms",
                            user_id=user_id,
                            reported_at=txn_time,
                            balance_type=payload.balance_type or "AVAILABLE",
                            currency=payload.currency or "INR",
                            confidence=payload.confidence or "HIGH",
                            source_evidence=effective_body,
                        )
                    db.commit()
                    return SmsIngestResponse(
                        created=False,
                        replayed=True,
                        status="replayed",
                        transaction_type="expense",
                        id=ex.id,
                        entity_id=ex.id,
                        account_id=account.id,
                        account_name=account_name,
                        available_balance_recorded=payload.available_balance_paise is not None,
                        current_calculated_balance_paise=account.current_balance_paise,
                        last_reported_balance_paise=account.last_reported_balance_paise,
                        reconciliation_status=account.reconciliation_status,
                        message="Transaction replayed (reconciled dual notification).",
                    )

        elif direction == "CREDIT":
            recent_inc_query = select(Income).where(
                Income.user_id == user_id,
                Income.account_id == account.id,
                Income.amount_paise == payload.amount_paise,
                Income.income_date == txn_date,
            )
            candidates = list(db.scalars(recent_inc_query).all())
            for inc in candidates:
                inc_ref = _clean_ref(inc.bank_reference)
                if clean_ref and inc_ref and clean_ref != inc_ref:
                    continue  # Distinct transactions; do not merge

                # Balance progression check (Layer E):
                if (
                    payload.available_balance_paise is not None
                    and account.last_reported_balance_paise is not None
                ):
                    delta = abs(
                        payload.available_balance_paise - account.last_reported_balance_paise
                    )
                    if delta == payload.amount_paise:
                        continue  # Verified distinct consecutive transaction!

                if not clean_ref or not inc_ref or clean_ref == inc_ref:
                    _record_sms_evidence(
                        db,
                        user_id=user_id,
                        payload=payload,
                        income_id=inc.id,
                        direction="CREDIT",
                    )
                    if clean_ref and not inc.bank_reference:
                        inc.bank_reference = clean_ref
                    if (
                        payload.available_balance_paise is not None
                        and payload.available_balance_paise > 0
                    ):
                        record_reported_balance(
                            db,
                            account.id,
                            payload.available_balance_paise,
                            source="sms",
                            user_id=user_id,
                            reported_at=txn_time,
                            balance_type=payload.balance_type or "AVAILABLE",
                            currency=payload.currency or "INR",
                            confidence=payload.confidence or "HIGH",
                            source_evidence=effective_body,
                        )
                    db.commit()
                    return SmsIngestResponse(
                        created=False,
                        replayed=True,
                        status="replayed",
                        transaction_type="income",
                        id=inc.id,
                        entity_id=inc.id,
                        account_id=account.id,
                        account_name=account_name,
                        available_balance_recorded=payload.available_balance_paise is not None,
                        current_calculated_balance_paise=account.current_balance_paise,
                        last_reported_balance_paise=account.last_reported_balance_paise,
                        reconciliation_status=account.reconciliation_status,
                        message="Transaction replayed (reconciled dual notification).",
                    )

    # -------------------------------------------------------------------------
    # CREATE NEW TRANSACTION & SYNCHRONIZE BANK BALANCE
    # -------------------------------------------------------------------------

    balance_recorded = False

    if direction == "CREDIT":
        # Resolve income type (multi-tenant safe)
        suggestion = payload.suggested_category or ""
        income_type = None

        if suggestion:
            stmt = select(IncomeType).where(
                IncomeType.name.ilike(f"%{suggestion}%"),
                IncomeType.is_archived.is_(False),
            )
            if user_id is not None:
                stmt = stmt.where((IncomeType.user_id == user_id) | (IncomeType.user_id.is_(None)))
            income_type = db.scalar(stmt)

        if not income_type:
            stmt = select(IncomeType).where(
                IncomeType.name_key == "other_income",
                IncomeType.is_archived.is_(False),
            )
            if user_id is not None:
                stmt = stmt.where((IncomeType.user_id == user_id) | (IncomeType.user_id.is_(None)))
            income_type = db.scalar(stmt)

        if not income_type:
            stmt = select(IncomeType).where(IncomeType.is_archived.is_(False))
            if user_id is not None:
                stmt = stmt.where((IncomeType.user_id == user_id) | (IncomeType.user_id.is_(None)))
            income_type = db.scalar(stmt)

        if not income_type:
            from app.services.expense_types import name_key

            default_key = name_key("Other Income")
            try:
                with db.begin_nested():
                    income_type = IncomeType(
                        user_id=user_id,
                        name="Other Income",
                        name_key=default_key,
                        color="#10B981",
                        icon="wallet",
                        is_archived=False,
                    )
                    db.add(income_type)
                    db.flush()
                db.commit()
                db.refresh(income_type)
            except IntegrityError:
                stmt = select(IncomeType).where(
                    IncomeType.name_key == default_key,
                    IncomeType.is_archived.is_(False),
                )
                if user_id is not None:
                    stmt = stmt.where(
                        (IncomeType.user_id == user_id) | (IncomeType.user_id.is_(None))
                    )
                income_type = db.scalar(stmt)

        income_create = IncomeCreate(
            income_type_id=income_type.id,
            account_id=account_id,
            amount_paise=payload.amount_paise,
            income_date=txn_date,
            payer=payload.merchant_or_payer,
            description=payload.note
            or f"Auto-credit via SMS: {payload.merchant_or_payer or 'Inflow'}",
            payment_method="upi" if "upi" in effective_body.lower() else "bank_transfer",
            bank_reference=clean_ref,
            source="sms",
            confidence=getattr(payload, "confidence", None) or "HIGH",
        )

        income, replayed = create_income(
            db, income_create, idempotency_key=effective_key, user_id=user_id
        )

        source_msg = _record_sms_evidence(
            db,
            user_id=user_id,
            payload=payload,
            income_id=income.id,
            direction="CREDIT",
        )

        # Check if this credit is a refund/reversal of an earlier expense
        body_lower = effective_body.lower()
        if user_id and any(k in body_lower for k in ("refund", "reversed", "reversal")):
            from app.services.reversals import find_original_expense_for_refund, record_expense_refund

            orig_exp = find_original_expense_for_refund(
                db,
                user_id=user_id,
                reference=clean_ref,
                amount_paise=payload.amount_paise,
                merchant=payload.merchant_or_payer,
            )
            if orig_exp:
                record_expense_refund(
                    db,
                    user_id=user_id,
                    original_expense_id=orig_exp.id,
                    refund_amount_paise=payload.amount_paise,
                    reversal_income_id=income.id,
                    reversal_reference=clean_ref,
                    sms_message_id=source_msg.id if source_msg else None,
                    reason=f"Auto-linked refund via SMS: {payload.merchant_or_payer or ''}",
                )

        # Synchronize balance snapshot if reported
        if (
            account
            and payload.available_balance_paise is not None
            and payload.available_balance_paise > 0
        ):
            record_reported_balance(
                db,
                account.id,
                payload.available_balance_paise,
                source="sms",
                user_id=user_id,
                reported_at=txn_time,
                balance_type=payload.balance_type or "AVAILABLE",
                sms_message_id=source_msg.id if source_msg else None,
                transaction_time=txn_time,
                message_reception_time=reception_time,
                confidence=payload.confidence or "HIGH",
                source_evidence=effective_body,
                currency=payload.currency or "INR",
            )
            balance_recorded = True
        elif account:
            recalculate_account_balance(db, account.id)

        db.commit()
        if account:
            db.refresh(account)

        current_bal = account.current_balance_paise if account else None
        last_rep = account.last_reported_balance_paise if account else None
        rec_status = account.reconciliation_status if account else None

        return SmsIngestResponse(
            created=not replayed,
            replayed=replayed,
            status="replayed" if replayed else "created",
            transaction_type="income",
            id=income.id,
            entity_id=income.id,
            account_id=account_id,
            account_name=account_name,
            available_balance_recorded=balance_recorded,
            current_calculated_balance_paise=current_bal,
            last_reported_balance_paise=last_rep,
            reconciliation_status=rec_status,
            message="Income recorded and bank balance updated."
            if not replayed
            else "Transaction replayed (idempotent).",
        )

    elif direction == "DEBIT":
        # Resolve expense type (multi-tenant safe)
        suggestion = payload.suggested_category or ""
        expense_type = None

        if suggestion:
            stmt = select(ExpenseType).where(
                ExpenseType.name.ilike(f"%{suggestion}%"),
                ExpenseType.is_archived.is_(False),
            )
            if user_id is not None:
                stmt = stmt.where(
                    (ExpenseType.user_id == user_id) | (ExpenseType.user_id.is_(None))
                )
            expense_type = db.scalar(stmt)

        if not expense_type:
            stmt = select(ExpenseType).where(ExpenseType.is_archived.is_(False))
            if user_id is not None:
                stmt = stmt.where(
                    (ExpenseType.user_id == user_id) | (ExpenseType.user_id.is_(None))
                )
            expense_type = db.scalar(stmt)

        if not expense_type:
            from app.services.expense_types import name_key

            default_key = name_key("Other")
            try:
                with db.begin_nested():
                    expense_type = ExpenseType(
                        user_id=user_id,
                        name="Other",
                        name_key=default_key,
                        color="#64748B",
                        icon="tag",
                        is_archived=False,
                    )
                    db.add(expense_type)
                    db.flush()
                db.commit()
                db.refresh(expense_type)
            except IntegrityError:
                stmt = select(ExpenseType).where(
                    ExpenseType.name_key == default_key,
                    ExpenseType.is_archived.is_(False),
                )
                if user_id is not None:
                    stmt = stmt.where(
                        (ExpenseType.user_id == user_id) | (ExpenseType.user_id.is_(None))
                    )
                expense_type = db.scalar(stmt)

        from app.core.constants import PaymentMethod

        method = PaymentMethod.OTHER
        body_lower = effective_body.lower()
        if "upi" in body_lower:
            method = PaymentMethod.UPI
        elif "credit card" in body_lower or "card" in body_lower:
            method = PaymentMethod.DEBIT_CARD
        elif any(k in body_lower for k in ("netbanking", "neft", "imps", "rtgs")):
            method = PaymentMethod.BANK_TRANSFER

        expense_create = ExpenseCreate(
            expense_type_id=expense_type.id,
            amount_paise=payload.amount_paise,
            expense_date=txn_date,
            note=payload.note or f"Auto-debit via SMS: {payload.merchant_or_payer or 'Outflow'}",
            payment_method=method,
            merchant=payload.merchant_or_payer,
            bank_reference=clean_ref,
            source="sms",
            confidence=getattr(payload, "confidence", None) or "HIGH",
        )

        expense, replayed = create_expense(
            db,
            expense_create,
            idempotency_key=effective_key,
            account_id=account_id,
            user_id=user_id,
        )

        source_msg = _record_sms_evidence(
            db,
            user_id=user_id,
            payload=payload,
            expense_id=expense.id,
            direction="DEBIT",
        )

        # Synchronize balance snapshot if reported
        if (
            account
            and payload.available_balance_paise is not None
            and payload.available_balance_paise > 0
        ):
            record_reported_balance(
                db,
                account.id,
                payload.available_balance_paise,
                source="sms",
                user_id=user_id,
                reported_at=txn_time,
                balance_type=payload.balance_type or "AVAILABLE",
                sms_message_id=source_msg.id if source_msg else None,
                transaction_time=txn_time,
                message_reception_time=reception_time,
                confidence=payload.confidence or "HIGH",
                source_evidence=effective_body,
                currency=payload.currency or "INR",
            )
            balance_recorded = True
        elif account:
            recalculate_account_balance(db, account.id)

        db.commit()
        if account:
            db.refresh(account)

        current_bal = account.current_balance_paise if account else None
        last_rep = account.last_reported_balance_paise if account else None
        rec_status = account.reconciliation_status if account else None

        return SmsIngestResponse(
            created=not replayed,
            replayed=replayed,
            status="replayed" if replayed else "created",
            transaction_type="expense",
            id=expense.id,
            entity_id=expense.id,
            account_id=account_id,
            account_name=account_name,
            available_balance_recorded=balance_recorded,
            current_calculated_balance_paise=current_bal,
            last_reported_balance_paise=last_rep,
            reconciliation_status=rec_status,
            message="Expense recorded and bank balance updated."
            if not replayed
            else "Transaction replayed (idempotent).",
        )
    else:
        return SmsIngestResponse(
            created=False,
            transaction_type="queued",
            account_id=account_id,
            account_name=account_name,
            available_balance_recorded=balance_recorded,
            message="Ambiguous transaction direction; preserved for manual review.",
        )
