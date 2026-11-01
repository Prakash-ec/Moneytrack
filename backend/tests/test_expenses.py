def test_create_get_update_delete_expense(client, make_type):
    food = make_type(name="Food")
    created = client.post(
        "/api/expenses",
        json={
            "expense_type_id": food["id"],
            "amount_paise": 39900,
            "expense_date": "2026-01-14",
            "note": "  Lunch with friends ",
            "payment_method": "UPI",
            "merchant": "  Local cafe ",
        },
    )
    assert created.status_code == 201
    data = created.json()
    assert data["amount_paise"] == 39900
    assert data["note"] == "Lunch with friends"
    assert data["merchant"] == "Local cafe"
    assert data["expense_type"]["name"] == "Food"
    assert data["created_at"]
    assert data["updated_at"]
    expense_id = data["id"]

    fetched = client.get(f"/api/expenses/{expense_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == expense_id

    updated = client.patch(
        f"/api/expenses/{expense_id}",
        json={"amount_paise": 45050, "note": None, "payment_method": None},
    )
    assert updated.status_code == 200
    assert updated.json()["amount_paise"] == 45050
    assert updated.json()["note"] is None
    assert updated.json()["payment_method"] is None

    deleted = client.delete(f"/api/expenses/{expense_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/expenses/{expense_id}").status_code == 404
    assert client.delete(f"/api/expenses/{expense_id}").status_code == 404


def test_expense_validation(client, make_type):
    food = make_type()
    base = {
        "expense_type_id": food["id"],
        "amount_paise": 1000,
        "expense_date": "2026-01-01",
    }

    for invalid_amount in (0, -1):
        response = client.post("/api/expenses", json={**base, "amount_paise": invalid_amount})
        assert response.status_code == 422

    missing_type = client.post(
        "/api/expenses", json={"amount_paise": 1000, "expense_date": "2026-01-01"}
    )
    assert missing_type.status_code == 422

    missing_date = client.post(
        "/api/expenses", json={"expense_type_id": food["id"], "amount_paise": 1000}
    )
    assert missing_date.status_code == 422

    invalid_date = client.post(
        "/api/expenses", json={**base, "expense_date": "not-a-date"}
    )
    assert invalid_date.status_code == 422

    nonexistent = client.post(
        "/api/expenses", json={**base, "expense_type_id": 99999}
    )
    assert nonexistent.status_code == 404

    invalid_payment = client.post(
        "/api/expenses", json={**base, "payment_method": "Crypto"}
    )
    assert invalid_payment.status_code == 422


def test_filters_sorting_and_pagination(client, make_type, make_expense):
    food = make_type(name="Food")
    travel = make_type(name="Travel", category="Travel")

    make_expense(food["id"], amount_paise=10000, expense_date="2026-01-01", note="Breakfast", payment_method="Cash")
    make_expense(food["id"], amount_paise=30000, expense_date="2026-01-05", note="Dinner", payment_method="UPI")
    make_expense(travel["id"], amount_paise=20000, expense_date="2026-01-03", note="Bus pass", payment_method="UPI", merchant="City Bus")

    by_date = client.get(
        "/api/expenses",
        params={"start_date": "2026-01-02", "end_date": "2026-01-04"},
    ).json()
    assert by_date["total"] == 1
    assert by_date["items"][0]["expense_date"] == "2026-01-03"

    by_type = client.get("/api/expenses", params={"expense_type_id": food["id"]}).json()
    assert by_type["total"] == 2

    by_payment = client.get("/api/expenses", params={"payment_method": "Cash"}).json()
    assert by_payment["total"] == 1
    assert by_payment["items"][0]["note"] == "Breakfast"

    by_search = client.get("/api/expenses", params={"q": "city"}).json()
    assert by_search["total"] == 1
    assert by_search["items"][0]["expense_type"]["name"] == "Travel"

    by_type_name = client.get("/api/expenses", params={"q": "food"}).json()
    assert by_type_name["total"] == 2

    amount_sorted = client.get("/api/expenses", params={"sort": "amount_desc"}).json()
    assert [item["amount_paise"] for item in amount_sorted["items"]] == [30000, 20000, 10000]

    date_sorted = client.get("/api/expenses", params={"sort": "date_asc"}).json()
    assert [item["expense_date"] for item in date_sorted["items"]] == [
        "2026-01-01",
        "2026-01-03",
        "2026-01-05",
    ]

    page_one = client.get("/api/expenses", params={"page": 1, "page_size": 2}).json()
    page_two = client.get("/api/expenses", params={"page": 2, "page_size": 2}).json()
    assert page_one["total"] == 3
    assert page_one["pages"] == 2
    assert len(page_one["items"]) == 2
    assert len(page_two["items"]) == 1
    assert page_one["items"][0]["id"] != page_two["items"][0]["id"]

    invalid_range = client.get(
        "/api/expenses",
        params={"start_date": "2026-02-01", "end_date": "2026-01-01"},
    )
    assert invalid_range.status_code == 400


def test_paise_precision(client, make_type, make_expense):
    food = make_type()
    expense = make_expense(food["id"], amount_paise=1)
    assert expense["amount_paise"] == 1

    summary = client.get(
        "/api/analytics/summary",
        params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
    ).json()
    assert summary["total_paise"] == 1
    assert summary["average_paise"] == 1


def test_update_requires_valid_type(client, make_type, make_expense):
    food = make_type(name="Food")
    archived = make_type(name="Archived")
    expense = make_expense(food["id"])
    client.post(f"/api/expense-types/{archived['id']}/archive")

    response = client.patch(
        f"/api/expenses/{expense['id']}", json={"expense_type_id": archived["id"]}
    )
    assert response.status_code == 409

    response = client.patch(
        f"/api/expenses/{expense['id']}", json={"expense_type_id": 99999}
    )
    assert response.status_code == 404


def test_update_rejects_explicit_nulls(client, make_type, make_expense):
    food = make_type(name="Food")
    expense = make_expense(food["id"])

    assert client.patch(f"/api/expenses/{expense['id']}", json={"amount_paise": None}).status_code == 422
    assert client.patch(f"/api/expenses/{expense['id']}", json={"expense_type_id": None}).status_code == 422
    assert client.patch(f"/api/expenses/{expense['id']}", json={"expense_date": None}).status_code == 422


def test_amount_range_filters(client, make_type, make_expense):
    food = make_type(name="Food", category="Food")
    travel = make_type(name="Bus Travel", category="Travel")

    make_expense(food["id"], amount_paise=5000, expense_date="2026-01-01", note="Small")
    make_expense(food["id"], amount_paise=15000, expense_date="2026-01-02", note="Medium")
    make_expense(travel["id"], amount_paise=40000, expense_date="2026-01-03", note="Large")

    # Minimum amount only
    res = client.get("/api/expenses", params={"min_amount": 15000}).json()
    assert res["total"] == 2
    assert {item["amount_paise"] for item in res["items"]} == {15000, 40000}

    # Maximum amount only
    res = client.get("/api/expenses", params={"max_amount": 10000}).json()
    assert res["total"] == 1
    assert res["items"][0]["amount_paise"] == 5000

    # Range
    res = client.get("/api/expenses", params={"min_amount": 10000, "max_amount": 30000}).json()
    assert res["total"] == 1
    assert res["items"][0]["amount_paise"] == 15000

    # Min greater than max is rejected
    res = client.get("/api/expenses", params={"min_amount": 50000, "max_amount": 10000})
    assert res.status_code == 400

    # Negative amount is rejected
    res = client.get("/api/expenses", params={"min_amount": -100})
    assert res.status_code == 422


def test_category_and_payment_filters(client, make_type, make_expense):
    food = make_type(name="Canteen", category="Food")
    travel = make_type(name="Bus Pass", category="Travel")

    make_expense(food["id"], amount_paise=10000, expense_date="2026-01-01", payment_method="Cash")
    make_expense(food["id"], amount_paise=20000, expense_date="2026-01-02", payment_method="UPI")
    make_expense(travel["id"], amount_paise=30000, expense_date="2026-01-03", payment_method="Cash")

    # Filter by category name
    res = client.get("/api/expenses", params={"category": "Travel"}).json()
    assert res["total"] == 1
    assert res["items"][0]["expense_type"]["name"] == "Bus Pass"

    # Filter by category + payment method combined
    res = client.get(
        "/api/expenses", params={"category": "Food", "payment_method": "Cash"}
    ).json()
    assert res["total"] == 1
    assert res["items"][0]["expense_type"]["name"] == "Canteen"

    # Combined search + category + amount
    res = client.get(
        "/api/expenses", params={"q": "pass", "category": "Travel", "max_amount": 35000}
    ).json()
    assert res["total"] == 1
    assert res["items"][0]["note"] is None


def test_search_case_insensitive_and_whitespace(client, make_type, make_expense):
    food = make_type(name="Food")
    make_expense(food["id"], amount_paise=10000, expense_date="2026-01-01", note="  Lunch Meeting  ")

    # Case-insensitive
    res = client.get("/api/expenses", params={"q": "LUNCH"}).json()
    assert res["total"] == 1

    # Surrounding whitespace in query is tolerated
    res = client.get("/api/expenses", params={"q": "  lunch  "}).json()
    assert res["total"] == 1

    # Search matches category name too
    res = client.get("/api/expenses", params={"q": "food"}).json()
    assert res["total"] == 1


def test_empty_results_after_filter(client, make_type, make_expense):
    food = make_type(name="Food")
    make_expense(food["id"], amount_paise=10000, expense_date="2026-01-01", note="Only expense")

    res = client.get("/api/expenses", params={"q": "nonexistent"}).json()
    assert res["total"] == 0
    assert res["items"] == []
    assert res["pages"] == 0

    res = client.get("/api/expenses", params={"min_amount": 999999999}).json()
    assert res["total"] == 0
    assert res["items"] == []


def test_pagination_counts_reflect_filters(client, make_type, make_expense):
    food = make_type(name="Food", category="Food")
    for i in range(5):
        make_expense(food["id"], amount_paise=10000 * (i + 1), expense_date=f"2026-01-0{i+1}")

    res = client.get("/api/expenses", params={"category": "Food", "page_size": 2}).json()
    assert res["total"] == 5
    assert res["pages"] == 3
    assert len(res["items"]) == 2

    res = client.get(
        "/api/expenses", params={"category": "Food", "min_amount": 20000, "page_size": 2}
    ).json()
    assert res["total"] == 4
    assert res["pages"] == 2

