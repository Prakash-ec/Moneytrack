from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.bank_account import BankAccount
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.income import Income
from app.models.income_type import IncomeType


def test_bank_accounts_crud(client: TestClient):
    # 1. Create account
    res = client.post(
        "/api/bank-accounts",
        json={
            "bank_name": "HDFC Bank",
            "account_name": "HDFC Salary Account",
            "account_type": "salary",
            "account_number_mask": "XX8824",
            "opening_balance_paise": 2500000,  # ₹25,000.00
            "opening_balance_date": "2026-10-01",
            "color": "#1D4ED8",
            "icon": "building",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    account_id = data["id"]
    assert data["bank_name"] == "HDFC Bank"
    assert data["current_balance_paise"] == 2500000
    assert data["reconciliation_status"] == "matched"

    # 2. List accounts
    res = client.get("/api/bank-accounts")
    assert res.status_code == 200
    list_data = res.json()
    assert list_data["account_count"] >= 1
    assert list_data["total_balance_paise"] >= 2500000

    # 3. Report bank balance from SMS
    res = client.post(
        f"/api/bank-accounts/{account_id}/report-balance?reported_balance_paise=2500000&source=sms"
    )
    assert res.status_code == 200
    assert res.json()["last_reported_balance_paise"] == 2500000
    assert res.json()["reconciliation_status"] == "matched"

    # 4. Report discrepancy
    res = client.post(
        f"/api/bank-accounts/{account_id}/report-balance?reported_balance_paise=2000000&source=sms"
    )
    assert res.status_code == 200
    assert res.json()["reconciliation_status"] == "discrepancy"


def test_income_crud_and_account_balance(client: TestClient, make_income_type):
    # Setup account and income type
    acc_res = client.post(
        "/api/bank-accounts",
        json={
            "bank_name": "State Bank of India",
            "account_name": "SBI Savings",
            "account_type": "savings",
            "account_number_mask": "XX1024",
            "opening_balance_paise": 1000000,  # ₹10,000.00
            "opening_balance_date": "2026-10-01",
        },
    )
    account_id = acc_res.json()["id"]

    inc_type = make_income_type(name="Salary", category="Earned")
    salary_type_id = inc_type["id"]

    # 1. Add income with idempotency
    key = "idem-income-test-12345"
    res = client.post(
        "/api/incomes",
        headers={"Idempotency-Key": key},
        json={
            "income_type_id": salary_type_id,
            "account_id": account_id,
            "amount_paise": 5000000,  # ₹50,000.00
            "income_date": "2026-10-15",
            "payer": "Acme Corp",
            "description": "Monthly Salary",
            "payment_method": "neft",
            "bank_reference": "NEFT12345678",
        },
    )
    assert res.status_code == 201
    income_id = res.json()["id"]

    # Replay idempotency
    replay_res = client.post(
        "/api/incomes",
        headers={"Idempotency-Key": key},
        json={
            "income_type_id": salary_type_id,
            "account_id": account_id,
            "amount_paise": 5000000,
            "income_date": "2026-10-15",
        },
    )
    assert replay_res.status_code == 200
    assert replay_res.headers.get("X-Idempotent-Replay") == "true"
    assert replay_res.json()["id"] == income_id

    # Check that bank account current balance increased from ₹10,000 to ₹60,000
    acc_check = client.get(f"/api/bank-accounts/{account_id}")
    assert acc_check.json()["current_balance_paise"] == 6000000


def test_internal_transfers(client: TestClient):
    acc1 = client.post(
        "/api/bank-accounts",
        json={
            "bank_name": "ICICI Bank",
            "account_name": "ICICI Current",
            "account_number_mask": "XX9901",
            "opening_balance_paise": 5000000,  # ₹50,000
            "opening_balance_date": "2026-10-01",
        },
    ).json()["id"]

    acc2 = client.post(
        "/api/bank-accounts",
        json={
            "bank_name": "Axis Bank",
            "account_name": "Axis Savings",
            "account_number_mask": "XX4402",
            "opening_balance_paise": 1000000,  # ₹10,000
            "opening_balance_date": "2026-10-01",
        },
    ).json()["id"]

    # Transfer ₹15,000 from ICICI to Axis
    res = client.post(
        "/api/transfers",
        json={
            "from_account_id": acc1,
            "to_account_id": acc2,
            "amount_paise": 1500000,
            "transfer_date": "2026-10-20",
            "description": "Savings fund allocation",
            "bank_reference": "IMPS883311",
        },
    )
    assert res.status_code == 201

    # Check updated balances
    bal1 = client.get(f"/api/bank-accounts/{acc1}").json()["current_balance_paise"]
    bal2 = client.get(f"/api/bank-accounts/{acc2}").json()["current_balance_paise"]
    assert bal1 == 3500000  # 50,000 - 15,000 = 35,000
    assert bal2 == 2500000  # 10,000 + 15,000 = 25,000


def test_sms_ingest_credit_and_debit(client: TestClient, make_income_type, make_type):
    # Setup income and expense types
    make_income_type(name="Other Income", category="General")
    make_type(name="Food", category="Food")

    # Setup bank account
    acc = client.post(
        "/api/bank-accounts",
        json={
            "bank_name": "Kotak Mahindra Bank",
            "account_name": "Kotak Savings",
            "account_number_mask": "XX5566",
            "opening_balance_paise": 500000,  # ₹5,000
            "opening_balance_date": "2026-10-01",
        },
    ).json()["id"]

    # 1. Ingest credit SMS with available balance
    res_credit = client.post(
        "/api/sms/ingest",
        json={
            "body": "Rs. 2,000 credited to a/c XX5566 on 28-OCT-26 by UPI. Avail bal: Rs 7,000.",
            "sender": "AD-KOTAKB",
            "amount_paise": 200000,
            "merchant_or_payer": "Ramesh Sharma",
            "reference": "UPI4991823",
            "transaction_date": "2026-10-28",
            "direction": "CREDIT",
            "available_balance_paise": 700000,
            "account_suffix": "5566",
            "bank_name": "Kotak",
            "suggested_category": "Other Income",
        },
    )
    assert res_credit.status_code == 200
    data_c = res_credit.json()
    assert data_c["created"] is True
    assert data_c["transaction_type"] == "income"
    assert data_c["account_id"] == acc
    assert data_c["current_calculated_balance_paise"] == 700000
    assert data_c["available_balance_recorded"] is True

    # 2. Ingest debit SMS with available balance
    res_debit = client.post(
        "/api/sms/ingest",
        json={
            "body": "Rs. 1,500 debited from a/c XX5566 on 29-OCT-26 to Swiggy. Avail bal: Rs 5,500.",
            "sender": "AD-KOTAKB",
            "amount_paise": 150000,
            "merchant_or_payer": "Swiggy",
            "reference": "UPI992211",
            "transaction_date": "2026-10-29",
            "direction": "DEBIT",
            "available_balance_paise": 550000,
            "account_suffix": "5566",
            "bank_name": "Kotak",
            "suggested_category": "Food",
        },
    )
    assert res_debit.status_code == 200
    data_d = res_debit.json()
    assert data_d["created"] is True
    assert data_d["transaction_type"] == "expense"
    assert data_d["current_calculated_balance_paise"] == 550000


def test_sms_ingest_auto_creates_bank_account_and_records_balance(client: TestClient, make_type):
    make_type(name="Food", category="Food")

    # Ingest without pre-creating account XX4375
    res = client.post(
        "/api/sms/ingest",
        json={
            "body": "Your Account XXX924375 is debited by Rs. 15 Total Balance : Rs. 12,118.09 Clear Balance : Rs. 12,118.0907/11/2026",
            "sender": "AD-SDCCBL-S",
            "amount_paise": 1500,
            "merchant_or_payer": "Salem District Central Co-operative Bank",
            "reference": "631165217684",
            "transaction_date": "2026-11-07",
            "direction": "DEBIT",
            "available_balance_paise": 1211809,
            "account_suffix": "4375",
            "bank_name": "Salem District Central Co-operative Bank",
            "suggested_category": "Food",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["created"] is True
    assert data["available_balance_recorded"] is True
    assert data["account_id"] is not None

    # Verify account exists in list
    acc_res = client.get("/api/bank-accounts")
    assert acc_res.status_code == 200
    acc_list = acc_res.json()
    created_acc = next(a for a in acc_list["items"] if a["id"] == data["account_id"])
    assert "4375" in created_acc["account_number_mask"] or "4375" in created_acc["account_name"]
    assert created_acc["last_reported_balance_paise"] == 1211809



def test_cashflow_summary_endpoint(client: TestClient):
    res = client.get("/api/analytics/cashflow")
    assert res.status_code == 200
    data = res.json()
    assert "total_income_paise" in data
    assert "total_expense_paise" in data
    assert "net_cashflow_paise" in data
    assert "savings_rate_percent" in data
    assert "total_bank_balance_paise" in data
    assert "accounts" in data


def test_bank_account_frontend_compatibility_and_expense_linking(client: TestClient, make_type):
    food_type = make_type(name="Cafeteria", category="Food")

    # 1. Create account with frontend payload format (name, opening_date, null mask, wallet type)
    res = client.post(
        "/api/bank-accounts",
        json={
            "name": "Paytm Wallet",
            "bank_name": "Paytm Payments Bank",
            "account_number_mask": None,
            "account_type": "wallet",
            "opening_balance_paise": 100000,
            "opening_date": "2026-10-01",
            "is_primary": True,
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["account_name"] == "Paytm Wallet"
    assert data["name"] == "Paytm Wallet"
    assert data["opening_date"] == "2026-10-01"
    assert data["opening_balance_date"] == "2026-10-01"
    account_id = data["id"]

    # 2. Verify list response includes computed fields
    list_res = client.get("/api/bank-accounts")
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert "consolidated_balance_paise" in list_data
    assert "total_accounts" in list_data

    # 3. Create expense linked to this account with lowercase payment_method
    exp_res = client.post(
        "/api/expenses",
        json={
            "expense_type_id": food_type["id"],
            "account_id": account_id,
            "amount_paise": 25000,
            "expense_date": "2026-10-10",
            "payment_method": "upi",
            "merchant": "Campus Cafe",
        },
    )
    assert exp_res.status_code == 201, exp_res.text
    exp_data = exp_res.json()
    assert exp_data["account_id"] == account_id
    assert exp_data["payment_method"] == "UPI"

    # 4. Check that account current balance reflects deduction
    acc_check = client.get(f"/api/bank-accounts/{account_id}")
    assert acc_check.status_code == 200
    # 100000 - 25000 = 75000
    assert acc_check.json()["current_balance_paise"] == 75000

