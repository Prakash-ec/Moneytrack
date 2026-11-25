# 04 — Information Architecture

Navigation, page hierarchy, and user journeys. Redesigns the complete navigation system;
consolidates duplicated routes; surfaces missing features (Budgets, SMS review).

## 1. Proposed site map

```
Public
  /welcome            Onboarding (sample-labeled, skippable)
  /login  /register   Auth (single component, mode toggle)

App (authenticated, AppLayout shell)
  /                   Overview (dashboard)
  /transactions       Unified ledger (All · Income · Expenses · Transfers)
  /budgets            Budgets (NEW — monthly + category)
  /analytics          Reports (Overview · Trends · Categories · Weekly)
  /accounts           Bank accounts & reconciliation
  /sms-review         SMS automation & review queue
  /categories         Expense & income types (merged TypesPage + income types)
  /notifications      Notification center
  /security           Security centre
  /settings           Profile · appearance · notifications · SMS · data · connection · about

Detail / modal routes
  /transactions/:id   Transaction detail (drawer on mobile)
  /categories/:id     Category detail
  /scanner            Receipt scan (modal-first; route kept as deep link, wired)

Removed / redirected (fix D6 duplicates)
  /expenses,/income,/transfers,/breakdown,/trends  → /transactions?tab=… / /analytics?view=…
  /report,/weekly                                  → /analytics?view=weekly
  /expense-types                                   → /categories
```

Keep old paths as **redirects** so deep links/bookmarks don't break. Remove duplicate
component implementations (one source per surface).

## 2. Desktop navigation (≥1024)

Sidebar 248px, grouped, quiet:
```
[MoneyTrack mark + "Private ledger"]

MAIN
  Overview          (LayoutDashboard)
  Transactions      (ArrowLeftRight)   [badge: pending SMS count]
  Budgets           (Target)
  Analytics         (ChartPie)

MANAGE
  Accounts          (Building2)
  Categories        (Tags)
  SMS review        (MessageSquareText) [badge: pending]

SYSTEM
  Notifications     (Bell)            [unread dot]
  Security          (ShieldCheck)
  Settings          (Settings)

[footer: theme toggle · connection status · user]
```
- Active = surface step + accent left bar + hairline. Row 36px, gap 2.
- Top bar: page title + period picker (where relevant) + quick-add + command (⌘K) + sync status.
- CommandPalette: full route coverage (fix inconsistent links), dialog role + focus trap.

## 3. Mobile navigation (<1024)

Purpose-built bottom nav (not shrunk desktop):
```
[ Overview ] [ Transactions ] [ + FAB ] [ Budgets ] [ More ]
```
- FAB opens quick-add sheet (Expense / Income / Transfer / Scan) — fixes expense-only FAB (C50).
- "More" → sheet with Accounts, Categories, SMS review, Analytics, Notifications, Security, Settings.
- Compact header: page title + period + overflow. Safe-area insets. Touch ≥44.
- SMS review reachable from More + dashboard banner + notification deep link (fix dead badge).
- Transaction detail = bottom drawer; filters = bottom sheet; forms = full-screen sheet on small phones.

## 4. Page hierarchy & headers

Every page: consistent PageHeader (title sentence case, optional description, period picker,
primary action). Breadcrumb on detail pages. One primary action per page; secondary in overflow.

## 5. User journeys (must be simple & predictable)

### J1 — Open & understand position
Open → Overview loads (skeleton) → balance hero (available, verified dot if reconciled) +
this-month inflow/outflow/net → recent activity → one spending chart. ≤2s to comprehension.
Failure: error state with retry; offline: cached + offline banner.

### J2 — Add expense
FAB/+ → Expense sheet (amount, category, date, method, note) → validate inline → Save →
toast "Expense added" → balance/lists invalidate → Overview updates. Offline → queued with
idempotency key, syncs later. ≤3 taps.

### J3 — Record income
FAB → Income sheet (requires income type; if none, prompt create — fixes C57) → Save →
toast → totals refresh. Same language as expense.

### J4 — Review transactions
Transactions → unified list (direction icons + signed amounts) → search/filter/sort/date →
tap row → detail drawer → Edit / Reverse / Delete (confirm). Pagination/incremental.

### J5 — Understand monthly spending
Analytics → income-vs-expense comparison + category breakdown + trend → period switch →
export (fixed auth). Correct labels, net definitions.

### J6 — Manage budgets
Budgets → monthly overall + category cards (spent/allocated/remaining, progress) → create/edit →
overspend warning. Empty state invites first budget. (Alerts/historical = backend gap, see 10.)

### J7 — Review SMS transactions
SMS review → automation/permission status → pending queue → tap item → see detection evidence +
**explicit direction confirmation** (Debit/Credit/Unknown, never default) → Confirm → ingest →
status (created/replayed/conflict/queued) shown honestly. Duplicate explanation visible.

### J8 — Fix failed syncs
SMS review → Failed/Unresolved section → see error → Retry (bounded) → or Resolve manually →
dead-letter surfaced (backend gap flagged). Never infinite silent loop.

### J9 — Change settings
Settings → grouped sections (Profile, Appearance, Notifications, SMS, Data, Connection, About) →
each control labeled, saved with feedback; preferences merge (fix C41); export works (fix C31).

## 6. Cross-cutting IA rules

- One period source of truth (IST) shared by Overview/Analytics/Budgets/Weekly.
- One money formatter; one direction convention (icon+sign+colour).
- Every list has empty/loading/error states; every destructive action confirms.
- Badges reflect real counts (pending SMS, unread notifications) — fix stale/inconsistent (C37/P28).
- No orphaned routes (wire /scanner or remove); no dead nav branches.
