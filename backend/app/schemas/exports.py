from pydantic import BaseModel


class RestoreSummaryRead(BaseModel):
    restored_types: int
    matched_types: int
    restored_expenses: int
    skipped_expenses: int
    message: str
