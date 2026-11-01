# Requirements: MoneyTrack Figma Make Redesign

**Defined:** 2026-10-30
**Core Value:** Faithfully replicate the visual identity, layouts, typography, and components of the published Figma Make website without breaking any existing business logic, SQLite data, or API contracts.

## v1 Requirements

### Design System & Layout
- [x] **DS-01**: Implement exact Figma Make color palette, typography (Inter), border-radii (8px/9px/16px), shadows, and CSS classes in `index.css` for light and dark modes.
- [x] **DS-02**: Standardize atomic components (`Button`, `Badge`, `Card`, `PageHeader`, `PeriodPicker`, `EmptyState`) to match Figma Make specifications.
- [x] **NAV-01**: Implement desktop sidebar with brand mark, "Add expense" button, "Scan receipt" button, navigation links with emerald active state, and bottom local-ledger indicator.
- [x] **NAV-02**: Implement responsive mobile topbar with mobile brand mark, scan action, theme toggle, and mobile bottom nav with floating Add Expense action (`fab`).

### Views & Analytics
- [x] **DASH-01**: Replicate Dashboard Overview with 4-card metric row (Total spent, Transactions, Daily average, Highest expense) and comparison badge.
- [x] **DASH-02**: Replicate Daily Spending chart with high-contrast emerald bars and tooltips matching Figma Make.
- [x] **DASH-03**: Replicate Spending Breakdown card with central donut chart, category color dots, and INR amounts.
- [x] **DASH-04**: Replicate Recent Transactions card with category icons, merchant/notes, and Indian Rupee formatted amounts.
- [x] **EXP-01**: Replicate Expenses page with search field, filter controls, period picker, view toggle, and styled expense table.
- [x] **EXP-02**: Replicate Add/Edit Expense modal with clean input fields, category selector, payment method dropdown, and save action.
- [x] **BRK-01**: Replicate Breakdown page with period metrics, large donut chart, and category distribution progress list.
- [x] **TRN-01**: Replicate Trends page with period tabs (Daily, Weekly, Monthly), area trend chart, and insight cards (Spending down, Most active day, Category alerts).
- [x] **CAT-01**: Replicate Expense Types page with category cards grid, color indicators, transaction counts, total spend, and create/edit modal.

### Specialized Features
- [x] **SCN-01**: Replicate Receipt Scanner modal/page with 3 input modes (Upload, Camera, Paste text) in segmented tabs and extraction review.
- [x] **SMS-01**: Replicate SMS Review page with unsupported browser state and Android transaction review cards.
- [x] **SET-01**: Replicate Settings page with Appearance theme switcher, API connection configuration, Offline queue status, and Data backup/restore.
- [x] **NOTF-01**: Replicate 404 Not Found page matching Figma Make.

### Quality & Verification
- [x] **VER-01**: TypeScript check passes cleanly (`tsc --noEmit`).
- [x] **VER-02**: Frontend vitest suite passes (100% test pass rate).
- [x] **VER-03**: Backend pytest suite passes (138 tests pass).
- [x] **VER-04**: Production build succeeds (`vite build`).
- [x] **VER-05**: Android debug APK builds successfully (`gradlew assembleDebug`).
- [x] **VER-06**: Real database file `backend/data/moneytrack.db` remains intact at 81,920 bytes.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DS-01, DS-02 | Phase 1 | Satisfied |
| NAV-01, NAV-02 | Phase 2 | Satisfied |
| DASH-01, DASH-02, DASH-03, DASH-04 | Phase 3 | Satisfied |
| EXP-01, EXP-02 | Phase 4 | Satisfied |
| BRK-01, TRN-01 | Phase 5 | Satisfied |
| CAT-01 | Phase 6 | Satisfied |
| SCN-01, SMS-01 | Phase 7 | Satisfied |
| SET-01, NOTF-01 | Phase 8 | Satisfied |
| VER-01, VER-02, VER-03, VER-04, VER-05, VER-06 | Phase 9 | Satisfied |
