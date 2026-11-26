# MoneyTrack — Security Audit

**Audit Date:** 2026-11-26  
**Skills Applied:** `security-and-hardening`, `api-security-review`, `android-intent-security`, `android-permissions-security`, `capacitor-security`

---

## 1. Authentication, JWT & Session Lifecycle

- **Password Hashing (`backend/app/core/security.py:13-27`):** Uses `bcrypt` with cost factor 12 (`bcrypt.gensalt(rounds=12)`).
  - **Gap (`P13` / `V4`):** `UserCreate.password` (`backend/app/schemas/auth.py:8`) has `min_length=8` but **no `max_length`**. `bcrypt >= 4.0` raises `ValueError: password cannot be longer than 72 bytes` -> unhandled `500` or CPU DoS. **Action:** Add `max_length=72` (or byte-length validator) on `UserCreate.password` and `UserLogin.password`.
  - **Gap (`P20` / `S12`):** `authenticate_user()` (`backend/app/services/auth.py:154-164`) skips bcrypt verification when user does not exist (timing oracle) and returns `"User account is inactive."` vs `"Invalid email or password."` (account state disclosure). **Action:** Run dummy `verify_password` on missing user and return uniform `"Invalid email or password."`.
- **JWT Lifecycle (`backend/app/core/security.py:30-59`, `config.py:73`):** HS256 JWT with 30-day expiry (`access_token_expire_minutes = 43200`), no `jti`, no revocation/logout endpoint, no password-change endpoint (`D13` / `S6`). Production rejects empty or placeholder `SECRET_KEY` (`config.py:120-126`).
- **Rate Limiting (`V5` / `S7`):** No rate limiting on `/api/auth/login`, `/api/auth/register`, `/api/sms/ingest`, or `/api/receipts/parse`.
- **Public Setup Status (`D14` / `S11`):** `GET /api/auth/setup-status` exposes `user_count` publicly.

---

## 2. Multi-Tenant Authorization & Data Isolation

- **Application Scoping:** Verified every API route (`expenses.py`, `incomes.py`, `bank_accounts.py`, `transfers.py`, `budgets.py`, `analytics.py`, `cashflow.py`, `exports.py`, `security.py`, `notifications.py`, `weekly_report.py`, `sms_ingest.py`) depends on `get_current_user` (`deps.py:38-56`).
- **Kernel Enforcement:** Alembic `0010_tenant_evidence_fk.py` enforces composite foreign keys `(user_id, expense_id)`, `(user_id, income_id)`, `(user_id, sms_message_id)` on `transaction_evidence`.
- **Critical Open Tenancy Breaches:**
  1. **`C1` (`P0`) — Cross-Tenant DEBIT Idempotency Replay:** `ExpenseIdempotencyKey` (`backend/app/models/idempotency_key.py:22-35`) lacks `user_id` and has global `unique=True` on `idempotency_key`. `sms_ingest.py:288-294` fetches `db.get(Expense, existing_key.expense_id)` without checking `Expense.user_id == user_id`.
  2. **`C18` (`P0`) — Cross-Tenant Backup Restore Type Binding:** `backend/app/services/exports.py:411,508` executes `select(ExpenseType)` and `select(IncomeType)` with **no `user_id` filter**, allowing User B's restore to bind to User A's private category IDs on `name_key` match (violating tenant isolation).
  3. **`C27` (`P1`) — Shared System Income Types Writable by Any User:** `backend/app/api/routes/income_types.py:99-100,120-121` checks `if model.user_id is not None and model.user_id != current_user.id`, which permits any tenant to edit or archive `user_id IS NULL` shared templates (`Salary`, etc.).
  4. **`C28` (`P1`) — First-User Claim Key Mismatch:** `backend/app/services/auth.py:27-53` uses underscores (`"food_&_dining"`, `"rent_&_maintenance"`) while `name_key()` produces spaces (`"food & dining"`), causing first user bootstrap to claim shared multi-word system types as private.
  5. **`C20` (`P1`) — Global `UserPreference.key` Collision:** `backend/app/models/user_preference.py:17` sets `unique=True` on `key`, blocking every user after the first from saving preferences (`500 IntegrityError`).

---

## 3. Input Validation, Injection & Third-Party Data Handling

- **SQL Injection:** All queries use SQLAlchemy parameterized expressions.
- **CSV Formula Injection (`P15` / `S9`):** `backend/app/services/exports.py:96-110` writes `merchant`, `note`, `expense_type.name` verbatim into CSV; leading `=`, `+`, `-`, `@`, `\t`, `\r` must be neutralized (`'`).
- **Receipt Upload / OCR (`P14`):** `backend/app/api/routes/receipts.py` buffers uploaded file bytes before size enforcement; Groq vision (`P21` / `S10`) sends receipt image/text to Groq API when `GROQ_API_KEY` is set.
- **SMS Schema Validation (`V7`):** `backend/app/schemas/sms_ingest.py` has unbounded string lengths on `body`, `raw_text`, `reference`, `suggested_category`.

---

## 4. Infrastructure, Headers & Android Security

- **Android `TEST_NOTIFICATION` Backdoor (`C15` / `S2` — `P0`):** `MainActivity.kt:41-102` accepts `com.moneytrack.app.TEST_NOTIFICATION` in **release** builds without `BuildConfig.DEBUG` guard, allowing any external app on the device to inject fake SMS candidates, flip records to `READY_TO_SYNC`, or clear notifications, while logging raw intent extras (`MainActivity.kt:48`).
- **Android Deep Link & Notification Privacy (`P23`):** `SmsNotificationHelper.kt:277-286` creates an implicit `Intent(Intent.ACTION_VIEW)` without `.setPackage(context.packageName)` and displays merchant/amount on lockscreen without `VISIBILITY_PRIVATE`.
- **Android Network Security (`network_security_config.xml`):** HTTPS required by default; cleartext limited to `10.0.2.2`, `localhost`, `127.0.0.1`. `SyncWorker.buildEndpointUrl` permits `http://` if configured in `backendUrl` (`S7-android`).
- **Token Storage:** Web uses `localStorage`; Android mirrors JWT to Keystore-backed `SecureTokenStore.kt` (release builds fail closed; debug builds fall back to Base64 if Keystore fails — `P24`).
- **Docker & Headers (`C13` / `S5`, `D15` / `S8`, `D16`):** `backend/Dockerfile` runs as `root`, defaults `CORS_ORIGINS=*` and `SQLite`, and copies `.` without a `.dockerignore` (risking baking local `backend/.env` and `data/*.db` into Docker images). `main.py:225-231` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, but omits `Content-Security-Policy` (`D16`).
