package com.moneytrack.app.sms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SyncWorkerTest {

    // =========================================================================
    // URL Normalization Tests
    // =========================================================================

    @Test
    fun `normalizes base URL without api path`() {
        val url = SyncWorker.buildEndpointUrl("http://10.0.2.2:8000", "expenses")
        assertEquals("http://10.0.2.2:8000/api/expenses", url)
    }

    @Test
    fun `normalizes base URL with trailing slash`() {
        val url = SyncWorker.buildEndpointUrl("http://10.0.2.2:8000/", "expenses")
        assertEquals("http://10.0.2.2:8000/api/expenses", url)
    }

    @Test
    fun `normalizes base URL ending with api`() {
        val url = SyncWorker.buildEndpointUrl("http://10.0.2.2:8000/api", "expenses")
        assertEquals("http://10.0.2.2:8000/api/expenses", url)
    }

    @Test
    fun `normalizes base URL ending with api and trailing slash`() {
        val url = SyncWorker.buildEndpointUrl("http://10.0.2.2:8000/api/", "expenses")
        assertEquals("http://10.0.2.2:8000/api/expenses", url)
    }

    @Test
    fun `prevents duplicate api when endpoint starts with api slash`() {
        val url = SyncWorker.buildEndpointUrl("http://10.0.2.2:8000/api", "/api/expenses")
        assertEquals("http://10.0.2.2:8000/api/expenses", url)
    }

    @Test
    fun `handles base URL that already includes expenses path`() {
        val url = SyncWorker.buildEndpointUrl("http://10.0.2.2:8000/api/expenses", "expenses")
        assertEquals("http://10.0.2.2:8000/api/expenses", url)
    }

    @Test
    fun `correctly constructs expense-types endpoint with query parameters`() {
        val url1 = SyncWorker.buildEndpointUrl("http://10.0.2.2:8000", "expense-types?archived=exclude")
        val url2 = SyncWorker.buildEndpointUrl("http://10.0.2.2:8000/api", "/api/expense-types?archived=exclude")
        assertEquals("http://10.0.2.2:8000/api/expense-types?archived=exclude", url1)
        assertEquals("http://10.0.2.2:8000/api/expense-types?archived=exclude", url2)
    }

    @Test
    fun `preserves https and custom ports`() {
        val url = SyncWorker.buildEndpointUrl("https://moneytrack.company.internal:8443", "expenses")
        assertEquals("https://moneytrack.company.internal:8443/api/expenses", url)
    }

    @Test
    fun `rejects blank and malformed URLs safely`() {
        val invalid = listOf("", "   ", "ftp://invalid-scheme.com", "not_a_valid_url")
        for (u in invalid) {
            try {
                SyncWorker.buildEndpointUrl(u, "expenses")
                fail("Expected IllegalArgumentException for URL: '$u'")
            } catch (_: IllegalArgumentException) {
                // Expected
            }
        }
    }

    // =========================================================================
    // Fingerprint and Idempotency Tests
    // =========================================================================

    @Test
    fun `identical bank reference and amount produces identical fingerprint across different timestamps`() {
        val fp1 = Fingerprint.of("AD-HDFCBK", 1700000000000L, 45000L, "REF123456", "2026-10-28")
        val fp2 = Fingerprint.of("AD-HDFCBK", 1700099999999L, 45000L, "REF123456", "2026-10-28")
        assertEquals(fp1, fp2)
    }

    @Test
    fun `normalizes telecom operator prefix in sender ID`() {
        val fpA = Fingerprint.of("AD-HDFCBK", 1700000000000L, 50000L, "TXN998877", "2026-10-28")
        val fpB = Fingerprint.of("VM-HDFCBK", 1700050000000L, 50000L, "TXN998877", "2026-10-28")
        val fpC = Fingerprint.of("VK-HDFCBK", 1700080000000L, 50000L, "TXN998877", "2026-10-28")
        assertEquals(fpA, fpB)
        assertEquals(fpA, fpC)
    }

    @Test
    fun `different bank references produce different fingerprints`() {
        val fp1 = Fingerprint.of("AD-HDFCBK", 1700000000000L, 45000L, "REF111111", "2026-10-28")
        val fp2 = Fingerprint.of("AD-HDFCBK", 1700000000000L, 45000L, "REF222222", "2026-10-28")
        assertNotEquals(fp1, fp2)
    }

    @Test
    fun `different amounts produce different fingerprints`() {
        val fp1 = Fingerprint.of("AD-HDFCBK", 1700000000000L, 10000L, "REF123456", "2026-10-28")
        val fp2 = Fingerprint.of("AD-HDFCBK", 1700000000000L, 20000L, "REF123456", "2026-10-28")
        assertNotEquals(fp1, fp2)
    }

    @Test
    fun `fallback fingerprint uses transaction date when reference is missing`() {
        val fp1 = Fingerprint.of("AD-HDFCBK", 1700000000000L, 35000L, null, "2026-10-28")
        val fp2 = Fingerprint.of("AD-HDFCBK", 1700080000000L, 35000L, null, "2026-10-28")
        assertEquals(fp1, fp2)

        val fpDiffDate = Fingerprint.of("AD-HDFCBK", 1700000000000L, 35000L, null, "2026-10-29")
        assertNotEquals(fp1, fpDiffDate)
    }

    @Test
    fun `handles missing sender and missing date safely`() {
        val fp = Fingerprint.of(null, null, 1500L, null, null)
        assertNotNull(fp)
        assertTrue(fp.length == 64) // valid sha-256 hex string
    }

    // =========================================================================
    // Expense Types JSON Parsing Tests
    // =========================================================================

    @Test
    fun `parses wrapped items response and excludes archived types`() {
        val json = """
        {
            "items": [
                {"id": 10, "name": "Groceries", "category": "Food", "is_archived": false},
                {"id": 20, "name": "Old Type", "category": "Other", "is_archived": true},
                {"id": 30, "name": "Travel", "category": "Travel", "archived": false}
            ],
            "total": 3
        }
        """.trimIndent()

        val parsed = SyncWorker.parseExpenseTypesJson(json)
        assertEquals(2, parsed.size)
        assertEquals(10, parsed[0].id)
        assertEquals("Groceries", parsed[0].name)
        assertEquals(30, parsed[1].id)
        assertEquals("Travel", parsed[1].name)
    }

    @Test
    fun `parses bare array response format`() {
        val json = """
        [
            {"id": 1, "name": "Food", "category": "Food"},
            {"id": 2, "name": "Bus", "category": "Travel"}
        ]
        """.trimIndent()

        val parsed = SyncWorker.parseExpenseTypesJson(json)
        assertEquals(2, parsed.size)
        assertEquals(1, parsed[0].id)
        assertEquals(2, parsed[1].id)
    }

    // =========================================================================
    // Dynamic Expense-Type Resolution Tests
    // =========================================================================

    private val sampleActiveTypes = listOf(
        ActiveExpenseType(id = 101, name = "Food & Dining", category = "Food"),
        ActiveExpenseType(id = 102, name = "Bus Travel", category = "Travel"),
        ActiveExpenseType(id = 103, name = "Mobile Recharge", category = "Utilities"),
        ActiveExpenseType(id = 104, name = "Shopping", category = "Shopping"),
        ActiveExpenseType(id = 105, name = "General Expenses", category = "Other"),
    )

    @Test
    fun `priority 1 exact name match`() {
        val resolved = SyncWorker.resolveExpenseTypeId("Mobile Recharge", null, sampleActiveTypes)
        assertEquals(103, resolved)
    }

    @Test
    fun `priority 2 exact category match`() {
        val resolved = SyncWorker.resolveExpenseTypeId("Food", null, sampleActiveTypes)
        assertEquals(101, resolved)
    }

    @Test
    fun `priority 3 explicit alias mapping for transport and groceries`() {
        val transportId = SyncWorker.resolveExpenseTypeId("Transport", null, sampleActiveTypes)
        assertEquals(102, transportId) // Transport -> Travel category (Bus Travel)

        val groceriesId = SyncWorker.resolveExpenseTypeId("Groceries", null, sampleActiveTypes)
        assertEquals(101, groceriesId) // Groceries -> Food category (Food & Dining)

        val fuelId = SyncWorker.resolveExpenseTypeId("Fuel", null, sampleActiveTypes)
        assertEquals(102, fuelId) // Fuel -> Travel category (Bus Travel)
    }

    @Test
    fun `priority 4 partial substring match`() {
        val resolved = SyncWorker.resolveExpenseTypeId("Recharge", null, sampleActiveTypes)
        assertEquals(103, resolved) // "Recharge" matches "Mobile Recharge"
    }

    @Test
    fun `priority 5 merchant based matching`() {
        val typesWithJio = sampleActiveTypes + ActiveExpenseType(id = 106, name = "Jio Data", category = "Utilities")
        val resolved = SyncWorker.resolveExpenseTypeId(null, "Jio", typesWithJio)
        assertEquals(106, resolved)
    }

    @Test
    fun `priority 6 fallback to Other or General category`() {
        val resolved = SyncWorker.resolveExpenseTypeId("Cryptocurrency", null, sampleActiveTypes)
        assertEquals(105, resolved) // Matches "General Expenses" / "Other"
    }

    @Test
    fun `priority 7 first active type fallback when nothing else matches`() {
        val limitedTypes = listOf(
            ActiveExpenseType(id = 999, name = "Custom Specific", category = "Custom")
        )
        val resolved = SyncWorker.resolveExpenseTypeId("Unrelated", null, limitedTypes)
        assertEquals(999, resolved)
    }

    @Test
    fun `returns null when active types list is empty`() {
        val resolved = SyncWorker.resolveExpenseTypeId("Food", null, emptyList())
        assertNull(resolved)
    }
}
