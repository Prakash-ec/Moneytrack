from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError


def test_create_read_and_update_type(client, make_type, make_expense):
    created = make_type(name="  Jio   Recharge ", description=" Monthly plan ", category="Utilities")
    assert created["name"] == "Jio Recharge"
    assert created["description"] == "Monthly plan"
    assert created["total_paise"] == 0
    assert created["transaction_count"] == 0

    type_id = created["id"]
    expense = make_expense(type_id, note="January recharge")

    detail = client.get(f"/api/expense-types/{type_id}").json()
    assert detail["total_paise"] == 39900
    assert detail["transaction_count"] == 1

    updated = client.patch(f"/api/expense-types/{type_id}", json={"name": "Mobile Recharge"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Mobile Recharge"

    expense_after = client.get(f"/api/expenses/{expense['id']}").json()
    assert expense_after["expense_type"]["name"] == "Mobile Recharge"
    assert expense_after["id"] == expense["id"]


def test_duplicate_names_are_case_and_space_insensitive(client, make_type):
    make_type(name="Tea and Snacks")
    response = client.post(
        "/api/expense-types",
        json={"name": "  tea   AND snacks ", "icon": "coffee", "color": "#123456"},
    )
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_type_validation(client):
    empty = client.post("/api/expense-types", json={"name": "   "})
    assert empty.status_code == 422
    bad_color = client.post("/api/expense-types", json={"name": "Books", "color": "green"})
    assert bad_color.status_code == 422
    bad_category = client.post("/api/expense-types", json={"name": "Books", "category": "Nope"})
    assert bad_category.status_code == 422


def test_search_and_archived_filters(client, make_type, make_expense):
    food = make_type(name="Food", category="Food")
    books = make_type(name="Books", category="Education")
    archived = make_type(name="Old Gym", category="Health")
    make_expense(food["id"], amount_paise=10000)
    make_expense(books["id"], amount_paise=20000)
    make_expense(archived["id"], amount_paise=30000)

    response = client.post(f"/api/expense-types/{archived['id']}/archive")
    assert response.status_code == 200
    assert response.json()["is_archived"] is True

    default_list = client.get("/api/expense-types").json()
    assert {item["name"] for item in default_list["items"]} == {"Food", "Books"}

    archived_only = client.get("/api/expense-types", params={"archived": "only"}).json()
    assert [item["name"] for item in archived_only["items"]] == ["Old Gym"]

    all_types = client.get("/api/expense-types", params={"archived": "include"}).json()
    assert all_types["total"] == 3

    search = client.get("/api/expense-types", params={"search": "book"}).json()
    assert [item["name"] for item in search["items"]] == ["Books"]

    restored = client.post(f"/api/expense-types/{archived['id']}/unarchive")
    assert restored.status_code == 200
    assert restored.json()["is_archived"] is False


def test_archived_type_keeps_history_but_rejects_new_expenses(client, make_type, make_expense):
    old = make_type(name="College Fees", category="Education")
    historical = make_expense(old["id"], amount_paise=250000, note="Semester fee")
    client.post(f"/api/expense-types/{old['id']}/archive")

    listed = client.get("/api/expenses", params={"expense_type_id": old["id"]}).json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == historical["id"]
    assert listed["items"][0]["expense_type"]["is_archived"] is True

    blocked = client.post(
        "/api/expenses",
        json={
            "expense_type_id": old["id"],
            "amount_paise": 1000,
            "expense_date": "2026-01-16",
        },
    )
    assert blocked.status_code == 409
    assert "archived" in blocked.json()["detail"]

    # Editing the existing historical expense is still allowed.
    edited = client.patch(f"/api/expenses/{historical['id']}", json={"note": "Paid in full"})
    assert edited.status_code == 200
    assert edited.json()["expense_type"]["is_archived"] is True


def test_delete_type_rules(client, make_type, make_expense):
    unused = make_type(name="Temporary")
    response = client.delete(f"/api/expense-types/{unused['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/expense-types/{unused['id']}").status_code == 404

    used = make_type(name="Fuel")
    make_expense(used["id"])
    blocked = client.delete(f"/api/expense-types/{used['id']}")
    assert blocked.status_code == 409
    assert "Archive it instead" in blocked.json()["detail"]
    assert client.get(f"/api/expense-types/{used['id']}").status_code == 200


def test_referential_integrity_is_enforced(db_session, make_type):
    from app.models.expense import Expense
    from app.models.expense_type import ExpenseType

    expense_type = ExpenseType(name="Food", name_key="food", icon="utensils", color="#0F766E")
    db_session.add(expense_type)
    db_session.commit()

    expense = Expense(
        expense_type_id=expense_type.id,
        amount_paise=1000,
        expense_date=date(2026, 1, 1),
    )
    db_session.add(expense)
    db_session.commit()

    db_session.delete(expense_type)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_type_summary(client, make_type, make_expense):
    food = make_type(name="Food")
    make_expense(food["id"], amount_paise=10000, expense_date="2026-01-02")
    make_expense(food["id"], amount_paise=30000, expense_date="2026-01-05", note="Dinner")
    make_expense(food["id"], amount_paise=20000, expense_date="2025-12-30")

    response = client.get(
        f"/api/expense-types/{food['id']}/summary",
        params={"start_date": "2026-01-01", "end_date": "2026-01-10"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_paise"] == 40000
    assert data["transaction_count"] == 2
    assert data["average_paise"] == 20000
    assert data["highest_expense"]["amount_paise"] == 30000
    assert data["lowest_expense"]["amount_paise"] == 10000
    assert data["previous_total_paise"] == 20000
    assert data["change_paise"] == 20000
    assert data["change_percent"] == 100.0
    assert data["direction"] == "up"
    assert len(data["daily_trend"]) == 10
    assert sum(point["total_paise"] for point in data["daily_trend"]) == 40000


def test_invalid_type_summary_range(client, make_type):
    food = make_type()
    response = client.get(
        f"/api/expense-types/{food['id']}/summary",
        params={"start_date": "2026-01-10", "end_date": "2026-01-01"},
    )
    assert response.status_code == 400
