# Codebase Structure

**Analysis Date:** 2026-10-28

## Directory Layout

```
MoneyTrack/
├── .planning/                  # Project intelligence, specs, and codebase maps
│   └── codebase/               # High-level architecture and convention documents
├── android/                    # Capacitor Android native project
│   ├── app/                    # Main Android application module
│   │   ├── src/main/java/      # Native Kotlin/Java plugins (SMS receiver, sync worker)
│   │   └── src/test/java/      # Android native unit tests
│   └── capacitor.settings.gradle
├── backend/                    # FastAPI backend application
│   ├── .venv/                  # Python 3.11 virtual environment
│   ├── app/                    # Backend source code
│   │   ├── api/                # API routers and endpoints
│   │   │   └── routes/         # Modular route definitions
│   │   ├── core/               # Configuration, time, and money utilities
│   │   ├── db/                 # Database base class, types, and session factory
│   │   ├── models/             # SQLAlchemy declarative ORM models
│   │   ├── schemas/            # Pydantic validation and serialization models
│   │   └── services/           # Domain business logic and integration services
│   ├── data/                   # SQLite database files (moneytrack.db, backup)
│   ├── tests/                  # Pytest test suite
│   ├── alembic.ini             # Alembic migration configuration
│   ├── pytest.ini              # Pytest configuration
│   └── requirements.txt        # Python dependency manifest
├── docs/                       # Developer documentation (e.g. SETUP-WINDOWS.md)
├── frontend/                   # React 18 + Vite + Tailwind SPA
│   ├── public/                 # Static web assets, manifest, PWA service worker
│   │   └── icons/              # App icons and masks
│   ├── src/                    # Frontend source code
│   │   ├── components/         # Shared and feature UI components
│   │   │   ├── charts/         # Recharts wrappers (Donut, Trends, Breakdown)
│   │   │   └── ui/             # Atomic design components (Badge, Button, Modal, Card, FormControls)
│   │   ├── hooks/              # Custom React hooks (useApiQuery, usePeriod, useOnlineStatus)
│   │   ├── layouts/            # Layout components (AppLayout with Sidebar and FAB)
│   │   ├── pages/              # Routed pages (HomePage, ExpensesPage, BreakdownPage, SettingsPage, etc.)
│   │   ├── providers/          # React context providers (RefreshProvider, ThemeProvider, ToastProvider)
│   │   ├── services/           # API and native plugin clients (api.ts, sms.ts)
│   │   ├── types/              # TypeScript domain and API interfaces
│   │   └── utils/              # Helper utilities (currency, dates, periods, receipt helpers)
│   ├── package.json            # Node dependency manifest
│   ├── tailwind.config.js      # Tailwind design system configuration
│   ├── tsconfig.json           # TypeScript compiler configuration
│   └── vite.config.ts          # Vite build and proxy configuration
├── start-dev.ps1               # PowerShell dev script (launches Vite + FastAPI concurrently)
├── start-prod.ps1              # PowerShell production launcher (builds and serves SPA + API)
└── README.md                   # Project overview and setup instructions
```

## Directory Purposes

**`backend/app/api/routes/`:**
- Purpose: HTTP request endpoints, request body parsing, dependency injection, and status code mapping.
- Contains: `analytics.py`, `budgets.py`, `expenses.py`, `expense_types.py`, `exports.py`, `health.py`, `receipts.py`.

**`backend/app/services/`:**
- Purpose: Core application business logic, calculations, OCR, and database transaction handling.
- Key files: `analytics.py`, `budgets.py`, `expenses.py`, `expense_types.py`, `exports.py`, `groq_vision.py`, `ocr.py`, `periods.py`, `receipt_parser.py`, `receipt_text.py`.

**`backend/app/models/`:**
- Purpose: Database table definitions, indexes, relations, and database constraints.
- Key files: `expense.py`, `expense_type.py`, `budget.py`, `idempotency_key.py`.

**`frontend/src/pages/`:**
- Purpose: Full-screen views corresponding to application routes.
- Key files: `HomePage.tsx`, `ExpensesPage.tsx`, `BreakdownPage.tsx`, `TypesPage.tsx`, `TypeDetailPage.tsx`, `TrendsPage.tsx`, `SettingsPage.tsx`, `SmsReviewPage.tsx`.

**`frontend/src/components/`:**
- Purpose: Reusable UI widgets, modals, charts, and form controls.
- Key files: `ExpenseForm.tsx`, `ReceiptScannerModal.tsx`, `TypeFormDialog.tsx`, `PeriodPicker.tsx`, `StatCard.tsx`, `TransactionList.tsx`.

**`frontend/src/utils/`:**
- Purpose: Pure helper functions for formatting, validation, math, and date manipulation.
- Key files: `currency.ts`, `dates.ts`, `periods.ts`, `receipt.ts`, `typeOptions.ts`, `cn.ts`.

## Key File Locations

**Entry Points:**
- Backend API: `backend/app/main.py`
- Frontend SPA: `frontend/src/main.tsx`
- Development Script: `start-dev.ps1`
- Production Script: `start-prod.ps1`

**Configuration:**
- Backend Settings: `backend/app/core/config.py` and `backend/.env`
- Frontend Build Config: `frontend/vite.config.ts`
- Styling Tokens & Colors: `frontend/tailwind.config.js`
- Mobile Capacitor Config: `frontend/capacitor.config.ts`

**Core Business Logic:**
- Financial Calculations: `backend/app/services/analytics.py` & `frontend/src/utils/currency.ts`
- Period Resolution: `backend/app/services/periods.py` & `frontend/src/utils/periods.ts`
- Receipt OCR & AI Parsing: `backend/app/services/receipt_parser.py` & `backend/app/services/groq_vision.py`

**Testing:**
- Backend Test Suite: `backend/tests/` (run via `pytest`)
- Frontend Test Suite: `frontend/src/utils/*.test.ts` (run via `npx vitest run`)
- Android SMS Tests: `android/app/src/test/` (run via `./gradlew test`)

## Naming Conventions

**Files & Directories:**
- Python: `snake_case.py` (e.g., `receipt_parser.py`, `expense_types.py`)
- React Components & Pages: `PascalCase.tsx` (e.g., `ExpenseForm.tsx`, `HomePage.tsx`)
- Frontend Utilities & Hooks: `camelCase.ts` (e.g., `usePeriod.ts`, `currency.ts`, `dates.ts`)
- Test Files: Co-located `[name].test.ts` in frontend, prefixed `test_[module].py` in backend.

**Variables & Functions:**
- Python: `snake_case` for functions/variables, `PascalCase` for classes and Pydantic schemas.
- TypeScript: `camelCase` for functions/variables, `PascalCase` for components, types, and interfaces, `UPPER_SNAKE_CASE` for constants.

## Where to Add New Code

**New Expense Feature / API Route:**
- Backend Schema: Define request/response models in `backend/app/schemas/`.
- Backend Service: Implement business logic and DB transactions in `backend/app/services/`.
- Backend Route: Register endpoint in `backend/app/api/routes/` and include in `backend/app/api/router.py`.
- Backend Test: Add tests in `backend/tests/test_[feature].py`.
- Frontend API Client: Add client method to `frontend/src/services/api.ts`.
- Frontend UI: Update or create components in `frontend/src/components/` and pages in `frontend/src/pages/`.

**New UI Component:**
- Atomic / Generic Control: Add to `frontend/src/components/ui/` (e.g. `Button.tsx`, `Modal.tsx`).
- Feature / Domain Component: Add directly under `frontend/src/components/` (e.g. `BudgetProgressBar.tsx`).

**New Utility or Helper:**
- Frontend: Add pure function and co-located unit test in `frontend/src/utils/` (e.g. `math.ts` + `math.test.ts`).
- Backend: Add to `backend/app/core/` (if cross-cutting) or appropriate service module.

## Special Directories

**`backend/data/`:**
- Contains SQLite databases (`moneytrack.db` and backup `moneytrack.db.backup`).
- Not committed to version control; preserved and protected during updates.

**`frontend/dist/`:**
- Production build output generated by `npm run build`.
- Served directly by FastAPI when `SERVE_FRONTEND=True`.

---

*Structure analysis: 2026-10-28*
