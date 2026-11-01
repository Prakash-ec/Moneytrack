# Master Implementation Plan: Income, Bank Balance & Automatic Transaction Intelligence

## Overview
Transform MoneyTrack into an intelligent personal finance system with:
1. Bank Accounts Architecture (multiple accounts, masked number suffix, opening & calculated balances, balance history).
2. Income Management (income types, income tracking, cash & bank linked, analytics).
3. Internal Transfers between own accounts (neutral to net worth, excluded from income/expense).
4. Automatic Bank SMS Credit/Debit & Balance Engine (Android Kotlin parser enhancement + backend ingestion).
5. Account Reconciliation (calculated vs bank-reported available balances).
6. 3D Fintech Virtual Card enhancement on Dashboard (total balance, income updates, hide/show toggle, accounts breakdown).
7. Comprehensive Analytics (Income vs Expenses, Net Cash Flow, Savings Rate, Payment Method breakdown).
8. New Frontend Pages (Income, Bank Accounts, Transfers) and navigation integration.
9. Full Verification (Backend tests, Frontend tests, Android tests, APK build).

---

## Phases & Execution Order

### Phase 1: Data Architecture & Database Migration
- Define SQLAlchemy models in `backend/app/models/`:
  - `BankAccount` (`app/models/bank_account.py`)
  - `IncomeType` (`app/models/income_type.py`)
  - `Income` (`app/models/income.py`)
  - `AccountTransfer` (`app/models/account_transfer.py`)
  - `BalanceSnapshot` (`app/models/balance_snapshot.py`)
  - Update `Expense` with nullable `account_id`
- Alembic Migration `0004_income_and_bank_accounts.py`:
  - Safe additive migration.
  - Zero disruption to existing expenses and types.
- Seed default active income types.

### Phase 2: Backend Services & REST APIs
- Pydantic schemas in `backend/app/schemas/`:
  - `bank_account.py`, `income.py`, `income_type.py`, `transfer.py`, `balance.py`
- Services in `backend/app/services/`:
  - `bank_accounts.py` (CRUD, balance recalculation, reconciliation)
  - `incomes.py` (CRUD, category filtering, idempotency)
  - `transfers.py` (internal transfers, double-entry verification)
  - `cashflow.py` (net cash flow, savings rate, combined metrics)
  - `sms_ingest.py` (credit/debit transaction classification & auto-link)
- API Routes in `backend/app/api/routes/`:
  - `/bank-accounts`
  - `/income-types`
  - `/incomes`
  - `/transfers`
  - `/analytics/cashflow`
  - `/analytics/net-worth`
  - `/sms/ingest`
- Include in `backend/app/api/router.py`.

### Phase 3: Android SMS Parser & Classifier Expansion
- Extend `SmsParser.kt` & `SmsTransaction.kt`:
  - Extract `availableBalancePaise` (explicit bank balance from "Avail Bal", "Bal INR", etc.).
  - Extract `direction` (CREDIT, DEBIT, TRANSFER, UNKNOWN).
  - Extract `bankName` (SBI, HDFC, ICICI, Axis, Kotak, Canara, Baroda, Union, IDFC, etc.).
  - Extract `accountSuffix` (masked account number like "XX1234").
  - Support credit patterns: UPI received, salary, IMPS/NEFT, refund, interest.
  - Support debit patterns: UPI payment, ATM, card, POS, bill, recharge.
- Extend `SyncWorker.kt` & `SmsPlugin.kt`:
  - Ingest both credits and debits to backend.
  - Send balance reports and account suffixes.
  - Update local state and trigger refresh events.

### Phase 4: Frontend State & API Integration
- TypeScript types in `frontend/src/types/api.ts`:
  - `BankAccount`, `Income`, `IncomeType`, `AccountTransfer`, `CashFlowSummary`, `NetWorthResponse`
- API client methods in `frontend/src/services/api.ts`.
- Navigation updates in `AppLayout.tsx`:
  - Add Income, Bank Accounts, Transfers to sidebar and mobile navigation.

### Phase 5: UI/UX Implementation & 3D Balance Card
- Redesign `FintechCard3D.tsx`:
  - Total combined bank balance with hide/show toggle.
  - Live income update badge when credit/balance detected.
  - Linked accounts count & quick switcher.
  - Reconciliation alert if bank reported balance differs from calculated.
- Redesign Dashboard (`HomePage.tsx`):
  - Net cash flow meter (`Total Income - Total Expenses`).
  - Savings rate badge (`(Net Cash Flow / Income) * 100`).
  - Cash flow trend chart.
- Create Pages:
  - `IncomePage.tsx` (income ledger, add/edit modal, search, categories).
  - `BankAccountsPage.tsx` (accounts list, create/edit account, opening balance, reconciliation).
  - `TransfersPage.tsx` (internal transfers between own accounts).
- Integrate with Breakdown & Trends:
  - Income analytics and net savings comparisons.

### Phase 6: Automated Testing & Verification
- Backend pytest: new tests for accounts, income, transfers, cashflow, SMS ingestion.
- Frontend vitest: tests for currency, income parsing, balance cards.
- Android tests: SMS parser credit/debit/balance extraction unit tests.
- Database safety verification.

### Phase 7: Production Build & APK Generation
- `npm run build`
- `npx cap sync android`
- `gradlew assembleDebug`
- Copy to `release/MoneyTrack.apk`.
- Completion report in `INCOME_BANK_BALANCE_COMPLETION_REPORT.md`.
