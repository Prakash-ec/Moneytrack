import logging
import re
from abc import ABC, abstractmethod
from datetime import date
from typing import Sequence

from app.core.time import today_ist
from app.models.expense_type import ExpenseType
from app.schemas.receipt import ReceiptItem, ReceiptParseResponse
from app.services.expense_types import name_key
from app.services.groq_vision import GroqVisionError, GroqVisionProvider
from app.services.type_classifier import TypeClassifier

logger = logging.getLogger("moneytrack.receipt_parser")

# ---------------------------------------------------------------------------
# Category Keyword Dictionaries for Indian Receipts
# ---------------------------------------------------------------------------
CATEGORY_KEYWORDS: dict[str, set[str]] = {
    "food": {
        "restaurant", "restro", "cafe", "coffee", "tea", "chai", "bakery", "bakes",
        "dosa", "idli", "pizza", "burger", "grocery", "groceries", "supermarket",
        "food", "foods", "kitchen", "dining", "swiggy", "zomato", "meals", "meal",
        "tiffin", "mess", "hotel", "sweets", "snacks", "snack", "juice", "bistro",
        "biryani", "dhaba", "canteen", "ice cream", "cake", "beverage", "beverages",
    },
    "travel": {
        "bus", "metro", "train", "cab", "taxi", "uber", "ola", "auto", "irctc",
        "fuel", "petrol", "diesel", "cng", "toll", "ticket", "travel", "travels",
        "transport", "railway", "railways", "flight", "airline", "parking",
        "fastag", "station", "fare", "trip", "rides", "ride",
    },
    "utilities": {
        "recharge", "jio", "airtel", "vodafone", "vi", "idea", "bsnl", "electricity",
        "bescom", "tneb", "water", "internet", "wifi", "broadband", "gas", "lpg",
        "cylinder", "bill desk", "postpaid", "prepaid", "utility", "utilities",
    },
    "education": {
        "stationary", "stationery", "books", "book", "notebook", "notebooks", "pen",
        "pens", "pencil", "xerox", "printout", "print", "photostat", "library",
        "college", "school", "fee", "fees", "tuition", "course", "exam", "study",
        "textbook", "paper", "stationers",
    },
    "shopping": {
        "apparel", "apparels", "clothes", "clothing", "fashion", "footwear",
        "electronics", "amazon", "flipkart", "store", "mart", "retail", "shoes",
        "bag", "bags", "garment", "garments", "dress", "shirt", "pant", "mall",
        "outlet", "lifestyle", "trends",
    },
    "health": {
        "pharmacy", "medical", "medicals", "chemist", "chemists", "hospital",
        "clinic", "doctor", "medicine", "medicines", "lab", "diagnostics",
        "apollo", "medplus", "tablets", "pharma", "dental", "optical", "healthcare",
    },
    "entertainment": {
        "movie", "cinema", "cinemas", "pvr", "inox", "cinepolis", "multiplex",
        "ticket", "game", "gaming", "park", "subscription", "netflix", "spotify",
        "hotstar", "prime video", "concert", "show",
    },
    "housing": {
        "rent", "maintenance", "deposit", "flat", "apartment", "society",
        "maintenance charge", "quarterly maintenance",
    },
}

MONTH_MAP: dict[str, int] = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9, "sept": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def _parse_amount_to_paise(raw_num_str: str) -> int | None:
    cleaned = raw_num_str.replace(",", "").strip()
    if not re.match(r"^\d+(?:\.\d{1,2})?$", cleaned):
        return None
    try:
        parts = cleaned.split(".")
        whole = int(parts[0])
        fraction = parts[1] if len(parts) > 1 else "00"
        paise = whole * 100 + int(fraction.ljust(2, "0")[:2])
        if 0 < paise <= 10_000_000_00:  # <= 10 crore
            return paise
    except ValueError:
        pass
    return None


class BaseReceiptParser(ABC):
    @abstractmethod
    def parse(self, text: str, existing_types: Sequence[ExpenseType]) -> ReceiptParseResponse:
        pass


class RuleBasedReceiptParser(BaseReceiptParser):
    def parse(self, text: str, existing_types: Sequence[ExpenseType]) -> ReceiptParseResponse:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return ReceiptParseResponse(
                raw_text="",
                warnings=["Receipt text is empty or unreadable."],
                confidence={"overall": 0.0},
            )

        merchant, merchant_conf = self._extract_merchant(lines)
        parsed_date, date_conf, date_warning = self._extract_date(lines)
        amount_paise, subtotal_paise, tax_paise, amount_conf, amount_warnings = self._extract_amounts(lines)
        payment_method = self._extract_payment_method(text)
        items = self._extract_items(lines)

        suggested_type, type_conf = self._match_expense_type(
            merchant=merchant,
            items=items,
            full_text=text,
            existing_types=existing_types,
        )

        warnings = list(amount_warnings)
        if date_warning:
            warnings.append(date_warning)
        if not merchant:
            warnings.append("Could not identify merchant name.")
        if suggested_type is None and existing_types:
            warnings.append("No matching expense type found. Please select an existing category.")

        # Synthesize note
        note = None
        if items:
            item_summaries = []
            for it in items[:6]:
                if it.amount_paise:
                    rupees = it.amount_paise / 100
                    qty_prefix = f"{it.quantity}x " if it.quantity else ""
                    item_summaries.append(f"{qty_prefix}{it.name} (₹{rupees:.2f})")
                else:
                    item_summaries.append(it.name)
            note = f"Items: {', '.join(item_summaries)} · Scanned receipt"
        elif merchant:
            note = f"Scanned receipt from {merchant}"

        confidence = {
            "merchant": merchant_conf,
            "date": date_conf,
            "amount": amount_conf,
            "type": type_conf,
        }

        return ReceiptParseResponse(
            merchant=merchant,
            amount_paise=amount_paise,
            expense_date=parsed_date,
            currency="INR",
            subtotal_paise=subtotal_paise,
            tax_paise=tax_paise,
            payment_method=payment_method,
            items=items,
            note=note,
            suggested_expense_type_id=suggested_type.id if suggested_type else None,
            suggested_expense_type_name=suggested_type.name if suggested_type else None,
            confidence=confidence,
            warnings=warnings,
            raw_text=text,
            scan_method="ocr",
        )

    # -----------------------------------------------------------------------
    # 1. Merchant Extraction
    # -----------------------------------------------------------------------
    def _extract_merchant(self, lines: list[str]) -> tuple[str | None, float]:
        header_noise = re.compile(
            r"(?i)\b(?:tax\s*invoice|retail\s*invoice|invoice|receipt|bill\s*of\s*supply|"
            r"cash\s*memo|cash\s*receipt|bill|customer\s*copy|merchant\s*copy|original|"
            r"duplicate|gstin|gst\s*no|fssai|cin|tin|pan|ph(?:one)?|tel|mob(?:ile)?|"
            r"welcome|thank\s*you|order\s*no|table\s*no|token\s*no)\b"
        )
        address_noise = re.compile(
            r"(?i)\b(?:road|street|nagar|cross|main|floor|opp|near|pincode|pin|bengaluru|bangalore|"
            r"mumbai|delhi|chennai|hyderabad|kolkata|india|\.com|\.in|www)\b"
        )

        for line in lines[:6]:
            clean = re.sub(r"[^\w\s\&\.\-]", "", line).strip()
            if len(clean) < 3 or len(clean) > 80:
                continue
            if re.match(r"^[\d\s\-\.\:\/]+$", clean):
                continue
            if header_noise.search(clean) or address_noise.search(clean):
                continue

            # Return cleaned merchant name
            title_merchant = " ".join(clean.split())
            return title_merchant[:100], 0.85

        # Fallback to very first line if nothing matched
        if lines:
            fallback = lines[0].strip()[:80]
            if len(fallback) >= 3 and not re.match(r"^[\d\s\-\.\:\/]+$", fallback):
                return fallback, 0.40

        return None, 0.0

    # -----------------------------------------------------------------------
    # 2. Date Extraction
    # -----------------------------------------------------------------------
    def _extract_date(self, lines: list[str]) -> tuple[date | None, float, str | None]:
        # 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        num_pattern = re.compile(
            r"\b([0-3]?[0-9])[/\-\.]([0-1]?[0-9])[/\-\.](20\d{2}|\d{2})\b"
        )
        # 2. DD Mon YYYY (e.g. 23 Oct 2026 or 23-October-2026)
        text_pattern = re.compile(
            r"\b([0-3]?[0-9])[\s\-\.]([A-Za-z]{3,9})[\s\-\.](20\d{2}|\d{2})\b"
        )
        # 3. ISO YYYY-MM-DD
        iso_pattern = re.compile(
            r"\b(20\d{2})[/\-\.]([0-1]?[0-9])[/\-\.]([0-3]?[0-9])\b"
        )

        current_year = today_ist().year

        for line in lines:
            # Check Text month pattern first (e.g. 23 Oct 2026)
            text_match = text_pattern.search(line)
            if text_match:
                day_s, month_s, year_s = text_match.groups()
                m_num = MONTH_MAP.get(month_s.lower())
                if m_num:
                    y_num = int(year_s)
                    if y_num < 100:
                        y_num += 2000
                    if 2000 <= y_num <= current_year + 1:
                        try:
                            d = date(y_num, m_num, int(day_s))
                            return d, 0.95, None
                        except ValueError:
                            pass

            # Check Indian numeric date DD/MM/YYYY
            num_match = num_pattern.search(line)
            if num_match:
                d_s, m_s, y_s = num_match.groups()
                y_num = int(y_s)
                if y_num < 100:
                    y_num += 2000
                if 2000 <= y_num <= current_year + 1:
                    try:
                        d = date(y_num, int(m_s), int(d_s))
                        return d, 0.90, None
                    except ValueError:
                        pass

            # Check ISO format
            iso_match = iso_pattern.search(line)
            if iso_match:
                y_s, m_s, d_s = iso_match.groups()
                y_num = int(y_s)
                if 2000 <= y_num <= current_year + 1:
                    try:
                        d = date(y_num, int(m_s), int(d_s))
                        return d, 0.90, None
                    except ValueError:
                        pass

        # If date not found, return today with a friendly warning
        return today_ist(), 0.30, "Could not detect date from receipt; defaulted to today."

    # -----------------------------------------------------------------------
    # 3. Amount Extraction (Total, Subtotal, Tax)
    # -----------------------------------------------------------------------
    def _extract_amounts(
        self, lines: list[str]
    ) -> tuple[int | None, int | None, int | None, float, list[str]]:
        warnings: list[str] = []

        total_kw = re.compile(
            r"(?i)\b(?:grand\s*total|net\s*payable|amount\s*payable|payable\s*amount|"
            r"final\s*total|invoice\s*total|bill\s*amount|total\s*amount|net\s*amount|total|payment\s*of|payment|debited)\b"
        )
        subtotal_kw = re.compile(
            r"(?i)\b(?:sub\s*total|subtotal|item\s*total|taxable\s*value|taxable\s*amount)\b"
        )
        tax_kw = re.compile(r"(?i)\b(?:cgst|sgst|igst|total\s*tax|tax|vat|gst)\b")
        exclude_kw = re.compile(
            r"(?i)\b(?:cash\s*tendered|tendered|cash\s*given|received|change(?:\s*due|\s*returned)?|"
            r"balance\s*returned|discount|savings|saving|cashback)\b"
        )

        amount_re = re.compile(
            r"(?<![/\-\d])(?:₹|Rs\.?|INR)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2}))(?![/\-\d])"
        )
        date_line_kw = re.compile(
            r"(?i)\b(?:date|time|gstin|gst|ph|phone|tel|mob|mobile|invoice|bill)\b|[0-3]?[0-9][/\-\.][0-1]?[0-9][/\-\.]20\d{2}"
        )

        subtotal_paise: int | None = None
        tax_paise: int | None = None
        total_candidates: list[tuple[int, int]] = []  # (amount_paise, score)

        for line in lines:
            line_amounts = []
            for match in amount_re.finditer(line):
                p = _parse_amount_to_paise(match.group(1))
                if p:
                    line_amounts.append(p)

            if not line_amounts:
                continue

            last_amount = line_amounts[-1]

            # Subtotal check first (Sub Total should NOT be counted as Total)
            if subtotal_kw.search(line):
                subtotal_paise = last_amount
                continue

            # Tax check
            if tax_kw.search(line):
                tax_paise = (tax_paise or 0) + last_amount
                continue

            # Cash tendered / change exclude
            if exclude_kw.search(line):
                continue

            # Payment amount extraction: prefer the number immediately following
            # "payment of"/"paid" so unrelated numbers (time, txn ids) are ignored.
            payment_amount = None
            pm = re.search(
                r"(?i)\b(?:payment\s*of|paid)\s*(?:Rs\.?|INR|₹)?\s*"
                r"([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})|[0-9]+(?:\.[0-9]{1,2}))",
                line,
            )
            if pm:
                payment_amount = _parse_amount_to_paise(pm.group(1))

            # Total keyword match
            if total_kw.search(line):
                weight = 100
                if re.search(r"(?i)\b(?:grand\s*total|net\s*payable|amount\s*payable|final\s*total)\b", line):
                    weight = 150
                if re.search(r"(?i)\b(?:payment\s*of|payment|debited)\b", line):
                    weight = 120
                chosen = payment_amount if payment_amount is not None else last_amount
                total_candidates.append((chosen, weight))

        # Check if subtotal + tax validates one of the candidate totals
        if subtotal_paise and tax_paise:
            expected = subtotal_paise + tax_paise
            for amt, w in total_candidates:
                if abs(amt - expected) <= 200:  # within ₹2 rounding
                    return amt, subtotal_paise, tax_paise, 0.98, warnings

        if total_candidates:
            # Pick candidate with highest weight; tie-break with largest amount
            total_candidates.sort(key=lambda x: (x[1], x[0]), reverse=True)
            chosen_total = total_candidates[0][0]
            confidence = 0.90 if total_candidates[0][1] >= 100 else 0.75
            return chosen_total, subtotal_paise, tax_paise, confidence, warnings

        # Fallback: scan bottom lines for largest plausible amount (skipping date and phone lines)
        fallback_amounts: list[int] = []
        for line in lines[len(lines) // 2:]:
            if exclude_kw.search(line) or date_line_kw.search(line):
                continue
            for match in amount_re.finditer(line):
                p = _parse_amount_to_paise(match.group(1))
                if p:
                    fallback_amounts.append(p)

        if fallback_amounts:
            largest = max(fallback_amounts)
            warnings.append("Total amount was inferred from the receipt numbers. Please verify before saving.")
            return largest, subtotal_paise, tax_paise, 0.50, warnings

        warnings.append("Could not detect total amount from receipt.")
        return None, subtotal_paise, tax_paise, 0.0, warnings

    # -----------------------------------------------------------------------
    # 4. Payment Method Detection
    # -----------------------------------------------------------------------
    def _extract_payment_method(self, text: str) -> str | None:
        low = text.lower()
        if re.search(r"\b(?:upi|gpay|google\s*pay|phonepe|paytm|bhim|cred)\b", low):
            return "UPI"
        if re.search(r"\b(?:debit\s*card|visa\s*debit|master\s*debit|rupay\s*debit)\b", low):
            return "Debit Card"
        if re.search(r"\b(?:credit\s*card|visa\s*credit|master\s*card|amex)\b", low):
            return "Credit Card"
        if re.search(r"\b(?:cash)\b", low):
            return "Cash"
        if re.search(r"\b(?:net\s*banking|neft|imps|rtgs|bank\s*transfer)\b", low):
            return "Bank Transfer"
        return None

    # -----------------------------------------------------------------------
    # 5. Line Item Extraction
    # -----------------------------------------------------------------------
    def _extract_items(self, lines: list[str]) -> list[ReceiptItem]:
        item_re = re.compile(
            r"^(?P<qty>\d+)?\s*(?:[xX*]\s*)?(?P<name>[A-Za-z][A-Za-z0-9\s\&\-\.\'\(\)]+?)\s+(?:₹|Rs\.?|INR)?\s*(?P<amount>[0-9]+(?:\.[0-9]{1,2})?)$"
        )
        non_item_kw = re.compile(
            r"(?i)\b(?:total|subtotal|tax|cgst|sgst|gst|vat|round|cash|change|discount|balance|due)\b"
        )

        items: list[ReceiptItem] = []
        for line in lines:
            line_str = line.strip()
            if non_item_kw.search(line_str):
                continue
            match = item_re.match(line_str)
            if match:
                name = match.group("name").strip()
                qty_str = match.group("qty")
                amt_str = match.group("amount")
                if len(name) >= 2 and not name.isdigit():
                    paise = _parse_amount_to_paise(amt_str)
                    qty = int(qty_str) if qty_str else 1
                    items.append(ReceiptItem(name=name, amount_paise=paise, quantity=qty))
        return items[:15]

    # -----------------------------------------------------------------------
    # 6. Automatic Expense-Type Matching
    # -----------------------------------------------------------------------
    def _match_expense_type(
        self,
        merchant: str | None,
        items: list[ReceiptItem],
        full_text: str,
        existing_types: Sequence[ExpenseType],
    ) -> tuple[ExpenseType | None, float]:
        if not existing_types:
            return None, 0.0

        full_text_lower = full_text.lower()
        merchant_lower = (merchant or "").lower()
        item_names = " ".join(it.name.lower() for it in items)
        search_blob = f"{merchant_lower} {item_names} {full_text_lower}"

        scores: list[tuple[ExpenseType, int]] = []

        for etype in existing_types:
            score = 0
            t_key = name_key(etype.name)
            category_key = (etype.category or "").lower()

            # 1. Exact Name match in merchant or text (Highest weight)
            if t_key and t_key in merchant_lower:
                score += 50
            elif t_key and t_key in search_blob:
                score += 30

            # 2. Check keywords for this category
            keywords = CATEGORY_KEYWORDS.get(category_key, set())
            # Also check if type name itself suggests keywords (e.g. "Stationary", "Bus Travel")
            for cat_name, kw_set in CATEGORY_KEYWORDS.items():
                if cat_name in t_key:
                    keywords = keywords | kw_set

            for kw in keywords:
                if re.search(rf"\b{re.escape(kw)}\b", merchant_lower):
                    score += 25
                elif re.search(rf"\b{re.escape(kw)}\b", item_names):
                    score += 15
                elif re.search(rf"\b{re.escape(kw)}\b", full_text_lower):
                    score += 8

            scores.append((etype, score))

        scores.sort(key=lambda x: x[1], reverse=True)
        best_type, best_score = scores[0]

        if best_score >= 20:
            confidence = min(0.95, 0.60 + (best_score / 100))
            return best_type, confidence
        elif best_score >= 10:
            return best_type, 0.45

        return None, 0.0


_DEFAULT_PARSER: BaseReceiptParser = RuleBasedReceiptParser()


def get_receipt_parser() -> BaseReceiptParser:
    return _DEFAULT_PARSER


def set_receipt_parser(parser: BaseReceiptParser) -> None:
    global _DEFAULT_PARSER
    _DEFAULT_PARSER = parser


def _format_paise(paise: int | None) -> str:
    if paise is None:
        return "unknown"
    return f"\u20b9{paise / 100:.2f}"


def _find_type_by_category(
    suggested_category: str | None, existing_types: Sequence[ExpenseType]
) -> ExpenseType | None:
    """Match an AI-suggested category to an existing expense type."""
    if not suggested_category or not existing_types:
        return None
    cat = suggested_category.strip().lower()
    for etype in existing_types:
        if (etype.category or "").strip().lower() == cat:
            return etype
        if cat and cat in (etype.name or "").strip().lower():
            return etype
    return None


def _merge_results(
    rule_result: ReceiptParseResponse,
    ai: dict | None,
    existing_types: Sequence[ExpenseType],
) -> ReceiptParseResponse:
    """Merge rule-based (Tesseract) and Groq-vision results without blindly
    trusting the largest number or silently overwriting conflicting values.

    Groq's total is preferred when present and plausible because the vision
    model understands receipt context (e.g. "TOTAL RS: 12" versus an unrelated
    "149600"). When both sources disagree, the difference is surfaced as a
    warning so the user reviews before saving.
    """
    warnings = list(rule_result.warnings)
    amount = rule_result.amount_paise
    amount_conf = float(rule_result.confidence.get("amount", 0.0) or 0.0)

    rule_type = None
    if rule_result.suggested_expense_type_id is not None:
        rule_type = next(
            (et for et in existing_types if et.id == rule_result.suggested_expense_type_id),
            None,
        )

    ai_type = None
    ai_amount = ai.get("total_paise") if ai else None
    # Reject non-positive / non-numeric AI totals so they can't clobber OCR.
    if not isinstance(ai_amount, int) or isinstance(ai_amount, bool) or ai_amount <= 0:
        ai_amount = None

    if ai_amount is not None:
        if rule_result.amount_paise is not None:
            # Safeguard: distrust an AI total that is an order of magnitude
            # larger than the OCR keyword-total (hallucination guard).
            if ai_amount > rule_result.amount_paise * 10:
                warnings.append(
                    f"AI amount ({_format_paise(ai_amount)}) seems unusually high "
                    f"vs OCR ({_format_paise(rule_result.amount_paise)}); using OCR amount."
                )
            # Safeguard 2: distrust an OCR total that is an order of magnitude
            # larger than the AI total (OCR misread a phone/invoice number).
            elif rule_result.amount_paise > ai_amount * 10:
                warnings.append(
                    f"OCR amount ({_format_paise(rule_result.amount_paise)}) seems unusually high "
                    f"vs AI ({_format_paise(ai_amount)}); using AI amount."
                )
                amount = ai_amount
                ai_conf = (ai.get("confidence") or {}).get("amount")
                if ai_conf is not None:
                    amount_conf = max(amount_conf, float(ai_conf))
                else:
                    amount_conf = max(amount_conf, 0.6)
            else:
                if rule_result.amount_paise != ai_amount:
                    warnings.append(
                        f"AI amount ({_format_paise(ai_amount)}) differs from OCR "
                        f"({_format_paise(rule_result.amount_paise)}); using AI value."
                    )
                amount = ai_amount
                ai_conf = (ai.get("confidence") or {}).get("amount")
                if ai_conf is not None:
                    amount_conf = max(amount_conf, float(ai_conf))
                else:
                    amount_conf = max(amount_conf, 0.6)
        else:
            amount = ai_amount
            ai_conf = (ai.get("confidence") or {}).get("amount")
            amount_conf = max(amount_conf, float(ai_conf) if ai_conf is not None else 0.5)

    ai_type = _find_type_by_category(
        ai.get("suggested_category") if ai else None, existing_types
    )
    suggested_type = ai_type or rule_type

    # Merchant: prefer AI when it found one; otherwise keep OCR result.
    merchant = ai.get("merchant") if (ai and ai.get("merchant")) else rule_result.merchant

    # Date: prefer AI when valid; otherwise keep OCR result.
    expense_date = rule_result.expense_date
    if ai and ai.get("expense_date"):
        try:
            expense_date = date.fromisoformat(ai["expense_date"])
        except ValueError:
            pass  # keep OCR date if AI date is invalid

    # Payment method: prefer AI when present.
    payment_method = (
        ai.get("payment_method") if (ai and ai.get("payment_method")) else rule_result.payment_method
    )

    currency = ai.get("currency", rule_result.currency) if ai else rule_result.currency

    confidence = dict(rule_result.confidence)
    if ai and isinstance(ai.get("confidence"), dict):
        for key, value in ai["confidence"].items():
            if value is not None:
                confidence[key] = float(value)
    confidence["amount"] = amount_conf

    merged = ReceiptParseResponse(
        merchant=merchant,
        amount_paise=amount,
        expense_date=expense_date,
        currency=currency,
        subtotal_paise=rule_result.subtotal_paise,
        tax_paise=rule_result.tax_paise,
        payment_method=payment_method,
        items=rule_result.items,
        note=rule_result.note,
        suggested_expense_type_id=suggested_type.id if suggested_type else None,
        suggested_expense_type_name=suggested_type.name if suggested_type else None,
        confidence=confidence,
        warnings=warnings,
        raw_text=rule_result.raw_text,
    )
    _apply_type_classification(
        merged, existing_types, category_hint=(ai.get("suggested_category") if ai else None)
    )
    return merged


def _ai_only_response(
    ai: dict, existing_types: Sequence[ExpenseType]
) -> ReceiptParseResponse:
    """Build a ReceiptParseResponse from a Groq-only result (scan_method='groq')."""
    warnings: list[str] = []
    total_paise = ai.get("total_paise")
    if not isinstance(total_paise, int) or isinstance(total_paise, bool) or total_paise <= 0:
        total_paise = None
        warnings.append("AI did not return a usable total; please enter the amount manually.")
    expense_date = None
    if ai.get("expense_date"):
        try:
            expense_date = date.fromisoformat(ai["expense_date"])
        except ValueError:
            warnings.append("AI returned an invalid date; date left blank.")

    category = ai.get("suggested_category")
    matched_type = _find_type_by_category(category, existing_types)
    confidence = ai.get("confidence") or {}
    if not isinstance(confidence, dict):
        confidence = {}

    items: list[ReceiptItem] = []
    for it in ai.get("line_items", []):
        if isinstance(it, dict) and it.get("name"):
            items.append(
                ReceiptItem(
                    name=str(it["name"]).strip(),
                    amount_paise=it.get("amount_paise"),
                    quantity=it.get("quantity"),
                )
            )

    note = "Scanned via Groq AI vision"
    if ai.get("merchant"):
        note = f"Scanned via Groq AI vision ({ai.get('merchant')})"

    ai_only = ReceiptParseResponse(
        merchant=ai.get("merchant"),
        amount_paise=total_paise,
        expense_date=expense_date,
        currency=ai.get("currency", "INR"),
        subtotal_paise=ai.get("subtotal_paise"),
        tax_paise=ai.get("tax_paise"),
        payment_method=ai.get("payment_method"),
        items=items,
        note=note,
        suggested_expense_type_id=matched_type.id if matched_type else None,
        suggested_expense_type_name=matched_type.name if matched_type else None,
        confidence={k: float(v) for k, v in confidence.items() if v is not None},
        warnings=warnings,
        raw_text=ai.get("raw_text"),
        scan_method="groq",
    )
    _apply_type_classification(ai_only, existing_types, category_hint=category)
    return ai_only


class AIReceiptParser(BaseReceiptParser):
    """Receipt parser that augments local Tesseract OCR with optional Groq vision.

    Supports three scan modes:
      - "ocr":   local Tesseract OCR only (falls back to Groq if OCR missing)
      - "groq":  Groq vision AI only (backend), falls back to OCR if unavailable
      - "both":  Groq vision primary, OCR merged if available (default)

    The text path always delegates to the rule-based parser. Nothing is saved
    automatically; the user reviews before saving.
    """

    def __init__(
        self,
        rule_parser: BaseReceiptParser | None = None,
        groq_provider: GroqVisionProvider | None = None,
    ) -> None:
        self._rule = rule_parser or RuleBasedReceiptParser()
        self._groq = groq_provider or GroqVisionProvider()

    def parse(self, text: str, existing_types: Sequence[ExpenseType]) -> ReceiptParseResponse:
        return self._rule.parse(text, existing_types)

    def parse_text(self, text: str, existing_types: Sequence[ExpenseType]) -> ReceiptParseResponse:
        """Parse pasted/typed receipt text via Groq AI with rule-based fallback."""
        from app.services.receipt_text import ReceiptTextParser

        text_parser = ReceiptTextParser(rule_parser=self._rule, groq_provider=self._groq)
        return text_parser.parse_text(text, existing_types)

    def parse_image(
        self,
        image_bytes: bytes,
        existing_types: Sequence[ExpenseType],
        scan_mode: str = "both",
    ) -> ReceiptParseResponse:
        from app.services.ocr import OCRUnavailableError, get_ocr_provider

        mode = (scan_mode or "both").strip().lower()
        if mode not in {"ocr", "groq", "both"}:
            mode = "both"

        ocr = get_ocr_provider()
        has_ocr = ocr.is_available()
        has_groq = self._groq.is_available()

        if not has_ocr and not has_groq:
            raise OCRUnavailableError(
                "Receipt image analysis is currently unavailable on this server. "
                "Please paste receipt text manually or enter expenses directly."
            )

        # ------------------------------------------------------------------
        # OCR-only mode
        # ------------------------------------------------------------------
        if mode == "ocr":
            if has_ocr:
                extracted_text = ocr.extract_text(image_bytes)
                return self._rule.parse(extracted_text, existing_types)
            if has_groq:
                try:
                    ai = self._groq.analyze_receipt(image_bytes)
                    res = _ai_only_response(ai, existing_types)
                    res.warnings = [
                        "Local OCR engine is not installed on this server; processed using Groq AI vision."
                    ] + list(res.warnings)
                    return res
                except GroqVisionError as exc:
                    raise OCRUnavailableError(
                        f"Local OCR is not installed and Groq Vision analysis failed: {exc}"
                    ) from exc
            raise OCRUnavailableError(
                "Local OCR engine is not installed on this server. "
                "Please paste receipt text manually or enter expenses directly."
            )

        # ------------------------------------------------------------------
        # Groq-only mode
        # ------------------------------------------------------------------
        if mode == "groq":
            if has_groq:
                try:
                    ai = self._groq.analyze_receipt(image_bytes)
                    return _ai_only_response(ai, existing_types)
                except GroqVisionError as exc:
                    logger.warning("Groq Vision failed in groq mode: %s", exc)
                    if has_ocr:
                        extracted_text = ocr.extract_text(image_bytes)
                        res = self._rule.parse(extracted_text, existing_types)
                        res.warnings = [
                            f"Groq Vision unavailable ({exc}); fell back to local Tesseract OCR."
                        ] + list(res.warnings)
                        return res
                    raise OCRUnavailableError(
                        f"Receipt analysis failed ({exc}). Please paste receipt text manually or enter expenses directly."
                    ) from exc
            if has_ocr:
                extracted_text = ocr.extract_text(image_bytes)
                res = self._rule.parse(extracted_text, existing_types)
                res.warnings = [
                    "Groq is not configured; fell back to local Tesseract OCR."
                ] + list(res.warnings)
                return res
            raise OCRUnavailableError(
                "Groq is not configured and local OCR is not installed. "
                "Please paste receipt text manually or enter expenses directly."
            )

        # ------------------------------------------------------------------
        # Both mode: Groq Vision primary, OCR merged if available
        # ------------------------------------------------------------------
        if has_groq:
            ai_data = None
            ai_exc = None
            try:
                ai_data = self._groq.analyze_receipt(image_bytes)
            except GroqVisionError as exc:
                ai_exc = exc
                logger.warning("Groq Vision failed in both mode: %s", exc)

            if ai_data is not None:
                if has_ocr:
                    try:
                        extracted_text = ocr.extract_text(image_bytes)
                        rule_result = self._rule.parse(extracted_text, existing_types)
                        merged = _merge_results(rule_result, ai_data, existing_types)
                        merged.scan_method = "hybrid"
                        return merged
                    except Exception as ocr_err:
                        logger.warning("OCR step failed in hybrid mode: %s", ocr_err)
                return _ai_only_response(ai_data, existing_types)

            # Groq failed: fall back to OCR if available
            if has_ocr:
                extracted_text = ocr.extract_text(image_bytes)
                res = self._rule.parse(extracted_text, existing_types)
                res.warnings = [
                    f"Groq Vision unavailable ({ai_exc}); fell back to local Tesseract OCR."
                ] + list(res.warnings)
                return res

            raise OCRUnavailableError(
                f"Receipt analysis failed ({ai_exc}). Please paste receipt text manually or enter expenses directly."
            )

        # Groq not available, but OCR is available:
        if has_ocr:
            extracted_text = ocr.extract_text(image_bytes)
            res = self._rule.parse(extracted_text, existing_types)
            res.warnings = [
                "Groq Vision is not configured; using local OCR only."
            ] + list(res.warnings)
            return res

        raise OCRUnavailableError(
            "Receipt analysis is currently unavailable on this server. "
            "Please paste receipt text manually or enter expenses directly."
        )


_DEFAULT_PARSER: BaseReceiptParser = AIReceiptParser()

_DEFAULT_CLASSIFIER: TypeClassifier = TypeClassifier()


def _apply_type_classification(
    result: ReceiptParseResponse,
    existing_types: Sequence[ExpenseType],
    category_hint: str | None = None,
) -> None:
    """Run the type classifier and update the result in place.

    Only acts when no existing type is already bound, so a confident
    existing-type match from the merge/rule step is never overridden.
    Backend learnings are intentionally empty here (no DB session available
    at this layer); frontend-side learnings via localStorage handle user
    preferences. The classifier still works with deterministic rules + AI.
    """
    if result.suggested_expense_type_id is not None:
        return

    description = result.note or result.merchant or ""
    if result.raw_text:
        description = f"{description}\n{result.raw_text}".strip()
    line_items = [
        {"name": it.name, "amount_paise": it.amount_paise, "quantity": it.quantity}
        for it in (result.items or [])
    ]

    classification = _DEFAULT_CLASSIFIER.classify(
        merchant=result.merchant,
        description=description,
        line_items=line_items,
        existing_types=existing_types,
        category_hint=category_hint,
    )

    suggested_name = classification.get("suggested_name")
    existing_type_id = classification.get("existing_type_id")
    match_type = classification.get("match_type")

    if match_type == "exact" and existing_type_id is not None:
        matched = next((et for et in existing_types if et.id == existing_type_id), None)
        if matched is not None:
            result.suggested_expense_type_id = matched.id
            result.suggested_expense_type_name = matched.name
            result.suggested_new_type_name = None
    elif match_type == "new" and suggested_name:
        result.suggested_new_type_name = suggested_name
        result.suggested_expense_type_id = None
        result.suggested_expense_type_name = None

    if match_type in ("exact", "new"):
        result.warnings = [
            w for w in (result.warnings or [])
            if "No matching expense type found" not in w
        ]
