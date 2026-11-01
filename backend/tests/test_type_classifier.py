"""Tests for the expense-type classifier service.

Covers deterministic matching (exact, case/whitespace, singular/plural),
AI-based suggestion for unfamiliar merchants, and Groq failure fallback.
No live Groq quota is consumed; all AI calls are mocked.
"""

from datetime import date
from typing import Any, Sequence
from unittest.mock import MagicMock

import pytest

from app.models.expense_type import ExpenseType
from app.services.type_classifier import TypeClassifier


class FakeGroqProvider:
    """Minimal Groq provider double used by the classifier tests."""

    def __init__(self, result: str | None = None, exc=None, available: bool = True):
        self.result = result
        self.exc = exc
        self.available = available
        self.calls: list[str] = []

    def is_available(self) -> bool:
        return self.available

    def suggest_type_name(
        self,
        merchant: str | None,
        description: str | None,
        line_items: list[dict[str, Any]] | None,
        existing_types: Sequence[ExpenseType],
        category_hint: str | None = None,
    ) -> str | None:
        self.calls.append(merchant or "")
        if self.exc is not None:
            raise self.exc
        return self.result


@pytest.fixture
def existing_types():
    return [
        ExpenseType(
            id=1,
            name="Mobile Recharge",
            name_key="mobile recharge",
            category="Utilities",
            color="#0284C7",
            icon="smartphone",
        ),
        ExpenseType(
            id=2,
            name="Bus Travel",
            name_key="bus travel",
            category="Travel",
            color="#4F46E5",
            icon="bus",
        ),
        ExpenseType(
            id=3,
            name="Food & Dining",
            name_key="food & dining",
            category="Food",
            color="#EA580C",
            icon="utensils",
        ),
    ]


# ---------------------------------------------------------------------------
# Deterministic exact matching (case / whitespace / punctuation)
# ---------------------------------------------------------------------------

def test_classify_exact_match_case_insensitive(existing_types):
    """Merchant 'jio' with existing 'Mobile Recharge' should reuse it."""
    groq = FakeGroqProvider(result="Mobile Recharge", available=True)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="Jio",
        description="Jio mobile recharge",
        line_items=[{"name": "Data Plan", "amount_paise": 1900, "quantity": 1}],
        existing_types=existing_types,
    )

    assert result["existing_type_id"] == 1
    assert result["suggested_name"] == "Mobile Recharge"
    assert result["match_type"] == "exact"
    assert result["confidence"] > 0


def test_classify_exact_match_whitespace(existing_types):
    """Existing type with surrounding whitespace/punctuation still matches."""
    groq = FakeGroqProvider(result="Mobile Recharge", available=True)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="  Jio  ",
        description=None,
        line_items=[],
        existing_types=existing_types,
    )
    assert result["existing_type_id"] == 1
    assert result["match_type"] == "exact"


# ---------------------------------------------------------------------------
# Singular/plural tolerance
# ---------------------------------------------------------------------------

def test_classify_singular_plural_match(existing_types):
    """'Mobile Recharges' (plural) should match existing 'Mobile Recharge'."""
    groq = FakeGroqProvider(result="Mobile Recharges", available=True)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="Jio",
        description=None,
        line_items=[],
        existing_types=existing_types,
    )
    assert result["existing_type_id"] == 1
    assert result["suggested_name"] == "Mobile Recharge"
    assert result["match_type"] == "exact"


# ---------------------------------------------------------------------------
# New type suggestion (no existing match)
# ---------------------------------------------------------------------------

def test_classify_suggests_new_type_when_no_match(existing_types):
    """Unfamiliar merchant with no existing type should propose a new name."""
    groq = FakeGroqProvider(result=None, available=False)  # Groq unavailable
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="Jio",
        description="Jio mobile recharge",
        line_items=[{"name": "Data Plan", "amount_paise": 1900, "quantity": 1}],
        existing_types=[existing_types[1]],  # only Bus Travel exists
    )
    # Deterministic merchant hint "jio" -> "Mobile Recharge"
    assert result["match_type"] == "new"
    assert result["suggested_name"] == "Mobile Recharge"
    assert result["existing_type_id"] is None
    assert result["confidence"] > 0


def test_classify_ai_suggests_new_type(existing_types):
    """Groq AI suggestion for unfamiliar type should be returned as new."""
    groq = FakeGroqProvider(result="Streaming Subscription", available=True)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="DisneyPlus",
        description="Monthly subscription",
        line_items=[],
        existing_types=existing_types,
    )
    assert result["match_type"] == "new"
    assert result["suggested_name"] == "Streaming Subscription"
    assert result["existing_type_id"] is None


# ---------------------------------------------------------------------------
# AI preference: existing type reused over new suggestion
# ---------------------------------------------------------------------------

def test_classify_ai_reuses_existing_type(existing_types):
    """If AI suggests a name matching an existing type, reuse it."""
    groq = FakeGroqProvider(result="mobile recharge", available=True)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="Jio",
        description=None,
        line_items=[],
        existing_types=existing_types,
    )
    assert result["existing_type_id"] == 1
    assert result["suggested_name"] == "Mobile Recharge"
    assert result["match_type"] == "exact"


# ---------------------------------------------------------------------------
# Groq failure fallback
# ---------------------------------------------------------------------------

def test_classify_groq_failure_falls_back_to_rules(existing_types):
    """Groq error must not crash; rules still produce a suggestion."""
    from app.services.groq_vision import GroqVisionError

    groq = FakeGroqProvider(result=None, exc=GroqVisionError("rate limited"), available=True)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="Jio",
        description=None,
        line_items=[],
        existing_types=[existing_types[1]],  # only Bus Travel
    )
    assert result["match_type"] == "new"
    assert result["suggested_name"] == "Mobile Recharge"


def test_classify_groq_unavailable_uses_rules_only(existing_types):
    """Groq unavailable must not prevent rule-based suggestion."""
    groq = FakeGroqProvider(result=None, available=False)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="Jio",
        description=None,
        line_items=[],
        existing_types=[existing_types[1]],
    )
    assert result["match_type"] == "new"
    assert result["suggested_name"] == "Mobile Recharge"


# ---------------------------------------------------------------------------
# No suggestion at all
# ---------------------------------------------------------------------------

def test_classify_no_suggestion_when_unknown(existing_types):
    """Completely unknown input with no rules/AI should return no suggestion."""
    groq = FakeGroqProvider(result=None, available=False)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="Xyzzy Corp",
        description=None,
        line_items=[],
        existing_types=existing_types,
    )
    assert result["match_type"] is None
    assert result["suggested_name"] is None
    assert result["existing_type_id"] is None


# ---------------------------------------------------------------------------
# Jio recharge example (₹19, Mobile Recharge)
# ---------------------------------------------------------------------------

def test_classify_jio_recharge_example(existing_types):
    """Jio recharge message should suggest Mobile Recharge and ₹19.00."""
    groq = FakeGroqProvider(result="Mobile Recharge", available=True)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="Jio",
        description="Recharge Successful! Plan Name: 19.00 Validity: 1Day",
        line_items=[{"name": "Data Plan", "amount_paise": 1900, "quantity": 1}],
        existing_types=[],  # no existing types -> new suggestion
    )
    assert result["match_type"] == "new"
    assert result["suggested_name"] == "Mobile Recharge"
    assert result["existing_type_id"] is None
    assert result["confidence"] > 0


def test_classify_jio_recharge_reuses_existing(existing_types):
    """If 'Mobile Recharge' already exists, Jio recharge reuses it."""
    groq = FakeGroqProvider(result="Mobile Recharge", available=True)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="Jio",
        description="Recharge Successful! Plan Name: 19.00",
        line_items=[{"name": "Data Plan", "amount_paise": 1900, "quantity": 1}],
        existing_types=existing_types,
    )
    assert result["existing_type_id"] == 1
    assert result["suggested_name"] == "Mobile Recharge"
    assert result["match_type"] == "exact"


def test_classify_phone_number_not_amount(existing_types):
    """Phone numbers / transaction IDs must not drive classification amounts."""
    # This is a guard on the rule-based amount parser, exercised via parse_text
    # integration tests. Here we just confirm the classifier ignores digits in
    # merchant names when matching.
    groq = FakeGroqProvider(result=None, available=False)
    classifier = TypeClassifier(groq_provider=groq)
    result = classifier.classify(
        merchant="9876543210",
        description=None,
        line_items=[],
        existing_types=existing_types,
    )
    assert result["match_type"] is None
