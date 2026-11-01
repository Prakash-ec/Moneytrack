from enum import Enum


class PaymentMethod(str, Enum):
    UPI = "UPI"
    CASH = "Cash"
    DEBIT_CARD = "Debit Card"
    CREDIT_CARD = "Credit Card"
    BANK_TRANSFER = "Bank Transfer"
    OTHER = "Other"


class ExpenseCategory(str, Enum):
    FOOD = "Food"
    TRAVEL = "Travel"
    UTILITIES = "Utilities"
    EDUCATION = "Education"
    SHOPPING = "Shopping"
    HEALTH = "Health"
    ENTERTAINMENT = "Entertainment"
    HOUSING = "Housing"
    OTHER = "Other"


DEFAULT_TYPE_COLOR = "#0F766E"
DEFAULT_TYPE_ICON = "wallet"
