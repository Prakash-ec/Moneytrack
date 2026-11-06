from fastapi import APIRouter

from app.api.routes import (
    analytics,
    auth,
    bank_accounts,
    budgets,
    cashflow,
    expense_types,
    expenses,
    exports,
    health,
    income_types,
    incomes,
    notifications,
    receipts,
    security,
    sms_ingest,
    transfers,
    weekly_report,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(expense_types.router)
api_router.include_router(expenses.router)
api_router.include_router(analytics.router)
api_router.include_router(exports.router, prefix="/export", tags=["Export"])
api_router.include_router(exports.router, prefix="/exports", tags=["Export"])
api_router.include_router(receipts.router)
api_router.include_router(budgets.router)
api_router.include_router(bank_accounts.router)
api_router.include_router(income_types.router)
api_router.include_router(incomes.router)
api_router.include_router(transfers.router)
api_router.include_router(cashflow.router)
api_router.include_router(sms_ingest.router)
api_router.include_router(security.router)
api_router.include_router(notifications.router)
api_router.include_router(weekly_report.router)
api_router.add_api_route("/weekly-report", weekly_report.get_weekly_report, methods=["GET"], response_model=weekly_report.WeeklyReportData, tags=["reports"])
api_router.add_api_route("/weekly", weekly_report.get_weekly_report, methods=["GET"], response_model=weekly_report.WeeklyReportData, tags=["reports"])
