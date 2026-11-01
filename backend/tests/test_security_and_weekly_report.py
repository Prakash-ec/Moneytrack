from datetime import date, datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.income import Income
from app.models.income_type import IncomeType
from app.models.bank_account import BankAccount
from app.models.security_alert import SecurityAlert
from app.services.security import evaluate_transaction_security, action_security_alert, get_security_summary
from app.services.weekly_report import generate_weekly_report, get_previous_complete_week
from app.services.notifications import log_notification, list_notifications, mark_as_read, get_preferences, update_preferences
from app.schemas.notification_log import NotificationPreferences


def test_previous_complete_week_calculation():
    # If ref_date is Wednesday 2026-11-04 (weekday 2)
    ref = date(2026, 11, 4)
    mon, sun = get_previous_complete_week(ref)
    assert mon == date(2026, 10, 26)
    assert sun == date(2026, 11, 1)
    assert (sun - mon).days == 6


def test_security_alert_heuristics(client: TestClient, make_type, make_expense):
    etype = make_type(name="Shopping", category="Shopping")

    # Baseline small expense
    make_expense(
        etype["id"],
        amount_paise=50000,
        expense_date="2026-10-20",
        merchant="Corner Store",
    )
    # Check alerts - small expense does not trigger alert
    res = client.get("/api/security/alerts?status_filter=NEEDS_REVIEW")
    assert res.status_code == 200
    assert len(res.json()) == 0

    # High amount expense (e.g. ₹20,000)
    make_expense(
        etype["id"],
        amount_paise=2000000,
        expense_date="2026-10-21",
        merchant="Apple Store",
    )
    res2 = client.get("/api/security/alerts?status_filter=NEEDS_REVIEW")
    assert res2.status_code == 200
    alerts = res2.json()
    assert len(alerts) >= 1
    assert alerts[0]["alert_type"] in ("HIGH_AMOUNT", "NEW_MERCHANT")
    assert alerts[0]["status"] == "NEEDS_REVIEW"


def test_security_alert_actions_and_dispute(client: TestClient, make_type, make_expense):
    etype = make_type(name="Food", category="Food")
    exp = make_expense(
        etype["id"],
        amount_paise=3500000,
        expense_date="2026-10-22",
        merchant="Suspicious Merchant",
    )

    res = client.get("/api/security/alerts?status_filter=NEEDS_REVIEW")
    assert res.status_code == 200
    alerts = res.json()
    assert len(alerts) >= 1
    alert_id = alerts[0]["id"]

    # Dispute action
    resp = client.post(
        f"/api/security/alerts/{alert_id}/action",
        json={"action": "dispute", "dispute_reason": "Did not make this purchase"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["status"] == "DISPUTED"
    assert data["fraud_guidance"] is not None
    assert len(data["fraud_guidance"]) > 0
    assert data["cybercrime_helpline"] == "1930"

    # Recognise action
    resp2 = client.post(
        f"/api/security/alerts/{alert_id}/action",
        json={"action": "recognise"},
    )
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "RECOGNISED"


def test_notifications_service(client: TestClient):
    # Get preferences
    pref_res = client.get("/api/notifications/preferences")
    assert pref_res.status_code == 200
    prefs = pref_res.json()
    assert prefs["suspicious_alerts_enabled"] is True

    # Update preferences
    upd_res = client.put(
        "/api/notifications/preferences",
        json={"quiet_hours_enabled": True, "quiet_hours_start": "23:00"},
    )
    assert upd_res.status_code == 200
    assert upd_res.json()["quiet_hours_enabled"] is True
    assert upd_res.json()["quiet_hours_start"] == "23:00"

    # List notifications
    notif_res = client.get("/api/notifications")
    assert notif_res.status_code == 200
    assert "unread_count" in notif_res.json()


def test_weekly_report_generation(client: TestClient, make_type, make_expense, make_income_type):
    etype = make_type(name="Groceries", category="Food")
    itype = make_income_type(name="Salary", category="Salary")

    start_d = "2026-10-19"
    end_d = "2026-10-25"

    # Add expense in that week
    make_expense(
        etype["id"],
        amount_paise=450000,  # ₹4,500
        expense_date="2026-10-21",
        merchant="Supermarket",
    )
    # Add income in that week
    inc_res = client.post(
        "/api/incomes",
        json={
            "income_type_id": itype["id"],
            "amount_paise": 2000000,  # ₹20,000
            "income_date": "2026-10-20",
            "payer": "Employer",
        },
    )
    assert inc_res.status_code == 201

    rep_res = client.get(f"/api/reports/weekly?start_date={start_d}&end_date={end_d}")
    assert rep_res.status_code == 200
    report = rep_res.json()
    assert report["total_expense_paise"] == 450000
    assert report["total_income_paise"] == 2000000
    assert report["net_cashflow_paise"] == 1550000
    assert report["savings_rate_percent"] == 77.5
    assert len(report["top_categories"]) >= 1
    assert len(report["largest_expenses"]) >= 1


def test_security_and_notifications_api_endpoints(client: TestClient):
    # Test Security Summary
    res = client.get("/api/security/summary")
    assert res.status_code == 200
    data = res.json()
    assert "total_alerts" in data
    assert "needs_review_count" in data

    # Test Notifications
    res = client.get("/api/notifications")
    assert res.status_code == 200
    notifs = res.json()
    assert "unread_count" in notifs
    assert "items" in notifs

    # Test Preferences
    res = client.get("/api/notifications/preferences")
    assert res.status_code == 200
    prefs = res.json()
    assert "suspicious_alerts_enabled" in prefs
    assert prefs["weekly_report_day"] == "Monday"

    # Test Weekly Report Endpoint
    res = client.get("/api/reports/weekly?start_date=2026-10-19&end_date=2026-10-25")
    assert res.status_code == 200
    rep = res.json()
    assert rep["start_date"] == "2026-10-19"
    assert rep["end_date"] == "2026-10-25"
    assert "savings_rate_percent" in rep
