"""Server-side idempotency for expense creation.

Covers retries, concurrent requests, and replays for the same idempotency key,
plus the guarantee that different keys create different expenses.
"""
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest

from app.api.routes.expenses import IDEMPOTENT_REPLAY_HEADER


def base_payload(food):
    return {
        "expense_type_id": food["id"],
        "amount_paise": 14900,
        "expense_date": "2026-01-15",
        "note": "SMS payment",
        "payment_method": "UPI",
        "merchant": "Test Merchant",
    }


def test_idempotent_replay_returns_existing_expense(client, make_type):
    food = make_type(name="Food")
    headers = {"Idempotency-Key": "sms-abc-123"}

    first = client.post("/api/expenses", json=base_payload(food), headers=headers)
    assert first.status_code == 201, first.text
    assert first.headers.get(IDEMPOTENT_REPLAY_HEADER) is None
    first_id = first.json()["id"]

    second = client.post("/api/expenses", json=base_payload(food), headers=headers)
    assert second.status_code == 200, second.text
    assert second.headers.get(IDEMPOTENT_REPLAY_HEADER) == "true"
    assert second.json()["id"] == first_id
    assert second.json()["amount_paise"] == 14900


def test_different_keys_create_different_expenses(client, make_type):
    food = make_type(name="Food")

    first = client.post(
        "/api/expenses", json=base_payload(food), headers={"Idempotency-Key": "key-1"}
    )
    second = client.post(
        "/api/expenses", json=base_payload(food), headers={"Idempotency-Key": "key-2"}
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


def test_no_idempotency_key_creates_expense_as_before(client, make_type):
    food = make_type(name="Food")
    response = client.post("/api/expenses", json=base_payload(food))
    assert response.status_code == 201
    assert response.json()["amount_paise"] == 14900


def test_replay_after_timeout_like_retry(client, make_type):
    """Simulate: request sent, response lost, client retries with same key."""
    food = make_type(name="Food")
    headers = {"Idempotency-Key": "timeout-retry-1"}

    responses = [
        client.post("/api/expenses", json=base_payload(food), headers=headers)
        for _ in range(3)
    ]
    created = [r for r in responses if r.status_code == 201]
    replays = [r for r in responses if r.status_code == 200]
    assert len(created) == 1, f"expected exactly one creation, got {responses}"
    assert len(replays) == 2
    ids = {r.json()["id"] for r in responses}
    assert len(ids) == 1


def test_concurrent_requests_with_same_key_create_once(client, make_type):
    food = make_type(name="Food")
    headers = {"Idempotency-Key": "concurrent-key-1"}

    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [
            pool.submit(client.post, "/api/expenses", json=base_payload(food), headers=headers)
            for _ in range(8)
        ]
        for future in as_completed(futures):
            results.append(future.result())

    created = [r for r in results if r.status_code == 201]
    replays = [r for r in results if r.status_code == 200]
    assert len(created) == 1, f"expected exactly one creation under concurrency, got {results}"
    assert len(replays) == 7
    ids = {r.json()["id"] for r in results}
    assert len(ids) == 1
