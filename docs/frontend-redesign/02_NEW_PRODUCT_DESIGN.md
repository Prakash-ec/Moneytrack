# 02 — New Product Design

Design direction for the MoneyTrack frontend transformation. Governed by the installed
`frontend-design` and `unslop` skills (credit: unslop by Damir Sokolovsky, CC BY 4.0).
This is a complete product redesign, not a recolour.

## 1. Direction (unslop five lines)

- **Product.** MoneyTrack is a private, offline-capable personal finance ledger for one
  person (or household) in India that turns bank SMS into an accurate, reviewable record
  of income, expenses, transfers and balances.
- **Character.** `calm, exact, trustworthy` — a quiet instrument you check daily, not a
  dashboard that shouts. (Avoids the banned generic words clean/modern/sleek/minimal/premium.)
- **World.** The private ledger / passbook: ruled lines, tabular figures, a single green
  ink for "verified/growth", obsidian night surfaces. The tint of the neutrals leans
  graphite-ink (technical, night), not warm paper.
- **Moments.** (1) The **balance figure** — one large tabular number set in JetBrains Mono,
  the single most important thing on the overview. (2) The **income-vs-expense flow chart** —
  one carefully drawn comparison where green means inflow and a muted red means outflow,
  every colour meaningful. Everything else stays quiet.
- **Signature.** A **verified-status dot** (small green dot + hairline) that appears only
  where a bank-reported balance actually reconciles — never fabricated. Carried from the
  existing logo's tracking-node idea, redrawn flat. This is the one detail only MoneyTrack
  would have, tied to its SMS-reconciliation truth.

## 2. The brand pivot (indigo → green) — explained

**Current:** Mercury Indigo `#5266eb`/`#6366f1`, gradient+glow logo, gradient "Track"
wordmark, uppercase tracked tagline. **Requested:** primary green `#16845B`, secondary
`#36B889`, obsidian surfaces.

**Decision:** adopt green as the brand accent. Rationale:
1. Green reads as money/growth/verified in the Indian finance vernacular — fits the world.
2. The current indigo→cyan→emerald gradient logo is an AI-slop tell; a flat green mark is
   more distinctive and trustworthy.
3. The user explicitly requested it; the brief wins over the existing default.

**What changes (every significant change justified):**
| Change | From | To | Why |
|---|---|---|---|
| Primary accent | indigo #5266eb/#6366f1 | green #16845B (light) / #36B889 (dark) | brand pivot; money/verified semantics |
| Logo mark | gradient + glow + drop shadow | flat green M + growth arrow + orbit node | remove slop; calm, reproducible at 16px |
| Wordmark "Track" | gradient fill | solid text color (ink) | gradient text is a slop tell |
| Tagline | "PRIVATE FINANCIAL INTELLIGENCE" uppercase tracked | "Private ledger" sentence case | no uppercase tracked labels |
| Positive semantic | #059669/#10b981 | keep distinct from brand green (see §3) | avoid brand/semantic confusion |
| Progress bar | gradient primary→accent | solid accent fill | no hue gradients |
| Status banners | hardcoded slate + backdrop-blur + animate-ping | token surfaces, quiet dot | remove slop, use tokens |

**What stays:** name MoneyTrack, font trio (Inter / Plus Jakarta Sans / JetBrains Mono),
obsidian dark surfaces, light theme, the M+arrow+orbit mark geometry (redrawn flat).

## 3. Colour philosophy (quiet chrome, one accent)

Per unslop: surfaces stay **neutral graphite-ink**; the green accent covers a few percent
of the screen (primary action, selection, the one key figure, verified dot). Semantic
colours carry meaning only.

**Critical distinction — brand green vs income green:** if brand primary is green AND
income/positive is green, users can't tell "brand action" from "money in". Resolution:
- **Brand accent** = `#16845B`/`#36B889` for actions/selection/verified.
- **Income/positive delta** = a slightly different, brighter mint `#16a34a` (light) /
  `#4cc38a` (dark) used ONLY on financial deltas and the inflow series.
- **Expense/negative** = muted red `#dc2626` (light) / `#e5484d` (dark), used ONLY on
  outflow/deltas. Transactions also carry **direction icons + sign** (↑/↓, +/−) so colour
  is never the sole indicator (WCAG 1.4.1).
- Full token values + contrast math in `03_DESIGN_SYSTEM.md`.

**Contrast note (must verify in implementation):** `#16845B` with white text ≈ 4.6:1
(passes AA normal text). `#36B889` with white text ≈ 2.3:1 (FAILS) — so on dark theme the
primary button uses **dark ink text on #36B889** (≈ 8:1) OR a darker green fill; green-as-text
on dark surfaces uses `#36B889` (≈ 7:1 on #0b0f19, passes). Never put white text on #36B889.

## 4. Typography

Keep the trio (real brand, per unslop "keep the project's font"):
- **Inter Variable** — interface, body, nav (400/500, 600 rare).
- **Plus Jakarta Sans Variable** — page titles / display (500; no 700-900).
- **JetBrains Mono** — ALL financial figures, tabular-nums, one format.

Hierarchy from size + colour, not weight. Sentence case everywhere. No italic emphasis,
no gradient text, no negative tracking on small text. Scale in `03_DESIGN_SYSTEM.md`.

## 5. Layout philosophy

- App shell fills viewport: sidebar 248px (desktop), fluid content capped 1440px, page
  padding 24–32. Not a narrow centered column.
- **One memorable thing per screen** (the balance figure on overview; the flow chart on
  analytics). Everything around it quiet and disciplined.
- Stat cards are **numbers only** (label, big tabular figure, change-vs-period). No sparklines,
  mini-bars, or icons added to fill them. Vary grid rhythm: 3–4 compact stats above one wide
  chart; a wide chart next to a narrow list — not identical cards in a row.
- Charts: one main chart clearly biggest; secondary data as ranked lists/tables, not a second
  equal chart. One accent per chart; neutral steps for the rest. Muted grid + mono labels.
- Cards: 12–16px radius, hairline border, subtle neutral shadow (light) / surface step (dark).
  Nested radius = outer − padding. No excessive rounding, no glow.

## 6. Motion

One easing curve `cubic-bezier(0.22,1,0.36,1)`. Hover/press 120–180ms; menus 160–220ms;
entrances 300–500ms (one orchestrated page-load fade-rise, not every card flying in).
Transition only color/background/border/opacity/transform. Remove animate-ping/pulse on
non-live elements, transition-all, hover:scale on cards. Respect prefers-reduced-motion.

## 7. Copy & content

- Plain, active, sentence case. Button says exactly what happens ("Add expense" → toast
  "Expense added"). No exclamation marks, no hype, no greeting headlines.
- Page title names context ("Overview", "October 2026"), not "Welcome back! 👋".
- Changes say what they compare to ("+12% vs last month").
- **No mock financial data in production UI.** Welcome/onboarding previews must be clearly
  labeled "Sample" or removed; SMS simulation paths removed from production (D33).
- Errors explain what went wrong + how to fix, in the product's voice; empty states invite action.
- All money in Indian format: ₹1,250.00 / ₹25,000.00 / -₹500.00 (existing `formatINR`).

## 8. Emotional goal

Open the app → immediately know your available balance and whether it's verified → add an
expense in two taps → trust every number. The interface should feel like a well-kept
passbook: calm, exact, private. Premium comes from restraint and correctness, not decoration.

## 9. Anti-template check (frontend-design skill)

If we swapped "MoneyTrack" for another product, would the screen still fit? Guard against:
- The verified-status dot tied to real SMS reconciliation (only MoneyTrack has this).
- Indian rupee tabular figures + lakh/crore grouping (specific to this audience).
- The SMS review queue as a first-class surface (specific to this product).
- The passbook/ledger vernacular in copy ("Private ledger", "Verified by bank SMS").
Reject: cream+serif+terracotta, acid-green-on-black, broadsheet hairlines, identical SaaS
cards, ALL-CAPS eyebrows, middle-dot meta strings, gradient wordmarks.

## 10. Themes

Support light + dark (architecture already permits). Dark is the default identity (obsidian);
light is a clean graphite-paper alternative. Both use the same green accent + semantic rules.
System preference respected; manual override persisted (existing ThemeProvider).
