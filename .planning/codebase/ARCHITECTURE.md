<!-- refreshed: 2026-10-28 -->
# Architecture

**Analysis Date:** 2026-10-28

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Client Layer (Browser & Android)                      │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│    Web SPA (React 18)    │   Capacitor Mobile App   │  Native SMS Receiver  │
│     `frontend/src/`      │   `android/app/src/`     │  `android/.../sms/`   │
└────────────┬─────────────┴────────────┬─────────────┴───────────┬───────────┘
             │                          │                         │
             ▼                          ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     API Gateway & Routing Layer (FastAPI)                   │
│                     `backend/app/main.py`, `backend/app/api/`               │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│   Expenses & Types API   │    Analytics & Budgets   │   Receipt & SMS API   │
│   `api/routes/expenses`  │   `api/routes/analytics` │   `api/routes/receipts`
└────────────┬─────────────┴────────────┬─────────────┴───────────┬───────────┘
             │                          │                         │
             ▼                          ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Domain Service Layer                            │
│                         `backend/app/services/`                             │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│   Expenses & Budgets     │    Analytics & Periods   │   OCR, Groq Vision &  │
│   `services/expenses.py` │   `services/analytics.py`│   Receipt Text Parser │
└────────────┬─────────────┴────────────┬─────────────┴───────────┬───────────┘
             │                          │                         │
             ▼                          ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Persistence Layer (SQLAlchemy 2.0 ORM)                   │
│                `backend/app/models/`, `backend/app/db/session.py`           │
├─────────────────────────────────────────────────────────────────────────────┤
│         Local SQLite Database (WAL Mode, Foreign Keys, Paise Storage)        │
│                         `backend/data/moneytrack.db`                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **FastAPI Application** | Bootstraps middleware, routing, SPA static file serving, and exception handlers | `backend/app/main.py` |
| **API Router** | Aggregates all modular REST endpoints under `/api` | `backend/app/api/router.py` |
| **Expenses Service** | CRUD operations, validation, search, sorting, and pagination for transactions | `backend/app/services/expenses.py` |
| **Expense Types Service** | Manages reusable spending categories, uniqueness keys, and soft archival | `backend/app/services/expense_types.py` |
| **Analytics Service** | Period totals, period comparisons, type breakdowns, recurring detection, and trend points | `backend/app/services/analytics.py` |
| **Budgets Service** | Monthly overall budget limits and per-category budget tracking with alert thresholds | `backend/app/services/budgets.py` |
| **Receipt Parser Service** | Rule-based and AI-assisted extraction of merchants, dates, totals, taxes, and items | `backend/app/services/receipt_parser.py` |
| **Groq Vision Service** | Cloud vision/LLM integration using Qwen models for complex receipt extraction | `backend/app/services/groq_vision.py` |
| **OCR Service** | Local offline Tesseract execution with byte validation and streaming | `backend/app/services/ocr.py` |
| **Exports & Backup Service** | CSV transaction exports and atomic, transactional JSON backup restoration with deduplication | `backend/app/services/exports.py` |
| **Database Session** | SQLite engine creation, connection pooling, and session dependency generator | `backend/app/db/session.py` |
| **React App & Providers** | Client-side routing, global theme, toast alerts, data refresh signals, and dialog management | `frontend/src/App.tsx`, `frontend/src/providers/` |
| **API Client** | Typed HTTP requests to backend REST API with error mapping | `frontend/src/services/api.ts` |
| **SMS Plugin Client** | Bridge to native Android Capacitor SMS reading and transaction staging | `frontend/src/services/sms.ts` |

## Pattern Overview

**Overall:** Clean Layered Architecture (Presentation -> API Controllers -> Domain Services -> ORM Data Access).

**Key Characteristics:**
- **Strict Separation of Concerns:** Database models do not know about HTTP requests; controllers delegate all business logic to service modules.
- **Local-First & Offline Resilience:** SQLite runs entirely on the host machine; frontend service worker caches UI shell for offline operation.
- **Integer Paise Financial Representation:** Monetary amounts are stored as 64-bit integers representing 1/100th of an Indian Rupee (paise), preventing IEEE 754 floating-point inaccuracies.
- **Reactive Cache Invalidation:** Frontend avoids stale data through a unified `RefreshProvider` context that triggers query re-fetching across open views when mutations occur.

## Layers

**1. Presentation Layer (Frontend):**
- Purpose: Delivers accessible, responsive, dark/light theme user interfaces for tracking expenditure.
- Location: `frontend/src/`
- Contains: React components, pages, custom hooks, Tailwind CSS, Recharts visualizations.
- Depends on: Backend REST API (`frontend/src/services/api.ts`).

**2. API Routing Layer (Backend):**
- Purpose: Request deserialization, schema validation, HTTP response encoding, and status codes.
- Location: `backend/app/api/routes/`
- Contains: FastAPI router functions and endpoint schemas.
- Depends on: Pydantic schemas and service functions.

**3. Domain Service Layer:**
- Purpose: Encapsulates all financial business rules, period calculations, receipt parsing, and database transactions.
- Location: `backend/app/services/`
- Contains: Pure Python business logic functions and service classes.
- Depends on: SQLAlchemy ORM models, Pydantic schemas, and third-party helpers (Groq/Tesseract).

**4. Data Access Layer:**
- Purpose: Object-relational mapping, schema constraints, indexing, and connection lifecycle.
- Location: `backend/app/models/`, `backend/app/db/`
- Contains: Declarative models (`Expense`, `ExpenseType`, `Budget`, `CategoryBudget`, `ExpenseIdempotencyKey`).
- Depends on: SQLite driver and SQLAlchemy.

## Data Flow

### Primary Request Path (Adding an Expense)

1. **User Submission (`frontend/src/components/ExpenseForm.tsx`):**
   - User inputs amount, date, category, note, and payment method.
   - Form validates client-side with Zod schema (`amount > 0`, date format, character limits).
   - Amount in rupees is converted to integer paise via `parseRupeesToPaise`.
2. **API Request (`frontend/src/services/api.ts`):**
   - Calls `POST /api/expenses` with JSON payload `ExpenseCreateInput`.
3. **Route Handling (`backend/app/api/routes/expenses.py`):**
   - FastAPI parses request into `ExpenseCreate` Pydantic model.
   - Injects database session via `Depends(get_db)`.
4. **Service Execution (`backend/app/services/expenses.py`):**
   - Verifies the referenced `expense_type_id` exists and is active.
   - Instantiates `Expense` model and commits transaction to SQLite.
5. **Response & Invalidation:**
   - Returns serialized `ExpenseRead` schema.
   - Frontend calls `invalidate()` from `useDataRefresh()`, triggering automatic re-fetch of summary, trends, and transaction list queries.

### Receipt Scanning Flow

1. **Capture / Input (`frontend/src/components/ReceiptScannerModal.tsx`):**
   - Image captured via camera or selected from disk (or raw text pasted).
2. **Parsing Request (`POST /api/receipts/parse`):**
   - Validates file format (JPEG, PNG, WebP) and size (<10MB).
   - Checks OCR options: tries Groq vision or falls back to local Tesseract OCR streaming.
   - `RuleBasedReceiptParser` extracts merchant, date, total, subtotal, tax, items, and matches to existing user categories.
3. **Interactive Review (`frontend/src/components/ExpenseForm.tsx`):**
   - Form opens pre-filled in review mode with confidence badges and warning banners.
   - **Crucial:** Record is NEVER auto-saved; user must click "Confirm & save expense".

## Key Abstractions

**Integer Paise Currency (`app.core.money` & `utils/currency.ts`):**
- Purpose: Safe financial representation without floating point rounding errors.
- Examples: `100.50` INR is stored as `10050` paise.

**Date Period Resolution (`app.services.periods` & `utils/periods.ts`):**
- Purpose: Timezone-aware date interval resolution defaulting to `Asia/Kolkata` for daily, monthly, yearly, and custom ranges.

**OCR & Vision Engine Abstraction (`app.services.ocr` & `app.services.groq_vision`):**
- Purpose: Swappable receipt intelligence providers (Local Tesseract vs Groq Cloud AI vs Mock in tests).

## Entry Points

- **Development Server:** `start-dev.ps1` (Launches Vite on port 5173 and FastAPI on port 8000).
- **Production Server:** `start-prod.ps1` (Compiles frontend and serves both API and static files via Uvicorn on port 8000).
- **Backend Application:** `backend/app/main.py:app`.
- **Frontend SPA:** `frontend/src/main.tsx` mounting `App.tsx`.
- **Android Entry Point:** `android/app/src/main/java/com/moneytrack/app/MainActivity.java`.

## Architectural Constraints

- **Single-User / Local Storage:** No public login; access restricted to local machine or private trusted network.
- **SQLite Concurrency:** Uses Write-Ahead Logging (WAL) and 5000ms busy timeout to prevent database lock contention.
- **Zero Auto-Save for Machine Ingestion:** Scanned receipts and incoming SMS messages always require explicit user review and confirmation before being persisted as official financial transactions.
- **Integrity Constraints:** Database enforces `CheckConstraint("amount_paise > 0")` and unique case-folded names for expense types.

## Anti-Patterns

### Floating-Point Currency Math
**What happens:** Using JavaScript/Python standard `float` for money arithmetic (e.g. `0.1 + 0.2 = 0.30000000000000004`).
**Why it's wrong:** Introduces accumulated precision loss and ledger reconciliation discrepancies.
**Do this instead:** Store and compute all values as integer paise (`amount_paise`), converting to display strings only at UI boundaries via `formatINR()`.

### Bypassing Service Transactions
**What happens:** Performing ad-hoc `db.add()` and `db.commit()` directly inside API route controllers.
**Why it's wrong:** Violates separation of concerns, makes testing cumbersome, and risks partial uncommitted state.
**Do this instead:** Put all domain mutations inside `backend/app/services/` functions with clear transaction rollbacks.

## Error Handling

- **Domain Exceptions:** Services raise custom exceptions (`NotFoundError`, `ConflictError`, `PeriodError`, `OCRUnavailableError`).
- **Global Handlers:** Configured in `backend/app/main.py` to translate domain errors into uniform JSON error payloads with standard HTTP status codes.
- **Frontend Graceful Fallback:** Catches API errors, surfaces toasts via `useToast()`, and renders non-blocking retryable error states via `<ErrorState>`.

---

*Architecture analysis: 2026-10-28*
