# MoneyTrack - Agent Guide

MoneyTrack is an offline-capable personal finance tracker. Financial correctness,
tenant isolation, and safe SMS classification are production invariants, not
style preferences. Do not change application behavior unless the task explicitly
asks for it.

## Stack

| Layer | Technology |
|---|---|
| Web UI | React 18, TypeScript 5.7, Vite 6, Tailwind CSS 3, React Router 7 |
| Forms/validation | React Hook Form, Zod |
| Mobile shell | Capacitor 8.5 (Android), Kotlin native SMS engine |
| API | FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 |
| Data | SQLite locally, PostgreSQL in production |
| Tests | pytest (backend), Vitest (frontend), Gradle/JUnit (Android) |
| Deployment | Render (`render.yaml`), Dockerfile in `backend/` |

## Commands

Run from the repository root.

```powershell
# Backend tests
backend\.venv\Scripts\python -m pytest backend\tests -q

# Backend lint / types
backend\.venv\Scripts\python -m ruff check backend
backend\.venv\Scripts\python -m mypy backend\app

# Frontend
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build

# Android
cmd /c "cd android && gradlew.bat test"
cmd /c "cd android && gradlew.bat assembleDebug"

# Local development (backend + frontend)
.\start-dev.ps1
```

- Backend settings live in `backend/.env`; never commit it.
- Applied Alembic revisions live in `backend/alembic/versions/`. Add a new
  revision with `backend/generate_migration.py`; never edit an applied migration.
- `backend/pytest.ini` sets `testpaths = tests` and `pythonpath = .`, so run
  pytest from `backend/` or pass `backend/tests` as shown above.

## Non-negotiable financial invariants

1. **Integer paise only.** Store and compute money as integer paise
   (1 INR = 100 paise). Never introduce floats for monetary amounts. Use the
   helpers in `backend/app/core/money.py`.
2. **Preserve idempotency.** Replaying an ingest with the same idempotency key
   must return `replayed=True` without duplicate ledger rows or balance updates.
   See `backend/app/models/idempotency_key.py` and `backend/tests/test_idempotency.py`.
3. **Ambiguity over deduction.** Unknown SMS direction stays
   `AMBIGUOUS_REVIEW` / `CandidateStatus.PENDING_REVIEW`; never auto-post a debit.
4. **Quarantine non-financial SMS.** Promotions, OTPs, balance queries, and data
   quotas remain `NON_FINANCIAL_SMS`.
5. **Tenant isolation.** Scope every query and fallback category lookup by
   `user_id`. System defaults are allowed only where explicitly intended.
6. **Atomic transfers.** Debit and credit both sides in one database transaction.
7. **Distinct identical transactions.** Preserve legitimate same-amount entries
   when UTR references or balance progression support them.
8. **Offline resilience.** Do not weaken the retry/persistence behavior in
   `frontend/src/services/offlineQueue.ts`, `TransactionStore.kt`, or `SyncWorker.kt`.
9. **Evidence matters.** Transaction evidence and balance snapshots are part of
   the audit trail; do not silently rewrite them.

Any change touching ledger posting, balances, SMS classification, or sync needs
tests in `backend/tests/` and/or `frontend/src/**/*.test.ts`. The authoritative
detail is in `docs/FINANCIAL_INTEGRITY_REPORT.md` and
`docs/MASTER_ARCHITECTURE.md`.

## Project skills

Project skills are installed under `.agents/skills/`; OpenCode discovers that
path automatically. Load only the skills relevant to the current task. Prefer
these project skills over global generic skills for repo work.

| Task | Use |
|---|---|
| API contracts, endpoint design | `api-and-interface-design` |
| Idempotency keys, retries, duplicate writes | `api-idempotency-retry` |
| FastAPI patterns | `fastapi-python` |
| Pydantic v2 models and validation | `pydantic` |
| SQLAlchemy models, Alembic migrations | `sqlalchemy-alembic-expert-best-practices-code-review` |
| PostgreSQL schema, indexes, queries | `supabase-postgres-best-practices` |
| React performance / composition | `vercel-react-best-practices`, `vercel-composition-patterns` |
| UI review, interaction quality | `web-design-guidelines` |
| Accessibility audit | `accessibility-engineering` |
| Advanced TypeScript types | `typescript-advanced-types` |
| Vite config / build | `vite` |
| Vitest tests | `vitest` |
| Android permissions and IPC | `android-permissions-security`, `android-intent-security` |
| Google Play policy / SMS declarations | `play-policy-insights` |
| Capacitor core, security, tests | `capacitor-expert`, `capacitor-security`, `capacitor-testing` |
| Auth, input handling, OWASP | `security-and-hardening`, `api-security-review` |
| Dependency/supply-chain risk | `supply-chain-risk-auditor` |
| Dockerfile quality | `docker-build-strategies` |
| CI/CD workflows | `ci-cd-and-automation` |
| Logging, metrics, diagnosis | `observability-and-instrumentation` |
| Performance work | `performance-optimization` |
| ADRs and docs drift | `documentation-and-adrs` |
| Spec before implementation | `spec-driven-development` |
| Deep-module design | `codebase-design` |
| Code review | `code-review` |
| Agent-facing docs / AGENTS.md | `writing-for-agents` |
| Commits, branches, releases | `git-workflow-and-versioning` |
| Context/token discipline | `context-engineering` |
| Find another skill | `find-skills` |
| Visual de-slopping (pre-existing) | `unslop` |

The global skill set (GSD workflow, `frontend-design`, TDD, systematic
debugging, refactoring, verification, and others) remains available. Do not
install duplicate global skills into this project.

### Restoring skills

`.agents/` is ignored by `.gitignore`, so a fresh clone does not contain the
installed skill files. Restore the pinned set from `skills-lock.json`:

```powershell
npx skills@1.9.0 experimental_install
```

Commit `skills-lock.json` when the selected skill set changes. Do not commit
`.agents/` unless the team decides to stop ignoring it.
