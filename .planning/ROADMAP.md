# Roadmap: MoneyTrack Figma Make Redesign

## Overview

Transform MoneyTrack to faithfully replicate the published Figma Make reference website (`https://visa-mess-16562097.figma.site/`) while preserving 100% of existing backend functionality, database records, and Android compatibility. Executed through 9 verifiable phases.

## Phases

- [x] **Phase 1: Design Tokens, Typography, and Base CSS System** - Implement exact Figma Make color palette, typography (Inter), border radii, shadows, and base component styling.
- [x] **Phase 2: App Shell, Sidebar, Navigation & Layout** - Build desktop sidebar, mobile header, and mobile bottom nav with FAB matching Figma.
- [x] **Phase 3: Dashboard (Overview) & Core Analytics Visuals** - Replicate Figma Overview layout, 4 stat cards, daily spending chart, donut breakdown, and recent transactions.
- [x] **Phase 4: Transactions Ledger & Expense Dialogs** - Replicate Expenses table, search/filter bar, pagination, and Add/Edit Expense modal.
- [x] **Phase 5: Breakdown & Trends Pages** - Replicate Breakdown page (donut & share table) and Trends page (trend chart & insight cards).
- [x] **Phase 6: Expense Types Management** - Replicate Expense Types category cards grid, color dots, create/edit modal, and category detail view.
- [x] **Phase 7: Smart Receipt Scanner & SMS Review** - Replicate 3-mode receipt scanner and Android SMS review interface.
- [x] **Phase 8: Settings, Data Backup/Restore & Polish** - Replicate Settings sections (Appearance, API Connection, Sync, Backup/Restore) and 404 page.
- [x] **Phase 9: Comprehensive Verification, Build & APK Deliverable** - Execute all automated tests, TypeScript check, production build, and Android APK generation.
- [ ] **Phase 10: Command Palette & Global Search** - Implement quick command palette (Cmd+K/Ctrl+K), keyboard shortcuts, and instant navigation.
- [ ] **Phase 11: Overview & Dashboard Creative Elevate** - Add daily burn rate velocity meter, 1-tap quick expense logging chips, and category sparklines.
- [ ] **Phase 12: Expenses Ledger Grouping & Statement Export** - Date-grouped daily timeline with transaction subtotals and 1-click CSV export.
- [ ] **Phase 13: Spending Breakdown & Trends Advanced Analytics** - Top category spotlight banner, weekend vs weekday spending analysis, and run-rate projections.
- [ ] **Phase 14: Receipt Scanner Sample Templates & Bulk SMS Authorisation** - Realistic Indian bill test templates and bulk SMS approval.
- [ ] **Phase 15: Full Verification, Production Build & Android APK** - Complete regression suite across all tiers and release deliverable.

## Phase Details

### Phase 1: Design Tokens, Typography, and Base CSS System
**Goal**: Establish the exact Figma Make design system in `frontend/src/index.css` and standardize UI primitives (`Button`, `Badge`, `Card`, `PageHeader`, `PeriodPicker`).
**Depends on**: Nothing
**Requirements**: DS-01, DS-02
**Success Criteria**:
  1. Light and dark CSS variables match Figma Make (`--primary: #16845b`, `--bg: #f7f9f8`, `--surface: #fff`, `--text: #17231d`, etc.).
  2. Core CSS classes (`.button`, `.badge`, `.card`, `.stat-card`, `.page-header`, `.period-picker`) match Figma's exact visual specifications.
  3. UI primitives render cleanly without TypeScript errors.
Plans:
- [x] 01-01: Implement design tokens, CSS variables, and base components (Button, Badge, Card, PageHeader, StatCard, PeriodPicker)

### Phase 2: App Shell, Sidebar, Navigation & Layout
**Goal**: Replicate Figma Make desktop sidebar, mobile topbar, and mobile bottom nav with FAB in `AppLayout.tsx`.
**Depends on**: Phase 1
**Requirements**: NAV-01, NAV-02
**Success Criteria**:
  1. Desktop sidebar displays brand mark, primary "Add expense" button, secondary "Scan receipt" button, navigation links with emerald active state, and local ledger status pill.
  2. Mobile header displays brand, theme toggle, and scan button.
  3. Mobile bottom nav provides smooth navigation and elevated floating action button (`fab`).
Plans:
- [x] 02-01: Implement Figma Make app shell, sidebar navigation, topbar header, mobile nav bar, and floating action button.

### Phase 3: Dashboard (Overview) & Core Analytics Visuals
**Goal**: Redesign `HomePage.tsx` to replicate Figma Overview with real backend data.
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04
**Success Criteria**:
  1. 4-card metric row displays Total spent (with comparison badge), Transactions, Daily average, Highest expense.
  2. Daily expenses bar/line chart renders real historical spend with Figma styling and tooltips.
  3. Donut breakdown card displays central total, donut ring, and colored category legend.
  4. Recent transactions list displays category icons, merchant/notes, and formatted INR amounts.
Plans:
- [x] 03-01: Replicate Overview dashboard with 4 stat cards, daily spending chart, donut breakdown, and recent transactions.

### Phase 4: Transactions Ledger & Expense Dialogs
**Goal**: Redesign `ExpensesPage.tsx` and expense modal to match Figma Make.
**Depends on**: Phase 2
**Requirements**: EXP-01, EXP-02
**Success Criteria**:
  1. Filter bar provides search, category select, payment method select, and sort options.
  2. Table displays Date, Category badge, Merchant/Description, Payment method, and formatted INR amount.
  3. Add/Edit Expense modal matches Figma's form styling and creates/updates expenses through `api.createExpense` / `api.updateExpense`.
Plans:
- [x] 04-01: Replicate Expenses ledger table, filters, pagination, and modal dialogs.

### Phase 5: Breakdown & Trends Pages
**Goal**: Redesign `BreakdownPage.tsx` and `TrendsPage.tsx` to match Figma Make.
**Depends on**: Phase 2
**Requirements**: BRK-01, TRN-01
**Success Criteria**:
  1. Breakdown page displays large interactive donut and category share progress table.
  2. Trends page displays period selector (Daily/Weekly/Monthly), area trend chart, and automated insight cards (`.insight`).
Plans:
- [x] 05-01: Replicate Breakdown distribution and Trends charts with insight cards.

### Phase 6: Expense Types Management
**Goal**: Redesign `TypesPage.tsx` and `TypeDetailPage.tsx` to match Figma Make.
**Depends on**: Phase 2
**Requirements**: CAT-01
**Success Criteria**:
  1. Category cards grid displays color circles, transaction counts, and total spend.
  2. Create/Edit Category modal allows updating name, color, and icon.
  3. Detail page shows category-specific analytics and transactions.
**Plans**: 1 plan (06-01-PLAN.md)

### Phase 7: Smart Receipt Scanner & SMS Review
**Goal**: Redesign Receipt Scanner and SMS Review views to match Figma Make.
**Depends on**: Phase 2
**Requirements**: SCN-01, SMS-01
**Success Criteria**:
  1. Receipt scanner offers Upload, Camera, and Paste text tabs with dropzone and extraction review.
  2. SMS review displays clean browser fallback and Android review cards.
**Plans**: 1 plan (07-01-PLAN.md)

### Phase 8: Settings, Data Backup/Restore & Polish
**Goal**: Redesign `SettingsPage.tsx` and `NotFoundPage.tsx` to match Figma Make.
**Depends on**: Phase 2
**Requirements**: SET-01, NOTF-01
**Success Criteria**:
  1. Settings page organized into Appearance, API Connection, Offline Sync, and Data Management sections.
  2. 404 page renders clean minimal Figma empty state.
**Plans**: 1 plan (08-01-PLAN.md)

### Phase 9: Comprehensive Verification, Build & APK Deliverable
**Goal**: Execute all verification gates and generate the final debug APK.
**Depends on**: Phases 1-8
**Requirements**: VER-01, VER-02, VER-03, VER-04, VER-05, VER-06
**Success Criteria**:
  1. TypeScript checks pass without errors (`tsc --noEmit`).
  2. Frontend vitest and backend pytest suites pass 100%.
  3. Frontend production build succeeds.
  4. Debug APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk` and copied to `release/MoneyTrack.apk`.
  5. SQLite database file `backend/data/moneytrack.db` remains intact at 81,920 bytes.
**Plans**: 1 plan (09-01-PLAN.md)

### Phase 10: Command Palette & Global Search
**Goal**: Build a keyboard-first Command Palette (`Cmd+K` / `Ctrl+K`) for instantaneous navigation, search, and action triggers across MoneyTrack.
**Depends on**: Phase 9
**Success Criteria**:
  1. Pressing `Cmd+K` or clicking search icon opens modal palette with quick search for transactions, pages, and actions.
  2. Quick actions include "Add expense", "Scan receipt", "Review SMS", "Toggle dark mode".
  3. Clean keyboard navigation (Arrow keys, Enter, Escape).

### Phase 11: Overview & Dashboard Creative Elevate
**Goal**: Elevate the Overview dashboard with daily spending velocity, 1-tap quick expense logging chips, and category sparklines.
**Depends on**: Phase 10
**Success Criteria**:
  1. Spending velocity widget renders daily burn rate.
  2. Quick chips allow 1-tap logging of common everyday expenses (Chai/Coffee, Food, Fuel, Groceries) opening pre-filled modal.
  3. Category visual sparklines display top spend distribution cleanly.

### Phase 12: Expenses Ledger Grouping & Statement Export
**Goal**: Group transactions by date with daily subtotals and add 1-click statement CSV export.
**Depends on**: Phase 10
**Success Criteria**:
  1. Transactions grouped by date with clear day headers ("Today", "Yesterday", or formatted date) and daily total spend.
  2. Payment method badges feature distinct color styling.
  3. "Export CSV" button allows 1-click ledger download.

### Phase 13: Spending Breakdown & Trends Advanced Analytics
**Goal**: Add Top Spender spotlight, weekend vs weekday spending dynamics, and month-end projection.
**Depends on**: Phase 10
**Success Criteria**:
  1. Category spotlight card highlights highest spending category and share.
  2. Trends page includes weekend vs weekday spending breakdown.
  3. Projected month-end run-rate metric is clearly calculated and displayed.

### Phase 14: Receipt Scanner Sample Templates & Bulk SMS Authorisation
**Goal**: Add sample receipt templates to the scanner and bulk authorisation to SMS review.
**Depends on**: Phase 10
**Success Criteria**:
  1. Receipt scanner has 3 sample templates (Cafe, Grocery, Fuel) for instant 1-click testing.
  2. SMS review includes a "Bulk Authorise All" button for one-tap batch approval.

### Phase 15: Full Verification, Production Build & Android APK
**Goal**: Full automated test verification, Vite production build, Capacitor sync, and release APK assembly.
**Depends on**: Phases 10-14
**Success Criteria**:
  1. All automated tests pass (Pytest 138/138, Vitest 37/37, TypeScript 0 errors, Android JVM 55/55).
  2. Android APK built and verified in `release/MoneyTrack.apk`.
  3. Database intact at 81,920 bytes.
