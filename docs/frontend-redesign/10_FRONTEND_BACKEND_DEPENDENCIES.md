# 10 — Frontend ↔ Backend Dependencies

Separates **pure frontend bugs** (fix in frontend, no backend change) from **backend
capabilities the redesign needs** (recommend separately; do NOT change backend from this
frontend work). Cross-references the transformation plan (`..\02_COMPLETE_BUG_AUDIT.md`,
`..\12_API_AND_DATABASE_BLUEPRINT.md`). The frontend must never fabricate a capability the
backend lacks.

## 1. Pure frontend contract bugs (fix in FE only)

| ID | Bug | Frontend fix | Backend (unchanged) |
|---|---|---|---|
| C31 | Exports always 401 | `downloadExport` send Authorization via unified request() | exports already require Bearer |
| C32 | Report-balance 422 | send query param `reported_balance_paise` (not JSON body) | route expects query `gt=0` |
| C33 | Amount filter ×100 escalation | store rupees consistently in URL+input | filter expects paise (convert once) |
| C34 | Income page-scoped totals | use server `total_paise` | IncomeList already returns it |
| C36 | Weekly net positive | signed formatter (drop Math.abs) | backend sign correct |
| C41 | Preferences reset | send full payload OR backend merge (see §2) | partial PUT destructive |
| C48 | Web SMS confirm no-op | call real `ingestSms` on web | ingest exists |
| P25 | parseFloat comma truncation | use `parseRupeesToPaise` | — |
| P34 | Ingest status ignored | type response, handle created/replayed/conflict/queued | response already has status |
| C40 | Login setup race | derive mode after setupStatus loads | setup-status exists |
| C39 | Android back vs Modal | dispatch Escape on document / integrate stack | — |
| C38 | Camera attach/cleanup | render video before attach; cleanup on unmount | — |
| C55 | False reconcile (FE math) | use server `reconciliation_difference_paise`; handle null | server field exists |
| C45/C46/C44/C47/C43 | display/labels | full aggregation query / correct meta / bucket labels / filtered total / period label | analytics exists |

These are frontend presentation/contract fixes; **no backend response contract changes**.

## 2. Backend changes recommended (separate work, not done here)

Needed for full redesign fidelity. Until delivered, UI shows only what exists and labels gaps.

### B1 — Preferences merge semantics (C41 root)
- **Need:** PUT partial should merge, not overwrite defaults; expose all fields.
- **Backend:** change `update_preferences` to merge into stored JSON; add missing fields to schema.
- **FE interim:** send full payload (read-modify-write) to avoid reset; debounce.
- **Also:** preferences unique key bug (C20) — composite `(user_id,key)` (transformation DB2).

### B2 — SMS server review queue + dead-letter (P7/C24/C25)
- **Need:** persist ambiguous/conflict candidates server-side; cross-device recovery; failed/
  dead-letter states; bounded retry.
- **Backend:** new `sms_review_candidates` + endpoints (list/confirm/reject); direction required
  (no default DEBIT — C16); quarantine NON_FINANCIAL server-side.
- **FE interim:** local queue (Android) + honest "available on Android" on web; no simulation.

### B3 — Income analytics / savings trend (PD2)
- **Need:** income-vs-expense and savings trends beyond expense-only analytics.
- **Backend:** income analytics service/endpoints (summary/by-type/trends) mirroring expenses.
- **FE interim:** inflow from cashflow summary; label "income analytics coming" only if honest;
  do not fabricate charts.

### B4 — Budget alerts + historical comparison
- **Need:** overspend alerts endpoint; month-over-month budget comparison.
- **Backend:** add alerts + comparison to budgets router; type summary response.
- **FE interim:** derive overspend client-side from spent>allocated (truthful); omit historical
  until endpoint exists.

### B5 — Auth lifecycle (D13)
- **Need:** password change, active sessions, logout revocation, refresh token.
- **Backend:** refresh/revocation/logout/password endpoints (transformation API8).
- **FE interim:** local logout (clear token) works; show "session management coming" honestly.

### B6 — Full backup/restore v2 (C30/U11)
- **Need:** backup includes incomes/accounts/transfers/evidence/provenance; restore dedup + tenant scope.
- **Backend:** exports v2 complete + restore integrity (transformation API6/T4).
- **FE interim:** use v2 `/exports` prefix; label scope honestly; warn restore limitations.

### B7 — Reversal API (D3)
- **Need:** explicit reversal/refund endpoint + soft-delete for audit.
- **Backend:** reversal service exists (model); expose API; soft-delete option.
- **FE interim:** edit/delete with confirm; show reversal evidence where present.

### B8 — Financial definitions (C11/C14, U1/U2)
- **Need:** net refunds, one balance/cashflow definition, zero-balance handling.
- **Backend:** transformation T13/T8 (shared reporting module).
- **FE interim:** present server values truthfully; don't recompute net client-side from two endpoints.

### B9 — Idempotency scoping (C1) & direction safety (C16/C17)
- **Need:** user-scoped keys; no default DEBIT.
- **Backend:** transformation T1/T2 (P0).
- **FE interim:** send idempotency keys; explicit direction selector; never default uncertain to debit.

## 3. Capability honesty matrix (what UI may show now)

| Feature | Now | After backend |
|---|---|---|
| Budgets monthly/category/progress | YES (API exists) | + alerts/historical |
| Income analytics | partial (cashflow inflow) | full income trends |
| SMS review queue | Android local; web honest limited | server queue + dead-letter |
| Export/backup | CSV + v1 partial (fix auth) | full v2 + provenance |
| Password/sessions | local logout only | change/revoke/sessions |
| Reversal | edit/delete + evidence | explicit reversal API |
| Savings trend | derive from real income/expense | dedicated endpoint |

**Rule:** never show a control that implies a missing capability; never mock financial data;
label limitations honestly. Backend recommendations are documented here and in the
transformation plan, but **not implemented by the frontend redesign**.

## 4. Contract stability guarantee

The frontend redesign will NOT change: API response shapes, financial calculations, database
schemas, authentication mechanism, SMS native functionality, production data. It fixes
frontend-side contract misuse (sending wrong param/missing auth) and consumes existing
contracts correctly. New backend endpoints are additive and optional until delivered.
