# 09 — Frontend Acceptance Criteria

Measurable visual, functional, responsive, accessibility, and regression criteria. Every
criterion is testable. IDs cross-reference the audit (`01`) and roadmap (`08`).

## 1. Visual / design-system

- V-1: Every page uses token-based styling; **zero undefined Tailwind classes**, zero hardcoded
  hex in components, zero page-specific CSS hacks (stylelint gate).
- V-2: One accent (green) covers a few % of screen; surfaces neutral; no hue gradients, gradient
  text, glows, coloured shadows, blobs (unslop checklist).
- V-3: Consistent spacing (4px grid), radius (nested rule), typography (trio, weights ≤600),
  icons (lucide 16/18 stroke 1.5) across all pages.
- V-4: Logo flat green, wordmark solid, tagline sentence case; no gradient/glow mark.
- V-5: Stat cards are numbers only; one main chart per screen; no identical-card grid template.
- V-6: Light + dark themes coherent; system preference respected; theme-color meta matches.
- V-7: Template-check: swapping product name would NOT fit (verified dot, ₹ figures, SMS queue).

## 2. Financial correctness (presentation)

- F-1: Available balance never masks zero/negative; reported/opening/available clearly distinguished.
- F-2: Verified badge only when reported balance exists AND matches; else "Not yet verified".
- F-3: Income totals use server period total (not page-scoped); weekly net keeps sign.
- F-4: Breakdown aggregates full period; bucket labels match granularity; average correctly labeled.
- F-5: All money `formatINR` (₹1,250.00 / -₹500.00 / lakh-crore); tabular-nums; integer paise; no
  float in presentation; exact backend values preserved.
- F-6: Direction encoded by icon + sign + colour (never colour alone).
- F-7: No fabricated insights; health indicators only where data supports; no mock production data.
- F-8: Period definitions consistent (IST) across Overview/Analytics/Budgets/Weekly.

## 3. Functional / flows

- FN-1: Export CSV/JSON downloads (auth sent) — C31.
- FN-2: Report bank balance succeeds (query param) — C32.
- FN-3: Preferences toggle preserves other settings (merge) — C41.
- FN-4: Amount filter no escalation; URL/input units consistent — C33.
- FN-5: Add expense/income/transfer affordances present on all tabs; FAB opens all — C50.
- FN-6: Income recordable on fresh instance (type creation prompt) — C57.
- FN-7: SMS web confirm persists via real ingest; direction explicit (never default debit);
  response status shown honestly — C48/C17/P34.
- FN-8: Camera preview attaches + cleans up on unmount; PDF handled or removed — C38/C54.
- FN-9: Android back closes topmost overlay; login fresh-instance admin creation works — C39/C40.
- FN-10: Offline boot keeps valid session; 5xx queued; poison quarantined; cross-page invalidate — P35/D27/D28/D30.
- FN-11: Budgets create/edit/progress/overspend work; Dec→Jan rollover correct.
- FN-12: Transactions search/filter/sort/date/pagination/edit/delete-confirm work.
- FN-13: No orphaned routes; no dead nav branches; duplicates redirect.
- FN-14: Simulation/fake-import removed from production; welcome preview labeled sample.

## 4. Responsive

- R-1: Usable at 360/390/414/768/1024/1280/1536; no horizontal overflow; no clipped amounts.
- R-2: Mobile bottom nav + FAB + More; desktop sidebar; purpose-built (not shrunk desktop).
- R-3: Tables → card lists on mobile; detail → drawer; filters → sheet; forms → full-screen sheet.
- R-4: Touch targets ≥44 (AA min 24 with spacing); primary actions thumb-reachable.
- R-5: Safe-area insets; 200% zoom no content loss; landscape usable.
- R-6: Android WebView/device verified (capacitor-testing); TalkBack navigable.

## 5. Accessibility (WCAG 2.2 AA)

- A-1: axe-core + pa11y no Critical/Serious violations (pinned versions).
- A-2: Contrast 4.5:1 text / 3:1 large+UI; green tokens verified (no white-on-#36B889).
- A-3: All interactive elements keyboard-accessible; visible focus ring; no traps.
- A-4: Tabs role/aria-selected/arrow-keys; dialogs role/aria-modal/focus-trap/restore.
- A-5: All inputs associated labels; errors aria-describedby; no clickable divs.
- A-6: Colour not sole indicator; dynamic updates aria-live; images alt.
- A-7: Reduced-motion respected; no looping animations on non-live.
- A-8: Manual keyboard + screen-reader (NVDA/TalkBack) verified or recorded untested.

## 6. Performance

- P-1: Initial bundle <250KB gzip; charts lazy; no oversized charts.
- P-2: Dashboard LCP <2.5s (mid-tier phone); skeleton without layout shift.
- P-3: Polling consolidated/visibility-aware; paused backgrounded; no infinite retry churn.
- P-4: Long lists virtualized if needed; memoized charts; no effect-dep churn.

## 7. Regression / preservation

- RG-1: Auth flow + Keystore mirror intact; SMS native pipeline intact; offline queue intact.
- RG-2: Currency utils, ThemeProvider, Modal focus management, ExpenseForm preserved.
- RG-3: All real API integrations preserved; contract tests pass; no `as any`.
- RG-4: Component/page tests exist for financial surfaces + forms; CI gates green.
- RG-5: Visual regression screenshots per page (light+dark × mobile+desktop) baselined.
- RG-6: No backend/financial-logic/schema/contract changes from frontend work.

## 8. Verification methods

- Automated: typecheck, vitest (component+page), stylelint/eslint, axe-core/pa11y, vite bundle
  report, contract tests, Playwright E2E.
- Manual: keyboard audit, screen-reader (NVDA/TalkBack), contrast meter, 200% zoom, device
  matrix (capacitor-testing), visual screenshot review against unslop checklist.
- Per-page definition of done: criteria met + tests + screenshots + a11y pass + no regression.
