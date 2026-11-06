from pydantic import BaseModel, ConfigDict


class RestoreSummaryRead(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schema_version: int = 2
    restored_types: int = 0
    matched_types: int = 0
    restored_expenses: int = 0
    skipped_expenses: int = 0
    restored_accounts: int = 0
    restored_incomes: int = 0
    restored_transfers: int = 0
    restored_budgets: int = 0
    message: str
