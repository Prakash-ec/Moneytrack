# 01 — Current Frontend Audit

**Project:** `D:\MoneyTrack\frontend` · **Mode:** read-only plan · **Date:** 23 Nov 2026
**Method:** complete 90-file frontend inspection (exploration agent) + lead first-hand
verification of styling system, branding assets, navigation shell, theme provider, and
UI primitives. Cross-checked against backend routes/schemas. Companion evidence:
`C:\Users\velmu\.opencode\plan\07_FRONTEND_UX_AUDIT.md` and `02_COMPLETE_BUG_AUDIT.md`.

> Location note: Plan mode writes only to `C:\Users\velmu\.opencode\plan\`. These docs
> live in `...\plan\frontend-redesign\`. Copy to `docs/frontend-redesign/` after switching
> out of Plan mode. No app code/styling was modified.

## 1. Technical architecture (verified)

| Concern | Implementation | Evidence |
|---|---|---|
| Framework | React 18.3 + TypeScript 5.7 | `package.json` |
| Build | Vite 6.4 | `package.json` |
| Styling | Tailwind 3.4 (class dark mode) + large custom `index.css` (~1700 lines) | `tailwind.config.js`, `index.css` |
| Routing | React Router 7, lazy pages + Suspense | `App.tsx` |
| Forms | React Hook Form + Zod (ExpenseForm/TypeFormDialog); manual useState elsewhere | mixed |
| Charts | Recharts | `components/charts/*` |
| Icons | lucide-react | throughout |
| Fonts | Inter Variable (UI), Plus Jakarta Sans Variable (display), JetBrains Mono (figures) | `index.css:1-17`, `main.tsx` |
| Mobile shell | Capacitor 8.5 (Android WebView) | `capacitor.config.ts` |
| State | custom `useApiQuery` + `RefreshProvider` (no shared cache); AuthProvider; ThemeProvider; ToastProvider | `hooks/`, `providers/` |
| Offline | `services/offlineQueue.ts` (expenses+income only) | |
| Native bridge | `services/sms.ts` → SmsPlugin (web stubs no-op) | |

**Styling system reality:** two parallel languages — (a) token-based CSS primitives
(`.button`, `.card`, `.badge`, `.segmented`) and (b) raw Tailwind arbitrary values
(`bg-[var(--primary)]`, `text-[11px]`) plus **undefined utility classes** that silently
no-op (`bg-surface-card`, `p-4.5`, `h-18`, `shadow-xs`, `animate-in`). This is the core
source of visual inconsistency.

## 2. Current visual identity (verified — NOT green)

- **Primary is "Mercury Indigo":** `--primary: #5266eb` (light) / `#6366f1` (dark)
  (`index.css:20,73`). Dark comment explicitly says "No Swamp Green".
- **Surfaces:** obsidian dark `--bg:#0b0f19`, `--surface:#161b26`, `--surface-raised:#1c2333`;
  light `--bg:#f8fafc`, `--surface:#ffffff`. Neutral ramp is slate-tinted.
- **Green exists only as semantic positive:** `--positive:#059669` (light) / `#10b981` (dark).
- **Logo is gradient + glow:** `moneytrack-icon.svg` uses indigo→blue→cyan→emerald
  linear/radial gradients, ambient glow, drop shadow; wordmark "Track" is gradient-filled;
  tagline "PRIVATE FINANCIAL INTELLIGENCE" is uppercase tracked (`moneytrack-logo-dark.svg`).
  These are AI-slop tells (per `unslop` skill) and conflict with the requested calm green identity.
- **Theme:** system/light/dark, class-based, persisted (`ThemeProvider.tsx`), theme-color meta.
- **Brand subtitle in shell:** "Private ledger" (`AppLayout.tsx:79`).

> The user's requested green `#16845B`/`#36B889` is a **deliberate brand pivot**, not the
> current state. Documented in `02_NEW_PRODUCT_DESIGN.md` with contrast analysis.

## 3. Routes & pages (24 route paths, 20 page files)

| Path | Page | Status |
|---|---|---|
| `/welcome` | WelcomePage | public onboarding (4-stage auto-advance; unlabeled mock balances) |
| `/login`, `/register` | LoginPage | public; fresh-instance setup race (C40) |
| `/` | HomePage | dashboard; C5/C6/C7/C14 display defects |
| `/transactions` | TransactionsPage | tabs embed Expenses/Income/Transfers; add affordance broken (C50) |
| `/expenses` | ExpensesPage | duplicate of tab; amount-filter escalation (C33) |
| `/income` | IncomePage | duplicate of tab; page-scoped totals (C34); fresh-instance blocked (C57) |
| `/transfers` | TransfersPage | duplicate of tab; create-only (U10) |
| `/bank-accounts` | BankAccountsPage | report-balance 422 (C32); false reconcile (C55); delete=archive no-op (C42) |
| `/analytics` | AnalyticsPage | tabs embed Breakdown/Trends/WeeklyReport |
| `/breakdown` | BreakdownPage | duplicate; truncated stats (C45); wrong payment labels (C46) |
| `/trends` | TrendsPage | duplicate; bucket-label bug (C44) |
| `/expense-types` | TypesPage | "this month" vs all-time (C43) |
| `/expense-types/:typeId` | TypeDetailPage | sound |
| `/sms-review` | SmsReviewPage | web confirm no-op (C48); simulation postable (D33); parseFloat (P25) |
| `/scanner` | ScannerPage | **orphaned** (C49); camera leak (C38); PDF mismatch (C54) |
| `/security` | SecurityCentrePage | helpline dials "1800" (C37); undefined tokens |
| `/weekly-report`,`/report`,`/weekly` | WeeklyReportPage | triplicated; negative net positive (C36) |
| `/notifications` | NotificationsPage | destructive prefs PUT (C41); unpadded cards (C51) |
| `/settings` | SettingsPage | exports 401 (C31); partial backup (U11) |
| `*` | NotFoundPage | auth-gated; Button-in-Link |
| — | **Budgets** | **NO PAGE** (C12); backend complete |

## 4. Components (33 component files)

- **ui primitives (8):** Button, Card, Modal, FormControls, States, Badge, SegmentedControl
  (never imported), ConfirmDialog. Button/Modal/ConfirmDialog are sound; States has slop
  (gradient progress, animate-ping, hardcoded slate banners).
- **charts (3):** ExpenseDonut, TrendChart, TypeBarChart (dead). Hardcoded divergent colors.
- **feature (22):** BrandLogo, CashflowHeroCard, CommandPalette, ComparisonBadge, ErrorBoundary,
  ExpenseDialogProvider, ExpenseForm, FintechCard3D (dead), PageHeader, PeriodPicker,
  PermissionRecoveryModal (dead), QuickChipsModal, ReceiptScannerModal, ScrollToTop, StatCard,
  TransactionList, TransactionRow, TypeBreakdownTable (dead), TypeConfirmationDialog,
  TypeFormDialog, TypeIcon, TypeSelectSheet.
- **~1000 lines dead code** (F60): FintechCard3D, PermissionRecoveryModal, TypeBreakdownTable,
  TypeBarChart, SegmentedControl, SlowNetworkBanner, extra skeletons, registerBackHandler,
  getBankReconciliation, useTypeLearnings suggestions, api-base-changed event, sidebar SMS badge.

## 5. Navigation (verified — `AppLayout.tsx`)

- Sidebar (5): Overview, Transactions, Accounts, Analytics, Settings.
- Mobile dock (4): Overview, Ledger, Accounts, Insights + FAB (expense only) + More.
- CommandPalette links inconsistent with nav; SMS-review badge branch dead.
- No Budgets nav; SMS review reachable only via deep link/banner.

## 6. Major design & usability problems (summary)

1. **Inconsistent styling** — two languages + undefined tokens → unpadded cards, missing
   shadows, wrong colors per page (C51, C52).
2. **Indigo gradient brand** conflicts with requested calm green; logo glow/gradient = slop.
3. **Financial display defects** — masked zero/negative balance (C5), false Reconciled (C6/C55),
   mislabeled average (C7), page-scoped income totals (C34), negative net positive (C36),
   truncated breakdown (C45), wrong bucket labels (C44).
4. **Broken core flows** — exports 401 (C31), report-balance 422 (C32), amount-filter escalation
   (C33), income unrecordable fresh instance (C57), web SMS confirm no-op (C48), camera leak (C38),
   Android back can't close modals (C39), login race (C40), no add-income affordance (C50).
5. **Missing features** — Budgets UI (C12), income analytics, income-type management.
6. **Accessibility** — clickable divs, missing labels, tab ARIA absent, contrast fails (C53),
   CommandPalette no focus trap, Button-in-Link.
7. **Slop tells** — gradient progress bar, animate-ping/pulse on non-live, backdrop-blur banners,
   uppercase tracked tagline, emoji filter tabs, unlabeled mock balances.
8. **Offline/auth gaps** — boot lockout (P35), 5xx not queued, poison retries (D28).
9. **No component/page tests** (V1) — only 8 util/service tests.

## 7. What works and MUST be preserved

- Integer-paise currency utils (`parseRupeesToPaise`, `formatINR` Indian grouping) — sound.
- Theme system (system/light/dark), auth flow + Keystore mirror, lazy routing, ErrorBoundary.
- Modal focus trap/stack/restore, skip link, aria-live toasts, :focus-visible ring.
- ExpenseForm (RHF+Zod) + offline queue with idempotency keys; quick chips; receipt scan modal.
- SMS native pipeline (Android) + review UI structure; bank-account reconciliation concept.
- All real API integrations (see `10_FRONTEND_BACKEND_DEPENDENCIES.md` for contract fixes).
- Brand name "MoneyTrack", font trio, obsidian dark surfaces, "Private ledger" positioning.

## 8. Backend capability map (what the UI may rely on)

| Domain | Backend exists | Gaps (detail in 10) |
|---|---|---|
| Expenses/Income/Transfers CRUD | yes | transfers no FE edit/delete; idempotency scoping bug |
| Budgets monthly+category+summary | yes | no alerts/historical-comparison endpoint; no FE |
| Analytics summary/by-type/trends/comparison | yes (expense-only) | no income analytics/savings trend |
| Cashflow summary | yes | mixed bases; zero-balance handling |
| SMS ingest | yes | no server review queue/dead-letter; direction default DEBIT |
| Bank accounts + reconcile/report | yes | report-balance contract mismatch (FE bug) |
| Exports CSV/JSON v1/v2 + restore | yes | FE sends no auth; v1 partial |
| Notifications + preferences | yes | partial PUT destructive; prefs unique-key bug |
| Security alerts | yes | helpline data static |
| Weekly report | yes | acc.name crash with accounts |
| Auth register/login/me | yes | no refresh/revocation/password-change/logout |
| Receipts parse (OCR+Groq) | yes | privacy copy; size-before-buffer |

## 9. Inventory counts (for final report)

- **Pages inspected:** 20 page files; **24 route paths** (incl. aliases).
- **Components inspected:** 33 component files (8 ui + 3 charts + 22 feature).
- **Layouts:** 1 (AppLayout). **Providers:** 4. **Hooks:** 7. **Services:** 6. **Utils:** 8+.
- **Total frontend source files:** 90 (all read by exploration agent).
