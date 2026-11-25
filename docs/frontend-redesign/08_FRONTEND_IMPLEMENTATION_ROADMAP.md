# 08 — Frontend Implementation Roadmap

Dependency-aware phases. Frontend-only changes first; backend-dependent features flagged
(detail in `10_FRONTEND_BACKEND_DEPENDENCIES.md`). Preserve working features; no mock
production data; no backend/financial-logic/schema changes from the frontend work.

> Plan mode produced this roadmap. Implementation requires switching agents. Phases assume
> the transformation plan's P0 backend fixes (idempotency, direction safety) land in parallel;
> frontend contract fixes that are pure FE bugs can proceed immediately.

## Phase F0 — Foundations (no visual change yet) — ~1 wk

- **F0.1 Tokens:** new green/obsidian CSS vars + Tailwind mapping; define/remove undefined
  utilities; split index.css → tokens/base/utilities. (03)
- **F0.2 Primitives:** upgrade Button/Card/Modal/Drawer/Sheet/Tabs/Field/Progress/States to
  token-only, compound, accessible. Fix Modal footer overflow + Android back (C39/P32).
- **F0.3 Brand:** redraw logo flat green (mark + wordmark solid + "Private ledger"); update assets.
- **F0.4 API client:** typed, unified request(); fix downloadExport auth (C31), reportBankBalance
  query (C32), preferences merge (C41 FE side), ingest typed+status (P34). Remove `as any`.
- **F0.5 State:** shared query cache (TanStack Query or minimal); invalidation; usePeriod IST shared.
- **F0.6 Tests/lint:** Vitest+Testing Library setup; stylelint/eslint gates; axe in CI.
- **Gate:** primitives pass a11y + component tests; no undefined classes; bundle baseline.

## Phase F1 — Core correctness & broken flows (P1) — ~1.5 wk

- **F1.1 Financial display:** BalanceHero truthful (C5/C6), StatCard server totals (C34),
  signed weekly net (C36), reconciliation truth (C55), filtered totals (C47), bucket labels (C44),
  average label (C7), breakdown full aggregation (C45) + payment labels (C46).
- **F1.2 Transactions:** unified list, filter unit fix (C33), page reset (C35), add affordances (C50),
  detail drawer, edit/delete confirm; wire transfers edit/delete (U10 FE).
- **F1.3 Income:** IncomeForm + income-type management UI + seed prompt (C57).
- **F1.4 SMS review (FE):** real web confirm (C48), DirectionSelector (C17 FE), integer amount (P25),
  remove simulation (D33), honest status (P34). [Server review queue/dead-letter = backend dep.]
- **F1.5 Auth/offline:** login setup race (C40), offline boot (P35), 5xx queue (D27), poison
  quarantine (D28), idempotency online (D26), invalidate (D30).
- **F1.6 Scanner:** camera attach+cleanup (C38), PDF (C54), wire/remove orphan (C49), privacy copy.
- **Gate:** core journeys work E2E; no broken flow; financial surfaces truthful.

## Phase F2 — Navigation & shell redesign — ~1 wk

- **F2.1 AppShell:** new sidebar (grouped) + topbar; mobile bottom nav + FAB QuickAddSheet + More.
- **F2.2 Routes:** consolidate duplicates → redirects (D6); add /budgets, /categories, /sms-review nav.
- **F2.3 CommandPalette:** full coverage, dialog role, focus trap, contrast (C53).
- **F2.4 PageHeader:** consistent across pages; period picker shared.
- **Gate:** navigation coherent desktop+mobile; no orphan/dead branches; back button works.

## Phase F3 — Page-by-page premium redesign (P2) — ~2.5 wk

Order (highest priority first):
1. **Overview** (BalanceHero + stats + flow + recent + category + quick actions).
2. **Transactions** (premium list/table/cards, filters, detail).
3. **Budgets** (NEW — monthly/category cards, progress, create/edit; alerts/historical if backend).
4. **Analytics** (income-vs-expense, trends, categories, weekly; export).
5. **Accounts** (reconciliation truthful, report-balance fixed).
6. **SMS review** (status, queue, evidence, direction, failed/unresolved).
7. **Categories** (expense+income types, detail).
8. **Settings** (grouped, prefs merge, export/backup, connection).
9. **Notifications / Security / Scanner / Welcome / Login / NotFound**.
- Each page: token styling, L/E/R states, a11y, mobile-first, component tests.
- **Gate:** every page same design language; axe AA; responsive verified; no old design left.

## Phase F4 — Polish, performance, accessibility — ~1 wk

- Motion restraint (one curve, remove slop animations); reduced-motion.
- Performance: lazy charts, virtualize long lists, consolidate polling, bundle <250KB.
- Full a11y audit (axe + pa11y + manual keyboard/TalkBack); contrast verification of green tokens.
- Copy pass (unslop): plain active sentence-case, no mock data, honest empty/error states.
- Dead code removal (~1000 lines); remove duplicate components.
- **Gate:** WCAG 2.2 AA; performance targets; template-check passed.

## Phase F5 — Backend-dependent enhancements (coordinate) — varies

- Income analytics / savings trend UI (when backend adds).
- Budget alerts + historical comparison UI (when backend adds).
- SMS server review queue / dead-letter UI (when backend adds).
- Password change / sessions / logout revocation UI (when backend adds).
- Full backup/restore v2 UI (when backend fixes provenance).
- These are **optional until backend ready**; UI must not fabricate the capability.

## Dependencies & parallelization

```
F0 ──► F1 ──► F2 ──► F3 ──► F4
              (F2 can overlap F1 tail)
F5 depends on backend (transformation P0/P1 + new endpoints)
```
- F0.4 contract fixes are pure FE → immediate.
- F1.1 financial display depends on transformation T13 definitions for net/refund consistency;
  pure display fixes (sign, labels, totals) can land earlier.
- F3 Budgets depends on budgets API (exists) — build now; alerts/historical wait for backend.
- Parallel tracks: primitives/state (F0) ∥ contract fixes ∥ brand assets.

## Estimated effort

F0 ~1wk · F1 ~1.5wk · F2 ~1wk · F3 ~2.5wk · F4 ~1wk = **~7 engineer-weeks** frontend core,
plus F5 backend coordination. Planning estimate; refine after F0 baseline. One frontend
engineer + design review; Android device testing adds time.

## Highest-priority pages

1. Overview (first impression + financial truth)
2. Transactions (core daily use)
3. SMS review (signature feature, trust)
4. Budgets (missing feature, advertised)
5. Settings (broken exports/prefs)

## Risk controls

- Strangler migration behind same routes; feature-flag risky changes.
- Regression tests before/after each surface; never break auth/SMS/offline.
- Contract tests prevent API drift; no `as any`.
- Visual regression screenshots per page (light+dark, mobile+desktop).
