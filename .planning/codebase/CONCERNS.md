# Codebase Concerns

**Analysis Date:** 2026-10-28

## Tech Debt

**Local OCR Binary Dependency:**
- Issue: Local OCR relies on the `tesseract` binary being installed in the operating system's PATH. If not installed, image scanning falls back to manual text input or cloud Groq AI.
- Files: `backend/app/services/ocr.py`
- Impact: Users running the app without Tesseract or Groq API key cannot automatically parse images.
- Fix approach: Package a bundled lightweight WASM OCR worker in the frontend, or provide automated binary detection and installation guides in the setup script.

**Bank SMS Template Drift:**
- Issue: Indian banks periodically alter SMS transaction formats (sender codes, wording like "debited by", "spent on", "transferred to").
- Files: `android/app/src/main/java/com/moneytrack/app/sms/`, `frontend/src/pages/SmsReviewPage.tsx`
- Impact: Some SMS messages might fail eligibility checks or misclassify merchants/amounts.
- Fix approach: Expand test suite regex fixtures with community-contributed bank SMS formats and allow users to submit unparsed templates for learning.

## Known Limitations

**Mobile Browser Camera Streaming over HTTP:**
- Symptoms: `navigator.mediaDevices.getUserMedia` is blocked by modern mobile browsers on non-secure origins (e.g. `http://192.168.x.x:8000`).
- Files: `frontend/src/components/ReceiptScannerModal.tsx`
- Trigger: Opening MoneyTrack on a smartphone connected to the same Wi-Fi network as the server.
- Workaround: A built-in native camera file input (`<input type="file" capture="environment">`) is provided so mobile users can snap pictures using their phone's native camera without HTTPS.

**Single-User / Local-Only Model:**
- Symptoms: There is no user authentication or access control mechanism on the REST API.
- Files: `backend/app/main.py`
- Trigger: Exposing port 8000 to the public internet.
- Workaround: Keep the application bound to `localhost` or trusted private LANs. If deploying remotely, place it behind an authenticated reverse proxy (e.g. Tailscale, Cloudflare Access, or Caddy with Basic Auth).

## Security Considerations

**API Exposure & Data Privacy:**
- Risk: Anyone on the local network who can reach the backend IP can view or edit financial records.
- Files: `backend/app/main.py`, `backend/app/core/config.py`
- Current mitigation: CORS origin checks, security headers (CSP, `nosniff`, `DENY` frames, `no-referrer`), and documentation warning users against public exposure.
- Recommendations: Add an optional local PIN or bearer token for multi-device LAN usage.

**Image Upload Processing:**
- Risk: Malicious payload uploads causing denial-of-service or memory exhaustion.
- Files: `backend/app/services/ocr.py`, `backend/app/api/routes/receipts.py`
- Current mitigation: Strict byte size limit (<10MB), magic header validation for JPEG, PNG, and WebP, and in-memory streaming without persisting unvetted files to disk.

## Performance Bottlenecks

**Large Transaction History Rendering:**
- Problem: Rendering hundreds of transactions at once in charts or DOM trees causes layout recalculation lag.
- Files: `frontend/src/components/TransactionList.tsx`, `frontend/src/components/charts/`
- Current mitigation: Server-side pagination (`page_size=20`), memoized chart components, and period-based data aggregation (`daily`, `weekly`, `monthly` granularity).
- Improvement path: Introduce DOM virtualization (e.g., `tanstack-virtual`) for infinite scrolling lists if transaction volumes exceed thousands.

## Fragile Areas

**Indian Receipt Total & Tax Disambiguation:**
- Files: `backend/app/services/receipt_parser.py`
- Why fragile: Receipts often list multiple monetary figures: Item prices, Subtotal, CGST, SGST, Service Charge, Discount, Cash Tendered, and Change Returned. A naive regex matching the largest number frequently picks "Cash Tendered" or "Subtotal" instead of the final payable amount.
- Safe modification: Any modifications to `RuleBasedReceiptParser` regex or scoring must be validated against `backend/tests/test_receipt_parser.py` to ensure existing Indian receipt fixtures do not regress.
- Test coverage: 6 dedicated test cases in `test_receipt_parser.py` covering multi-tax, change returned, and subtotal distinction.

**Database Backup Restoration:**
- Files: `backend/app/services/exports.py`
- Why fragile: Restoring a JSON backup merges data with existing records, remapping expense type primary keys while preserving relational integrity.
- Safe modification: Always verify schema version `1`, execute the entire restore inside an atomic database transaction with rollback on failure, and never overwrite the live database without explicit user confirmation.
- Test coverage: Tested in `backend/tests/test_restore.py` across full roundtrips, invalid payloads, and rollback scenarios.

## Scaling Limits

**SQLite Concurrent Writers:**
- Current capacity: Thousands of transactions with sub-millisecond read times.
- Limit: SQLite only supports a single active writer at a time.
- Scaling path: WAL (Write-Ahead Logging) is enabled and busy timeout is set to 5000ms. For a single-user or family expenditure tracker, this exceeds all expected throughput. If scaling to a hosted SaaS with thousands of simultaneous users, the backend can be pointed to PostgreSQL via `DATABASE_URL` without code changes.

## Test Coverage Gaps

**Android SMS Native Receiver Hardware Testing:**
- What's not tested in CI: Full end-to-end SMS broadcast reception on physical Android hardware (requires physical device or Android emulator with mocked GSM telephony).
- Files: `android/app/src/main/java/com/moneytrack/app/sms/`
- Risk: Operating system background battery optimization or OEM-specific SMS permission revocation on Xiaomi/Samsung devices.
- Priority: Medium. (Core parsing algorithms are verified via JUnit unit tests).

---

*Concerns audit: 2026-10-28*
