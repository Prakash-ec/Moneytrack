from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.expense_type import ExpenseType
from app.models.income_type import IncomeType
from app.schemas.expense import ExpenseCreate
from app.schemas.income import IncomeCreate
from app.schemas.sms_ingest import SmsIngestRequest, SmsIngestResponse
from app.services.bank_accounts import (
    find_account_by_identifier,
    recalculate_account_balance,
    record_reported_balance,
)
from app.services.expenses import create_expense
from app.services.incomes import create_income


def ingest_sms_transaction(
    db: Session,
    payload: SmsIngestRequest,
    idempotency_key: str | None = None,
    user_id: int | None = None,
) -> SmsIngestResponse:
    # 1. Match bank account if suffix or bank name present
    account = find_account_by_identifier(
        db, suffix=payload.account_suffix, bank_name=payload.bank_name, user_id=user_id
    )
    account_id = account.id if account else None
    account_name = account.account_name if account else None

    # 2. Parse transaction date
    txn_date = date.today()
    if payload.transaction_date:
        try:
            txn_date = date.fromisoformat(payload.transaction_date)
        except ValueError:
            txn_date = date.today()

    direction = payload.direction.upper()
    balance_recorded = False

    # Record available balance if present and account identified
    if account and payload.available_balance_paise is not None and payload.available_balance_paise > 0:
        record_reported_balance(
            db, account.id, payload.available_balance_paise, source="sms", user_id=user_id
        )
        balance_recorded = True

    # 3. Route according to direction
    if direction == "CREDIT":
        # Resolve income type
        suggestion = payload.suggested_category or ""
        income_type = None

        if suggestion:
            income_type = db.scalar(
                select(IncomeType).where(
                    IncomeType.name.ilike(f"%{suggestion}%"),
                    IncomeType.is_archived.is_(False),
                )
            )

        if not income_type:
            # Default to "Other Income" or first active income type
            income_type = db.scalar(
                select(IncomeType).where(
                    IncomeType.name_key == "other_income",
                    IncomeType.is_archived.is_(False),
                )
            ) or db.scalar(
                select(IncomeType).where(IncomeType.is_archived.is_(False))
            )

        if not income_type:
            # Auto-create "Other Income" type if no active income types exist
            from app.services.income_types import name_key
            default_key = name_key("Other Income")
            income_type = IncomeType(
                user_id=user_id,
                name="Other Income",
                name_key=default_key,
                color="#10B981",
                icon="wallet",
                is_archived=False,
            )
            db.add(income_type)
            db.commit()
            db.refresh(income_type)

        income_create = IncomeCreate(
            income_type_id=income_type.id,
            account_id=account_id,
            amount_paise=payload.amount_paise,
            income_date=txn_date,
            payer=payload.merchant_or_payer,
            description=payload.note or f"Auto-credit via SMS: {payload.merchant_or_payer or 'Inflow'}",
            payment_method="upi" if "upi" in (payload.body or "").lower() else "bank_transfer",
            bank_reference=payload.reference,
            source="sms",
        )

        income, replayed = create_income(
            db, income_create, idempotency_key=idempotency_key, user_id=user_id
        )
        current_bal = recalculate_account_balance(db, account.id) if account else None

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
            message="Income recorded and bank balance updated." if not replayed else "Transaction replayed (idempotent).",
        )

    elif direction == "DEBIT":
        # Resolve expense type
        suggestion = payload.suggested_category or ""
        expense_type = None

        if suggestion:
            expense_type = db.scalar(
                select(ExpenseType).where(
                    ExpenseType.name.ilike(f"%{suggestion}%"),
                    ExpenseType.is_archived.is_(False),
                )
            )

        if not expense_type:
            expense_type = db.scalar(
                select(ExpenseType).where(ExpenseType.is_archived.is_(False))
            )

        if not expense_type:
            return SmsIngestResponse(
                created=False,
                transaction_type="queued",
                message="No active expense types configured.",
            )

        from app.core.constants import PaymentMethod

        method = PaymentMethod.OTHER
        body_lower = (payload.body or "").lower()
        if "upi" in body_lower:
            method = PaymentMethod.UPI
        elif "credit card" in body_lower or "card" in body_lower:
            method = PaymentMethod.DEBIT_CARD

        expense_create = ExpenseCreate(
            expense_type_id=expense_type.id,
            amount_paise=payload.amount_paise,
            expense_date=txn_date,
            note=payload.note or f"Auto-debit via SMS: {payload.merchant_or_payer or 'Outflow'}",
            payment_method=method,
            merchant=payload.merchant_or_payer,
        )

        expense, replayed = create_expense(
            db,
            expense_create,
            idempotency_key=idempotency_key,
            account_id=account_id,
            user_id=user_id,
        )
        current_bal = recalculate_account_balance(db, account.id) if account else None

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
            message="Expense recorded and bank balance updated." if not replayed else "Transaction replayed (idempotent).",
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
