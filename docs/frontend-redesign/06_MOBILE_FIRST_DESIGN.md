# 06 — Mobile-First Design

The phone is the primary MoneyTrack device (Android WebView via Capacitor). Design for
phones first, then scale up — not shrink desktop.

## 1. Target devices & breakpoints

| Class | Width | Layout |
|---|---|---|
| Small Android phone | 360–399 | single column, bottom nav, full-screen sheets, card lists |
| Large Android phone | 400–639 | single column, bottom nav, card lists |
| Tablet | 640–1023 | 2-column where useful, bottom nav or rail, drawers |
| Laptop | 1024–1279 | sidebar 248, fluid content, tables |
| Desktop | 1280–1535 | sidebar, content cap 1440 |
| Wide | ≥1536 | content cap 1440, centered |

Tailwind: sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536. Sidebar appears ≥1024; bottom nav <1024.

## 2. Mobile shell

- **Bottom nav:** Overview · Transactions · [+ FAB] · Budgets · More. Height 64 + safe-area.
  Active = accent icon+label. Labels 12px. Touch ≥44.
- **FAB:** center, 56px, accent, opens QuickAddSheet (Expense/Income/Transfer/Scan) — fixes
  expense-only FAB. One-handed reach.
- **More sheet:** Accounts, Categories, SMS review, Analytics, Notifications, Security, Settings.
- **Compact header:** 56px, page title (sentence case), period chip, overflow menu. Sticky.
- **Safe-area insets** top/bottom (notch/gesture bar). Status-bar theme-color matches theme.
- **Android back:** closes topmost modal/drawer/sheet (fix C39 — dispatch on document, integrate
  with Modal stack). Hardware back navigates router when nothing overlayed.

## 3. Mobile patterns per surface

- **Lists → cards:** TransactionRow cards (icon, title, meta, signed tabular amount), 56–64px rows,
  not horizontal-scroll tables. Day headers sticky.
- **Detail → bottom drawer:** transaction/account/category detail slides up, drag-handle, Escape/back
  closes, focus trap.
- **Filters → bottom sheet:** full-height sheet with apply/reset; chips show active filters.
- **Forms → full-screen sheet** on small phones (amount keypad-friendly, input 16px to prevent iOS
  zoom — existing rule preserved); sticky Save footer.
- **Charts:** simplified on mobile (fewer ticks, shorter labels ≥11px, no dense legends); main chart
  full-width, secondary becomes ranked list.
- **Dashboard:** balance hero → 3 stat cards (scrollable row or stacked) → flow bars → recent →
  category list. No crowded multi-chart grid.
- **Budgets:** stacked cards, progress bars full-width.
- **SMS review:** stacked cards, direction selector as segmented control (touch), evidence expandable.
- **Settings:** grouped stacked sections, full-width controls.

## 4. Touch & ergonomics

- Touch targets ≥44×44 (AAA target; AA minimum 24×24 with spacing). Row tap area full-width.
- Primary actions in thumb zone (bottom). Destructive actions require confirm + not adjacent to primary.
- Swipe optional (e.g., transaction row → edit/delete) but never the only path; buttons always present.
- Haptics via Capacitor on confirm (optional, restrained).
- No horizontal overflow anywhere; tables become cards; long amounts tabular truncate with title.

## 5. Performance on mobile

- Lazy routes (existing) + skeleton; avoid layout shift.
- Charts lazy-loaded; limit Recharts bundle; no oversized charts.
- Reduce polling overhead (notifications 15s + SMS 10s + keepAlive) — consolidate/visibility-aware
  (D39); pause when backgrounded.
- Images: logo SVG flat (small); no heavy hero images on app screens.
- Offline: cached reads + queue writes; optimistic UI with rollback; sync status visible.
- Respect reduced-motion; no looping animations (battery).

## 6. Capacitor / Android specifics

- WebView viewport fit=cover; safe-area via env().
- Native SMS plugin bridge preserved; web stubs must not silently no-op (fix C48) — show "Available
  on Android" honestly on web, or call real ingest.
- Permission flows (SMS, notifications) via plugin; status reflected in UI; request on denial.
- Deep links (com.moneytrack.app://review etc.) preserved; fix fragile substring routing.
- Keystore token mirror preserved; offline boot keeps valid session (fix P35).
- Theme-color meta + status bar match obsidian/light.

## 7. Responsive verification

Test at 360, 390, 414, 768, 1024, 1280, 1536 widths; Android emulator/device (capacitor-testing
skill); 200% zoom; landscape; keyboard nav; screen reader (TalkBack). No overflow, no clipped
amounts, all actions reachable one-handed.
