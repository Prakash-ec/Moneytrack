import json
from datetime import date

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app.models.expense import Expense
from app.models.expense_type import ExpenseType


def test_csv_export(client, make_type, make_expense):
    food = make_type(name="Food")
    make_expense(food["id"], amount_paise=125050, expense_date="2026-01-02", note="Groceries, weekly")

    response = client.get("/api/export/expenses.csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]
    text = response.content.decode("utf-8-sig")
    assert "Date,Expense Type,Category,Amount (INR)" in text
    assert "2026-01-02,Food,Food,1250.50,125050" in text
    assert '"Groceries, weekly"' in text


def test_json_backup(client, make_type, make_expense):
    food = make_type(name="Food")
    make_expense(food["id"], amount_paise=12345)

    response = client.get("/api/export/backup.json")
    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == 1
    assert len(payload["expense_types"]) == 1
    assert len(payload["expenses"]) == 1
    assert payload["expenses"][0]["amount_paise"] == 12345
    assert payload["expenses"][0]["expense_type_name"] == "Food"


def test_export_date_filter_validation(client):
    response = client.get(
        "/api/export/expenses.csv",
        params={"start_date": "2026-02-01", "end_date": "2026-01-01"},
    )
    assert response.status_code == 400


def test_data_persists_after_reconnecting(tmp_path):
    url = f"sqlite:///{(tmp_path / 'persistent.db').as_posix()}"

    engine = create_engine(url, connect_args={"check_same_thread": False})
    from app.db.base import Base

    Base.metadata.create_all(engine)
    LocalSession = sessionmaker(bind=engine, expire_on_commit=False)
    with LocalSession() as session:
        expense_type = ExpenseType(
            name="Jio Recharge",
            name_key="jio recharge",
            icon="smartphone",
            color="#0F766E",
        )
        session.add(expense_type)
        session.commit()
        session.add(
            Expense(
                expense_type_id=expense_type.id,
                amount_paise=39900,
                expense_date=date(2026, 1, 20),
                note="Monthly plan",
            )
        )
        session.commit()
    engine.dispose()

    reconnected = create_engine(url, connect_args={"check_same_thread": False})
    NewSession = sessionmaker(bind=reconnected, expire_on_commit=False)
    with NewSession() as session:
        types = list(session.scalars(select(ExpenseType)).all())
        expenses = list(session.scalars(select(Expense)).all())
        assert len(types) == 1
        assert len(expenses) == 1
        assert expenses[0].amount_paise == 39900
        assert expenses[0].expense_type.name == "Jio Recharge"
    reconnected.dispose()
