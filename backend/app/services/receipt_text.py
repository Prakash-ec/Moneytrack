"""Text-based receipt parsing.

Separates concerns for reuse by future input sources (pasted text today, SMS later):

1. Input normalization (trimming; length enforced at the route layer).
2. AI-based field extraction via Groq text completion (untrusted input).
3. Deterministic financial validation via the existing rule-based parser.
4. Expense-type classification against existing types (new-type suggestion).
5. Category normalization against existing expense types.

Nothing is saved automatically; this only returns a proposed expense for user review.
"""

from __future__ import annotations

from typing import Any, Sequence

import httpx

from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.schemas.receipt import ReceiptParseResponse
from app.services.groq_vision import GroqVisionError, GroqVisionProvider
from app.services.receipt_parser import (
    RuleBasedReceiptParser,
    _find_type_by_category,
    _merge_results,
)
from app.services.type_classifier import TypeClassifier
from app.services.type_learnings import build_learnings


class ReceiptTextParser:
    """Parses pasted/typed receipt text with Groq AI and a rule-based fallback."""

    def __init__(
        self,
        rule_parser: RuleBasedReceiptParser | None = None,
        groq_provider: GroqVisionProvider | None = None,
        type_classifier: TypeClassifier | None = None,
    ) -> None:
        self._rule = rule_parser or RuleBasedReceiptParser()
        self._groq = groq_provider or GroqVisionProvider()
        self._classifier = type_classifier or TypeClassifier(
            groq_provider=self._groq
        )

    def parse_text(
        self, text: str, existing_types: Sequence[ExpenseType]
    ) -> ReceiptParseResponse:
        """Extract proposed expense fields from raw receipt text.

        Returns a :class:`ReceiptParseResponse` with ``scan_method`` set to
        ``"AI text extraction"`` when Groq succeeded, or ``"ocr"`` when the
        local rule-based parser was used as a fallback. Nothing is persisted.
        """
        text = (text or "").strip()
        rule_result = self._rule.parse(text, existing_types)

        ai: dict[str, Any] | None = None
        groq_error: str | None = None
        if self._groq.is_available():
            try:
                ai = self._groq.analyze_receipt_text(text)
            except GroqVisionError as exc:
                ai = None
                groq_error = str(exc)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                ai = None
                groq_error = str(exc)

        if ai is not None:
            result = _merge_results(rule_result, ai, existing_types)
            result.scan_method = "AI text extraction"
            result.note = "Extracted via AI text extraction"
            result.raw_text = None
        else:
            # Local fallback: deterministic rule-based parsing only.
            result = rule_result
            result.scan_method = "ocr"
            result.raw_text = None
            if groq_error:
                result.warnings = [
                    f"Groq unavailable ({groq_error}); used local text parsing. "
                    "Please verify the extracted fields before saving."
                ] + list(result.warnings)

        # Classify / match the expense type against existing types, and propose
        # a new type name when no suitable existing type exists. Only run when
        # the merge/rule step did not already bind an existing type, so we never
        # override a confident existing-type match.
        ai_category = ai.get("suggested_category") if isinstance(ai, dict) else None
        if result.suggested_expense_type_id is None:
            self._apply_type_classification(
                result, existing_types, text, category_hint=ai_category
            )

        return result

    def _apply_type_classification(
        self,
        result: ReceiptParseResponse,
        existing_types: Sequence[ExpenseType],
        original_text: str | None = None,
        category_hint: str | None = None,
    ) -> None:
        """Run the type classifier and update the result in place.

        If the classifier matches an existing type, sets
        ``suggested_expense_type_id``/``suggested_expense_type_name``.
        If it proposes a new type, sets ``suggested_new_type_name``.
        """
        # Build learnings from past expenses so the classifier can prefer
        # previously confirmed merchant -> type mappings.
        learnings = build_learnings(
            self._get_past_expenses(), existing_types
        )
        # Honour an explicitly injected classifier (e.g. for tests or subclasses)
        # while still applying backend learnings when possible.
        classifier = self._classifier
        if classifier is None:
            classifier = TypeClassifier(groq_provider=self._groq)
        if hasattr(classifier, "_learnings"):
            classifier._learnings = learnings

        description = result.note or result.merchant or ""
        if original_text:
            description = f"{description}\n{original_text}".strip()
        line_items = [
            {"name": it.name, "amount_paise": it.amount_paise, "quantity": it.quantity}
            for it in (result.items or [])
        ]

        classification = classifier.classify(
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
            matched = next(
                (et for et in existing_types if et.id == existing_type_id),
                None,
            )
            if matched is not None:
                result.suggested_expense_type_id = matched.id
                result.suggested_expense_type_name = matched.name
                result.suggested_new_type_name = None
        elif match_type == "new" and suggested_name:
            result.suggested_new_type_name = suggested_name
            result.suggested_expense_type_id = None
            result.suggested_expense_type_name = None

        # Drop the stale "no matching type" warning once a suggestion is produced.
        if match_type in ("exact", "new"):
            result.warnings = [
                w for w in (result.warnings or [])
                if "No matching expense type found" not in w
            ]

    def _get_past_expenses(self) -> Sequence[Expense]:
        """Return past expenses for learning. Overridable by subclasses/tests."""
        return []
