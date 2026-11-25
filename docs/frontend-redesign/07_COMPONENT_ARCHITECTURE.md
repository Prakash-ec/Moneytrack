# 07 — Component Architecture

Reusable components, layouts, state management, and styling architecture. Governed by
`vercel-composition-patterns` (compound components, avoid boolean-prop proliferation) and
`vercel-react-best-practices` (rendering/data-fetching performance). Preserve React 18 +
Vite + Tailwind + Router 7 (no compelling reason to change).

## 1. Directory structure (target)

```
frontend/src/
  app/                 route definitions, providers composition (keep App.tsx role)
  layouts/
    AppShell.tsx       sidebar + topbar + mobile dock + FAB + outlet
    Sidebar.tsx  BottomNav.tsx  TopBar.tsx  MoreSheet.tsx
  components/
    ui/                design-system primitives (token-only)
      Button Card Modal Drawer Sheet Tabs Table List Badge Tooltip
      Input Textarea Select Checkbox Switch AmountInput DateRangePicker
      Progress Skeleton EmptyState ErrorState ConfirmDialog Toast
    finance/           domain components
      BalanceHero StatCard FlowBars CategoryRankList TransactionRow TransactionTable
      TransactionDetail BudgetCard VerifiedBadge DirectionSelector SmsReviewCard
      PeriodPicker ExportButton
    charts/            TrendChart FlowBars CategoryDonut (thin Recharts wrappers)
    brand/             BrandLogo (flat green) Wordmark
  features/            page-level composition (one folder per surface)
    overview/ transactions/ budgets/ analytics/ accounts/ sms-review/
    categories/ notifications/ security/ settings/ auth/ scanner/
  hooks/               useApiQuery (upgraded), usePeriod, useOnlineStatus, useAndroidBackButton...
  providers/           Auth Theme Toast Refresh (keep)
  services/            api.ts (typed), auth, offlineQueue, sms, keepAlive
  lib/                 currency (keep), dates (IST), cn, format
  styles/              tokens.css (vars) + base.css + utilities (replace monolithic index.css)
```

Remove dead code (~1000 lines): FintechCard3D, PermissionRecoveryModal, TypeBreakdownTable,
TypeBarChart, SegmentedControl (or adopt it), SlowNetworkBanner, extra skeletons,
registerBackHandler, getBankReconciliation, unused learnings, api-base-changed event.

## 2. Design-system primitives (compound, token-only)

- **Button** — keep API; variants via `variant`, sizes via `size`; no boolean soup.
- **Card** — compound: `Card`, `Card.Header`, `Card.Body`, `Card.Footer`. StatCard separate (number-only).
- **Modal/Drawer/Sheet** — one overlay primitive with `placement` (center/bottom/right); focus trap,
  stack, scroll-lock, Escape/back close, restore focus. Fixes footer overflow + Android back.
- **Tabs** — `Tabs`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Panel`; role/aria-selected/arrow-keys built in.
- **Table/List** — `DataTable` (desktop) + `CardList` (mobile) sharing row render; responsive switch.
- **Field** — `Field` wraps label+control+hint+error; **label always associated** (fix optional htmlFor).
- **AmountInput** — integer paise via `parseRupeesToPaise`; rupee prefix; tabular; inline validation.
- **Progress** — solid accent; `tone` for warning/danger; label+value; no gradient.
- **States** — EmptyState/ErrorState/Skeleton; no animate-ping/pulse on non-live; token surfaces.
- **VerifiedBadge** — signature green dot + text; `state: verified|unverified|discrepancy`.

Rule: primitives consume tokens only; no hardcoded hex; no undefined Tailwind classes.

## 3. Domain components

- **BalanceHero** — available figure (tabular), reported/opening distinction, VerifiedBadge,
  privacy toggle. Never masks zero/negative.
- **StatCard** — label, big figure, change-vs-period; number only.
- **FlowBars** — income vs expense comparison; positive/danger; accessible table fallback.
- **TransactionRow/Table** — direction icon + sign + colour; category dot; account; date IST.
- **TransactionDetail** — drawer; fields + evidence + actions (edit/reverse/delete).
- **BudgetCard** — allocated/spent/remaining + Progress + edit.
- **SmsReviewCard** — evidence + DirectionSelector (Debit/Credit/Can't tell) + status.
- **PeriodPicker** — one IST period source; presets + custom; shared across surfaces.

## 4. State management

- **Server state:** upgrade `useApiQuery` to a small shared cache (key-based dedup, stale-while-
  revalidate, mutation invalidation). Option: adopt TanStack Query (compelling reason: fixes
  no-cache/dedup D29, cross-page staleness D30, skeleton flash). If added, it's the only new
  dependency; otherwise implement minimal shared cache. **Recommend TanStack Query** for
  correctness + dev ergonomics; keep bundle small.
- **Invalidation:** mutations call `invalidate` so Overview/totals refresh (fix D30). Keep
  RefreshProvider as event bridge or replace with query invalidation.
- **Auth:** keep AuthProvider + Keystore mirror; **offline boot keeps valid session** (fix P35);
  add refresh/revocation when backend ready (10).
- **Theme/Toast:** keep.
- **Offline queue:** keep idempotency keys; extend to transfers/accounts; enqueue on 5xx (fix D27);
  poison quarantine + backoff (fix D28); flush on online + resume.
- **Period:** single `usePeriod` (IST) shared; URL-synced; no per-page divergence.
- **Forms:** RHF + Zod everywhere (replace manual useState forms); schemas mirror backend bounds.

## 5. Styling architecture

- **tokens.css** — CSS vars (`:root`/`.dark`) from `03_DESIGN_SYSTEM`; single source of truth.
- **Tailwind config** — maps tokens; define/remove undefined utilities; add animate plugin or keyframes.
- **base.css** — reset, focus-visible, reduced-motion, typography base.
- **Component styles** — Tailwind utilities referencing tokens; minimal CSS for complex primitives
  (button/card/badge) kept but token-driven. **No page-specific hacks**, no arbitrary `var()` where
  a token exists, no one-off spacing/radius.
- **Lint gates:** stylelint (no undefined classes, no hardcoded hex), eslint (no `as any` API casts).
- Split monolithic index.css (~1700 lines) into tokens/base/utilities; remove dead rules.

## 6. API client (typed, contract-safe)

- Generate/maintain TS types from backend Pydantic schemas (or hand-mirror with tests). Remove
  `as any` (D37). Fix contract bugs: downloadExport Authorization (C31), reportBankBalance query
  param (C32), preferences merge (C41), ingest response typed + status handled (P34).
- One `request()` path (auth.ts/downloadExport currently bypass — unify).
- Idempotency keys on all online creates (D26); retries only for idempotent/keyed.

## 7. Performance patterns (vercel-react-best-practices)

- Lazy routes + Suspense (keep); prefetch on hover/intent for nav.
- Memoize expensive lists/charts; virtualize long transaction lists if needed.
- Avoid effect-dep churn (fix D40 listener re-subscribe); stable callbacks.
- Charts lazy; limit Recharts imports; no layout-property animations.
- Consolidate polling; visibility-aware; pause backgrounded.
- Bundle budget: initial <250KB gzip; analyze with vite build --report.

## 8. Testing architecture

- Vitest + Testing Library: component tests for primitives + finance components (BalanceHero
  truthful balance, VerifiedBadge, StatCard, TransactionRow sign, BudgetCard progress,
  DirectionSelector, AmountInput, preferences merge).
- Page tests: overview, transactions, budgets, sms-review, settings flows.
- Contract tests: client types vs backend schemas.
- a11y: axe-core in tests; manual keyboard/TalkBack.
- E2E: Playwright (web) + capacitor-testing device loop (Android) for core journeys.
- CI gates: typecheck + vitest + build + axe + bundle budget.

## 9. Migration strategy (preserve working features)

- Strangler pattern: introduce tokens + primitives first; migrate page-by-page behind the same
  routes; keep API integrations intact; remove duplicates/dead code as each surface migrates.
- Never break auth/SMS/offline; feature-flag risky changes; regression tests before/after.
- Keep CurrencyUtils, ThemeProvider, Modal focus management, ExpenseForm, offline queue core.
