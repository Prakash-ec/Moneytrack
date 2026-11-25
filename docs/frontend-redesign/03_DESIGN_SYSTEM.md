# 03 — Design System

Complete token system + reusable component specifications. Every page uses this system;
no page-specific CSS hacks. Values follow the `unslop` tokens reference, adapted to the
MoneyTrack green/obsidian identity. Implementation maps to Tailwind config + CSS variables
(extend the existing `index.css`/`tailwind.config.js`, remove undefined utilities).

## 1. Colour tokens

### Neutral ramp (graphite-ink; surfaces stay neutral)

| Role | Light | Dark |
|---|---|---|
| Page background | `#fafafa` | `#0b0f19` (keep obsidian) |
| Sidebar / deepest | `#ffffff` | `#0f1422` |
| Card surface | `#ffffff` | `#161b26` |
| Raised (active row, input) | `#f4f4f5` | `#1c2333` |
| Hairline border | `rgba(15,23,42,0.08)` | `rgba(248,250,252,0.08)` |
| Strong border | `rgba(15,23,42,0.16)` | `rgba(248,250,252,0.16)` |
| Primary text | `#171717` | `#f8fafc` |
| Secondary text | `#525252` | `#a3a9b8` |
| Muted text/icons (meta only) | `#737373` | `#7a8296` |

Three text roles only. Muted stays ≥4.5:1 on its surface; body uses primary/secondary.

### Brand accent (green)

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--primary` | `#16845B` | `#36B889` | actions, selection, key figure, verified dot |
| `--primary-hover` | `#11694a` | `#4ccb9d` | |
| `--primary-soft` | `#e7f3ee` | `rgba(54,184,137,0.14)` | soft backgrounds |
| `--primary-contrast` | `#ffffff` | `#06231a` | **dark theme uses dark ink text on green** |
| `--primary-border` | `rgba(22,132,91,0.25)` | `rgba(54,184,137,0.28)` | |

**Contrast rules (verify with axe in implementation):**
- Light: white on `#16845B` ≈ 4.6:1 → AA normal text OK.
- Dark: white on `#36B889` ≈ 2.3:1 → **FAIL**. Use dark ink `#06231a` on `#36B889` (≈ 8:1).
- Green-as-text: `#16845B` on white ≈ 4.6:1 OK; `#36B889` on `#0b0f19` ≈ 7:1 OK.
- Never use `#36B889` as small text on light surfaces (fails); use `#16845B` there.

### Semantic financial colours (distinct from brand)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--positive` (income/+) | `#16a34a` | `#4cc38a` | inflow deltas, income series ONLY |
| `--positive-soft` | `#ecfdf5` | `rgba(76,195,138,0.14)` | |
| `--danger` (expense/−) | `#dc2626` | `#e5484d` | outflow deltas, expense series, errors |
| `--danger-soft` | `#fef2f2` | `rgba(229,72,77,0.14)` | |
| `--warning` | `#d97706` | `#f59e0b` | overspend caution, pending |
| `--warning-soft` | `#fffbeb` | `rgba(245,158,11,0.14)` | |
| `--info` | `#2563eb` | `#60a5fa` | neutral informational (sparingly) |

**Rule:** brand green ≠ income green. Direction also encoded by icon (ArrowUpRight/ArrowDownLeft)
and sign (+/−), never colour alone (WCAG 1.4.1).

### Chart palette

One accent leads; others are neutral steps. Categorical (only when series must differ):
`#16845B` (lead), `#36B889`, `#0ea5e9`, `#f59e0b`, `#8b5cf6`, `#64748b` — muted, no glow.
Income series = positive; expense series = danger; current period = accent; prior = neutral.

## 2. Typography scale

| Use | Size/line | Weight | Family |
|---|---|---|---|
| Meta, counts, captions | 12/16 | 400 | Inter (mono welcome) |
| Secondary text | 13–14/20 | 400 | Inter |
| Body, nav | 14–15/20–22 | 400–500 | Inter |
| Card figure | 28–32/1 | 500 tabular | JetBrains Mono |
| Balance hero | 36–44/1.05 | 500 tabular | JetBrains Mono |
| Page title | 24–28/1.15 | 500 | Plus Jakarta Sans |
| Section head | 16–18/1.3 | 500 | Inter |
| Wordmark | 16–18/1 | 600 | Plus Jakarta Sans |

Letter-spacing 0 below 16px; display ≥40px may go −0.02em. `tabular-nums` on all figures.
One money format everywhere: `formatINR` (₹1,250.00; -₹500.00; lakh/crore compact).

## 3. Spacing scale (4px grid)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128`
- Inside control: 4–12. Between rows: 2–8. Between groups: 12–24. Between sections: 32–64.
- Row heights: 32 compact / 36 default / 40–44 touch.
- Page padding 24–32; card padding 20–24; sidebar padding 16; nav rows 32–36, gap 2–4.
- Remove one-off values (`mt-[13px]`, `p-4.5`). Equal things equal sizes.

## 4. Radius tokens

| Element | Radius |
|---|---|
| Tag, keycap, small button | 6 |
| Input, button, row | 8–10 |
| Card | 12–16 |
| Panel, modal, drawer | 16–20 |

Nested: inner = outer − padding (≥4). Not everything a pill. Remove `rounded-[1.25rem]`
one-offs in favour of `--radius-card: 14px`.

## 5. Shadows / depth

- Light: small `0 1px 2px rgba(0,0,0,0.05)`; floating `0 8px 24px rgba(0,0,0,0.06)`.
- Dark: surface steps + hairline; active row top highlight `inset 0 1px 0 rgba(255,255,255,0.06)`.
  No coloured glows/shadows. Modal/dropdown may keep soft neutral shadow.

## 6. Layout constraints & breakpoints

| Breakpoint | Width | Behaviour |
|---|---|---|
| `sm` | ≥640 | large phone / small tablet |
| `md` | ≥768 | tablet |
| `lg` | ≥1024 | laptop (sidebar appears) |
| `xl` | ≥1280 | desktop |
| `2xl` | ≥1536 | wide (content cap 1440) |

- Mobile <1024: bottom nav + FAB, compact headers, single column, card lists (not tables).
- Desktop ≥1024: sidebar 248px, fluid content cap 1440, page padding 32.
- Detail in `06_MOBILE_FIRST_DESIGN.md`.

## 7. Icon conventions

lucide-react, 16/18px, stroke 1.5, colour = secondary/muted text role (never own colours).
Fixed icon-box width per row; 8–10px gap to label. No emoji icons. Category colour = small
status dot, not coloured icon. One set, one size, one stroke.

## 8. Component specifications

Each component: variants, sizes, states (default/hover/active/focus/disabled/loading),
a11y contract. All consume tokens; no hardcoded hex.

### Button
- Variants: primary (accent fill, contrast text), secondary (raised + hairline), ghost,
  danger, link. Sizes: sm(30)/md(38)/lg(44)/icon(34). Touch ≥44 on mobile.
- Loading: spinner + `aria-busy`, disabled. Focus: 2px accent ring offset 2.
- Keep existing sound Button API; fix `lg` to use tokens; remove `subtle/outline` aliases or map cleanly.

### Input / Textarea / Select
- Height 38 (44 touch), radius 8, raised bg, hairline border; focus accent ring.
- **Label always associated** (`htmlFor`/id) — fix FormControls optional label. Error text
  below with `aria-describedby`; invalid `aria-invalid`. Placeholder ≠ label.
- Select: native on mobile; custom listbox (keyboard + aria) on desktop if needed.

### Card
- Surface bg, hairline, radius 14, padding 20–24, subtle shadow (light). Header (title +
  optional action) + body. No gradient, no glow. StatCard = number only.

### Table / List
- Desktop: table with sticky header, right-aligned tabular amounts, row hover surface step.
- Mobile: **card list** (TransactionRow), not horizontal-scroll table. Row height 56–64 touch.
- Sortable headers `aria-sort`; pagination or incremental load; empty/loading/error states.

### Dialog / Modal / Drawer
- Keep existing Modal (focus trap, stack, scroll lock, Escape, restore). Fix footer margin
  overflow (C42/P32). Bottom-sheet on mobile. Drawer for filters/details on mobile.
- `role="dialog"`, `aria-modal`, labelled title. Confirm dialog for destructive actions.

### Navigation
- Sidebar: grouped, active = surface step + accent left indicator + hairline; quiet.
- Bottom nav (mobile): 4 items + center FAB; active accent; labels 12px; safe-area inset.
- Tabs: `role="tablist"/"tab"/"tabpanel"`, `aria-selected`, arrow-key nav (fix C73).
- Breadcrumb for detail pages; CommandPalette with dialog role + focus trap (fix).

### Charts
- Recharts wrappers; muted grid, mono muted labels; one accent series; tooltip token-styled.
- Types: trend=line/area, comparison=bars, share=stacked bar or ranked list, goal=progress.
- No rainbow single-series, no glow, no uppercase day labels. Accessible data table fallback.

### Badge / Tag
- Quiet semantic tags (neutral/positive/warning/danger/info), radius 6, 11–12px. No glow pills.
- Verified status = green dot + "Verified" text (signature).

### Notifications / Toast
- Keep ToastProvider (aria-live). Replace window.alert (D32). Token surfaces, no backdrop-blur.
- Toast variants success/error/info; auto-dismiss; action optional.

### Tooltip
- Token surface, 12px, delay 300ms, `role="tooltip"`, keyboard-focusable trigger, Escape dismiss.

### Empty / Loading / Error states
- EmptyState: icon (muted), title, description, one action. Invite action, no mood.
- Skeleton: token surface, **no animate-pulse on non-live** (use subtle shimmer only while loading).
- ErrorState: what went wrong + retry; never vague. Fix gradient progress → solid accent.
- Offline/BackendWaking banners: token surfaces, quiet dot, no animate-ping/hardcoded slate.

### Progress / Budget bar
- Solid accent fill (no gradient), track = raised, radius full, height 8; label + tabular % .
- Overspend: warning/danger fill + icon + text (not colour alone).

### PeriodPicker / DateRange
- Presets (This month, Last month, This week, Custom) IST-based; accessible labels; keyboard.
- One period source of truth shared across dashboard/analytics (fix mixed bases).

### AmountInput
- Uses `parseRupeesToPaise` (integer, cap). Rupee prefix; tabular; inline validation; no float.
- Fix ExpensesPage filter unit escalation (C33) — store rupees in URL or paise consistently.

## 9. Token implementation map

- CSS variables in `index.css` `:root`/`.dark` (replace indigo values; add income/expense distinct).
- Tailwind `theme.extend.colors` map to vars; **define or remove** currently-undefined utilities
  (`surface-card`, `surface-hover`, `p-4.5`, `h-18`, `shadow-xs`, `animate-in`).
- Add `tailwindcss-animate` OR define keyframes; remove dead `indeterminate` reference.
- Radius/spacing/shadow tokens; font families kept.
- Lint gate: no arbitrary `bg-[var(--…)]` where a token exists; no undefined classes (stylelint).

## 10. Accessibility contract (WCAG 2.2 AA)

Per `accessibility-engineering` skill: contrast 4.5:1 text / 3:1 large/UI; focus visible;
touch ≥24×24 (AA SC 2.5.8), 44×44 target; labels associated; colour not sole indicator;
keyboard nav + focus trap; reduced-motion; 200% zoom no loss; aria-live for dynamic updates.
Audit with pinned `@axe-core/cli@4.13.0` + `pa11y@9.1.1` + manual keyboard/screen-reader.
