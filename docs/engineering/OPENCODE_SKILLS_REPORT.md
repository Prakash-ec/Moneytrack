# OpenCode Skills Upgrade Report

**Repository:** `D:\MoneyTrack`  
**Date:** 23 November 2026  
**Scope:** project-level OpenCode skills, verification, and agent instructions  
**Application code changed:** none

---

## 1. Executive summary

MoneyTrack now has **34 verified project-level skills from 17 source repositories**,
installed under `.agents/skills/` for OpenCode. Together with the pre-existing
`unslop` skill, the project exposes **35 skills**. The set covers the actual
stack: React/Vite/Tailwind/Capacitor, FastAPI/SQLAlchemy/Alembic/Pydantic,
PostgreSQL/SQLite, Android/Kotlin SMS handling, GitHub Actions, Docker, and
Render deployment.

The catalog was searched with the official Skills CLI across **85 queries**,
yielding **6,277 unique candidate results from 2,006 repositories**. After
metadata screening and content review of **58 skill-level candidates**, 34 were
installed and 24 were deliberately rejected. The 24 rejections are listed with
reasons in section 5.

Verification results:

| Check | Result |
|---|---|
| Skill directories | 35 (34 installed in this task + pre-existing `unslop`) |
| `SKILL.md` present and valid frontmatter | 35/35 |
| Frontmatter name matches directory | 35/35 |
| Duplicate skill IDs | 0 |
| Broken symlinks | 0 (all installations are copies) |
| Tracked lockfile entries | 34 |
| Source repositories pinned | 17 |
| `skills check` (best run) | 33/34 up to date; 1 source fetch failed |
| Name overlap with 99 global skills | 0 |
| Installed files (excluding `unslop`) | 255 files, ~1.5 MB |
| OpenCode discovery path | `.agents/skills/` (native) |

No application source, dependency, database schema, or deployment file was
modified. The only repository additions are:

- `.agents/skills/` (34 installed skills; git-ignored by the existing `.gitignore`)
- `skills-lock.json` (34 pinned entries)
- `AGENTS.md` (new project agent guide)
- `docs/engineering/OPENCODE_SKILLS_REPORT.md` (this report)

---

## 2. Environment and method

### 2.1 Environment

| Tool | Version |
|---|---|
| Node.js | v24.16.0 |
| npm | 11.13.0 |
| Skills CLI | 1.9.0 |
| Git | 2.55.0 |
| OS | Windows (win32) |

### 2.2 Installation model

- **Project scope, not global.** OpenCode reads project skills from
  `.agents/skills/`; the CLI was invoked with `-a opencode`, so no global
  configuration was changed.
- **Copy mode.** The CLI installed copies of each skill directory. No symlinks
  were created, so the project does not depend on the source clones remaining
  on disk.
- **Pinned source.** `skills-lock.json` records the upstream repository, commit,
  skill path, and a SHA-256 `computedHash` for every skill.
- **No existing config overwritten.** There was no `AGENTS.md`, `opencode.json`,
  `opencode.jsonc`, `.opencode/`, or `CLAUDE.md` in the repository before this
  task. The new `AGENTS.md` is additive.

### 2.3 Selection criteria

Each candidate was judged on:

1. **Stack fit** - does MoneyTrack actually use the technology?
2. **Content quality** - specific rules and examples, not generic advice.
3. **Maintenance** - recent commits, active source repository.
4. **Adoption** - install count and repository credibility.
5. **OpenCode compatibility** - plain `SKILL.md` with valid frontmatter.
6. **Dependencies** - no required services, credentials, or paid tools.
7. **Overlap** - not duplicating the 99 global skills or another selected skill.
8. **Security** - no credential access, exfiltration, obfuscation, or destructive
   commands.

### 2.4 Commands used

```powershell
# Discovery (85 queries across the requested categories)
npx skills@latest find "<query>"

# Installation (one repository at a time, exact skill names)
npx skills@latest add <owner/repo> `
  --skill <skill-name> `
  -a opencode -y

# Verification
npx skills@latest list
npx skills@latest list --json
npx skills@latest check

# Restore from the lockfile on a fresh clone
npx skills@latest experimental_install
```

The CLI's `add --json --force` mode was also used to inspect structured
security metadata for a subset of skills. It reports `security.gen`,
`security.socket`, and `security.snyk` per installed skill.

---

## 3. Counts

| Metric | Count |
|---|---:|
| Discovery queries executed | 85 |
| Unique candidate `repo@skill` results | 6,277 |
| Unique repositories surfaced | 2,006 |
| Unique skill names surfaced | 5,326 |
| Candidates with >=100 installs | 4,730 |
| Candidates with >=500 installs | 3,145 |
| Candidates reviewed at skill level | 58 |
| Skills selected and installed | 34 |
| Skills rejected after skill-level review | 24 |
| Source repositories used | 17 |
| Additional repositories screened and rejected | 14 |
| Project skills after installation | 35 |
| Pre-existing global skills | 99 |
| Project/global name collisions | 0 |

"Reviewed at skill level" means the skill's `SKILL.md`, structure, and fit were
examined. The 6,277 discovery results were screened by name, repository,
adoption, and stack relevance; not every result received a full content review.

---

## 4. Installed skills

### 4.1 Source repositories and pins

| Source repository | Skills | Commit |
|---|---:|---|
| `addyosmani/agent-skills` | 10 | `8c99fa36d900` |
| `android/skills` | 3 | `c72942584fff` |
| `antfu/skills` | 2 | `4a6bb39e7b45` |
| `capawesome-team/skills` | 1 | `847d536b4b6b` |
| `cap-go/capgo-skills` | 2 | `e82217b8fa76` |
| `docker/skills` | 1 | `8839ca12564e` |
| `mattpocock/skills` | 3 | `abeeaf95660b` |
| `mindrally/skills` | 1 | `7682ca77710e` |
| `owasp/secure-agent-playbook` | 1 | `65d4efd2cd0b` |
| `pydantic/skills` | 1 | `98f591c0886e` |
| `samber/developer-platform-skills` | 1 | `c042e5dc688e` |
| `supabase/agent-skills` | 1 | `c9be0e931b79` |
| `trailofbits/skills` | 1 | `149d7b21f406` |
| `vercel-labs/agent-skills` | 3 | `5a37a6329fba` |
| `vercel-labs/skills` | 1 | `57217cf86ba3` |
| `wispbit-ai/skills` | 1 | `8b2c7d0ceca0` |
| `wshobson/agents` | 1 | `1eecf4b58eb3` |

### 4.2 Skills by category

#### Agent workflow and documentation (7)

| Skill | Source | Why it fits |
|---|---|---|
| `context-engineering` | `addyosmani/agent-skills` | Keeps agent context small and task-focused across a large repo. |
| `spec-driven-development` | `addyosmani/agent-skills` | Requires a written spec before implementing features. |
| `writing-for-agents` | `mattpocock/skills` | Improves `AGENTS.md` and other agent-facing documents. |
| `codebase-design` | `mattpocock/skills` | Deep-module vocabulary for API and service boundaries. |
| `code-review` | `mattpocock/skills` | Two-axis review: standards and spec compliance. |
| `documentation-and-adrs` | `addyosmani/agent-skills` | ADR format and detection of stale docs. |
| `git-workflow-and-versioning` | `addyosmani/agent-skills` | Commit splitting, branches, releases, changelogs. |

#### Frontend and UI (7)

| Skill | Source | Why it fits |
|---|---|---|
| `vercel-react-best-practices` | `vercel-labs/agent-skills` | React 18 performance and data-fetching rules. |
| `vercel-composition-patterns` | `vercel-labs/agent-skills` | Compound components and reusable component APIs. |
| `web-design-guidelines` | `vercel-labs/agent-skills` | Interaction, form, and accessibility review checklist. |
| `accessibility-engineering` | `addyosmani/agent-skills` | WCAG 2.2 AA audit with axe-core/pa11y. |
| `typescript-advanced-types` | `wshobson/agents` | Generics, discriminated unions, type-safe APIs. |
| `vite` | `antfu/skills` | Vite 6 config, plugins, bundling, SSR. |
| `vitest` | `antfu/skills` | Vitest mocking, coverage, and test structure. |

#### Backend and data (6)

| Skill | Source | Why it fits |
|---|---|---|
| `fastapi-python` | `mindrally/skills` | Async FastAPI patterns and dependency injection. |
| `pydantic` | `pydantic/skills` | Pydantic v2 validation and model design, from the maintainers. |
| `sqlalchemy-alembic-expert-best-practices-code-review` | `wispbit-ai/skills` | Focused Alembic safety and PostgreSQL migration rules. |
| `supabase-postgres-best-practices` | `supabase/agent-skills` | Postgres indexes, locking, RLS, and query tuning; usable without Supabase. |
| `api-idempotency-retry` | `samber/developer-platform-skills` | Directly reinforces MoneyTrack's idempotency-key and retry invariants. |
| `api-and-interface-design` | `addyosmani/agent-skills` | REST contracts, versioning, and stable module boundaries. |

#### Mobile and Android (6)

| Skill | Source | Why it fits |
|---|---|---|
| `android-permissions-security` | `android/skills` | Runtime permissions and IPC component hardening for the SMS flow. |
| `android-intent-security` | `android/skills` | Intent redirection, PendingIntent, and exported-component review. |
| `play-policy-insights` | `android/skills` | Google Play data-safety and restricted-permission audit, including SMS. |
| `capacitor-expert` | `capawesome-team/skills` | Capacitor 8 architecture, CLI, plugins, and native project work. |
| `capacitor-security` | `cap-go/capgo-skills` | WebView, token storage, cleartext, and bundle-secret audit. |
| `capacitor-testing` | `cap-go/capgo-skills` | Web/native test strategy, mocking Capacitor plugins, device verification. |

#### Security, delivery, and quality (7)

| Skill | Source | Why it fits |
|---|---|---|
| `security-and-hardening` | `addyosmani/agent-skills` | OWASP-oriented input, auth, session, and dependency hardening. |
| `api-security-review` | `owasp/secure-agent-playbook` | OWASP API Security Top 10 review procedure. |
| `supply-chain-risk-auditor` | `trailofbits/skills` | Deterministic npm/PyPI/Go supply-chain and advisory audit. |
| `docker-build-strategies` | `docker/skills` | Multi-stage Dockerfile, cache, non-root, and image-size rules. |
| `ci-cd-and-automation` | `addyosmani/agent-skills` | Quality gates and pipeline design for GitHub Actions. |
| `observability-and-instrumentation` | `addyosmani/agent-skills` | Logging, metrics, tracing, and production diagnosis. |
| `performance-optimization` | `addyosmani/agent-skills` | Frontend/backend/query performance investigation. |

#### Discovery (1)

| Skill | Source | Why it fits |
|---|---|---|
| `find-skills` | `vercel-labs/skills` | Lets future agents search the catalog without guessing skill names. |

### 4.3 Pre-existing project skill

`unslop` was already present in `.agents/skills/` and is not tracked in
`skills-lock.json`. It was left untouched. It overlaps with the global
`frontend-design` skill and is useful for de-templating AI-looking UI.

---

## 5. Evaluation and exclusions

### 5.1 Skill-level rejections (24)

| Skill | Source | Reason |
|---|---|---|
| `browser-testing-with-devtools` | `addyosmani/agent-skills` | MoneyTrack has no Playwright/browser E2E setup; Vitest is the test runner. |
| `code-review-and-quality` | `addyosmani/agent-skills` | Overlaps installed `code-review` and global `receiving-code-review`. |
| `code-simplification` | `addyosmani/agent-skills` | Overlaps global `safe-refactor`. |
| `constraint-driven-development` | `addyosmani/agent-skills` | Process-only; no matching repo constraint workflow. |
| `debugging-and-error-recovery` | `addyosmani/agent-skills` | Overlaps global `systematic-debugging`. |
| `deprecation-and-migration` | `addyosmani/agent-skills` | Overlaps global `migration`. |
| `doubt-driven-development` | `addyosmani/agent-skills` | Niche decision-hygiene workflow; no current need. |
| `frontend-ui-engineering` | `addyosmani/agent-skills` | Overlaps global `frontend-design` and pre-existing `unslop`. |
| `idea-refine` | `addyosmani/agent-skills` | Overlaps GSD explore/discuss commands. |
| `incremental-implementation` | `addyosmani/agent-skills` | Overlaps global `writing-plans` and `lean-build`. |
| `interview-me` | `addyosmani/agent-skills` | Overlaps GSD discuss-phase questioning. |
| `planning-and-task-breakdown` | `addyosmani/agent-skills` | Overlaps global `writing-plans`. |
| `shipping-and-launch` | `addyosmani/agent-skills` | Overlaps GSD ship/release docs and existing release checklists. |
| `source-driven-development` | `addyosmani/agent-skills` | Niche sourcing workflow; low applicability. |
| `test-driven-development` | `addyosmani/agent-skills` | Global TDD skill already installed. |
| `using-agent-skills` | `addyosmani/agent-skills` | Meta-guidance; adds no domain value. |
| `domain-modeling` | `mattpocock/skills` | Useful, but overlaps installed `codebase-design` and API design. |
| `to-spec` | `mattpocock/skills` | Overlaps installed `spec-driven-development`. |
| `testing-setup` | `android/skills` | The repo already has Gradle/JUnit tests; no setup task. |
| `r8-analyzer` | `android/skills` | Relevant only during release shrinking; no current R8 task. |
| `anr-audit-and-fix` | `android/skills` | No ANR evidence; can be added when a trace exists. |
| `capacitor-plugins` | `capawesome-team/skills` | 244 files / 675 KB vendor catalog; `capacitor-expert` covers core needs. |
| `docker-compose-patterns` | `docker/skills` | No `compose.yaml` in the repo; only `backend/Dockerfile` exists. |
| `emil-design-eng` | `emilkowalski/skills` | Overlaps `frontend-design`/`unslop`; also forces a canned first response. |

### 5.2 Repository-level exclusions

These collections were cloned or inspected but rejected before skill-level
selection. They are in addition to the 24 skill-level rejections above.

| Repository | Why it was not used |
|---|---|
| `obra/superpowers` | Duplicates the global TDD, debugging, planning, and verification suite. |
| `pbakaus/impeccable` | 26 design skills; overlaps `frontend-design` and `unslop`. |
| `nextlevelbuilder/ui-ux-pro-max-skill` | 13 design skills; same overlap. |
| `anthropics/skills` | DOCX/PPTX/XLSX/PDF skills; not relevant to MoneyTrack. |
| `github/awesome-copilot` | 109 entries; generic/duplicative, and the clone had no root `SKILL.md` layout to verify. |
| `securityskills/skills` | 0 `SKILL.md` files found; unverifiable. |
| `addyosmani/web-quality-skills` | 0 `SKILL.md` files found; not a usable skills repo. |
| `jeffallan/claude-skills` | 0 `SKILL.md` files found; unverifiable. |
| `mindrally/skills` | 56 entries; only `fastapi-python` was relevant and selected. |
| `wshobson/agents` | 86 entries; only `typescript-advanced-types` was relevant. |
| `pydantic/skills` | 43 entries; only core `pydantic` fits; Pydantic AI/Logfire are not used. |
| `samber/developer-platform-skills` | 61 entries; only `api-idempotency-retry` fits. |
| `antfu/skills` | Many entries; only `vite` and `vitest` fit. |
| `supabase/agent-skills` | Postgres practices selected; Supabase client/RLS setup is not used. |

### 5.3 Categories excluded as not applicable

- Playwright, Cypress, and browser-automation skills (no such dependency).
- Next.js, Prisma, React Native, Expo, and Ionic skills (different stack).
- Vercel deployment skills (deployment is Render + Docker).
- Supabase client/RLS and auth skills (MoneyTrack uses its own FastAPI auth).
- Tailwind component libraries and generic landing-page design skills.
- Generic finance/investment skills (not personal-finance ledger integrity).

### 5.4 Financial-engineering gap

The catalog has many finance-domain skills (for example, 65 entries in
`anthropics/financial-services`), but they target financial-services analysis,
valuation, and modeling. None credibly encodes MoneyTrack's specific
invariants: integer paise, exact-once ledger posting, SMS ambiguity quarantine,
tenant-scoped categories, and idempotent offline sync.

`docs/FINANCIAL_INTEGRITY_REPORT.md` and the existing test suite remain the
authoritative source. If the team wants a skill for this, it should be authored
in-repo rather than installed from the catalog.

---

## 6. Verification

### 6.1 Inventory

`npx skills list --json` reports **35 project skills**. Of these:

- **34** have a tracked source and lockfile entry.
- **1** (`unslop`) is pre-existing and untracked.

The 34 installed skills contain **255 files / ~1.5 MB**. Including the
pre-existing `unslop` directory (14 files / ~1.4 MB), `.agents/skills/` contains
**269 files / ~2.9 MB**. The largest installed skills are
`supply-chain-risk-auditor` (230 KB), `vercel-react-best-practices` (224 KB), and
`play-policy-insights` (207 KB).

### 6.2 Frontmatter and structure

A full scan of all 35 directories found:

- `SKILL.md` present in every directory.
- Valid YAML frontmatter with both `name` and `description`.
- `name` exactly matches the directory name in every case.
- No duplicate skill names.
- No missing descriptions.

### 6.3 Lockfile

`skills-lock.json` contains:

- `version: 2`
- **34** skill entries
- **17** source repositories
- A pinned `commit`, `skillPath`, `sourceType`, and `computedHash` for each skill

The file is currently **untracked** (`?? skills-lock.json`). It should be
reviewed and committed if the team wants reproducible restoration.

### 6.4 Update check

`npx skills check` was run twice:

| Run | Result |
|---|---|
| First run | 20/34 up to date; 14 skill update failures (11 source fetch errors) |
| Retry | **33/34 up to date**; 1 source fetch failure (`samber/developer-platform-skills`) |

The failures were GitHub API/network fetch failures while checking for deleted
upstream skills, not local content mismatches. The command exits with code 1
when any source fetch fails. Re-running after rate limits reset, or supplying a
`GITHUB_TOKEN`, should clear the last failure.

A second full re-audit of all 34 `--json` security rows was interrupted twice by
environment restarts. The lockfile hashes were compared before and after:
**34 entries, 0 changed hashes**, so the interrupted runs did not alter the
installed set.

### 6.5 Symlinks and copies

No reparse points/symlinks were found under `.agents/skills/`. Every install is
a real directory copy. This is portable and does not depend on the temporary
source clones.

### 6.6 Security review

#### CLI assessments

Full Gen/Socket/Snyk rows were captured for **21 skills**:

- **Gen:** `Safe` for all 21.
- **Socket:** `0 alerts` for all 21.
- **Snyk:** 19 `Low`, 2 `Medium` (`code-review` and `security-and-hardening`).

One additional skill (`sqlalchemy-alembic-expert-best-practices-code-review`)
showed `Safe` and `0 alerts`; its Snyk column was truncated in the captured
output. The remaining 12 skills were installed through the same CLI pipeline but
their printed assessment rows were not captured before the environment
restarted. They were reviewed manually.

The two Snyk `Medium` ratings are risk ratings, not detected vulnerabilities.
Both skills are instruction-only and contain no executable scripts.

#### Manual script review

19 script files were found across four installed skills:

| Skill | Scripts | Observed behavior |
|---|---:|---|
| `accessibility-engineering` | 1 | Runs pinned `@axe-core/cli@4.13.0` and `pa11y@9.1.1` via `npx`; cleans its own temp directory. |
| `docker-build-strategies` | 1 | Verifies a Docker build; no credential access. |
| `play-policy-insights` | 5 | Reads Android project files, writes only under `.scratch/play_policy_insights_<uuid>`, and fetches public Google Play listing/data-safety pages with `urllib`. |
| `supply-chain-risk-auditor` | 12 | Queries npm registry, PyPI, OSV, and GitHub APIs; stdlib only; no credential reads. |

No evidence of:

- reading `.env`, keychains, browser profiles, or credentials;
- exfiltrating repository data to an unrelated endpoint;
- obfuscated or encoded payloads;
- destructive commands outside the skill's own temp/scratch directory;
- unconditional `curl | sh`, `eval`, or remote code execution.

`unslop` also contains two pre-existing scripts (`snapshot.mjs`, `story.mjs`);
they were not installed or modified by this task.

#### Source trust

The selected sources are official vendor repositories (Android, Docker,
Pydantic, OWASP, Supabase, Capacitor/Capawesome), established maintainers
(Addy Osmani, Matt Pocock, Vercel Labs, Antfu, Trail of Bits), or focused
practitioner repositories with verified content (`wispbit-ai`, `samber`,
`wshobson`, `mindrally`). `wispbit-ai/skills` is a small repository (9 stars),
but its Alembic rules are specific and its skill has 2.2K installs; it was
selected on content quality rather than stars alone.

### 6.7 OpenCode discovery

The CLI reports the installation target as OpenCode and writes to
`.agents/skills/`, which OpenCode discovers natively. `npx skills list` sees all
35 project skills in that directory. No `opencode.json` change is required.

### 6.8 Git sharing implication

`.gitignore` line 51 contains:

```gitignore
.agents/
```

This means the installed skill files are **not committed**. The lockfile is not
ignored, so the recommended sharing model is:

1. Commit `skills-lock.json`.
2. Let each developer or CI job restore with
   `npx skills@1.9.0 experimental_install`.
3. If the team prefers vendored skills, remove `.agents/` from `.gitignore` and
   commit the 1.5 MB of installed files instead.

This task intentionally did not modify `.gitignore`, because ignoring `.agents/`
may be a deliberate local-tooling decision.

---

## 7. Failures encountered and resolution

### 7.1 PowerShell `$args` swallowed install arguments

The first batch loop used the automatic variable `$args` to build the CLI
argument list. In PowerShell, `$args` is reserved, so the loop ran `npx skills
add` with no repository or skill arguments. Every iteration returned exit code
0, but only the first repository had actually installed.

**Resolution:** verification with `npx skills list` caught the missing entries.
The loop was rewritten with `$cliArgs`, and all 34 skills were installed and
re-verified. This is the main reason the report does not rely on exit codes
alone.

### 7.2 GitHub API rate limiting

Unauthenticated GitHub API calls were rate-limited during installation and
update checks. The CLI fell back to git clone for installs, which succeeded.
`skills check` reported source-fetch failures for up to 14 repositories on the
first run and only 1 on retry.

**Resolution:** installs completed via git; the update check is expected to pass
once the rate limit resets. For CI, provide `GITHUB_TOKEN` or authenticate `gh`.

### 7.3 Interrupted security re-audit

Two attempts to capture `--json` security metadata for all 34 skills were
interrupted by environment restarts. No files were lost, and a before/after
lockfile comparison showed 0 hash changes. Twenty-one full rows plus one
partial row were captured; the rest were reviewed manually.

### 7.4 `skills check` is not listed in `--help`

The command works but is absent from the CLI help output. It exits with code 1
when a source cannot be fetched, even when installed skills are up to date. Treat
its output as an update signal, not as an integrity verdict.

---

## 8. Changes made

| Path | Change |
|---|---|
| `.agents/skills/` | Added 34 skill directories via the official CLI; left `unslop` untouched. |
| `skills-lock.json` | Created by the CLI; 34 pinned entries from 17 sources. |
| `AGENTS.md` | New project guide with stack, commands, financial invariants, and skill routing. |
| `docs/engineering/OPENCODE_SKILLS_REPORT.md` | This report. |

Not changed:

- application source code, dependencies, tests, or database migrations;
- `.gitignore`;
- global OpenCode/Claude skill directories;
- `README.md`, `DEPLOYMENT.md`, `render.yaml`, or CI workflows;
- any existing user configuration (none was present in the repo).

---

## 9. Recommendations

1. **Commit `skills-lock.json`.** It is the reproducible source of truth for the
   34 skills. Without it, a fresh clone has no way to restore the same set.
2. **Decide how to share `.agents/`.** Either keep it ignored and document
   `npx skills@1.9.0 experimental_install`, or unignore and commit the ~1.5 MB
   of installed skills. Do not leave the team guessing.
3. **Pin the CLI version.** Use `skills@1.9.0` in docs and CI so a future CLI
   release does not silently change lockfile behavior.
4. **Run a monthly update check.** `npx skills check`, then review and test any
   changed skill before accepting it. Skills are instructions and can change
   agent behavior.
5. **Authenticate GitHub in CI.** Set `GITHUB_TOKEN` to avoid the rate-limit
   failures seen during this task.
6. **Load skills on demand.** Do not preload all 35 into every prompt. Use the
   routing table in `AGENTS.md` and load only the relevant skill.
7. **Keep the financial invariants in-repo.** The catalog has no credible skill
   for integer-paise double-entry integrity. If automation is wanted, write a
   repo-local skill from `docs/FINANCIAL_INTEGRITY_REPORT.md` and the existing
   pytest suite.
8. **Treat `play-policy-insights` as a sandboxed audit tool.** It reads Android
   project files, writes under `.scratch/`, and fetches public Play Store pages.
   Run it in CI or a disposable workspace, not against a production signing
   environment.
9. **Revisit deferred Android skills when needed.** `android/r8-analyzer` is
   useful during release shrinking, and `android/anr-audit-and-fix` is useful
   when an ANR trace exists. They were not installed because there is no current
   task for them.
10. **Revisit `capacitor-plugins` only for plugin work.** The full vendor catalog
    is large; `capacitor-expert` is sufficient for normal app work.

---

## 10. Appendix

### A. Exact source pins

```
addyosmani/agent-skills               8c99fa36d90068c82d547f7c12a9d67a3e95f4ee
android/skills                        c72942584fff970dac86ced78b367fce0c441e52
antfu/skills                          4a6bb39e7b45...
capawesome-team/skills                847d536b4b6b...
cap-go/capgo-skills                   e82217b8fa76...
docker/skills                         8839ca12564e...
mattpocock/skills                     abeeaf95660b...
mindrally/skills                      7682ca77710e...
owasp/secure-agent-playbook           65d4efd2cd0b...
pydantic/skills                       98f591c0886e...
samber/developer-platform-skills      c042e5dc688e541c5078206dba695157d63961fa
supabase/agent-skills                 c9be0e931b79...
trailofbits/skills                    149d7b21f406...
vercel-labs/agent-skills              5a37a6329fba...
vercel-labs/skills                    57217cf86ba3...
wispbit-ai/skills                     8b2c7d0ceca0...
wshobson/agents                       1eecf4b58eb3...
```

The full 40-character hashes and per-skill `computedHash` values are in
`skills-lock.json`. Abbreviated hashes above are for readability only.

### B. Verification commands

```powershell
# Inventory
npx skills@latest list
npx skills@latest list --json

# Update check
npx skills@latest check

# Frontmatter/name/duplicate scan (PowerShell)
Get-ChildItem .agents\skills -Directory | ForEach-Object {
  $f = Join-Path $_.FullName "SKILL.md"
  $raw = Get-Content $f -Raw
  # parse frontmatter, compare name to directory, collect issues
}

# Lockfile summary
(Get-Content skills-lock.json -Raw | ConvertFrom-Json).skills.PSObject.Properties |
  Group-Object { $_.Value.source } |
  ForEach-Object { "{0}: {1}" -f $_.Name, $_.Count }
```

### C. Reproduction

```powershell
git clone <MoneyTrack repository>
cd MoneyTrack
npx skills@1.9.0 experimental_install
npx skills@1.9.0 list
```

`experimental_install` reads `skills-lock.json` and restores the 34 pinned
skills into `.agents/skills/`.
