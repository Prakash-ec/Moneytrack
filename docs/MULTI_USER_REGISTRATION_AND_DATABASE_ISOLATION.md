# MoneyTrack — Multi-User Registration & Database Isolation Architecture

**Document Version:** 1.0.0  
**Date:** 22 November 2026  
**Scope:** User Registration, Authentication Flow, Multi-Tenant Data Partitioning, and Database Isolation

---

## 1. Overview & Objective

Previously, user registration in MoneyTrack was restricted after initial instance configuration (`allow_registration: bool = False`). New user sign-ups were disabled, and the login interface displayed:
> *"Registration is closed. Contact the instance administrator if you need access."*

This implementation completes the full end-to-end multi-user architecture:
1. **Public User Registration Enabled:** Allows any user to create an account and immediately log in.
2. **Strict Multi-Tenant Database Partitioning ("Separate Database Partition"):** Guarantees that each user has completely isolated financial records (bank accounts, expenses, incomes, budgets, transfers, categories, balance snapshots, and evidence).
3. **Dedicated Physical Database Support:** Supports running on separate physical databases via `DATABASE_URL` for isolated staging/production or private instance environments.
4. **Enhanced Frontend User Experience:** Interactive `[Sign In | Create Account]` tab switcher, `/register` route, and seamless onboarding.

---

## 2. Registration & Authentication Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User as New User
    participant Frontend as MoneyTrack Web / Mobile UI
    participant API as FastAPI Backend (/auth)
    participant DB as Relational Database (SQLite / Neon PG 18)

    User->>Frontend: Select "Create Account" (/register)
    User->>Frontend: Enter Full Name, Email, Password
    Frontend->>API: POST /api/auth/register
    API->>DB: Query existing users & check allow_registration
    alt First User (Instance Bootstrap)
        API->>DB: Create User (is_superuser=True)
        API->>DB: Atomically claim unowned legacy records
    else Subsequent User (Standard Tenant)
        API->>DB: Create User (is_superuser=False)
        API->>DB: Generate fresh isolated tenant space
    end
    API->>API: Generate Signed JWT Access Token (HS256)
    API-->>Frontend: 201 Created (Token + User Profile)
    Frontend-->>User: Authenticated Session Established -> Dashboard
```

### 2.1 Registration Policy Settings

In [`backend/app/core/config.py`](file:///D:/MoneyTrack/backend/app/core/config.py):
- `allow_registration: bool = True` (enabled by default).
- Can be overridden via environment variable `ALLOW_REGISTRATION=false` in environments requiring closed invite-only access.
- In `backend/app/services/auth.py`, `register_user()` verifies concurrency via PostgreSQL advisory lock (`pg_advisory_xact_lock(84729103)`) and threading locks.

---

## 3. Database Isolation ("Separate Database" Architecture)

MoneyTrack employs a **Two-Tier Defense** ensuring complete data isolation between users:

### 3.1 Tier 1: Application-Level Query Scoping
Every financial route and service method strictly scopes all reads and writes by `user_id = current_user.id`:
- **Expenses & Incomes:** Filtered strictly by `user_id`.
- **Bank Accounts & Balances:** Accounts belonging to User A are invisible to User B. Accessing an account by ID belonging to another user returns `404 Not Found`.
- **Budgets & Transfers:** Scoped to the current tenant.
- **Analytics & Cashflow:** Calculated exclusively from the authenticated user's records.
- **Expense Types (Categories):**
  - System default types (`user_id IS NULL`) are available to all users as shared templates.
  - Transaction statistics (`total_paise` and `transaction_count`) on system types are calculated strictly for `Expense.user_id == current_user.id`, ensuring User B never observes User A's transaction counts or totals.
  - Custom categories (`user_id = user.id`) are visible and mutable only by their creator.

### 3.2 Tier 2: Kernel-Enforced Composite Foreign Keys
Migration [`0010_tenant_evidence_fk.py`](file:///D:/MoneyTrack/backend/alembic/versions/0010_tenant_evidence_fk.py) enforces composite unique constraints:
- `expenses(user_id, id)`
- `incomes(user_id, id)`
- `sms_source_messages(user_id, id)`

And composite foreign keys on junction tables:
- `transaction_evidence(user_id, expense_id) REFERENCES expenses(user_id, id) ON DELETE CASCADE`
- `transaction_evidence(user_id, income_id) REFERENCES incomes(user_id, id) ON DELETE CASCADE`
- `transaction_evidence(user_id, sms_message_id) REFERENCES sms_source_messages(user_id, id) ON DELETE CASCADE`

Even with direct SQL injection or buggy queries, the PostgreSQL kernel strictly rejects cross-tenant references with constraint violations.

---

## 4. Configuring Separate Physical Databases

MoneyTrack supports running against distinct physical databases:

1. **Local Development (SQLite):**
   ```env
   # Default SQLite file
   DATABASE_URL=sqlite:///D:/MoneyTrack/backend/data/moneytrack.db

   # Dedicated separate SQLite database for testing or alternate tenant
   DATABASE_URL=sqlite:///D:/MoneyTrack/backend/data/moneytrack_tenant2.db
   ```
2. **Production / Cloud (Neon PostgreSQL 18):**
   ```env
   # Neon PostgreSQL DSN
   DATABASE_URL=postgresql://user:password@ep-silent-frost-b5ee0dqt.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
When starting with a new database, Alembic automatically runs all migrations `0001` through `0010` to initialize the complete schema.

---

## 5. Frontend Implementation Details

1. **Tab Switcher on [`LoginPage.tsx`](file:///D:/MoneyTrack/frontend/src/pages/LoginPage.tsx):**
   - High-visibility segmented control: `[ Sign In | Create Account ]`.
   - Preserves state, clears errors smoothly on tab switch.
2. **Dedicated Route in [`App.tsx`](file:///D:/MoneyTrack/frontend/src/App.tsx):**
   - `/register` renders `<LoginPage initialMode="register" />`.
   - `/login?mode=register` activates registration mode via query params.
3. **Form Validation & Security:**
   - Email format verification.
   - Password minimum length enforcement (8+ characters).
   - Password confirmation equality matching.
