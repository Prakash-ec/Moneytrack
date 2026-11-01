import io
import pytest

from app.services.ocr import BaseOCRProvider, set_ocr_provider
from app.services.receipt_parser import AIReceiptParser, get_receipt_parser, set_receipt_parser


class FakeGroqProvider:
    def __init__(self, result=None, exc=None):
        self.result = result
        self.exc = exc

    def is_available(self):
        return self.result is not None

    def analyze_receipt(self, image_bytes: bytes):
        if self.exc is not None:
            raise self.exc
        return self.result or {}


@pytest.fixture(autouse=True)
def reset_receipt_parser():
    yield
    set_receipt_parser(AIReceiptParser())


class MockOCRProvider(BaseOCRProvider):
    def __init__(self, return_text: str = "") -> None:
        self.return_text = return_text

    def is_available(self) -> bool:
        return True

    def extract_text(self, image_bytes: bytes) -> str:
        return self.return_text


@pytest.fixture(autouse=True)
def reset_ocr():
    yield
    set_ocr_provider(None)


def test_parse_receipt_text_api(client, make_type):
    make_type(name="Food", category="Food")
    make_type(name="Stationary", category="Education")

    payload = {
        "text": (
            "SARAVANA BHAVAN\n"
            "Date: 23/10/2026\n"
            "Dosa 80.00\n"
            "Coffee 40.00\n"
            "Total Amount: 120.00\n"
            "UPI PhonePe"
        )
    }
    resp = client.post("/api/receipts/parse", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["merchant"] == "SARAVANA BHAVAN"
    assert data["amount_paise"] == 12000
    assert data["expense_date"] == "2026-10-23"
    assert data["payment_method"] == "UPI"
    assert data["suggested_expense_type_name"] == "Food"
    assert data["confidence"]["amount"] >= 0.85


def test_parse_receipt_image_upload_api(client, make_type):
    make_type(name="Bus Travel", category="Travel")

    # Set mock OCR provider
    mock_text = "BMTC BUS TICKET\nDate: 10/11/2026\nFare: 45.00\nTotal: 45.00\nCash"
    set_ocr_provider(MockOCRProvider(mock_text))

    # Construct a valid JPEG image header: \xff\xd8\xff...
    fake_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00" + (b"\x00" * 100)

    files = {"file": ("receipt.jpg", io.BytesIO(fake_jpeg), "image/jpeg")}
    resp = client.post("/api/receipts/parse", files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount_paise"] == 4500
    assert data["suggested_expense_type_name"] == "Bus Travel"


def test_parse_receipt_invalid_file_format(client):
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00"
    files = {"file": ("malicious.jpg", io.BytesIO(fake_exe), "image/jpeg")}
    resp = client.post("/api/receipts/parse", files=files)
    assert resp.status_code == 400
    assert "Unsupported image format" in resp.json()["detail"]


def test_parse_receipt_oversized_file(client):
    large_bytes = b"\xff\xd8\xff" + (b"\x00" * (11 * 1024 * 1024))
    files = {"file": ("huge.jpg", io.BytesIO(large_bytes), "image/jpeg")}
    resp = client.post("/api/receipts/parse", files=files)
    assert resp.status_code == 400
    assert "exceeds the maximum allowed size" in resp.json()["detail"]


def test_parse_receipt_missing_payload(client):
    resp = client.post("/api/receipts/parse")
    assert resp.status_code == 400
    assert "Please provide an image file or receipt text" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Image upload through the API with Groq vision (mocked, no live key)
# ---------------------------------------------------------------------------

def _fake_jpeg():
    return b"\xff\xd8\xff\xe0\x00\x10JFIF" + (b"\x00" * 100)


def test_parse_receipt_image_upload_with_groq_success(client, make_type):
    make_type(name="Bus Travel", category="Travel")

    set_ocr_provider(MockOCRProviderApi("BMTC BUS TICKET\nDate: 10/11/2026\nFare: 12.00\nTotal: 12.00\nCash\n"))
    set_receipt_parser(
        AIReceiptParser(
            groq_provider=FakeGroqProvider(
                result={
                    "merchant": "BMTC",
                    "expense_date": "2026-11-10",
                    "total_paise": 1200,
                    "currency": "INR",
                    "payment_method": "Cash",
                    "suggested_category": "Travel",
                    "confidence": {"amount": 0.95},
                }
            )
        )
    )

    files = {"file": ("receipt.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")}
    resp = client.post("/api/receipts/parse", files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount_paise"] == 1200  # ₹12.00 from Groq, never 149600
    assert data["merchant"] == "BMTC"
    assert data["suggested_expense_type_name"] == "Bus Travel"


def test_parse_receipt_image_upload_groq_unavailable_falls_back_to_ocr(client, make_type):
    make_type(name="Bus Travel", category="Travel")

    set_ocr_provider(MockOCRProviderApi("BMTC BUS TICKET\nDate: 10/11/2026\nFare: 45.00\nTotal: 45.00\nCash\n"))
    # Default parser has no Groq key -> AI unavailable -> Tesseract fallback.
    set_receipt_parser(AIReceiptParser())

    files = {"file": ("receipt.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")}
    resp = client.post("/api/receipts/parse", files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount_paise"] == 4500


def test_parse_receipt_image_upload_groq_error_falls_back_to_ocr(client, make_type):
    make_type(name="Bus Travel", category="Travel")

    set_ocr_provider(MockOCRProviderApi("BMTC BUS TICKET\nDate: 10/11/2026\nFare: 45.00\nTotal: 45.00\nCash\n"))
    from app.services.groq_vision import GroqVisionError

    set_receipt_parser(
        AIReceiptParser(
            groq_provider=FakeGroqProvider(result={}, exc=GroqVisionError("rate limited"))
        )
    )

    files = {"file": ("receipt.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")}
    resp = client.post("/api/receipts/parse", files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount_paise"] == 4500  # Tesseract fallback


class MockOCRProviderApi(BaseOCRProvider):
    def __init__(self, return_text: str = "") -> None:
        self.return_text = return_text

    def is_available(self) -> bool:
        return True

    def extract_text(self, image_bytes: bytes) -> str:
        return self.return_text


class MockUnavailableOCR(BaseOCRProvider):
    def is_available(self) -> bool:
        return False

    def extract_text(self, image_bytes: bytes) -> str:
        from app.services.ocr import OCRUnavailableError
        raise OCRUnavailableError("Tesseract not installed")


def test_parse_receipt_image_upload_groq_success_without_tesseract(client, make_type):
    """Critical Render production test: Tesseract is NOT installed, Groq Vision succeeds."""
    make_type(name="Groceries", category="Shopping")
    set_ocr_provider(MockUnavailableOCR())

    set_receipt_parser(
        AIReceiptParser(
            groq_provider=FakeGroqProvider(
                result={
                    "merchant": "Supermarket",
                    "expense_date": "2026-11-12",
                    "total_paise": 25000,
                    "currency": "INR",
                    "payment_method": "UPI",
                    "suggested_category": "Shopping",
                    "confidence": {"amount": 0.98, "merchant": 0.95},
                    "line_items": [{"name": "Milk", "amount_paise": 5000, "quantity": 1}],
                }
            )
        )
    )

    files = {"file": ("receipt.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")}
    # Scan mode 'both' (frontend default) must work without Tesseract!
    resp = client.post("/api/receipts/parse", files=files, data={"scan_mode": "both"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount_paise"] == 25000
    assert data["merchant"] == "Supermarket"
    assert data["expense_date"] == "2026-11-12"
    assert data["payment_method"] == "UPI"
    assert data["suggested_expense_type_name"] == "Groceries"
    assert data["scan_method"] == "groq"
    assert len(data["items"]) == 1
    assert data["items"][0]["name"] == "Milk"


def test_parse_receipt_both_unavailable_gives_graceful_error(client):
    set_ocr_provider(MockUnavailableOCR())
    set_receipt_parser(AIReceiptParser(groq_provider=FakeGroqProvider(result=None)))

    files = {"file": ("receipt.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")}
    resp = client.post("/api/receipts/parse", files=files)
    assert resp.status_code == 503
    assert "Receipt image analysis is currently unavailable" in resp.json()["detail"]


def test_receipt_ocr_to_expense_creation_full_lifecycle(client, make_type):
    """Verify complete end-to-end flow:
    Image Upload -> Groq Vision -> Parsed Result -> Review -> Expense Save -> Persistence -> Analytics & Account Balance
    """
    # 1. Setup account and expense category
    dining_type = make_type(name="Dining", category="Food")
    acc_resp = client.post(
        "/api/bank-accounts",
        json={
            "bank_name": "HDFC Bank",
            "name": "Primary Checking",
            "account_number_mask": "XX9812",
            "account_type": "savings",
            "opening_balance_paise": 1000000,  # ?10,000.00
            "opening_date": "2026-11-01",
            "is_primary": True,
        },
    )
    assert acc_resp.status_code == 201
    account_id = acc_resp.json()["id"]

    # 2. Simulate OCR scanning via Groq Vision on Render (no local Tesseract)
    set_ocr_provider(MockUnavailableOCR())
    set_receipt_parser(
        AIReceiptParser(
            groq_provider=FakeGroqProvider(
                result={
                    "merchant": "Blue Tokai Coffee",
                    "expense_date": "2026-11-01",
                    "total_paise": 38000,  # ?380.00
                    "currency": "INR",
                    "payment_method": "UPI",
                    "suggested_category": "Food",
                    "confidence": {"amount": 0.99, "merchant": 0.95},
                    "line_items": [{"name": "Flat White", "amount_paise": 38000, "quantity": 1}],
                }
            )
        )
    )

    files = {"file": ("receipt.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")}
    parse_resp = client.post("/api/receipts/parse", files=files, data={"scan_mode": "both"})
    assert parse_resp.status_code == 200
    extracted = parse_resp.json()
    assert extracted["merchant"] == "Blue Tokai Coffee"
    assert extracted["amount_paise"] == 38000
    assert extracted["expense_date"] == "2026-11-01"
    assert extracted["payment_method"] == "UPI"
    assert extracted["suggested_expense_type_id"] == dining_type["id"]

    # 3. User reviews and saves expense to database
    save_resp = client.post(
        "/api/expenses",
        json={
            "expense_type_id": extracted["suggested_expense_type_id"],
            "account_id": account_id,
            "amount_paise": extracted["amount_paise"],
            "expense_date": extracted["expense_date"],
            "merchant": extracted["merchant"],
            "payment_method": extracted["payment_method"],
            "note": extracted["note"],
        },
    )
    assert save_resp.status_code == 201
    saved_exp = save_resp.json()
    exp_id = saved_exp["id"]
    assert saved_exp["amount_paise"] == 38000
    assert saved_exp["merchant"] == "Blue Tokai Coffee"
    assert saved_exp["account_id"] == account_id

    # 4. Verify persistence and retrieval
    get_resp = client.get(f"/api/expenses/{exp_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["merchant"] == "Blue Tokai Coffee"

    # 5. Verify analytics dashboard reflects saved expense
    analytics_resp = client.get("/api/analytics/summary?start_date=2026-11-01&end_date=2026-11-01")
    assert analytics_resp.status_code == 200
    assert analytics_resp.json()["total_paise"] >= 38000

    # 6. Verify linked bank account reflects balance deduction
    acc_check = client.get(f"/api/bank-accounts/{account_id}")
    assert acc_check.status_code == 200
    # 1000000 - 38000 = 962000 paise (?9,620.00)
    assert acc_check.json()["current_balance_paise"] == 962000

