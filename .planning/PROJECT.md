# MoneyTrack Website Redesign (Figma Make Replication)

## What This Is

A complete frontend redesign of the MoneyTrack personal expense management application to replicate the published Figma Make reference website (`https://visa-mess-16562097.figma.site/`). The redesign delivers a premium, minimal, accessible fintech interface with custom typography, emerald green tokens, structured cards, charts, and clean navigation while preserving 100% of the existing FastAPI backend APIs, SQLite financial records, and Android Capacitor features.

## Core Value

Faithfully replicate the visual identity, layouts, typography, and components of the published Figma Make website without breaking any existing business logic, SQLite data, or API contracts.

## Requirements

### Validated
- [x] Codebase mapped into `.planning/codebase/` with 7 architecture & stack documents.
- [x] Figma Make site inspected and extracted: design tokens, custom CSS (`formatted_css.css`), and bundle component hierarchy (`app_source.js`).
- [x] Database safety verified: `backend/data/moneytrack.db` (81,920 bytes) and backups untouched.
- [x] Complete frontend backup created at `frontend/src_backup_pre_figma`.

### Active Scope
- [ ] REQ-01: Global design system matching Figma Make (CSS tokens, typography, buttons, cards, badges, inputs).
- [ ] REQ-02: App Shell and Navigation (Desktop sidebar, mobile header, mobile bottom nav with FAB, active states).
- [ ] REQ-03: Dashboard / Overview page (4 stat cards, daily expenses bar/line chart, donut breakdown card, recent transactions).
- [ ] REQ-04: Expenses Ledger & Modal (Filter bar, search, expense table, pagination, Add/Edit Expense modal).
- [ ] REQ-05: Breakdown & Trends pages (Category donut & share table, spending trends chart, AI/automated insight cards).
- [ ] REQ-06: Expense Types management (Category cards grid with colors and icons, Create/Edit Category modal, detail view).
- [ ] REQ-07: Smart Receipt Scanner & SMS Review (3 input tabs, OCR/Groq extraction, Android SMS review queue).
- [ ] REQ-08: Settings & Data Management (Theme switcher, API base URL & health, CSV/JSON backup & restore, 404 page).
- [ ] REQ-09: End-to-end testing, TypeScript typecheck, frontend build, backend pytest, and Android debug APK.

### Out of Scope
- Modifying backend SQLite database schema or records.
- Adding fake income, balance, or net worth trackers.
- Replacing existing backend endpoints or changing request/response schemas.

## Context
- **Frontend Stack**: React 18, Vite, TypeScript, Tailwind CSS, Recharts, Lucide React, Capacitor 8.
- **Backend Stack**: Python 3.11, FastAPI, SQLite (paise-based amounts, Asia/Kolkata timezone).
- **Reference Site**: `https://visa-mess-16562097.figma.site/` (extracted to `figma_site_dump/`).

## Constraints
- **Data Integrity**: Never delete, overwrite, or reset `backend/data/moneytrack.db`.
- **Currency**: Indian Rupee (`₹`) with Indian numbering formatting (`₹1,25,000.00`) everywhere.
- **Design Authenticity**: Strictly follow the Figma Make styling and components; avoid inventing unrelated UI elements.

## Key Decisions
- **Token System**: Use Figma's native variables (`--primary: #16845b`, `--primary-soft: #eaf5f0`, `--bg: #f7f9f8`, `--surface: #fff`, `--border: #e5ebe7`, `--text: #17231d`) in `index.css`.
- **Component Classes**: Use the clean semantic BEM-like classes from the reference (`.app-shell`, `.sidebar`, `.desktop-nav`, `.nav-item`, `.card`, `.stat-card`, `.button`, `.badge`, `.modal`, etc.) combined with Tailwind utility support.
