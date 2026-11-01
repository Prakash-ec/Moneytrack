import pytest


@pytest.fixture()
def dataset(client, make_type, make_expense):
    food = make_type(name="Food", category="Food")
    recharge = make_type(name="Jio Recharge", category="Utilities", icon="smartphone")

    make_expense(food["id"], amount_paise=120000, expense_date="2026-01-01", note="Groceries")
    make_expense(food["id"], amount_paise=120000, expense_date="2026-01-02", note="Cafe")
    make_expense(recharge["id"], amount_paise=79900, expense_date="2026-01-05", note="Plan")
    make_expense(food["id"], amount_paise=100000, expense_date="2025-12-30", note="Previous period")

    return {"food": food, "recharge": recharge}


def test_empty_database_analytics(client):
    params = {"start_date": "2026-01-01", "end_date": "2026-01-31"}
    summary = client.get("/api/analytics/summary", params=params)
    assert summary.status_code == 200
    data = summary.json()
    assert data["total_paise"] == 0
    assert data["transaction_count"] == 0
    assert data["average_paise"] == 0
    assert data["highest_expense"] is None
    assert data["most_expensive_type"] is None
    assert data["comparison"]["direction"] == "none"
    assert data["comparison"]["change_percent"] is None

    by_type = client.get("/api/analytics/by-type", params=params).json()
    assert by_type["items"] == []
    assert by_type["total_paise"] == 0

    trends = client.get("/api/analytics/trends", params=params).json()
    assert len(trends["series"]) == 31
    assert all(point["total_paise"] == 0 for point in trends["series"])
    assert trends["largest_days"] == []
    assert trends["rankings"] == []
    assert trends["recurring"] == []
    assert trends["insights"] == []

    comparison = client.get("/api/analytics/comparison", params=params).json()
    assert comparison["direction"] == "none"
    assert comparison["by_type"] == []


def test_summary_calculations(client, dataset):
    response = client.get(
        "/api/analytics/summary",
        params={"start_date": "2026-01-01", "end_date": "2026-01-07"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_paise"] == 319900
    assert data["transaction_count"] == 3
    assert data["average_paise"] == 106633
    assert data["highest_expense"]["amount_paise"] == 120000
    assert data["most_expensive_type"]["name"] == "Food"
    assert data["most_expensive_type"]["total_paise"] == 240000
    assert data["most_expensive_type"]["share_percent"] == 75.0
    assert data["comparison"]["previous_total_paise"] == 100000
    assert data["comparison"]["change_paise"] == 219900
    assert data["comparison"]["change_percent"] == 219.9
    assert data["comparison"]["direction"] == "up"
    assert data["comparison"]["previous_transaction_count"] == 1


def test_by_type_percentages(client, dataset):
    data = client.get(
        "/api/analytics/by-type",
        params={"start_date": "2026-01-01", "end_date": "2026-01-07"},
    ).json()
    assert data["total_paise"] == 319900
    assert [item["name"] for item in data["items"]] == ["Food", "Jio Recharge"]

    food, recharge = data["items"]
    assert food["total_paise"] == 240000
    assert food["transaction_count"] == 2
    assert food["average_paise"] == 120000
    assert food["share_percent"] == 75.0
    assert recharge["share_percent"] == 25.0
    assert round(food["share_percent"] + recharge["share_percent"], 1) == 100.0


def test_trends_series_and_largest_days(client, dataset):
    daily = client.get(
        "/api/analytics/trends",
        params={
            "start_date": "2026-01-01",
            "end_date": "2026-01-07",
            "granularity": "daily",
        },
    ).json()
    assert daily["granularity"] == "daily"
    assert len(daily["series"]) == 7
    assert daily["series"][0]["date"] == "2026-01-01"
    assert daily["series"][0]["total_paise"] == 120000
    assert daily["largest_days"][0]["date"] == "2026-01-01"
    assert len(daily["largest_days"]) == 3
    assert daily["insights"]

    weekly = client.get(
        "/api/analytics/trends",
        params={
            "start_date": "2026-01-01",
            "end_date": "2026-01-07",
            "granularity": "weekly",
        },
    ).json()
    assert len(weekly["series"]) == 2
    assert weekly["series"][0]["date"] == "2025-12-29"
    assert weekly["series"][0]["total_paise"] == 240000
    assert weekly["series"][1]["total_paise"] == 79900

    monthly = client.get(
        "/api/analytics/trends",
        params={
            "start_date": "2026-01-01",
            "end_date": "2026-02-10",
            "granularity": "monthly",
        },
    ).json()
    assert len(monthly["series"]) == 2
    assert monthly["series"][0]["total_paise"] == 319900


def test_recurring_detection_requires_evidence(client, make_type, make_expense):
    tea = make_type(name="Tea", category="Food")
    for day in (1, 8, 15, 22):
        make_expense(
            tea["id"],
            amount_paise=1500,
            expense_date=f"2026-01-{day:02d}",
            note="Evening tea",
        )

    data = client.get(
        "/api/analytics/trends",
        params={
            "start_date": "2026-01-01",
            "end_date": "2026-01-31",
            "granularity": "daily",
        },
    ).json()
    assert len(data["recurring"]) == 1
    recurring = data["recurring"][0]
    assert recurring["name"] == "Tea"
    assert recurring["pattern"] == "regular"
    assert recurring["transaction_count"] == 4
    assert recurring["average_gap_days"] == 7.0
    assert "Tea" in recurring["message"]


def test_two_entries_are_not_called_recurring(client, make_type, make_expense):
    tea = make_type(name="Tea")
    make_expense(tea["id"], expense_date="2026-01-01")
    make_expense(tea["id"], expense_date="2026-01-02")

    data = client.get(
        "/api/analytics/trends",
        params={"start_date": "2026-01-01", "end_date": "2026-01-31"},
    ).json()
    assert data["recurring"] == []


def test_comparison_by_type_handles_new_and_removed_types(client, dataset):
    data = client.get(
        "/api/analytics/comparison",
        params={"start_date": "2026-01-01", "end_date": "2026-01-07"},
    ).json()
    assert data["current_total_paise"] == 319900
    assert data["previous_total_paise"] == 100000
    assert data["change_percent"] == 219.9

    by_name = {item["name"]: item for item in data["by_type"]}
    assert by_name["Food"]["current_total_paise"] == 240000
    assert by_name["Food"]["previous_total_paise"] == 100000
    assert by_name["Food"]["direction"] == "up"
    assert by_name["Food"]["change_percent"] == 140.0
    assert by_name["Jio Recharge"]["previous_total_paise"] == 0
    assert by_name["Jio Recharge"]["direction"] == "new"
    assert by_name["Jio Recharge"]["change_percent"] is None


def test_comparison_with_no_previous_spending(client, make_type, make_expense):
    food = make_type(name="Food")
    make_expense(food["id"], expense_date="2026-02-10", amount_paise=5000)

    data = client.get(
        "/api/analytics/summary",
        params={"start_date": "2026-02-01", "end_date": "2026-02-28"},
    ).json()
    assert data["comparison"]["previous_total_paise"] == 0
    assert data["comparison"]["change_percent"] is None
    assert data["comparison"]["direction"] == "new"


def test_analytics_default_range_does_not_crash(client):
    assert client.get("/api/analytics/summary").status_code == 200
    assert client.get("/api/analytics/by-type").status_code == 200
    assert client.get("/api/analytics/trends").status_code == 200
    assert client.get("/api/analytics/comparison").status_code == 200


def test_analytics_future_start_date_without_end_date(client):
    response = client.get("/api/analytics/summary", params={"start_date": "2099-01-01"})
    assert response.status_code == 200
    data = response.json()
    assert data["start_date"] == "2099-01-01"
    assert data["end_date"] == "2099-01-01"
