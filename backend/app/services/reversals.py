import logging
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.expense import Expense
from app.models.transaction_reversal import TransactionReversal

logger = logging.getLogger(__name__)


def record_expense_refund(
    db: Session,
    *,
    user_id: int,
    original_expense_id: int,
    refund_amount_paise: int,
    reversal_income_id: int | None = None,
    reversal_reference: str | None = None,
    original_reference: str | None = None,
    sms_message_id: int | None = None,
    reason: str | None = None,
) -> TransactionReversal:
    """Records a refund or reversal for an expense, enforcing cumulative refund caps
    and duplicate protection.
    """
    expense = db.scalar(
        select(Expense).where(Expense.id == original_expense_id, Expense.user_id == user_id)
    )
    if not expense:
        raise ValueError(f"Expense {original_expense_id} not found for user {user_id}")

    # Duplicate check: same reversal reference or same SMS evidence already recorded
    if reversal_reference:
        existing = db.scalar(
            select(TransactionReversal).where(
                TransactionReversal.user_id == user_id,
                TransactionReversal.reversal_reference == reversal_reference,
            )
        )
        if existing:
            logger.info("Reversal with reference %s already recorded (id=%s)", reversal_reference, existing.id)
            return existing

    if sms_message_id:
        existing = db.scalar(
            select(TransactionReversal).where(
                TransactionReversal.user_id == user_id,
                TransactionReversal.original_expense_id == original_expense_id,
                TransactionReversal.sms_message_id == sms_message_id,
            )
        )
        if existing:
            logger.info("Reversal for SMS %s already recorded on expense %s", sms_message_id, original_expense_id)
            return existing

    # Check cumulative refunds against original expense amount
    current_reversals = list(
        db.scalars(
            select(TransactionReversal).where(
                TransactionReversal.original_expense_id == original_expense_id,
                TransactionReversal.user_id == user_id,
                TransactionReversal.status == "COMPLETED",
            )
        ).all()
    )
    total_refunded = sum(r.amount_paise for r in current_reversals)

    status = "COMPLETED"
    rev_reason = reason
    if total_refunded + refund_amount_paise > expense.amount_paise:
        status = "PENDING_REVIEW"
        rev_reason = (
            f"Refund amount {refund_amount_paise} would exceed original expense of "
            f"{expense.amount_paise} (already refunded: {total_refunded})"
        )
        logger.warning(rev_reason)

    if total_refunded + refund_amount_paise == expense.amount_paise:
        reversal_type = "FULL_REFUND"
    else:
        reversal_type = "PARTIAL_REFUND"

    reversal = TransactionReversal(
        user_id=user_id,
        original_expense_id=original_expense_id,
        reversal_income_id=reversal_income_id,
        amount_paise=refund_amount_paise,
        reversal_type=reversal_type,
        original_reference=original_reference or expense.bank_reference,
        reversal_reference=reversal_reference,
        status=status,
        reason=rev_reason,
        sms_message_id=sms_message_id,
    )
    db.add(reversal)
    db.flush()
    return reversal


def find_original_expense_for_refund(
    db: Session,
    *,
    user_id: int,
    reference: str | None,
    amount_paise: int | None = None,
    merchant: str | None = None,
) -> Expense | None:
    """Finds the original expense to associate with an incoming refund."""
    if reference:
        clean = reference.strip()
        # Direct reference match
        stmt = select(Expense).where(
            Expense.user_id == user_id,
            Expense.bank_reference == clean,
        )
        exp = db.scalar(stmt)
        if exp:
            return exp

    if merchant and amount_paise:
        # Match by merchant and amount
        stmt = (
            select(Expense)
            .where(
                Expense.user_id == user_id,
                Expense.merchant.ilike(f"%{merchant}%"),
                Expense.amount_paise >= amount_paise,
            )
            .order_by(Expense.expense_date.desc(), Expense.id.desc())
        )
        exp = db.scalar(stmt)
        if exp:
            return exp

    return None
