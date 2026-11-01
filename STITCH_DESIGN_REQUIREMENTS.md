# MoneyTrack — Stitch Design Requirements

**Source of truth:** This document was produced by auditing the actual MoneyTrack application source code at `D:\MoneyTrack`. It describes what the application **actually does**, not what it might do in the future. No source code was modified during this audit. Google Stitch should use this document as the complete product specification for the UI redesign.

---

## 1. Product Overview

MoneyTrack is a private, local-first personal finance tracker. Users record what they spend, organize expenses into reusable types (categories), and view their spending through period summaries, category breakdowns, spending trends, and comparisons. It runs as a web application and as a native Android app (Capacitor 8). All financial data is stored in a local SQLite database on the backend. There is no user authentication, no third-party analytics, no cloud sync, and no hardcoded sample transactions. The backend exposes a JSON API at a user-configurable base URL; the frontend connects to it and falls back to an offline queue when disconnected.

Currency: Indian Rupee (INR). All amounts are stored as integer paise (1 INR = 100 paise) to avoid floating-point errors. Display uses Indian digit grouping (₹1,25,000.00). Timezone: Asia/Kolkata.

---

## 2. Feature Classification Summary

Statuses used throughout this document:

| Status | Meaning |
|--------|---------|
| **IMPLEMENTED** | Present in code and supported by tests or verified behavior. |
| **PARTIALLY IMPLEMENTED** | Some functionality exists but has limitations (e.g., backend only, no frontend UI). |
| **UNVERIFIED** | Implementation exists but actual operation could not be confirmed from code/tests. |
| **NOT IMPLEMENTED** | Absent from the inspected implementation. |
| **PLANNED** | Explicitly mentioned in project documentation but not implemented. |

---

## 3. Current Feature Inventory

### 3A. Dashboard (Home Page — route `/`) — IMPLEMENTED

**Purpose:** Show the user where their money went during the selected reporting period, with summary statistics, category split, spending trend, and recent transactions.

**Information displayed:**
- Reporting period label (e.g., "1 Jan 2026 – 31 Jan 2026") and timezone note ("Asia/Kolkata").
- Total spent (`total_paise`) formatted in INR.
- Transaction count.
- Average expense per transaction.
- Highest single expense (amount, type, date).
- Most expensive expense type (name, color, icon, total, count, share %).
- Period comparison vs. the preceding equal-length period (change in paise, change percent, direction: up/down/flat/new/none).
- Donut chart of spending by expense type (top 6 types shown individually, remaining grouped as "Other types").
- Bar/area chart of spending over time (daily/weekly/monthly granularity auto-selected by period length).
- Breakdown table of expense types (top 6 shown on dashboard, link to "View all" breakdown page).
- Recent transactions list (up to 4, newest first) with type icon, name, amount, date, payment method, merchant, note; archived types flagged.
- Count of expense types configured.

**Available user actions:**
- Change the reporting period via Period Picker (presets: Today, Yesterday, This week, This month, Last month, Last 30 days, This year, Custom range).
- Click a segment of the donut chart to navigate to that expense type's detail page.
- Click "View all" links to navigate to the full breakdown or expenses list.
- Tap a recent transaction to edit it.
- Tap "Add expense" to create a new expense.
- Tap "Scan receipt" to parse a receipt image/text.
- Retry all failed data queries.

**Existing filters and controls:**

### 3B. Expense Management — IMPLEMENTED

**Purpose:** Create, read, update, and delete individual expense transactions.

**Expense creation (modal dialog):**
- Fields:
  - Expense type (required dropdown; linked to existing expense types; can create a new type from receipt scan flow).
  - Amount (required, in rupees with up to 2 decimals; stored as integer paise; validated > 0 and ≤ 10^13 paise).
  - Expense date (required date input; defaults to today in Asia/Kolkata).
  - Note (optional, max 500 characters).
  - Payment method (optional dropdown: UPI, Cash, Debit Card, Credit Card, Bank Transfer, Other).
  - Merchant or recipient (optional, max 120 characters).
- Validation via Zod schema and react-hook-form. Inline error messages under each field.
- Last-used category and payment method are remembered in localStorage (`moneytrack-quick-prefs`).
- On success, the expense is created via `POST /expenses` with an optional idempotency key; if offline, the expense is enqueued in localStorage (`moneytrack_offline_queue`) and synced later.
- Toast confirmation on success.

**Expense editing:**
- Opened by tapping a transaction in any list (Home recent list, Expenses page, Type detail page).
- Same form as creation, pre-populated with the existing expense values.
- Updated via `PATCH /expenses/{id}`. All fields (expense_type_id, amount_paise, expense_date, note, payment_method, merchant) can be changed; sending `null` for note/payment_method/merchant clears them.
- Cannot move an expense to an archived expense type (backend returns 409 Conflict).
- Cannot set amount ≤ 0 or a non-existent expense type.

**Expense deletion:**
- Confirmation dialog required ("Delete this expense?"), showing amount, type, and date.
- States that totals and charts update immediately and the action cannot be undone.
- Deletes via `DELETE /expenses/{id}` (204 No Content).
- 404 if the expense does not exist.

**Validation (backend, verified by tests):**
- `amount_paise` must be > 0 (0 and negative rejected with 422).
- `expense_type_id` is required and must reference an existing type (404 if not found).
- `expense_date` must be a valid ISO date (422 otherwise).
- `payment_method` must be one of the enum values (422 otherwise).
- `note` max 500 chars; `merchant` max 120 chars.
- Whitespace is trimmed from note and merchant; blank becomes null.

**Existing workflows:**
- Add expense → form → save → appears in lists and charts immediately.
- Edit expense → form → save → lists and charts refresh via data refresh provider.
- Delete expense → confirm → remove → lists and charts refresh.
- Offline creation → enqueued → automatic sync when reconnected (with idempotency keys to prevent duplicates).

### 3C. Categories (Expense Types) — IMPLEMENTED

**Terminology note:** The application calls categories "expense types." Each type has a name, optional description, category, icon, color, and archived flag.

**Purpose:** Manage reusable expense classifications used when creating expenses.

**Category / expense type fields (verified from schema and UI):**
- `id` (integer)
- `name` (required, 1–80 chars, unique ignoring case and extra spaces)
- `description` (optional, max 500 chars)
- `category` (optional): one of Food, Travel, Utilities, Education, Shopping, Health, Entertainment, Housing, Other
- `icon` (required, short lowercase identifier from a fixed set of ~37 icons, default `wallet`)
- `color` (required hex `#RRGGBB`, default `#0F766E`)
- `is_archived` (boolean, default false)
- `created_at`, `updated_at` (timestamps)
- `total_paise`, `transaction_count` (computed aggregates)

**Category creation:**
- Form dialog with name, description, category dropdown, icon grid selector (37 options), color swatch selector (14 options).
- Validation: name required (1–80 chars), color must be valid hex, icon must be valid lowercase identifier.
- Duplicate names (case/whitespace-insensitive) rejected with 409 Conflict.
- Can be pre-seeded from a receipt scan suggestion (TypeConfirmationDialog).
- Type suggestions available: a fixed list of ~14 suggested types (e.g., "Jio Recharge", "Food", "Bus Travel") with pre-configured category/icon/color.

**Category editing:**
- Same form, pre-populated.

### 3D. Transactions — IMPLEMENTED

**Purpose:** View, filter, sort, search, and paginate the full list of expense transactions.

**Available transaction list (Expenses page — route `/expenses`):**
- Each row shows: type icon + name, amount (INR), date, payment method, merchant, note; "Archived" badge if the type is archived.
- Rows are clickable to edit; delete button available per row.

**Sorting (verified options):**
- Newest first (`date_desc`), Oldest first (`date_asc`), Highest amount (`amount_desc`), Lowest amount (`amount_asc`), Recently added (`created_desc`).
- Default: `date_desc`.

**Filtering (verified):**
- Date range (start_date, end_date).
- Expense type ID.
- Category (matches expense type's category).
- Payment method.
- Minimum amount / maximum amount (in paise; validated min ≤ max).
- Search query `q` (case-insensitive, matches note, merchant, expense type name, category; whitespace-tolerant).

**Search:**
- Debounced search input (300ms).
- Search matches across note, merchant, type name, and category.

**Pagination:**
- Page size default 25, configurable up to 200.
- Pagination controls show "Page X of Y · N total" with Previous/Next buttons.
- Page resets to 1 when filters or period change.

**Important states:**
- Empty: "No expenses in this period" or "No expenses match these filters" with "Clear filters" or "Add expense / Scan receipt" actions.
- Loading: skeletons.
- Error: Error state with retry.

**Data dependencies:**
- `GET /expenses` with query params; returns `ExpensePage` (items, total, page, page_size, pages).

### 3E. Analytics and Reports — IMPLEMENTED

The application provides three analytics pages plus dashboard widgets.

#### 3E1. Breakdown page (route `/breakdown`) — IMPLEMENTED

**Purpose:** Full spending breakdown by expense type for the selected period.

**Information displayed:**
- Summary stats (total, count, average, most expensive type, period comparison) — same as dashboard summary.
- Donut chart of spending by type.
- Bar chart comparing spending by type (top 8 types).
- Full breakdown table of all types: name, archived badge, transaction count, average, total, share % with progress bar; each row links to the type detail page.
- Search to filter types by name (case-insensitive) or "archived".
- Sort options: Highest total, Lowest total, Most transactions, Name A–Z.
- Note: shares use the full period total even while searched/sorted; archived types remain visible because historical expenses still count.

**Controls:** Period picker, search input, sort dropdown.

#### 3E2. Trends page (route `/trends`) — IMPLEMENTED

**Purpose:** Analyze spending patterns over time and detect recurring activity.

**Information displayed:**
- Summary stats (total, count, average, most expensive type, period comparison).
- Spending over time chart (area for daily, bar for weekly/monthly); granularity user-selectable (Daily/Weekly/Monthly) and auto-suggested by period length.
- Largest days (top 5 days by spend, with amount, count, and % of max day).

### 3F. Receipt Scanner — IMPLEMENTED (with external dependency)

**Purpose:** Extract expense data from receipt images or text and propose an expense for user review.

**Workflow:**
1. User taps "Scan receipt" (sidebar button, FAB, or empty-state action).
2. ReceiptScannerModal opens with three mode tabs: **Camera**, **Upload**, **Paste Text**.
3. User selects a scan mode: **OCR** (local Tesseract), **Groq AI** (cloud vision), or **Both** (default).
4. Image captured (camera) or selected (upload) or text pasted.
5. File validation: JPEG/PNG/WebP/HEIC, max 10 MB. Invalid format or oversized file → error.
6. Image sent to `POST /receipts/parse` (multipart) or text to `POST /receipts/parse-text` (JSON).
7. Backend parses using rule-based parser + optional Groq AI, merges results, classifies expense type against existing types.
8. Result returned with `scan_method` field: `"ocr"`, `"groq"`, `"hybrid"`, or `"AI text extraction"`.
9. If the parser proposes a brand-new type with no existing match → TypeConfirmationDialog (create new type or choose existing).
10. Otherwise → ExpenseForm opens pre-filled with scanned fields; user reviews/corrects and saves.

**Extracted fields (ReceiptParseResult):**
- Merchant (string or null)
- Amount in paise (integer or null)
- Expense date (ISO string or null)
- Currency (default "INR")
- Subtotal, tax (paise or null)
- Payment method (one of the enum values or null)
- Line items (name, amount, quantity)
- Note (optional)
- Suggested expense type ID/name (if an existing type matches)
- Suggested new type name (if no existing type matches)
- Confidence scores (merchant, date, amount, type — 0.0–1.0)
- Warnings array
- Raw extracted text

**Camera access:**
- Uses `navigator.mediaDevices.getUserMedia` with `facingMode: 'environment'` (rear camera).
- Requires secure context (HTTPS or localhost).
- Torch (flash) toggle if supported.
- Camera switching (front/back).
- Camera error handling with fallback message.

**Upload:**
- File input with `accept="image/jpeg,image/png,image/webp,image/heic"` and `capture="environment"`.
- Max 10 MB; MIME type validated by magic bytes on backend (and file extension on frontend).
- Preview URL shown before scanning.

**Paste text:**
- Textarea for pasting receipt/bill text.
- Example placeholder provided.
- Groq AI extracts fields with rule-based fallback; nothing saved until confirmed.

**External dependency — Tesseract OCR:**
- Backend service `app/services/ocr.py` provides `TesseractOCRProvider`.
- Locates `tesseract` binary via `TESSERACT_PATH` env var, `shutil.which`, or common Windows paths.
- `is_available()` returns true only if the binary is found.
- If Tesseract is not installed, OCR/image parsing returns HTTP 503 with message: "Local OCR engine (Tesseract) is not installed on this machine. You can still paste receipt text manually or enter expenses directly."
- Verified by tests: `test_parse_receipts_api.py` mocks OCR; real OCR availability depends on the host machine having Tesseract installed.
- Groq AI (optional): requires `GROQ_API_KEY` in `backend/.env`; if missing or failing, falls back to local rule-based parsing. Never sends data unless the key is configured.

**Preview and manual correction:**

### 3G. Settings and API Connection — IMPLEMENTED

**Purpose:** Configure the backend connection, test it, manage appearance, export/import data, and configure SMS.

**API base URL configuration:**
- Default base: `/api` (Vite dev proxy to backend) or `VITE_API_BASE_URL` env var.
- Runtime override via Settings page; normalized to ensure `/api` path prefix.
- Persisted to `localStorage` under key `moneytrack-api-base`.
- Change dispatches `moneytrack:api-base-changed` event so all UI components re-fetch.
- Used on Android to point the WebView at a laptop/LAN/cloud backend (USB reverse, Wi-Fi LAN IP, or cloud HTTPS).

**Connection testing:**
- `testConnection(candidateUrl)` calls `GET /health` on the configured base with an 8-second timeout.
- Validates the response is genuinely a MoneyTrack API (rejects HTML responses, checks for `status === 'ok'` or version/application fields).
- Returns: ok, status, version, application, error.
- UI shows test result (Connected: MoneyTrack API v1.0.0 or error message).

**Health check:**
- `GET /health` returns: status ("ok"|"degraded"), app, version, environment, database ("connected"|"unavailable").
- Root `/health` (no `/api` prefix) also available for load balancers.

**Connection-error behavior:**
- Offline banner: "You are offline. Any new expenses will be saved locally and synced once reconnected."
- Offline count badge: "N expense(s) stored offline awaiting sync" with "Sync now" button.
- Automatic sync when online and queue non-empty.
- API errors shown as ErrorState with retry, or toasts with variant "error".
- HTML-instead-of-JSON detection with helpful message to check the Backend URL in Settings.

**Persisted settings (localStorage):**
- `moneytrack-api-base` — API base URL.
- `moneytrack-theme` — theme preference (system/light/dark).
- `moneytrack-quick-prefs` — last category + payment method.
- `moneytrack-type-learnings` — merchant → type mappings.
- `moneytrack_offline_queue` — queued expenses awaiting sync.

**Theme:**

### 3H. Backup and Restore — IMPLEMENTED

**Purpose:** Export and import financial records for portability and safety.

**Export formats:**
1. **CSV:** `GET /export/expenses.csv` (optional `start_date`, `end_date`).
   - Columns: Date, Expense Type, Category, Amount (INR), Amount (paise), Payment Method, Merchant, Note, Created At (UTC), Updated At (UTC).
   - UTF-8 with BOM; filename `moneytrack-expenses-YYYY-MM-DD.csv`.
2. **JSON backup:** `GET /export/backup.json`.
   - Full backup of all expense types and all expenses.
   - Schema version 1, application name/version, exported_at timestamp.
   - Filename `moneytrack-backup-YYYY-MM-DD.json`.
   - No date filtering (exports everything).

**Import / restore:**
- `POST /export/restore` with JSON payload.
- Single ACID transaction; rollback on any error.
- Merge semantics: matching expense types (by normalized name) are reused; new types are added; duplicate expenses (same type_id + amount + date + note + payment_method + merchant) are skipped.
- Returns `RestoreSummary`: restored_types, matched_types, restored_expenses, skipped_expenses, message.
- Existing records are never deleted.

**UI (Settings page):**
- Export buttons: "Download CSV export", "Download full JSON backup".
- Import: file input for JSON backup; shows preview (type count, expense count) before confirming.
- Confirmation dialog: "Restore records from backup?" listing type and expense counts; explains merge behavior and that existing records won't be deleted.

### 3I. Mobile and Desktop Behavior — IMPLEMENTED

**Navigation:** Desktop (lg+) uses a fixed left sidebar (Home, Expenses, Expense types, Trends, SMS Sync, Settings + Add expense / Scan receipt buttons). Mobile uses a bottom navigation bar and a floating "Add expense" button.

**Routes:** `/` (Dashboard), `/expenses` (list), `/breakdown`, `/expense-types`, `/expense-types/:typeId`, `/trends`, `/settings`, `/sms-review`, `*` (NotFound).

**Responsive:** Tailwind CSS (sm/md/lg/xl); charts via recharts `ResponsiveContainer`; tables switch grid vs grid-cols; period picker select on mobile, segmented buttons on desktop.

**Android/Capacitor:** Capacitor 8; `appId: com.moneytrack.app`; APK at `release/MoneyTrack.apk`; native Android SMS parser and camera; backend URL configurable in Settings (USB reverse, Wi-Fi LAN, cloud HTTPS).

**Desktop:** Runs in browser at localhost:5173 (dev) or served by FastAPI from `frontend/dist` (prod); sidebar + keyboard/mouse.

## 4. Screens the UI Must Represent

| Screen | Purpose | Key Content | Key Actions | States |
|--------|---------|-------------|-------------|--------|
| **Dashboard (`/`)** | Where money went in period | Total, count, average, highest expense, most expensive type, comparison badge, donut chart, trend chart, recent transactions (4) | Change period, click donut→type, edit transaction, Add expense, Scan receipt | Loading skeleton, empty "Nothing recorded here", error+retry |
| **Expenses List (`/expenses`)** | Browse all transactions | Rows (type icon+name, amount, date, method, merchant, note, archived badge), page info | Edit, delete, filter, sort, search, paginate, Add expense, Scan receipt | Loading, empty, error+retry |
| **Expense Form (modal)** | Create/edit expense | Type dropdown, amount, date, note, payment method, merchant; inline errors | Save, cancel, scan receipt, delete (edit) | Validation errors, loading, success |
| **Expense Types List** | Manage categories | Type list (icon, name, category, archived badge, totals), Active/Archived/All tabs | Add, edit, archive/unarchive, delete (unused), search | Loading, empty, error, dialogs |
| **Type Detail** | One type's details | Period summary, trend chart, its transactions, archive/delete | Edit period, edit transaction, add expense, archive/unarchive, delete | Loading, empty, error |
| **Breakdown (`/breakdown`)** | Spending by type | Summary, donut, bar chart (top 8), full type table with share bars | Click type→detail, search, sort, change period | Loading, empty, error |
| **Trends (`/trends`)** | Patterns over time | Summary, trend chart (area/bar), largest days, rankings w/ comparison, recurring activity, insights | Change granularity, change period, click ranking→type | Loading, empty recurring, error |
| **Settings** | Configure app | API base URL + test, theme, export CSV/JSON, import backup + preview, SMS settings, version | Test connection, download, restore, toggle SMS | Connection testing, exporting/restoring, confirmations |
| **SMS Review (`/sms-review`)** | Review SMS transactions (Android only) | Pending transaction list, settings | Confirm/edit, dismiss, clear queue, sync | Loading, empty, error (stub on web) |
| **Not Found (`*`)** | Invalid route | "Page does not exist", Back to overview | Back to overview | — |

## 5. Critical Constraints

1. Backend behavior must be preserved; all calculations identical.
2. Existing API endpoints and data formats must remain compatible.
3. Real financial records only — no hardcoded/sample transactions.
4. Expense calculations must not change (backend computes; UI renders).
5. Receipt scanning, API connection settings, and backup/restore must remain.
6. Must work on Android phones and desktop browsers.
7. Unimplemented features must not be presented as working.
8. Database records must be preserved (no schema changes).
9. No authentication exists — do not design login/accounts.
10. INR with paise storage, Indian digit grouping, Asia/Kolkata timezone.

## 6. Features to Exclude from the Redesign

| Feature | Status | Reason |
|---------|--------|--------|
| Budgets UI | NOT IMPLEMENTED | Backend `/budgets` exists but no frontend route/UI |
| SMS on desktop/web | PARTIAL (stub) | `SmsPlugin` is a no-op stub on web; Android-native only |
| Tesseract OCR guaranteed | UNVERIFIED | Only works if `tesseract` binary installed; degrades to manual text |
| Groq AI receipt parsing | PARTIAL (optional) | Requires `GROQ_API_KEY`; falls back to rule-based |
| Authentication/accounts | NOT IMPLEMENTED | No auth exists |
| Cloud sync / multi-device | NOT IMPLEMENTED | Single backend; offline queue syncs to one URL |
| Bank feed | NOT IMPLEMENTED | SMS/manual/receipt scan only |
| Investment/asset tracking | NOT IMPLEMENTED | Expense tracking only |
| Multiple currencies | NOT IMPLEMENTED | INR only |

## 7. Design Freedom

Stitch may independently choose: visual style (colors, elevation, borders, radius), layout arrangement, typography, iconography, spacing, navigation presentation (sidebar/drawer/tabs/bottom bar), modal vs bottom sheet vs full-screen dialogs, and responsive composition — provided all documented screens, actions, filters, states, and constraints are preserved on both Android and desktop. Do not invent backend capabilities or present unimplemented features as working.

## 8. Audit Notes and Uncertainties

- Frontend vitest suite reports 4 failed suites due to a test-environment config issue (`TypeError: Cannot read properties of undefined (reading 'config')`), not an application bug; not re-run during audit.
- Backend: 133 pytest tests exist (reported passing in docs); not individually re-run.
- Tesseract OCR: not confirmed installed on this machine; backend gracefully returns 503 with manual-text fallback.
- Groq API key: not configured (`.env.example` only); AI parsing disabled by default.
- Android APK pre-built at `release/MoneyTrack.apk`; native SMS/camera code not inspected at Kotlin level.
- SQLite database at `backend/data/moneytrack.db` not modified during audit.

## 9. Output File

`D:\MoneyTrack\STITCH_DESIGN_REQUIREMENTS.md`

Self-contained specification for Google Stitch: product, screens, actual features, data models, constraints, exclusions, and design freedom — no source code reading required.

### 3J. Other Existing Functionality

**SMS Review (`/sms-review`) — PARTIALLY IMPLEMENTED:** Full frontend UI exists, but backs onto Capacitor `SmsPlugin` which is a non-functional stub on web (all permissions "unsupported", empty queue). SMS detection is Android-native only.

**Offline queue — IMPLEMENTED:** localStorage queue with idempotency keys; auto-sync on reconnect; manual "Sync now"; count badge and banner.

**Type learnings — IMPLEMENTED (frontend):** localStorage merchant→type mappings used to pre-select type in expense form.

**Error boundary, Toasts, Data refresh, Page skeletons, Type icons — IMPLEMENTED:** Standard UI infrastructure.

**Budget API — PARTIALLY IMPLEMENTED:** Backend `/budgets` routes exist with full CRUD, but **no frontend route or UI**. Do not present as a working feature.
- Loading states during export/restore; toasts on success/error.
- File input reset after restore.

**Validation:**
- Backend validates the backup structure; raises ConflictError if an expense type cannot be mapped.
- Frontend catches ApiError and displays it.
- Options: System, Light, Dark.
- Respects `prefers-color-scheme` media query.
- Persisted; applies `dark` class to `<html>` and theme-color meta tag.

**Backup and restore (see 3H):**

**SMS settings (Android only):**
- SMS automation toggle, backend URL for SMS forwarding, notifications toggle.
- Permission status (receive/read SMS, post notifications) — "unsupported" on web.
- Pending SMS transaction queue review (see 3J).
- The parsed result opens in the ExpenseForm where all fields (type, amount, date, note, payment method, merchant) can be edited before saving.
- Expense preview shown in TypeConfirmationDialog (merchant + amount) before type creation.

**Expense creation from scan:**
- After type confirmation (if needed), the ExpenseForm is pre-populated; user taps save to create the expense.
- Nothing is saved automatically from the scan alone.

**Limitations:**
- OCR accuracy depends on image quality and Tesseract installation.
- Groq AI requires an API key and network access; failures fall back gracefully.
- No batch scanning; one receipt at a time.
- Rankings table of expense types with current vs. previous period totals and change badges.
- Recurring activity detection: types with at least 3 expenses in the period, labeled "Regular" or "Frequent", showing total, count, average gap in days, distinct months, and a message.
- Insights list (auto-generated text observations).
- Empty state for recurring: "Not enough data for a reliable pattern" (needs ≥3 expenses of same type).

**Controls:** Period picker, granularity selector.

#### 3E3. Comparison — IMPLEMENTED (embedded in dashboard/trends/type detail)

**Purpose:** Compare current period vs. preceding equal-length period.

**Information displayed (via ComparisonBadge component):**
- Direction: up / down / flat / new / none.
- Change percent and change in paise.
- Labels: "New spending", "No prior spending", "No change", or percent.
- Per-type comparison on the Trends page (current vs. previous total, count, change, direction).

**Period resolution (backend, verified):**
- Defaults to current month up to today (Asia/Kolkata).
- Custom ranges allowed; max range 3660 days (~10 years).
- Previous period = equal-length period immediately before the current range.

**Data dependencies:**
- `GET /analytics/summary`, `GET /analytics/by-type`, `GET /analytics/trends`, `GET /analytics/comparison`, `GET /expense-types/{id}/summary`.
- Renaming a type updates every historical transaction that uses it.
- Archiving/unarchiving via confirmation dialog.
  - Archive: hides the type from new expense forms; existing expenses and reports remain intact; can be restored.
  - Unarchive: makes the type available again in expense forms.
- Deletion: only allowed when the type has **zero** linked expenses. If expenses exist, delete is disabled and the user is directed to archive instead. Permanent, cannot be undone.

**Category selection (in expense forms):**
- Dropdown of existing (non-archived) expense types, showing icon + name.
- Archived types are hidden from the creation dropdown but remain visible in reports with an "Archived" badge.

**Category totals:**
- Each type shows `total_paise`, `transaction_count`, `average_paise`, `share_percent` in breakdown views.
- Type detail page shows period summary for that type (total, count, average, highest/lowest expense, previous-period comparison, daily trend).

**Existing workflows:**
- List types (active/archived/all tabs), search, create, edit, archive/unarchive, delete (unused only), view type detail with its own trend chart and transaction list.
- Period preset selector + custom start/end date inputs.
- No search or sorting on the dashboard (those live on dedicated pages).

**Important states:**
- **Empty:** "Nothing recorded here" empty state with an "Add expense" call-to-action when there are no expenses.
- **Loading:** Page skeleton (card skeletons + chart skeleton) while queries load.
- **Error:** Error state with a "Try again" retry button if any summary query fails.
- **Success:** Toasts for offline sync completion.

**Mobile-specific requirements:**
- Bottom navigation bar (Home, Expenses, Trends, SMS Sync, Settings) on narrow screens.
- Floating action button ("Add expense") on narrow screens.
- Sidebar navigation on desktop/lg+ screens.
- Period labels and chart heights adapt to screen size.

**Data dependencies and limitations:**
- Requires the `analytics/summary`, `analytics/by-type`, `analytics/trends`, `listExpenses`, and `listExpenseTypes` API endpoints.
- All data comes from real backend records; no mock/sample data is used.
- Charts are rendered with recharts; data is fetched per period change.