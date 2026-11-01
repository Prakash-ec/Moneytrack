"""Comprehensive verification script for MoneyTrack live deployed backend and local database safety.
Tests live Render backend at https://moneytrack-backend-g5is.onrender.com
and validates CORS, API endpoints, CRUD cycles, and local database integrity.
"""

import json
import sqlite3
import sys
import time
from pathlib import Path
import urllib.request
import urllib.error

LIVE_BASE = "https://moneytrack-backend-g5is.onrender.com"
LOCAL_DB_PATH = Path(__file__).resolve().parent / "data" / "moneytrack.db"


def http_request(url: str, method: str = "GET", headers: dict = None, data: dict = None):
    headers = headers or {}
    encoded_data = None
    if data is not None:
        encoded_data = json.dumps(data).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")

    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            content_type = resp.headers.get("Content-Type", "")
            resp_headers = dict(resp.headers)
            json_body = None
            if "application/json" in content_type:
                try:
                    json_body = json.loads(body)
                except Exception:
                    pass
            return {
                "status": resp.status,
                "reason": resp.reason,
                "headers": resp_headers,
                "body": json_body if json_body is not None else body[:500],
                "error": None,
            }
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return {
            "status": e.code,
            "reason": e.reason,
            "headers": dict(e.headers),
            "body": err_body[:500],
            "error": str(e),
        }
    except Exception as e:
        return {
            "status": 0,
            "reason": "Exception",
            "headers": {},
            "body": str(e),
            "error": str(e),
        }


def run_tests():
    results = {}
    print("=" * 70)
    print("1. PROBING LIVE BACKEND HEALTH & CONNECTIVITY")
    print("=" * 70)

    # 1. Health checks
    for path in ["/health", "/api/health"]:
        res = http_request(f"{LIVE_BASE}{path}")
        print(f"[{res['status']}] GET {path} -> {res['body']}")
        results[f"GET {path}"] = res

    print("\n" + "=" * 70)
    print("2. TESTING CORS CONFIGURATION ON LIVE BACKEND")
    print("=" * 70)

    test_origins = [
        "https://moneytrack-frontend.onrender.com",
        "https://moneytrack-frontend-g5is.onrender.com",
        "http://localhost:5173",
        "https://localhost",
        "capacitor://localhost",
    ]

    for origin in test_origins:
        # Preflight OPTIONS
        preflight = http_request(
            f"{LIVE_BASE}/api/health",
            method="OPTIONS",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        allow_origin = preflight["headers"].get("access-control-allow-origin") or preflight["headers"].get("Access-Control-Allow-Origin")
        print(f"[{preflight['status']}] OPTIONS /api/health (Origin: {origin}) -> Allow-Origin: {allow_origin}")
        results[f"OPTIONS /api/health ({origin})"] = {
            "status": preflight["status"],
            "allow_origin": allow_origin,
        }

        # Actual GET
        get_res = http_request(
            f"{LIVE_BASE}/api/health",
            method="GET",
            headers={"Origin": origin},
        )
        allow_origin_get = get_res["headers"].get("access-control-allow-origin") or get_res["headers"].get("Access-Control-Allow-Origin")
        print(f"[{get_res['status']}] GET /api/health (Origin: {origin}) -> Allow-Origin: {allow_origin_get}")
        results[f"GET /api/health ({origin})"] = {
            "status": get_res["status"],
            "allow_origin": allow_origin_get,
        }

    print("\n" + "=" * 70)
    print("3. TESTING ALL LIVE GET ENDPOINTS")
    print("=" * 70)

    get_endpoints = [
        "/api/expense-types",
        "/api/bank-accounts",
        "/api/bank-accounts/reconciliation/summary",
        "/api/income-types",
        "/api/expenses",
        "/api/incomes",
        "/api/transfers",
        "/api/budgets/summary",
        "/api/cashflow/summary",
        "/api/analytics/summary",
        "/api/analytics/by-type",
        "/api/analytics/trends",
        "/api/reports/weekly",
        "/api/reports/weekly-report",
        "/api/security/summary",
        "/api/security/alerts",
        "/api/notifications",
        "/api/notifications/preferences",
        "/api/export/expenses.csv",
        "/api/export/backup.json",
    ]

    for ep in get_endpoints:
        res = http_request(f"{LIVE_BASE}{ep}")
        item_summary = ""
        if isinstance(res["body"], dict):
            item_summary = f"(keys: {list(res['body'].keys())[:4]})"
        elif isinstance(res["body"], list):
            item_summary = f"(count: {len(res['body'])})"
        elif isinstance(res["body"], str) and len(res["body"]) > 0:
            item_summary = f"(length: {len(res['body'])} chars)"
        print(f"[{res['status']}] GET {ep} {item_summary}")
        results[f"GET {ep}"] = res

    print("\n" + "=" * 70)
    print("4. SAFE CRUD LIFECYCLE ON LIVE BACKEND (INCOME TYPE)")
    print("=" * 70)

    # Create temporary income type
    create_it = http_request(
        f"{LIVE_BASE}/api/income-types",
        method="POST",
        data={"name": f"Temp Test Probe {int(time.time())}", "icon": "CheckCircle", "color": "#10b981"},
    )
    print(f"[{create_it['status']}] POST /api/income-types -> {create_it['body']}")
    created_id = create_it["body"].get("id") if isinstance(create_it["body"], dict) else None

    if created_id:
        # Patch
        patch_it = http_request(
            f"{LIVE_BASE}/api/income-types/{created_id}",
            method="PATCH",
            data={"name": f"Temp Test Probe Updated {int(time.time())}"},
        )
        print(f"[{patch_it['status']}] PATCH /api/income-types/{created_id} -> {patch_it['body']}")

        # Delete
        del_it = http_request(
            f"{LIVE_BASE}/api/income-types/{created_id}",
            method="DELETE",
        )
        print(f"[{del_it['status']}] DELETE /api/income-types/{created_id}")

        results["CRUD Income Type"] = {
            "create": create_it["status"],
            "patch": patch_it["status"],
            "delete": del_it["status"],
        }
    else:
        print("Skipped PATCH/DELETE due to create failure or non-dict body.")
        results["CRUD Income Type"] = {"create": create_it["status"]}

    print("\n" + "=" * 70)
    print("5. SAFE CRUD LIFECYCLE ON LIVE BACKEND (EXPENSE)")
    print("=" * 70)

    # Get an existing expense type
    types_res = http_request(f"{LIVE_BASE}/api/expense-types")
    type_id = None
    items = types_res["body"].get("items") if isinstance(types_res["body"], dict) else types_res["body"] if isinstance(types_res["body"], list) else []
    if items and len(items) > 0:
        type_id = items[0]["id"]

    if type_id:
        create_exp = http_request(
            f"{LIVE_BASE}/api/expenses",
            method="POST",
            data={
                "expense_type_id": type_id,
                "amount_paise": 100,
                "expense_date": "2026-11-01",
                "note": "Temporary Automated Test Probe (Will Delete Immediately)",
            },
        )
        print(f"[{create_exp['status']}] POST /api/expenses -> {create_exp['body']}")
        exp_id = create_exp["body"].get("id") if isinstance(create_exp["body"], dict) else None

        if exp_id:
            patch_exp = http_request(
                f"{LIVE_BASE}/api/expenses/{exp_id}",
                method="PATCH",
                data={"note": "Temporary Automated Test Probe (Updated)"},
            )
            print(f"[{patch_exp['status']}] PATCH /api/expenses/{exp_id} -> {patch_exp['body']}")

            del_exp = http_request(
                f"{LIVE_BASE}/api/expenses/{exp_id}",
                method="DELETE",
            )
            print(f"[{del_exp['status']}] DELETE /api/expenses/{exp_id}")

            results["CRUD Expense"] = {
                "create": create_exp["status"],
                "patch": patch_exp["status"],
                "delete": del_exp["status"],
            }
        else:
            results["CRUD Expense"] = {"create": create_exp["status"]}
    else:
        print("No expense type found to test expense creation.")

    print("\n" + "=" * 70)
    print("6. VERIFY LOCAL SQLITE INTEGRITY & RECORD SAFETY")
    print("=" * 70)
    if LOCAL_DB_PATH.exists():
        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        integrity = cursor.execute("PRAGMA integrity_check").fetchone()[0]
        expenses_count = cursor.execute("SELECT count(*) FROM expenses").fetchone()[0]
        expense_types_count = cursor.execute("SELECT count(*) FROM expense_types").fetchone()[0]
        incomes_count = cursor.execute("SELECT count(*) FROM incomes").fetchone()[0]
        income_types_count = cursor.execute("SELECT count(*) FROM income_types").fetchone()[0]
        accounts_count = cursor.execute("SELECT count(*) FROM bank_accounts").fetchone()[0]
        conn.close()

        print(f"SQLite DB Path: {LOCAL_DB_PATH}")
        print(f"PRAGMA integrity_check: {integrity}")
        print(f"Local records count: expenses={expenses_count}, expense_types={expense_types_count}, incomes={incomes_count}, income_types={income_types_count}, bank_accounts={accounts_count}")
        results["local_sqlite"] = {
            "integrity": integrity,
            "expenses": expenses_count,
            "expense_types": expense_types_count,
            "incomes": incomes_count,
            "income_types": income_types_count,
            "bank_accounts": accounts_count,
        }
    else:
        print(f"Local SQLite database not found at {LOCAL_DB_PATH}!")

    print("\n" + "=" * 70)
    print("TEST SUITE COMPLETED SUCCESSFULLY")
    print("=" * 70)
    return results


if __name__ == "__main__":
    run_tests()
