from datetime import datetime, timezone, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.models.security_alert import SecurityAlert
from app.models.expense import Expense
from app.models.bank_account import BankAccount
from app.schemas.security_alert import (
    SecuritySummary,
    SecurityActionResponse,
    SecurityAlertRead,
    BankHelplineInfo,
)
from app.services.notifications import log_notification

INDIAN_BANK_HELPLINES = [
    BankHelplineInfo(
        bank_name="State Bank of India (SBI)",
        phone="1800 11 1109 / 1800 1234",
        sms_block_keyword="BLOCK <Last4Digits> to 567676",
        url="https://sbi.co.in",
    ),
    BankHelplineInfo(
        bank_name="HDFC Bank",
        phone="1800 1600 / 1800 2600",
        sms_block_keyword="BLOCK <CardNumber> to 5676712",
        url="https://www.hdfcbank.com",
    ),
    BankHelplineInfo(
        bank_name="ICICI Bank",
        phone="1800 1080",
        sms_block_keyword="BLOCK <AccountNo> to 9215676766",
        url="https://www.icicibank.com",
    ),
    BankHelplineInfo(
        bank_name="Axis Bank",
        phone="1800 419 5959",
        sms_block_keyword="BLOCK <CardNumber> to 5676782",
        url="https://www.axisbank.com",
    ),
    BankHelplineInfo(
        bank_name="Kotak Mahindra Bank",
        phone="1860 266 2666",
        sms_block_keyword="CCBLOCK to 5676788",
        url="https://www.kotak.com",
    ),
    BankHelplineInfo(
        bank_name="Punjab National Bank (PNB)",
        phone="1800 180 2222",
        sms_block_keyword="HOTLIST to 5607040",
        url="https://pnbindia.in",
    ),
]


def evaluate_transaction_security(db: Session, expense: Expense) -> Optional[SecurityAlert]:
    """
    Evaluates an expense against financial heuristics to flag potentially unusual
    or unrecognised debits. Never assumes fraud certainty; prompts user verification.
    """
    signals = []
    amount = expense.amount_paise

    # 1. Check for Unusually High Amount (> ₹15,000 or > 3x 30-day average)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    avg_filter = [Expense.id != expense.id, Expense.created_at >= thirty_days_ago]
    if expense.user_id is not None:
        avg_filter.append(Expense.user_id == expense.user_id)
    avg_query = db.query(func.avg(Expense.amount_paise)).filter(*avg_filter).scalar()

    avg_30 = float(avg_query) if avg_query else 50000.0  # default baseline ₹500
    if amount >= 1500000 or (avg_30 > 0 and amount >= 3.0 * avg_30 and amount >= 200000):
        signals.append((
            "HIGH_AMOUNT",
            "CRITICAL" if amount >= 2500000 else "WARNING",
            f"Amount ₹{amount/100:.2f} is unusually high compared to recent average (₹{avg_30/100:.2f}).",
        ))

    # 2. Check for New / Unfamiliar Merchant with significant amount (> ₹1,000)
    if expense.merchant and len(expense.merchant.strip()) > 1 and amount >= 100000:
        merchant_filter = [
            Expense.id != expense.id,
            func.lower(Expense.merchant) == func.lower(expense.merchant.strip()),
        ]
        if expense.user_id is not None:
            merchant_filter.append(Expense.user_id == expense.user_id)
        prev_merchant_count = db.query(func.count(Expense.id)).filter(*merchant_filter).scalar()
        if prev_merchant_count == 0:
            signals.append((
                "NEW_MERCHANT",
                "WARNING",
                f"Merchant '{expense.merchant}' has not been seen before in your spending history.",
            ))

    # 3. Check for Rapid Debits on the same account (multiple within 15 mins)
    if expense.account_id:
        fifteen_mins_ago = (expense.created_at or datetime.now(timezone.utc)) - timedelta(minutes=15)
        rapid_filter = [
            Expense.id != expense.id,
            Expense.account_id == expense.account_id,
            Expense.created_at >= fifteen_mins_ago,
        ]
        if expense.user_id is not None:
            rapid_filter.append(Expense.user_id == expense.user_id)
        rapid_count = db.query(func.count(Expense.id)).filter(*rapid_filter).scalar() or 0
        if rapid_count >= 2:
            signals.append((
                "RAPID_TXNS",
                "CRITICAL",
                f"Multiple rapid debit transactions ({rapid_count + 1}) recorded on this account within 15 minutes.",
            ))

    # 4. Repeated Similar Debits (same amount in 24 hours)
    twenty_four_hours_ago = (expense.created_at or datetime.now(timezone.utc)) - timedelta(hours=24)
    rep_filter = [
        Expense.id != expense.id,
        Expense.amount_paise == amount,
        Expense.created_at >= twenty_four_hours_ago,
    ]
    if expense.user_id is not None:
        rep_filter.append(Expense.user_id == expense.user_id)
    repeated_count = db.query(func.count(Expense.id)).filter(*rep_filter).scalar() or 0
    if repeated_count >= 2:
        signals.append((
            "REPEATED_DEBIT",
            "WARNING",
            f"Identical amount (₹{amount/100:.2f}) was debited {repeated_count + 1} times within 24 hours.",
        ))

    if not signals:
        return None

    # Pick the most critical signal
    alert_type, severity, reason = sorted(
        signals, key=lambda s: 0 if s[1] == "CRITICAL" else 1
    )[0]

    # Check account suffix
    account_suffix = None
    if expense.account_id:
        acc = db.query(BankAccount).filter(BankAccount.id == expense.account_id).first()
        if acc:
            account_suffix = acc.account_number_mask

    # Prevent duplicate alert for the exact same transaction
    existing = db.query(SecurityAlert).filter(SecurityAlert.transaction_id == expense.id).first()
    if existing:
        return existing

    alert = SecurityAlert(
        user_id=expense.user_id,
        transaction_id=expense.id,
        account_id=expense.account_id,
        amount_paise=expense.amount_paise,
        merchant=expense.merchant,
        account_suffix=account_suffix,
        alert_type=alert_type,
        severity=severity,
        reason=reason,
        status="NEEDS_REVIEW",
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    # Log in-app notification
    log_notification(
        db=db,
        title=f"Security Alert: ₹{amount/100:.2f} at {expense.merchant or 'Unknown Merchant'}",
        body=reason,
        category="SECURITY",
        reference_id=str(alert.id),
        user_id=expense.user_id,
    )

    return alert


def list_security_alerts(
    db: Session,
    status: Optional[str] = None,
    limit: int = 50,
    user_id: Optional[int] = None,
) -> List[SecurityAlert]:
    query = db.query(SecurityAlert)
    if user_id is not None:
        query = query.filter(SecurityAlert.user_id == user_id)
    if status:
        query = query.filter(SecurityAlert.status == status)
    return query.order_by(desc(SecurityAlert.created_at)).limit(limit).all()


def get_security_summary(db: Session, user_id: Optional[int] = None) -> SecuritySummary:
    base = db.query(SecurityAlert)
    if user_id is not None:
        base = base.filter(SecurityAlert.user_id == user_id)

    total = base.count()
    needs_review = base.filter(SecurityAlert.status == "NEEDS_REVIEW").count()
    disputed = base.filter(SecurityAlert.status == "DISPUTED").count()
    resolved = base.filter(SecurityAlert.status == "RESOLVED").count()
    recognised = base.filter(SecurityAlert.status == "RECOGNISED").count()

    recent = (
        base.order_by(desc(SecurityAlert.created_at))
        .limit(10)
        .all()
    )

    return SecuritySummary(
        total_alerts=total,
        needs_review_count=needs_review,
        disputed_count=disputed,
        resolved_count=resolved,
        recognised_count=recognised,
        recent_alerts=[SecurityAlertRead.model_validate(a) for a in recent],
    )


def action_security_alert(
    db: Session,
    alert_id: int,
    action: str,
    dispute_reason: Optional[str] = None,
    user_id: Optional[int] = None,
) -> SecurityActionResponse:
    query = db.query(SecurityAlert).filter(SecurityAlert.id == alert_id)
    if user_id is not None:
        query = query.filter(SecurityAlert.user_id == user_id)
    alert = query.first()
    if not alert:
        raise ValueError(f"Security alert {alert_id} not found")

    now = datetime.now(timezone.utc)
    if action == "recognise":
        alert.status = "RECOGNISED"
        alert.resolved_at = now
        msg = "Transaction confirmed as recognised by user."
        guidance = None
    elif action == "dispute":
        alert.status = "DISPUTED"
        alert.dispute_reason = dispute_reason or "User reported transaction as unrecognised"
        alert.disputed_at = now
        msg = (
            "Transaction marked as disputed. Please contact your bank immediately "
            "to freeze your card/account and report the transaction."
        )
        guidance = INDIAN_BANK_HELPLINES
    elif action == "resolve":
        alert.status = "RESOLVED"
        alert.resolved_at = now
        msg = "Security alert marked as resolved."
        guidance = None
    else:
        raise ValueError(f"Unsupported security action: {action}")

    db.commit()
    db.refresh(alert)

    return SecurityActionResponse(
        success=True,
        status=alert.status,
        message=msg,
        alert=SecurityAlertRead.model_validate(alert),
        fraud_guidance=guidance,
    )
