"""AI-powered expense-type suggestion and matching.

Separates concerns:
1. Generate candidate expense-type names from transaction context
   (deterministic rules + Groq AI + user learnings).
2. Match candidates against existing expense types using normalized
   exact matching and singular/plural tolerance.
3. Return a suggestion: reuse an existing type, or propose a new one.

Nothing is saved automatically; the caller decides whether to create
or reuse a type. All user-provided text and model output is treated
as untrusted and is validated on the backend.
"""

from __future__ import annotations

import re
from typing import Any, Sequence

from app.models.expense_type import ExpenseType
from app.services.groq_vision import GroqVisionError, GroqVisionProvider
from app.services.type_learnings import apply_learnings_to_candidates, build_learnings


def _normalize_name(name: str) -> str:
    """Collapse whitespace, casefold, and strip trailing punctuation."""
    cleaned = " ".join(name.split()).casefold().strip()
    cleaned = re.sub(r"[&\.\-]+$", "", cleaned).strip()
    return cleaned


def _strip_plural(name: str) -> str:
    """Remove a single trailing 's' for basic singular/plural tolerance."""
    n = _normalize_name(name)
    if len(n) > 2 and n.endswith("s"):
        return n[:-1]
    return n


# Category -> suggested type name (deterministic fast path for obvious cases).
_CATEGORY_TYPE_HINTS: dict[str, str] = {
    "food": "Food & Dining",
    "travel": "Transportation",
    "utilities": "Utilities",
    "education": "Education",
    "shopping": "Shopping",
    "health": "Medical",
    "entertainment": "Entertainment",
    "housing": "Rent & Maintenance",
    "other": "Other",
}


# Merchant keyword -> suggested type name (deterministic fast path).
_MERCHANT_TYPE_HINTS: dict[str, str] = {
    "jio": "Mobile Recharge",
    "airtel": "Mobile Recharge",
    "vodafone": "Mobile Recharge",
    "vi": "Mobile Recharge",
    "bsnl": "Mobile Recharge",
    "recharge": "Mobile Recharge",
    "petrol": "Fuel",
    "diesel": "Fuel",
    "cng": "Fuel",
    "fuel": "Fuel",
    "electricity": "Electricity Bill",
    "bescom": "Electricity Bill",
    "tneb": "Electricity Bill",
    "bill desk": "Utilities",
    "uber": "Transportation",
    "ola": "Transportation",
    "bus": "Transportation",
    "metro": "Transportation",
    "taxi": "Transportation",
    "cab": "Transportation",
    "restaurant": "Food & Dining",
    "cafe": "Food & Dining",
    "coffee": "Food & Dining",
    "pharmacy": "Medical",
    "medical": "Medical",
    "hospital": "Medical",
    "clinic": "Medical",
    "college": "Education",
    "school": "Education",
    "tuition": "Education",
    "rent": "Rent & Maintenance",
    "maintenance": "Rent & Maintenance",
    "netflix": "Subscriptions",
    "spotify": "Subscriptions",
    "prime video": "Subscriptions",
    "swiggy": "Food & Dining",
    "zomato": "Food & Dining",
    "amazon": "Shopping",
    "flipkart": "Shopping",
}


class TypeClassifier:
    """Suggests an expense type for a transaction and matches against existing types."""

    def __init__(
        self,
        groq_provider: GroqVisionProvider | None = None,
        learnings: dict[str, str] | None = None,
    ) -> None:
        self._groq = groq_provider or GroqVisionProvider()
        self._learnings = learnings or {}

    # ------------------------------------------------------------------ #
    # Public entry point
    # ------------------------------------------------------------------ #
    def classify(
        self,
        merchant: str | None,
        description: str | None,
        line_items: list[dict[str, Any]] | None,
        existing_types: Sequence[ExpenseType],
        category_hint: str | None = None,
    ) -> dict[str, Any]:
        """Return a type suggestion.

        Result shape::
            {
                "suggested_name": str | None,   # proposed type name (may be new)
                "existing_type_id": int | None,  # id if matched to an existing type
                "confidence": float,             # 0.0-1.0
                "match_type": "exact" | "new" | None,
            }
        """
        candidates: list[tuple[str, str, float]] = []  # (source, name, confidence)

        # 1. Deterministic merchant keyword hint (high confidence, obvious cases).
        # Check both merchant and description so the rule still fires when the
        # merchant field is missing but the original text contains a keyword
        # (e.g. pasted SMS text).
        search_blob = " ".join(
            part.strip().casefold()
            for part in (merchant or "", description or "")
            if part
        )
        if search_blob:
            for keyword, type_name in _MERCHANT_TYPE_HINTS.items():
                # Match whole words only so short keywords such as "vi" do
                # not accidentally fire inside unrelated words like "via".
                if re.search(r"\b" + re.escape(keyword) + r"\b", search_blob):
                    candidates.append(("rule", type_name, 0.90))
                    break

        # 2. Deterministic category hint.
        if category_hint:
            cat = category_hint.strip().casefold()
            if cat in _CATEGORY_TYPE_HINTS:
                candidates.append(("rule", _CATEGORY_TYPE_HINTS[cat], 0.85))

        # 3. Boost previously confirmed learnings.
        candidates = apply_learnings_to_candidates(candidates, merchant, self._learnings)

        # 4. AI suggestion for unfamiliar cases (only when rules didn't already
        #    produce a high-confidence match).
        if self._groq.is_available() and not any(c[2] >= 0.90 for c in candidates):
            suggest_fn = getattr(self._groq, "suggest_type_name", None)
            if suggest_fn is not None:
                try:
                    ai_name = suggest_fn(
                        merchant, description, line_items, existing_types, category_hint
                    )
                    if ai_name:
                        candidates.append(("ai", ai_name, 0.75))
                except GroqVisionError:
                    # AI unavailable or failed; fall back to rules only.
                    pass

        # Build lookup of existing types by normalized name.
        existing_lookup: dict[str, ExpenseType] = {}
        for etype in existing_types:
            existing_lookup[_normalize_name(etype.name)] = etype

        # Try to match each candidate against existing types (best first).
        for _source, name, confidence in candidates:
            matched = self._match_against_existing(name, existing_lookup)
            if matched is not None:
                existing_type, match_confidence = matched
                return {
                    "suggested_name": existing_type.name,
                    "existing_type_id": existing_type.id,
                    "confidence": min(confidence, match_confidence),
                    "match_type": "exact",
                }

        # No existing match: return the best new-type suggestion.
        if candidates:
            # Prefer deterministic rules over AI for new suggestions.
            rule_candidates = [c for c in candidates if c[0] == "rule"]
            _source, name, confidence = (
                rule_candidates[0] if rule_candidates else candidates[0]
            )
            return {
                "suggested_name": name,
                "existing_type_id": None,
                "confidence": confidence,
                "match_type": "new",
            }

        return {
            "suggested_name": None,
            "existing_type_id": None,
            "confidence": 0.0,
            "match_type": None,
        }

    # ------------------------------------------------------------------ #
    # Matching helpers
    # ------------------------------------------------------------------ #
    def _match_against_existing(
        self, name: str, existing_lookup: dict[str, ExpenseType]
    ) -> tuple[ExpenseType, float] | None:
        """Match a suggested name against existing types.

        Handles exact (normalized) match and singular/plural variations.
        """
        norm = _normalize_name(name)
        if not norm:
            return None

        # Exact normalized match (case / whitespace / punctuation tolerant).
        if norm in existing_lookup:
            return existing_lookup[norm], 1.0

        # Singular/plural tolerance.
        stripped = _strip_plural(name)
        if stripped != norm:
            for key, etype in existing_lookup.items():
                if _strip_plural(key) == stripped:
                    return etype, 0.95

        return None
