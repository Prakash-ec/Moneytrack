# MoneyTrack — Frontend Audit

**Audit Date:** 2026-11-26  
**Codebase Checked:** `frontend/src/` (`main` @ `a781c21`), including commit `bfcdfff` redesign & cache fixes  
**Skills Applied:** `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`, `accessibility-engineering`, `typescript-advanced-types`, `vite`, `vitest`, `unslop`

---

## 1. Visual Design & Architecture Status

Commit `bfcdfff` landed substantial parts of the `docs/frontend-redesign/` plan:
- **Approved Design Tokens (`frontend/src/styles/tokens.css`, `tailwind.config.js`):** Primary green `#16845B` (light) / `#36B889` (dark) with WCAG AA dark ink contrast (`#06231a` on `#36B889`), neutral graphite/obsidian surfaces, `Inter Variable` + `Plus Jakarta Sans Variable` + `JetBrains Mono` (`tabular-nums`), and flat green SVG branding assets.
- **Shell & Core Pages Redesigned:** `AppLayout.tsx`, `HomePage.tsx`, `TransactionsPage.tsx`, `AnalyticsPage.tsx`, `BankAccountsPage.tsx`, `ExpensesPage.tsx`, `IncomePage.tsx`, `TransfersPage.tsx`, `BreakdownPage.tsx`, `TrendsPage.tsx`, `WeeklyReportPage.tsx`, `NotificationsPage.tsx`, `SecurityCentrePage.tsx`, `LoginPage.tsx`, `WelcomePage.tsx`, `AppPage.tsx`, and `Panel.tsx`.
- **Browser E2E Verification (`69034c81`):** Confirmed 0 console errors, 0 uncaught page errors, clean new-user registration/login/session reload persistence, and live expense/account updates after fixing `useApiQuery.ts` & `AuthProvider.tsx` in `bfcdfff`.

---

## 2. Remaining Functional & UX Defects in Current Code

| ID | Sev | Area | Finding & Exact Location |
|---|---|---|---|
| **C12** | P1 | Missing Budgets UI | Backend `/api/budgets` CRUD + `/summary` are complete (`budgets.py`), yet `frontend/src/App.tsx` and `AppLayout.tsx` still lack a `/budgets` page/route. |
| **C57-UI** | P1 | Custom Income Types | Backend now seeds 8 default income types (`main.py:107-146`), but `/expense-types` and `IncomePage.tsx` still provide no UI to create/manage custom `IncomeType` records. |
| **C39** | P1 | Android Hardware Back | `useAndroidBackButton.ts:46` dispatches `Escape` on `window`, whereas `Modal.tsx:102` listens on `document`. Hardware back cannot close modals on Android. |
| **C50** | P1 | Embedded Tab Actions | `TransactionsPage.tsx:80-91` only shows `Scan receipt` / `Add expense` in the header when `activeTab === 'expenses'`; switching to `Income` or `Transfers` hides the add button when the list already has entries. |
| **C34** | P1 | Income Total Scope | `IncomePage.tsx:90` sums only the current page (`pageSize: 20`) instead of displaying `incomesQuery.data.total_paise` for filtered results. |
| **C36** | P1 | Weekly Net Sign | `WeeklyReportPage.tsx` formats negative net cashflow without an explicit negative sign/danger tone in summary display. |
| **C45 / C46** | P1/P2 | Breakdown Stats | `BreakdownPage.tsx:93-95` caps client-side breakdown query at `page_size: 100`; `PAYMENT_METHOD_META` (`:36-45`) uses lowercase keys (`card`, `netbanking`) that miss backend enum values (`Debit Card`, `Bank Transfer`). |
| **C48 / C17 / P25** | P1 | SmsReviewPage Web/Parse | `SmsReviewPage.tsx:32-41` uses heuristic `isCreditItem` guessing debit for unknown direction; edit form uses `parseFloat` (`P25`); web confirm calls no-op `sms.ts` stubs (`C48`). |
| **P35** | P1 | Offline Boot Auth | `AuthProvider.tsx:60-71` clears stored token/user on **any** `fetchCurrentUser()` error (including offline/network `status === 0` or `503`), logging users out when opening the app offline! |
| **C35** | P2 | Income Filter Pagination | `IncomePage.tsx:45-85` does not reset `page` to `1` when search/account/type filters change. |
| **C37** | P2 | Fraud Helpline `tel:` | `SecurityCentrePage.tsx:327` uses `href="tel:${item.phone.split(' ')[0]}"`, dialing only `"1800"` instead of the full toll-free number. |
| **C43 / C44 / C47** | P2 | Misleading Labels | `TypesPage.tsx:323-326` labels all-time counts "this month"; `TrendsPage.tsx` hardcodes `Days` / `/day` for weekly/monthly buckets; `ExpensesPage.tsx` mixes unfiltered summary total with filtered count. |
| **D36 / C51 / C52** | P2 | Legacy CSS & Titles | `SettingsPage.tsx` (`narrow-page`), `TypesPage.tsx`, `SmsReviewPage.tsx` still use legacy CSS classes; `SecurityCentrePage` and `NotificationsPage` omit `useDocumentTitle()`; native `<select>` + custom chevron renders double arrow in Chromium when Tailwind `appearance-none` is overridden by `.filter-bar` or browser defaults; `TransactionRow.tsx` renders `merchant` twice at responsive breakpoints. |

---

## 3. Build, Bundle & Test Status

- **Typecheck (`tsc --noEmit`):** 0 errors.
- **Unit/Service Tests (`vitest run --pool=forks`):** 8 test files, 61/61 tests passing.
- **Production Build (`vite build`):** Succeeds cleanly with `VITE_API_BASE_URL=https://moneytrack-backend-g5is.onrender.com/api` baked from `frontend/.env.production`.
- **Coverage Gap (`V1`):** Zero React component/integration tests (all 8 test files cover `utils/` and `services/` only).
