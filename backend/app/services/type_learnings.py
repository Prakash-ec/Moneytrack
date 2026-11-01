"""Expense-type learnings service.

Tracks confirmed merchant -> expense-type selections so the classifier can
"learn" from the user's choices and prioritise previously confirmed types.

Learnings are stored per merchant (normalised) -> type name. On the frontend
they live in localStorage; on the backend they are derived from existing
expense records (merchant + expense_type pairs) so no schema migration is
required.
"""

from __future__ import annotations

import re
from typing import Any, Sequence

from app.models.expense_type import ExpenseType


def _normalize_name(name: str) -> str:
    cleaned = " ".join((name or "").split()).casefold().strip()
    cleaned = re.sub(r"[&\.\-]+$", "", cleaned).strip()
    return cleaned


def build_learnings(
    expenses: Sequence[Any], existing_types: Sequence[ExpenseType]
) -> dict[str, str]:
    """Build a merchant -> type-name mapping from past expenses.

    Scans existing expenses and records, for each merchant, the expense type
    name most frequently confirmed by the user. Returns a dict mapping
    normalised merchant -> type name.
    """
    type_by_id = {et.id: et for et in existing_types}
    merchant_type_counts: dict[str, dict[str, int]] = {}

    for expense in expenses:
        merchant = getattr(expense, "merchant", None) or ""
        type_id = getattr(expense, "expense_type_id", None)
        if not merchant or type_id is None:
            continue
        etype = type_by_id.get(type_id)
        if etype is None:
            continue
        m_key = _normalize_name(merchant)
        if not m_key:
            continue
        buckets = merchant_type_counts.setdefault(m_key, {})
        buckets[etype.name] = buckets.get(etype.name, 0) + 1

    learnings: dict[str, str] = {}
    for merchant, counts in merchant_type_counts.items():
        learnings[merchant] = max(counts, key=counts.get)

    return learnings


def apply_learnings_to_candidates(
    candidates: list[tuple[str, str, float]],
    merchant: str | None,
    learnings: dict[str, str],
) -> list[tuple[str, str, float]]:
    """Boost candidates that match previously confirmed learnings.

    If the user has previously confirmed a type for this merchant, that
    suggestion is boosted to the top so it is preferred over generic rules.
    """
    if not merchant:
        return candidates
    m_key = _normalize_name(merchant)
    learned_type = learnings.get(m_key)
    if not learned_type:
        return candidates

    boosted: list[tuple[str, str, float]] = []
    for source, name, confidence in candidates:
        if _normalize_name(name) == _normalize_name(learned_type):
            boosted.append((source, name, min(confidence + 0.10, 0.99)))
        else:
            boosted.append((source, name, confidence))

    boosted.sort(key=lambda c: c[2], reverse=True)
    return boosted
