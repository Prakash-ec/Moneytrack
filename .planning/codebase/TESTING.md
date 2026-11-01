# Testing Patterns

**Analysis Date:** 2026-10-28

## Test Framework

**Backend (Python):**
- Runner: `pytest` 8.3.4
- HTTP Client: `httpx` (via Starlette / FastAPI `TestClient`)
- Config: `backend/pytest.ini`

**Frontend (TypeScript):**
- Runner: `vitest` 5.0.5
- Assertion: Vitest built-in assertions (`expect`, `describe`, `it`)
- Config: `frontend/vite.config.ts`

**Android Native (Kotlin):**
- Runner: JUnit 4 (`org.junit.Test`, `kotlin.test`)
- Config: `android/app/build.gradle`

## Run Commands

```bash
# Backend pytest suite (all 48+ tests)
cd backend
.\.venv\Scripts\pytest

# Run a specific backend test file
.\.venv\Scripts\pytest tests/test_receipt_parser.py -v

# Frontend unit tests
cd frontend
npx vitest run

# Frontend type check (TypeScript compiler)
npx tsc --noEmit

# Frontend production bundle build verification
npm run build

# Android unit tests
cd android
./gradlew test
```

## Test File Organization

**Backend:**
- Located in `backend/tests/`.
- File naming pattern: `test_<module>.py`.
- Shared fixtures defined in `backend/tests/conftest.py`.

**Frontend:**
- Co-located with utility modules in `frontend/src/utils/`:
  - `currency.test.ts`
  - `periods.test.ts`
  - `receipt.test.ts`

**Android:**
- Located in `android/app/src/test/java/com/moneytrack/app/sms/`:
  - `SmsParserTest.kt`
  - `SmsEligibilityTest.kt`

## Test Structure & Isolation

### Backend Database Isolation

Every backend test executes against a fresh, isolated temporary SQLite database created via `tmp_path` fixture in `backend/tests/conftest.py`.
**Critical Guarantee:** Tests NEVER touch or overwrite `backend/data/moneytrack.db` or its backup.

```python
@pytest.fixture
def test_db_session(tmp_path: Path):
    db_file = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{db_file.as_posix()}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
```

### FastAPI Test Client Injection

FastAPI dependency overrides are used to swap the production database with the isolated test session:

```python
@pytest.fixture
def client(test_db_session):
    def override_get_db():
        try:
            yield test_db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

## Mocking

**What to Mock:**
- External AI cloud calls (Groq Cloud API).
- Native device hardware APIs (Camera, native SMS receivers, system Tesseract binary).

**What NOT to Mock:**
- Database queries and transactions (always run against real in-memory / temporary SQLite).
- Currency arithmetic and paise conversions.
- Date period boundary math.
- Pydantic schema validation.

**Mocking Example (Groq Vision & OCR):**

```python
class MockOCRProvider(BaseOCRProvider):
    def __init__(self, text: str = "Total: Rs. 450.00"):
        self.text = text

    def is_available(self) -> bool:
        return True

    def extract_text(self, image_bytes: bytes) -> str:
        return self.text
```

## Common Testing Patterns

### 1. Integer Paise Financial Roundtrip Testing

```typescript
describe('parseRupeesToPaise', () => {
  it('parses whole rupees and decimals precisely', () => {
    expect(parseRupeesToPaise('250')).toBe(25000)
    expect(parseRupeesToPaise('250.50')).toBe(25050)
    expect(parseRupeesToPaise('250.05')).toBe(25005)
    expect(parseRupeesToPaise('1,25,000.99')).toBe(12500099)
  })

  it('rejects invalid or negative amounts', () => {
    expect(parseRupeesToPaise('-50')).toBeNull()
    expect(parseRupeesToPaise('0')).toBeNull()
    expect(parseRupeesToPaise('abc')).toBeNull()
  })
})
```

### 2. Transaction Rollback & Data Integrity Testing

```python
def test_restore_rollback_on_invalid_record(client, test_db_session):
    bad_payload = {
        "schema_version": 1,
        "expense_types": [{"name": "Valid"}],
        "expenses": [{"amount_paise": -500}] # Fails DB constraint
    }
    response = client.post("/api/export/restore", json=bad_payload)
    assert response.status_code == 422
    # Verify transaction rolled back completely
    assert test_db_session.query(ExpenseType).count() == 0
```

### 3. Idempotency Key De-duplication Testing

```python
def test_idempotent_expense_creation(client):
    headers = {"X-Idempotency-Key": "test-key-123"}
    payload = {"expense_type_id": 1, "amount_paise": 15000, "expense_date": "2026-10-28"}
    
    res1 = client.post("/api/expenses", json=payload, headers=headers)
    res2 = client.post("/api/expenses", json=payload, headers=headers)
    
    assert res1.status_code == 201
    assert res2.status_code == 200
    assert res1.json()["id"] == res2.json()["id"]
```

---

*Testing analysis: 2026-10-28*
