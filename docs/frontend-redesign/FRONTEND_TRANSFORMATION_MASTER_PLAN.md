# FRONTEND TRANSFORMATION MASTER PLAN

Authoritative consolidated plan for the MoneyTrack frontend redesign. Companions: `01`–`10`
in this directory. Evidence base: `..\07_FRONTEND_UX_AUDIT.md`, `..\02_COMPLETE_BUG_AUDIT.md`.
Mode: read-only plan; no app code/styling modified. Skills applied: `frontend-design`, `unslop`
(credit Damir Sokolovsky CC BY 4.0), `web-design-guidelines`, `accessibility-engineering`,
`vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-advanced-types`,
`vite`, `vitest`, `capacitor-testing`.

> **Location:** Plan mode writes only to `C:\Users\velmu\.opencode\plan\frontend-redesign\`.
> Copy to `docs/frontend-redesign/` after switching out of Plan mode. Implementation requires
> switching agents.

## 1. Objective

Transform the frontend into a premium, calm, trustworthy, mobile-first personal finance
product — a complete visual + interaction redesign, not a recolour. Preserve every working
feature, real API integration, auth, SMS, and offline capability. No backend/financial-logic/
schema/contract changes from this work.

## 2. Design direction (summary of 02)

- **Character:** calm, exact, trustworthy — a private ledger/passbook instrument.
- **Brand pivot:** indigo gradient → **flat green** `#16845B` (light) / `#36B889` (dark);
  obsidian surfaces kept; font trio kept (Inter / Plus Jakarta Sans / JetBrains Mono).
- **Quiet chrome, one accent;** green = brand/verified; distinct mint = income; muted red =
  expense; direction also icon+sign (never colour alone).
- **Signature:** verified-status dot tied to real SMS reconciliation (never fabricated).
- **Moments:** the balance figure; the income-vs-expense flow chart. Everything else quiet.
- **Anti-slop:** no gradients/glows/gradient-text/uppercase-tracked/emoji/mock-data/looping motion.
- Light + dark themes; WCAG 2.2 AA; mobile-first.

## 3. Current state (summary of 01)

- 20 page files / 24 routes; 33 components; React 18 + Vite 6 + Tailwind 3.4 + Router 7 +
  Capacitor 8.5; custom useApiQuery (no shared cache); ~1700-line index.css.
- Identity is **Mercury Indigo** (NOT green); gradient+glow logo; two parallel styling languages
  + undefined utilities → inconsistency.
- **57 confirmed defects** overall (frontend subset: C31–C57 etc.); broken flows (exports 401,
  report-balance 422, filter escalation, income blocked fresh instance, web SMS no-op, camera
  leak, back-button, login race); missing Budgets UI; ~1000 lines dead code; no component tests.

## 4. Design system (summary of 03)

Tokens: neutral graphite-ink ramp; green accent (contrast-corrected: dark theme uses dark ink
text on #36B889); distinct income/expense semantics; typography scale (figures JetBrains Mono
tabular); 4px spacing; nested radius; neutral depth; breakpoints sm640/md768/lg1024/xl1280/2xl1536;
lucide 16/18 stroke1.5. Compound token-only primitives (Button/Card/Modal-Drawer-Sheet/Tabs/
Field/AmountInput/Progress/States/VerifiedBadge). No undefined classes, no page hacks.

## 5. Information architecture (summary of 04)

Sidebar (desktop) grouped Main/Manage/System; mobile bottom nav + FAB QuickAdd + More.
Consolidate duplicate routes → redirects; add /budgets, /categories, /sms-review nav. One IST
period source; one money formatter; consistent PageHeader; real badges. Journeys J1–J9 defined.

## 6. Page redesign (summary of 05)

Every page redesigned: Overview (truthful balance hero + stats + flow + recent + category +
quick actions), Transactions (unified, filters fixed, detail drawer), Expenses/Income (matching,
income-type management), Budgets (NEW), Analytics (income-vs-expense, trends, categories, weekly,
export), SMS review (status, explicit direction, evidence, failed/unresolved, no simulation),
Accounts (truthful reconcile, report fixed), Categories, Settings (grouped, prefs merge, export),
Notifications, Security, Scanner, Welcome, Login, NotFound. No page left old.

## 7. Mobile-first (summary of 06)

Phone-first: bottom nav + FAB, card lists (not tables), drawers/sheets, full-screen forms,
safe-area, Android back integration, touch ≥44, consolidated polling, Capacitor WebView verified.

## 8. Component architecture (summary of 07)

Strangler migration; token-only compound primitives; domain finance components; shared query
cache (recommend TanStack Query) + invalidation; RHF+Zod everywhere; typed API client (no `as any`);
split index.css; remove dead code; Vitest+Testing Library + axe + Playwright + capacitor-testing.

## 9. Implementation phases (summary of 08)

- **F0 Foundations** (~1wk): tokens, primitives, brand, API client fixes, state, tests/lint.
- **F1 Core correctness** (~1.5wk): financial display, transactions, income, SMS FE, auth/offline, scanner.
- **F2 Navigation/shell** (~1wk): sidebar/bottom nav, route consolidation, palette, headers.
- **F3 Page redesign** (~2.5wk): Overview→Transactions→Budgets→Analytics→Accounts→SMS→Categories→Settings→rest.
- **F4 Polish/perf/a11y** (~1wk): motion, performance, WCAG audit, copy, dead code.
- **F5 Backend-dependent** (varies): income analytics, budget alerts/historical, SMS server queue,
  auth lifecycle, full backup — optional until backend delivers; never fabricate.
- **Total frontend core ~7 engineer-weeks.** Spine F0→F1→F2→F3→F4; contract fixes immediate.

## 10. Highest-priority pages

1. Overview · 2. Transactions · 3. SMS review · 4. Budgets · 5. Settings.

## 11. Technical risks

| Risk | Mitigation |
|---|---|
| Green token contrast fails (white on #36B889) | dark ink text on green; verify with axe; contrast meter |
| Brand pivot disrupts recognition | keep mark geometry + name + fonts; flat redraw; gradual rollout |
| Migration breaks auth/SMS/offline | strangler behind same routes; regression tests; feature flags |
| Shared-cache refactor regressions | contract + component tests; incremental adoption |
| Financial display depends on backend definitions | pure display fixes first; net/refund waits for T13; never recompute wrong |
| Backend gaps (income analytics, SMS queue) | capability honesty matrix; show only what exists |
| Bundle bloat (TanStack/Recharts) | bundle budget <250KB; lazy charts; analyze |
| Undefined utilities regress | stylelint gate; token lint |
| Android WebView quirks | capacitor-testing device matrix; safe-area; back integration |

## 12. Backend dependencies (summary of 10)

Pure FE fixes: C31/C32/C33/C34/C36/C41(FE)/C48/P25/P34/C40/C39/C38/C55/display.
Backend recommended (separate): prefs merge, SMS server queue/dead-letter, income analytics,
budget alerts/historical, auth lifecycle, full backup v2, reversal API, financial definitions,
idempotency scoping. Frontend never changes backend contracts; consumes them correctly.

## 13. Quality verification (summary of 09)

- Automated: typecheck, vitest component/page, stylelint/eslint, axe-core@4.13.0 + pa11y@9.1.1,
  vite bundle report, contract tests, Playwright E2E.
- Manual: keyboard, NVDA/TalkBack, contrast meter, 200% zoom, device matrix, visual screenshots
  vs unslop checklist.
- Criteria: visual V-1..7, financial F-1..8, functional FN-1..14, responsive R-1..6, a11y A-1..8,
  performance P-1..4, regression RG-1..6.
- Per-page DoD: criteria + tests + screenshots (light/dark × mobile/desktop) + a11y + no regression.

## 14. Final quality requirements

Coherent across the app; every page same premium language; not a generic template; real user
journeys simple/predictable; no mock production data; real APIs preserved; exact financial values;
Indian rupee formatting; WCAG 2.2 AA; mobile-first; backend untouched.

## 15. Execution handoff

This is a PLAN. To execute: switch out of Plan mode → copy these 11 docs to
`docs/frontend-redesign/` → start F0 (tokens/primitives/brand/contract fixes) with tests-first →
proceed F1–F4 → coordinate F5 with backend. No application code, styling, dependencies, backend,
or production data was modified during this planning.

## Document index

01_CURRENT_FRONTEND_AUDIT · 02_NEW_PRODUCT_DESIGN · 03_DESIGN_SYSTEM ·
04_INFORMATION_ARCHITECTURE · 05_PAGE_BY_PAGE_DESIGN · 06_MOBILE_FIRST_DESIGN ·
07_COMPONENT_ARCHITECTURE · 08_FRONTEND_IMPLEMENTATION_ROADMAP ·
09_FRONTEND_ACCEPTANCE_CRITERIA · 10_FRONTEND_BACKEND_DEPENDENCIES ·
FRONTEND_TRANSFORMATION_MASTER_PLAN.
