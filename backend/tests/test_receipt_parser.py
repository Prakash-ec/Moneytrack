from datetime import date
import pytest

from app.models.expense_type import ExpenseType
from app.services.receipt_parser import (
    AIReceiptParser,
    RuleBasedReceiptParser,
    _merge_results,
)


@pytest.fixture
def parser():
    return RuleBasedReceiptParser()


@pytest.fixture
def mock_expense_types():
    return [
        ExpenseType(id=1, name="Food", name_key="food", category="Food", color="#0F766E", icon="utensils"),
        ExpenseType(id=2, name="Bus Travel", name_key="bus travel", category="Travel", color="#2563EB", icon="bus"),
        ExpenseType(id=3, name="Stationary", name_key="stationary", category="Education", color="#D97706", icon="book"),
        ExpenseType(id=4, name="Utilities", name_key="utilities", category="Utilities", color="#7C3AED", icon="smartphone"),
    ]


def test_parse_indian_receipt_with_subtotal_tax_and_cash(parser, mock_expense_types):
    receipt_text = """
    SARAVANA BHAVAN RESTAURANT
    12, MG Road, Bengaluru - 560001
    GSTIN: 29AAAAA0000A1Z5
    Ph: 080-25588990

    Date: 23/10/2026  Time: 13:45
    Bill No: SB-9482

    1 Masala Dosa          80.00
    2 Filter Coffee        60.00
    1 Idli Vada Combo      70.00

    Sub Total             210.00
    CGST 2.5%               5.25
    SGST 2.5%               5.25
    Grand Total           220.50

    Payment: UPI (PhonePe)
    Cash Tendered: 500.00
    Change: 279.50
    Thank You! Visit Again
    """
    res = parser.parse(receipt_text, mock_expense_types)

    assert res.merchant == "SARAVANA BHAVAN RESTAURANT"
    assert res.amount_paise == 22050  # ₹220.50
    assert res.subtotal_paise == 21000  # ₹210.00
    assert res.tax_paise == 1050  # ₹10.50 (5.25 + 5.25)
    assert res.expense_date == date(2026, 10, 23)
    assert res.payment_method == "UPI"
    assert res.suggested_expense_type_id == 1  # Food
    assert res.suggested_expense_type_name == "Food"
    assert res.confidence["amount"] >= 0.90
    assert len(res.items) >= 2


def test_receipt_does_not_pick_largest_number_as_total(parser, mock_expense_types):
    """Verify that a 10-digit phone number or cash tendered (5000) is NOT chosen as the total."""
    receipt_text = """
    SHREE BALAJI BOOK STORE & STATIONARY
    Contact: 9876543210
    Invoice Date: 15-08-2026

    Classmate Notebook 120.00
    Parker Pen         250.00

    Total Amount: 370.00
    Cash Paid: 2000.00
    Change Returned: 1630.00
    """
    res = parser.parse(receipt_text, mock_expense_types)

    assert res.amount_paise == 37000  # ₹370.00
    assert res.expense_date == date(2026, 8, 15)
    assert res.suggested_expense_type_id == 3  # Stationary
    assert res.suggested_expense_type_name == "Stationary"


def test_parse_bus_ticket(parser, mock_expense_types):
    receipt_text = """
    KSRTC BUS TRAVEL TICKET
    Trip: Bengaluru to Mysuru
    Journey Date: 04 Nov 2026
    Fare: Rs. 385.00
    Payment Mode: Cash
    Net Payable: 385.00
    """
    res = parser.parse(receipt_text, mock_expense_types)

    assert res.amount_paise == 38500
    assert res.expense_date == date(2026, 11, 4)
    assert res.payment_method == "Cash"
    assert res.suggested_expense_type_id == 2  # Bus Travel
    assert res.suggested_expense_type_name == "Bus Travel"


def test_parse_iso_date_and_recharge(parser, mock_expense_types):
    receipt_text = """
    JIO PREPAID RECHARGE
    Txn Date: 2026-05-20
    Plan: 1.5GB/Day 28 Days
    Amount: ₹ 299.00
    Net Amount: 299.00
    Paid via GPay UPI
    """
    res = parser.parse(receipt_text, mock_expense_types)

    assert res.amount_paise == 29900
    assert res.expense_date == date(2026, 5, 20)
    assert res.payment_method == "UPI"
    assert res.suggested_expense_type_id == 4  # Utilities


def test_unreadable_amount_and_unknown_category(parser, mock_expense_types):
    receipt_text = """
    MYSTERIOUS CORNER SHOP
    Date: 12/03/2026
    Some illegible characters #$%@
    """
    res = parser.parse(receipt_text, mock_expense_types)

    assert res.amount_paise is None
    assert res.confidence["amount"] == 0.0
    assert any("Could not detect total amount" in w for w in res.warnings)
    # Since no category matches, suggested type should be None with warning
    assert res.suggested_expense_type_id is None
    assert any("No matching expense type" in w for w in res.warnings)


def test_empty_receipt_text(parser, mock_expense_types):
    res = parser.parse("", mock_expense_types)
    assert res.amount_paise is None
    assert res.merchant is None
    assert res.warnings


# ---------------------------------------------------------------------------
# AI (Groq vision) + OCR merging tests
# ---------------------------------------------------------------------------

class FakeGroqProvider:
    def __init__(self, result=None, exc=None):
        self.result = result
        self.exc = exc
        self.called = False

    def is_available(self):
        return self.result is not None

    def analyze_receipt(self, image_bytes: bytes):
        self.called = True
        if self.exc is not None:
            raise self.exc
        return self.result


class MockOCRProvider:
    def __init__(self, text: str = "") -> None:
        self.text = text

    def is_available(self) -> bool:
        return True

    def extract_text(self, image_bytes: bytes) -> str:
        return self.text


from app.services.groq_vision import GroqVisionError  # noqa: E402
from app.services.ocr import set_ocr_provider  # noqa: E402


@pytest.fixture
def ai_parser(mock_expense_types):
    return AIReceiptParser()


def test_merge_uses_groq_total_not_unrelated_large_number(ai_parser, mock_expense_types):
    """Bus ticket: TOTAL RS: 12 with an unrelated 149600 => amount must be ₹12.00."""
    rule = RuleBasedReceiptParser()
    rule_result = rule.parse("BUS TICKET\nTOTAL RS: 12\n149600\nCash\n", mock_expense_types)
    ai = {
        "merchant": "KSRTC",
        "expense_date": "2026-11-04",
        "total_paise": 1200,
        "currency": "INR",
        "payment_method": "Cash",
        "suggested_category": "Travel",
        "confidence": {"amount": 0.9},
    }
    merged = _merge_results(rule_result, ai, mock_expense_types)
    assert merged.amount_paise == 1200  # ₹12.00, never 149600
    assert merged.amount_paise != 14_960_000


def test_merge_prefers_groq_amount_when_plausible(ai_parser, mock_expense_types):
    rule = RuleBasedReceiptParser()
    rule_result = rule.parse("SHOP\nTotal: 100.00\nCash\n", mock_expense_types)
    ai = {
        "total_paise": 12000,
        "currency": "INR",
        "confidence": {"amount": 0.9},
    }
    merged = _merge_results(rule_result, ai, mock_expense_types)
    assert merged.amount_paise == 12000  # AI value used when plausible
    assert any("differs from OCR" in w for w in merged.warnings)


def test_merge_distrusts_ai_hallucinated_huge_amount(ai_parser, mock_expense_types):
    """If AI total is an order of magnitude above OCR, keep OCR and warn."""
    rule = RuleBasedReceiptParser()
    rule_result = rule.parse("BUS TICKET\nTOTAL RS: 12\nCash\n", mock_expense_types)
    ai = {
        "total_paise": 149600,  # AI hallucinated an unrelated large number
        "currency": "INR",
        "confidence": {"amount": 0.9},
    }
    merged = _merge_results(rule_result, ai, mock_expense_types)
    assert merged.amount_paise == 1200  # OCR amount kept
    assert any("unusually high" in w for w in merged.warnings)


def test_merge_groq_failure_falls_back_to_ocr(ai_parser, mock_expense_types):
    """Groq timeout/rate-limit/error must fall back to Tesseract."""
    set_ocr_provider(MockOCRProvider("BUS TICKET\nTOTAL RS: 12\nCash\n"))
    parser = AIReceiptParser(
        groq_provider=FakeGroqProvider(result={}, exc=GroqVisionError("rate limited"))
    )
    result = parser.parse_image(b"\xff\xd8\xfffake-jpeg", mock_expense_types)
    assert result.amount_paise == 1200
    assert result.raw_text == "BUS TICKET\nTOTAL RS: 12\nCash\n"


# ---------------------------------------------------------------------------
# Scan-mode selection tests (ocr / groq / both)
# ---------------------------------------------------------------------------

def test_parse_image_ocr_mode_uses_ocr_only(ai_parser, mock_expense_types):
    """scan_mode='ocr' must not call Groq and return scan_method='ocr'."""
    set_ocr_provider(MockOCRProvider("BUS TICKET\nTOTAL RS: 12\nCash\n"))
    groq = FakeGroqProvider()
    parser = AIReceiptParser(groq_provider=groq)
    result = parser.parse_image(b"\xff\xd8\xfffake-jpeg", mock_expense_types, scan_mode="ocr")
    assert result.amount_paise == 1200
    assert result.scan_method == "ocr"
    assert groq.called is False


def test_parse_image_groq_mode_success(ai_parser, mock_expense_types):
    """scan_mode='groq' uses Groq vision only and returns scan_method='groq'."""
    groq = FakeGroqProvider(
        result={
            "merchant": "KSRTC",
            "expense_date": "2026-11-04",
            "total_paise": 1200,
            "currency": "INR",
            "payment_method": "Cash",
            "suggested_category": "Travel",
            "confidence": {"amount": 0.95},
        }
    )
    parser = AIReceiptParser(groq_provider=groq)
    result = parser.parse_image(b"\xff\xd8\xfffake-jpeg", mock_expense_types, scan_mode="groq")
    assert result.amount_paise == 1200  # ₹12.00
    assert result.scan_method == "groq"
    assert result.merchant == "KSRTC"
    assert result.suggested_expense_type_name == "Bus Travel"


def test_parse_image_groq_mode_falls_back_to_ocr(ai_parser, mock_expense_types):
    """scan_mode='groq' with Groq error falls back to OCR with scan_method='ocr'."""
    set_ocr_provider(MockOCRProvider("BUS TICKET\nTOTAL RS: 12\nCash\n"))
    groq = FakeGroqProvider(result={}, exc=GroqVisionError("rate limited"))
    parser = AIReceiptParser(groq_provider=groq)
    result = parser.parse_image(b"\xff\xd8\xfffake-jpeg", mock_expense_types, scan_mode="groq")
    assert result.amount_paise == 1200
    assert result.scan_method == "ocr"
    assert any("fell back to local Tesseract OCR" in w for w in result.warnings)


def test_parse_image_both_mode_uses_hybrid(ai_parser, mock_expense_types):
    """scan_mode='both' merges OCR + Groq and returns scan_method='hybrid'."""
    set_ocr_provider(MockOCRProvider("BUS TICKET\nTOTAL RS: 12\nCash\n"))
    groq = FakeGroqProvider(
        result={
            "total_paise": 1200,
            "currency": "INR",
            "confidence": {"amount": 0.9},
        }
    )
    parser = AIReceiptParser(groq_provider=groq)
    result = parser.parse_image(b"\xff\xd8\xfffake-jpeg", mock_expense_types, scan_mode="both")
    assert result.amount_paise == 1200
    assert result.scan_method == "hybrid"



def test_rule_sms_jio_payment_amount_not_inferred(parser):
    sms = (
        "Dear Customer, your payment of Rs.149.00 has been successfully made to "
        "Jio Prepaid Recharge on 25-Oct-2026 at 11:30 AM. Transaction ID: "
        "JIO123456789. Thank you for using your banking services."
    )
    res = parser.parse(sms, [])
    assert res.amount_paise == 14900
    assert not any("inferred" in w for w in res.warnings)
