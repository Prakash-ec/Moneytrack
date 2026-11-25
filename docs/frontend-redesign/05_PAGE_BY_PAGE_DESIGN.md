# 05 — Page-by-Page Design

Detailed redesign spec for every page. Each: purpose · current problems (IDs from audit) ·
new design · components · states · backend dependency · acceptance. All use `03_DESIGN_SYSTEM`.
Financial surfaces depend on correct definitions (transformation plan T13) — never design on
wrong numbers. Money always `formatINR`; never hide zero/negative; never fabricate insights.

## A. Overview / Dashboard (`/`)

**Purpose:** immediately communicate financial position.
**Current problems:** C5 masked balance, C6 false Reconciled, C7 mislabeled average, C14 mixed
bases, expenses-only recent/charts, clickable account divs, silent cashflow error (P26).
**New design:**
- **Balance hero** (the one memorable thing): large tabular "Available balance" figure;
  below it a quiet line distinguishing **Available (calculated)** vs **Reported by bank SMS**
  vs **Opening** (expandable explanation). Verified-status dot ONLY when reported exists and
  matches; otherwise "Not yet verified" (never false Reconciled). Show ₹0 and negatives truthfully.
- **This-month strip:** 3 compact stat cards — Inflow (+, positive), Outflow (−, danger),
  Net (signed). Numbers only, change-vs-last-month. One period label (IST).
- **Income vs expense** mini comparison (bars) — the second moment, smaller than hero.
- **Recent activity:** unified income+expense+transfer rows (direction icon + signed amount),
  link to /transactions. Not expenses-only.
- **Spending by category:** ranked list with thin bars (not a second equal donut). Link to analytics.
- **Quick actions:** Add expense / Add income / Transfer / Scan (sheet).
- **Financial health indicators** ONLY where data supports (e.g., savings rate from real
  income/expense; budget usage if budgets exist). No fabricated insights.
- Optional insight line: factual, computed ("Spending up 12% vs last month"), never invented.
**Components:** BalanceHero, StatCard, FlowBars, TransactionRow, CategoryRankList, QuickAddSheet,
PeriodPicker, VerifiedBadge.
**States:** PageSkeleton; ErrorState (include cashflow error); EmptyState (no transactions →
add first); offline banner.
**Backend:** cashflow summary (fix zero-balance C4, reconciliation C6 server-side), analytics.
Income analytics gap → show inflow from cashflow until backend income analytics exists (10).
**Acceptance:** AC-F5/F6/F7, AC-U5; balance truthful; ≤1 main chart; a11y.

## B. Transactions (`/transactions`)

**Purpose:** professional unified transaction management.
**Current problems:** C50 add affordance, C33 filter escalation, C34 page totals, C37 stale
banner, tabs no ARIA, duplicates.
**New design:**
- Tabs: All · Income · Expenses · Transfers (role=tablist, arrow keys). One list component.
- Toolbar: search (debounced, labeled), filters (category, account, method, amount range —
  **rupee-consistent**, fix C33), date-range (IST), sort. Active filters as removable chips.
- List: desktop table (sticky header, right-aligned tabular amounts, direction icon+sign);
  mobile card list. Day grouping with subtotals (from server where possible).
- Row → detail drawer: full fields, evidence (SMS ref/UTR), account, category; actions
  Edit / Reverse (if supported) / Delete (confirm). Reversal shows audit link.
- Pagination or incremental load; total uses **server period total** (fix C34).
- Add button always visible per tab (fix C50): Add income on Income tab, New transfer on Transfers.
**Components:** TransactionTable/TransactionRow, FilterSheet, DateRangePicker, AmountRangeInput,
TransactionDetailDrawer, ConfirmDialog, Pagination.
**States:** skeleton rows; empty (no results vs no data distinct); error+retry.
**Backend:** expenses/incomes/transfers list (pagination), transfers edit/delete (exists, wire),
reversal (model exists; API gap → 10). Idempotency on creates.
**Acceptance:** AC-FE4/FE5/FE7; search/filter/sort/pagination correct; mobile usable.

## C. Expenses (`/transactions?tab=expenses` + standalone redirect)

**Purpose:** clean expense management.
**Current problems:** C33 filter, C47 unfiltered total, export hidden mobile.
**New design:** overview stat (period expense total, net of refunds per U1), category chips,
add/edit expense sheet (ExpenseForm RHF+Zod preserved), history list, category analysis link,
date filter, clear amount presentation. Export visible on mobile (fixed auth C31).
**Components:** ExpenseForm, StatCard, CategoryRankList, TransactionRow, ExportButton.
**States:** full L/E/R. **Backend:** expenses CRUD, analytics by-type. **Acceptance:** AC-FE1/FE4.

## D. Income (`/transactions?tab=income` + standalone redirect)

**Purpose:** matching income management (same language as expenses).
**Current problems:** C34 page totals, C35 page reset, C57 fresh-instance blocked, no income-type UI.
**New design:** overview (period income total from server), income sources (types) management,
add/edit income sheet, history, monthly income analysis, search/filter. **If no income types,
inline "Create income source" prompt** (fix C57). Page resets on filter change (fix C35).
**Components:** IncomeForm (new, mirrors ExpenseForm), IncomeTypeManager, StatCard, TransactionRow.
**States:** full L/E/R; empty → create source + add income.
**Backend:** incomes CRUD, income-types CRUD (exists, wire UI), income analytics (gap → 10).
**Acceptance:** AC-FE5/FE7; income recordable on fresh instance.

## E. Budgets (`/budgets`) — NEW

**Purpose:** complete budget management (backend exists, no UI — C12).
**New design:**
- Month selector (IST). Overall monthly budget card: allocated, spent (net per U1), remaining,
  progress bar (solid accent; warning ≥80%, danger ≥100% + icon+text).
- Category budgets grid: each card category icon, allocated/spent/remaining, progress, edit.
- Create/edit budget sheet (amount, period, category). Empty state invites first budget.
- Overspend alerts list (derived from spent>allocated; backend alert endpoint gap → 10).
- Historical comparison: **only if backend adds endpoint** (10); otherwise omit, don't fabricate.
**Components:** BudgetCard, ProgressBar, BudgetFormSheet, MonthPicker, EmptyState.
**States:** no-budget empty; loading; error. **Backend:** budgets monthly/category/summary (exist);
alerts/historical (gap). **Acceptance:** budgets workflow E2E; overspend truthful; rollover Dec→Jan.

## F. Reports & Analytics (`/analytics`)

**Purpose:** informative financial analytics.
**Current problems:** C45 truncated breakdown, C46 payment labels, C44 bucket labels, C36 negative
net, expense-only backend, partial-period comparison (D7).
**New design:** views Overview · Trends · Categories · Weekly (tabs, ARIA).
- Income vs expense comparison (bars, positive/danger), savings trend (if data), spending trend
  (line/area, granularity-aware labels — fix C44), category breakdown (full aggregation — fix C45;
  correct payment-method labels — fix C46), weekly report (signed net — fix C36).
- Date filters (IST); export interface (fixed auth). Meaningful charts, readable mono labels,
  correct ₹ formatting. One main chart per view; secondary as lists.
**Components:** FlowBars, TrendChart, CategoryRankList, PaymentMethodList (fixed meta), WeeklyReport,
ExportButton, PeriodPicker.
**States:** full L/E/R; empty period. **Backend:** analytics (expense-only) + cashflow; income/savings
analytics gap → 10 (show what exists, label honestly). **Acceptance:** AC-FE5; charts accurate.

## G. SMS Automation & Review (`/sms-review`)

**Purpose:** MoneyTrack's signature feature — trustworthy SMS-to-ledger.
**Current problems:** C48 web confirm no-op, C17/P25 direction/parseFloat, D33 simulation postable,
P34 ignored response status, C22 notifications, C24/C25 retry (Android/backend).
**New design:**
- **Status header:** automation on/off, permission status (granted/denied + request), sync status
  (idle/syncing/failed), last sync. Clear, honest.
- **Pending review queue:** cards with amount, merchant, date, bank, balance, reference, detection
  evidence, classification badge. **Explicit direction selector: Debit / Credit / Can't tell**
  (never default; "Can't tell" keeps it in review — fix C17). Confirm requires direction.
- **Duplicate explanation:** when reconciled, show why ("Matched reference UTR…", "Balance
  progression confirms separate transaction") — transparency.
- **Synced / Failed / Unresolved sections:** failed shows error + Retry (bounded); unresolved/
  dead-letter surfaced (backend gap → 10). Response status shown honestly (created/replayed/
  conflict/queued — fix P34).
- **Settings link:** automation/notification preferences.
- **Remove simulation + fake historical import from production** (D33). Web confirm calls real
  ingest (fix C48); amount uses integer parser (fix P25).
**Components:** SmsStatusHeader, SmsReviewCard, DirectionSelector, EvidencePanel, SyncStatusBadge,
RetryButton, ConfirmDialog.
**States:** permission-denied empty; no-pending empty; loading; error.
**Backend:** ingest (exists); server review queue/dead-letter (gap → 10); Android retry fixes
(transformation T9). **Acceptance:** AC-M1–M8; never silently discard; never auto-post uncertain.

## H. Settings & Account (`/settings`)

**Purpose:** understandable settings.
**Current problems:** C31 exports 401, C41 prefs reset, U11 partial backup, no password/session mgmt.
**New design:** grouped sections with clear labels + save feedback:
- **Profile:** name, email (read-only email), avatar initial.
- **Appearance:** theme (system/light/dark, aria-pressed), density optional.
- **Notifications:** preferences with **merge semantics** (fix C41), all backend fields exposed
  (fix U12), quiet hours, max alerts; debounce saves (fix P33).
- **SMS:** automation toggle (verifies permission), notification toggle, backend URL (labeled).
- **Data:** export CSV/JSON (fixed auth C31), backup/restore (full v2 — fix U11; backend gap → 10),
  clear queue (confirm).
- **Connection:** backend URL + test + DB status (honest copy, not "local" for remote).
- **Security:** change password / active sessions / logout — **backend gaps → 10**; show what exists.
- **About:** version, licenses.
**Components:** SettingsSection, ThemeSelector, PreferencesForm (merge), ExportButton, RestoreDialog,
ConnectionPanel.
**States:** save success/error toast; test result; restore validation.
**Acceptance:** AC-FE1/FE3/FE8; every control labeled; logout works.

## I. Other pages

### Accounts (`/accounts`)
Fix C32 report-balance (query param), C55 false reconcile, C42 archive indicator. Design: consolidated
balance (calculated vs reported, truthful variance), account cards (mask, type, balance, verified dot),
add/edit/report-balance/reconcile/recalculate actions, archived section visible. **Acceptance:** AC-FE2.

### Categories (`/categories`, merges expense+income types)
Fix C43 period label. Grid of types (icon, name, count all-time labeled, total), create/edit/archive,
detail page with period summary + trend + recent. Income-type management added (fix C57). Delete guard
when transactions exist (preserve). **Acceptance:** labels truthful; income types manageable.

### Notifications (`/notifications`)
Fix C41 destructive PUT, C51 unpadded cards, P31 cap. Category tabs (ARIA), rows (keyboard), mark-read,
preferences modal (merge). Pagination/load-more. **Acceptance:** AC-FE3; cards padded; prefs preserved.

### Security (`/security`)
Fix C37 helpline (full number tel:), undefined tokens. Protection summary, alert cards (severity/status/
amount/reason), recognise/dispute actions, helplines (correct full numbers), cybercrime guidance.
**Acceptance:** helplines dial correctly; tokens defined; a11y.

### Scanner (`/scanner` + ReceiptScannerModal)
Fix C38 camera attach+cleanup, C54 PDF, C49 orphan, F58 privacy copy. Modal-first; wire route or remove
duplicate. Camera/upload/text tabs; honest "processed on your backend" copy; size check before buffer.
**Acceptance:** camera works+cleans; PDF handled or removed; no leak.

### Weekly report (`/analytics?view=weekly`)
Fix C36 signed net, C21 backend crash, P29 IST weeks. KPI cards (spent/income/net/savings), category
progress, largest expenses, account breakdown. **Acceptance:** net keeps sign; works with accounts.

### Welcome (`/welcome`)
Sample-labeled preview (or real empty-state), honest feature copy (remove budgets promise until built,
or build budgets), reduced-motion, skippable. No unlabeled mock balances (D41).

### Login / Register (`/login`,`/register`)
Fix C40 setup race (derive mode after setupStatus loads), email validation (V16), RHF+Zod consistency,
offline-aware (P35). Brand mark flat green. **Acceptance:** fresh-instance admin creation works.

### NotFound (`*`)
Fix Button-in-Link; public (not auth-gated) or graceful; return link. a11y.

## Cross-page rules
Every page: PageHeader, L/E/R states, token styling, keyboard a11y, ₹ formatting, IST dates,
no mock production data, real API integrations preserved. No page left with old design.
