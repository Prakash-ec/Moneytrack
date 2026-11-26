# MoneyTrack Skills Inventory

**Audit Date:** 2026-11-26  
**Skill Directory:** `D:\MoneyTrack\.agents\skills\` (ignored by `.gitignore`; pinned in `D:\MoneyTrack\skills-lock.json`)  
**Restore Command:** `npx skills@1.9.0 experimental_install`

---

## 1. Summary

- **Pinned Project Skills (`skills-lock.json` v2):** 34 skills installed under `.agents/skills/`
- **Pre-existing Project Skill:** `unslop` (`.agents/skills/unslop/SKILL.md`, 35th skill in `.agents/skills/`)
- **Total Active Project Skills:** 35
- **`frontend-design` Status:** Checked in Antigravity / Vercel & Addy Osmani skill registries; no `frontend-design` entry exists in the marketplace/project lockfile. Frontend design quality, responsiveness, accessibility, React performance, and de-slopping are covered by the installed combination of `web-design-guidelines`, `accessibility-engineering`, `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-advanced-types`, and `unslop` (plus global `gsd-ui-phase` / `gsd-ui-review`).

---

## 2. Complete Project Skills Table (`.agents/skills/`)

| # | Skill | Domain / Trigger | Source (`skills-lock.json`) | Pinned Commit |
|---|---|---|---|---|
| 1 | `accessibility-engineering` | WCAG 2.2 AA audits, focus, contrast, screen readers | `addyosmani/agent-skills` | `8c99fa36` |
| 2 | `android-intent-security` | AndroidManifest / Intent redirection & IPC checks | `android/skills` | `c7294258` |
| 3 | `android-permissions-security` | Services, Receivers, Providers, permissions, Binder UID | `android/skills` | `c7294258` |
| 4 | `api-and-interface-design` | REST contracts, module boundaries, schema stability | `addyosmani/agent-skills` | `8c99fa36` |
| 5 | `api-idempotency-retry` | Idempotency-Key handling, atomic claims, retries | `samber/developer-platform-skills` | `c042e5dc` |
| 6 | `api-security-review` | OWASP API Top 10 (2023), BOLA/IDOR, auth, SSRF | `owasp/secure-agent-playbook` | `65d4efd2` |
| 7 | `capacitor-expert` | Capacitor 8.5 plugins, WebView lifecycle, native shell | `capawesome-team/skills` | `847d536b` |
| 8 | `capacitor-security` | Mobile bundle secret leaks, Keystore, CSP, cleartext | `cap-go/capgo-skills` | `e82217b8` |
| 9 | `capacitor-testing` | Vitest plugin mocks, Android JUnit, simulator/device loops | `cap-go/capgo-skills` | `e82217b8` |
| 10 | `ci-cd-and-automation` | GitHub Actions, quality gates, test runners | `addyosmani/agent-skills` | `8c99fa36` |
| 11 | `code-review` | Spec & standards PR/diff reviews | `mattpocock/skills` | `abeeaf95` |
| 12 | `codebase-design` | Deep modules, seams, testability, AI-navigability | `mattpocock/skills` | `abeeaf95` |
| 13 | `context-engineering` | Context hygiene, `AGENTS.md`, rules setup | `addyosmani/agent-skills` | `8c99fa36` |
| 14 | `docker-build-strategies` | Multi-stage Dockerfiles, `.dockerignore`, non-root users | `docker/skills` | `8839ca12` |
| 15 | `documentation-and-adrs` | ADRs, documentation drift checks | `addyosmani/agent-skills` | `8c99fa36` |
| 16 | `fastapi-python` | FastAPI dependency injection, routes, async patterns | `mindrally/skills` | `7682ca77` |
| 17 | `find-skills` | Discovering and installing additional skills | `vercel-labs/skills` | `57217cf8` |
| 18 | `git-workflow-and-versioning` | Atomic commits, branching, changelog, releases | `addyosmani/agent-skills` | `8c99fa36` |
| 19 | `observability-and-instrumentation` | Structured logs, metrics, production diagnostics | `addyosmani/agent-skills` | `8c99fa36` |
| 20 | `performance-optimization` | Query efficiency, N+1 elimination, web vitals | `addyosmani/agent-skills` | `8c99fa36` |
| 21 | `play-policy-insights` | Google Play SMS/permissions policy compliance | `android/skills` | `c7294258` |
| 22 | `pydantic` | Pydantic v2 validation, constraints, strict models | `pydantic/skills` | `98f591c0` |
| 23 | `security-and-hardening` | Input validation, auth/session security, OWASP | `addyosmani/agent-skills` | `8c99fa36` |
| 24 | `spec-driven-development` | PRD/spec decomposition prior to coding | `addyosmani/agent-skills` | `8c99fa36` |
| 25 | `sqlalchemy-alembic-expert-best-practices-code-review` | SQLAlchemy 2 ORM & safe Alembic migrations | `wispbit-ai/skills` | `8b2c7d0c` |
| 26 | `supabase-postgres-best-practices` | PostgreSQL 18 schema, indexing, constraints, locks | `supabase/agent-skills` | `c9be0e93` |
| 27 | `supply-chain-risk-auditor` | Lockfile advisories, package publisher & script audits | `trailofbits/skills` | `149d7b21` |
| 28 | `typescript-advanced-types` | Generics, conditional/mapped types, strict contracts | `wshobson/agents` | `1eecf4b5` |
| 29 | `unslop` | UI spacing, typography, visual polish, removing AI tells | Pre-existing local | N/A (local) |
| 30 | `vercel-composition-patterns` | Scalable React component composition & providers | `vercel-labs/agent-skills` | `5a37a632` |
| 31 | `vercel-react-best-practices` | React rendering, state, bundle optimization | `vercel-labs/agent-skills` | `5a37a632` |
| 32 | `vite` | Vite 6 config, bundling, build optimization | `antfu/skills` | `4a6bb39e` |
| 33 | `vitest` | Vitest component/unit tests & mocks | `antfu/skills` | `4a6bb39e` |
| 34 | `web-design-guidelines` | UI/UX compliance and design quality checks | `vercel-labs/agent-skills` | `5a37a632` |
| 35 | `writing-for-agents` | Maintaining `AGENTS.md` and skill files | `mattpocock/skills` | `abeeaf95` |

---

## 3. Global Skills Also Available in Host Environment

Relevant global Antigravity skills available alongside `.agents/skills/`:
- `modern-web-guidance` (HTML/CSS/DOM APIs, dialogs, forms)
- `chrome-devtools`, `a11y-debugging`, `cookie-debugging`, `debug-optimize-lcp`, `memory-leak-debugging`
- `android-cli`, `android-device-hub`, `compose-preview`
- `gsd-ui-phase`, `gsd-ui-review`, `gsd-code-review`, `gsd-debug`, `gsd-audit-fix`
