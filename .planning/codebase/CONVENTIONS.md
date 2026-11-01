# Coding Conventions

**Analysis Date:** 2026-10-28

## Naming Patterns

**Files:**
- Backend Python files: lowercase `snake_case.py` (e.g., `receipt_parser.py`, `type_classifier.py`).
- Frontend React Components: `PascalCase.tsx` (e.g., `ExpenseForm.tsx`, `ReceiptScannerModal.tsx`).
- Frontend Hooks: `camelCase.ts` prefixed with `use` (e.g., `usePeriod.ts`, `useApiQuery.ts`).
- Frontend Utilities: `camelCase.ts` (e.g., `currency.ts`, `dates.ts`, `receipt.ts`).
- Android Kotlin/Java files: `PascalCase.kt` / `PascalCase.java` (e.g., `SmsParser.kt`, `MainActivity.java`).

**Functions & Methods:**
- Python: `snake_case()` (e.g., `calculate_summary()`, `get_receipt_parser()`). Private helpers prefixed with an underscore `_find_type_by_category()`.
- TypeScript: `camelCase()` (e.g., `formatINR()`, `parseRupeesToPaise()`, `handleAppendItemsToNote()`). Event handlers prefixed with `handle` or `on` (e.g., `onClose`, `onSubmit`, `handleFileChange`).

**Variables & Constants:**
- Local variables: `snake_case` in Python, `camelCase` in TypeScript.
- Top-level constants: `UPPER_SNAKE_CASE` (e.g., `MAX_RECEIPT_IMAGE_SIZE_BYTES`, `CATEGORY_OPTIONS`, `DEFAULT_TYPE_COLOR`).
- Boolean flags: Descriptive prefixes like `is_archived`, `isSubmitting`, `hasExpenses`, `loading`.

**Types & Schemas:**
- Pydantic models: `PascalCase` ending with action or role (e.g., `ExpenseCreate`, `ExpenseRead`, `ReceiptParseResponse`).
- TypeScript interfaces & types: `PascalCase` (e.g., `Expense`, `ReceiptItem`, `PeriodRange`).

## Code Style

**Formatting & Tooling:**
- TypeScript/JavaScript: Standard 2-space indentation, single quotes, no trailing semicolons, trailing commas in multi-line objects.
- Python: PEP 8 compliant, 4-space indentation, double quotes for strings, type annotations on all function signatures.

**Type Safety:**
- TypeScript: Strict type checking enabled (`strict: true` in `tsconfig.json`). Explicit interfaces for all API request and response payloads.
- Python: Modern Python 3.11+ type hints (`int | None = None`, `list[str]`, `dict[str, Any]`, `from __future__ import annotations`).

## Import Organization

**TypeScript Import Order:**
1. External core libraries (e.g. `react`, `react-dom`, `react-router-dom`)
2. Utility and third-party libraries (e.g. `lucide-react`, `zod`, `react-hook-form`, `recharts`)
3. Internal components (`@/components/...`, `@/layouts/...`)
4. Internal hooks & providers (`@/hooks/...`, `@/providers/...`)
5. Internal services & types (`@/services/...`, `@/types/...`)
6. Internal utilities (`@/utils/...`)

```typescript
import { useState, useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { useApiQuery } from '@/hooks/useApiQuery'
import { api } from '@/services/api'
import type { Expense } from '@/types/api'
import { formatINR } from '@/utils/currency'
```

**Python Import Order:**
1. Standard library imports (e.g. `datetime`, `pathlib`, `typing`, `subprocess`)
2. Third-party dependencies (e.g. `fastapi`, `sqlalchemy`, `pydantic`, `httpx`)
3. Local application imports (e.g. `app.core`, `app.db`, `app.models`, `app.schemas`, `app.services`)

```python
from datetime import date
from typing import Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.expense import Expense
from app.schemas.expense import ExpenseRead
from app.services import expenses as expense_service
```

**Path Aliases:**
- Frontend uses `@/` to reference `frontend/src/` (configured in both `tsconfig.json` and `vite.config.ts`). Relative `../../` paths across modules are discouraged.

## Error Handling

**Backend Services:**
- Raise typed custom exceptions inheriting from Python's base `Exception` (`NotFoundError`, `ConflictError`, `PeriodError`, `OCRUnavailableError`) defined in `backend/app/services/errors.py`.
- Do not let unhandled database exceptions leak raw SQL to clients.
- Handle transactional rollbacks (`db.rollback()`) within service mutation methods.

**Frontend Components:**
- Use `useToast` to surface actionable error messages to the user:
  ```typescript
  try {
    await api.deleteExpense(id)
    showToast({ title: 'Expense deleted', description: 'Transaction removed.' })
    invalidate()
  } catch (error) {
    showToast({
      title: 'Could not delete expense',
      description: error instanceof Error ? error.message : 'Please try again.',
      variant: 'error',
    })
  }
  ```
- Use `<ErrorBoundary>` at the root of the React tree to prevent white-screen crashes.

## Financial & Time Conventions

- **Money in Paise:** Never manipulate floats for money. All calculations (sums, subtotals, taxes, averages, percentages) operate on integers representing paise.
- **Timezone:** Always default financial reporting periods to Indian Standard Time (`Asia/Kolkata`).
- **Dates:** Store dates as ISO strings `YYYY-MM-DD` in database and APIs. Display to users using localized Indian formats (e.g., `28 Oct 2026`).

---

*Convention analysis: 2026-10-28*
