import pytest
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from sqlalchemy import select


def test_backup_restore_roundtrip(client, make_type, make_expense):
    food = make_type(name="Food", category="Food", color="#0F766E", icon="utensils")
    travel = make_type(name="Metro", category="Travel", color="#2563EB", icon="train")

    make_expense(food["id"], amount_paise=25000, expense_date="2026-01-10", note="Groceries")
    make_expense(travel["id"], amount_paise=5000, expense_date="2026-01-11", payment_method="UPI", merchant="Metro Corp")

    export_resp = client.get("/api/export/backup.json")
    assert export_resp.status_code == 200
    backup_data = export_resp.json()
    assert backup_data["schema_version"] == 1
    assert len(backup_data["expense_types"]) == 2
    assert len(backup_data["expenses"]) == 2

    # Now restore back into the client
    restore_resp = client.post("/api/export/restore", json=backup_data)
    assert restore_resp.status_code == 200
    result = restore_resp.json()
    # Since types and expenses were already present, types matched and expenses were skipped as duplicates
    assert result["matched_types"] == 2
    assert result["restored_types"] == 0
    assert result["skipped_expenses"] == 2
    assert result["restored_expenses"] == 0


def test_restore_into_empty_database(client):
    backup_data = {
        "schema_version": 1,
        "application": "MoneyTrack",
        "application_version": "1.0.0",
        "expense_types": [
            {
                "id": 99,
                "name": "Subscriptions",
                "description": "Streaming & cloud",
                "category": "Utilities",
                "icon": "tv",
                "color": "#8B5CF6",
                "is_archived": False,
            }
        ],
        "expenses": [
            {
                "id": 501,
                "expense_type_id": 99,
                "expense_type_name": "Subscriptions",
                "amount_paise": 49900,
                "expense_date": "2026-02-01",
                "note": "Annual plan",
                "payment_method": "Credit Card",
                "merchant": "StreamPlatform",
            }
        ],
    }

    restore_resp = client.post("/api/export/restore", json=backup_data)
    assert restore_resp.status_code == 200
    result = restore_resp.json()
    assert result["restored_types"] == 1
    assert result["matched_types"] == 0
    assert result["restored_expenses"] == 1
    assert result["skipped_expenses"] == 0

    # Verify query returns the restored data
    types_resp = client.get("/api/expense-types")
    assert types_resp.status_code == 200
    items = types_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Subscriptions"

    exp_resp = client.get("/api/expenses")
    assert exp_resp.status_code == 200
    exp_items = exp_resp.json()["items"]
    assert len(exp_items) == 1
    assert exp_items[0]["amount_paise"] == 49900
    assert exp_items[0]["note"] == "Annual plan"
    assert exp_items[0]["expense_type"]["name"] == "Subscriptions"


def test_restore_deduplication(client):
    backup_data = {
        "schema_version": 1,
        "expense_types": [{"id": 1, "name": "Coffee"}],
        "expenses": [
            {
                "id": 1,
                "expense_type_id": 1,
                "expense_type_name": "Coffee",
                "amount_paise": 15000,
                "expense_date": "2026-01-05",
                "note": "Espresso",
                "payment_method": "Cash",
                "merchant": "Cafe",
            }
        ],
    }

    # First restore
    r1 = client.post("/api/export/restore", json=backup_data).json()
    assert r1["restored_types"] == 1
    assert r1["restored_expenses"] == 1

    # Second restore with identical data
    r2 = client.post("/api/export/restore", json=backup_data).json()
    assert r2["matched_types"] == 1
    assert r2["restored_types"] == 0
    assert r2["restored_expenses"] == 0
    assert r2["skipped_expenses"] == 1

    # Total expenses in system should still be exactly 1
    assert client.get("/api/expenses").json()["total"] == 1


def test_restore_invalid_schema_version(client):
    resp = client.post("/api/export/restore", json={"schema_version": 2, "expense_types": [], "expenses": []})
    assert resp.status_code == 409
    assert "Unsupported backup schema version" in resp.json()["detail"]


def test_restore_broken_type_reference(client):
    payload = {
        "schema_version": 1,
        "expense_types": [{"id": 1, "name": "Food"}],
        "expenses": [
            {
                "expense_type_id": 999,  # Unknown type
                "amount_paise": 1000,
                "expense_date": "2026-01-01",
            }
        ],
    }
    resp = client.post("/api/export/restore", json=payload)
    assert resp.status_code == 409
    assert "unknown expense type" in resp.json()["detail"]


def test_restore_transaction_rollback_on_invalid_data(client):
    payload = {
        "schema_version": 1,
        "expense_types": [{"id": 1, "name": "BrandNewType"}],
        "expenses": [
            {
                "expense_type_id": 1,
                "amount_paise": 1000,
                "expense_date": "2026-01-01",
            },
            {
                "expense_type_id": 1,
                "amount_paise": -500,  # Invalid amount!
                "expense_date": "2026-01-02",
            },
        ],
    }
    resp = client.post("/api/export/restore", json=payload)
    assert resp.status_code == 409

    # Verify BrandNewType was NOT created because transaction rolled back
    types_resp = client.get("/api/expense-types")
    assert types_resp.json()["total"] == 0
