package com.moneytrack.app.sms

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuditRegressionTest {

    @Test
    fun `user edits via TransactionStore upsert forceUserEdit override merged fields`() {
        val dir = Files.createTempDirectory("mt-store-edit").toFile()
        try {
            val store = TransactionStore(dir)
            val original = TransactionRecord(
                id = "tx-edit-1",
                status = CandidateStatus.PENDING_REVIEW,
                parsed = ParsedTransaction(
                    amountPaise = 45000L,
                    merchant = "Old Merchant",
                    reference = "REF-1",
                    transactionDate = "2026-11-10",
                    transactionDateTime = null,
                    status = TxnStatus.DEBIT,
                    categorySuggestion = "Food",
                    note = "Old Note",
                    sender = "AD-HDFCBK",
                    timestampMs = 1700000000000L,
                    evidence = "Debited Rs 450 at Old Merchant",
                ),
                reason = "Needs review",
                createdAtMs = 1700000000000L,
            )
            store.upsert(original)

            val edited = original.copy(
                status = CandidateStatus.READY_TO_SYNC,
                reason = "Updated by user",
                parsed = original.parsed.copy(
                    amountPaise = 52000L,
                    merchant = "Edited Merchant",
                    transactionDate = "2026-11-12",
                    note = "Corrected bill split",
                    categorySuggestion = "Groceries",
                ),
            )
            val saved = store.upsert(edited, forceUserEdit = true)
            assertEquals(52000L, saved.parsed.amountPaise)
            assertEquals("Edited Merchant", saved.parsed.merchant)
            assertEquals("2026-11-12", saved.parsed.transactionDate)
            assertEquals("Corrected bill split", saved.parsed.note)
            assertEquals("Groceries", saved.parsed.categorySuggestion)
            assertEquals(CandidateStatus.READY_TO_SYNC, saved.status)
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun `TransactionStore persists queue safely without NIO Files dependency`() {
        val dir = Files.createTempDirectory("mt-store-save").toFile()
        try {
            val store = TransactionStore(dir)
            val rec = TransactionRecord(
                id = "tx-save-1",
                status = CandidateStatus.READY_TO_SYNC,
                parsed = ParsedTransaction(
                    amountPaise = 19900L,
                    merchant = "Store",
                    reference = "REF-99",
                    transactionDate = "2026-11-20",
                    transactionDateTime = null,
                    status = TxnStatus.CREDIT,
                    categorySuggestion = "Refunds",
                    note = "Refund",
                    sender = "AD-ICICIB",
                    timestampMs = 1700000000000L,
                    evidence = "Credited Rs 199 to a/c XX1234",
                ),
                reason = "Credit",
                createdAtMs = 1700000000000L,
            )
            store.saveQueue(listOf(rec))
            // Second overwrite tests replacing existing file on disk
            store.saveQueue(listOf(rec.copy(status = CandidateStatus.SYNCED)))
            val reloaded = store.loadQueue()
            assertEquals(1, reloaded.size)
            assertEquals(CandidateStatus.SYNCED, reloaded[0].status)
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun `C26 allows legitimate bank confirmation containing reward keyword`() {
        val parsed = ParsedTransaction(
            amountPaise = 50000L,
            merchant = "HDFC Cashback Reward",
            reference = "REF7788",
            transactionDate = "2026-11-20",
            transactionDateTime = null,
            status = TxnStatus.CREDIT,
            categorySuggestion = "Other Income",
            note = "Credited cashback",
            sender = "AD-HDFCBK",
            timestampMs = 1700000000000L,
            evidence = "Rs. 500.00 credited to a/c XX1234 towards Cashback Reward.",
        )
        val decision = SmsEligibility.decide(
            parsed,
            "rs. 500.00 credited to a/c xx1234 towards cashback reward.",
        )
        assertEquals(CandidateStatus.READY_TO_SYNC, decision.status)
    }

    @Test
    fun `C2 and C17 do not fall back to expenses for CREDIT or UNKNOWN network errors`() {
        val creditRecord = TransactionRecord(
            id = "tx-credit-netfail",
            status = CandidateStatus.READY_TO_SYNC,
            parsed = ParsedTransaction(
                amountPaise = 100000L,
                merchant = "Employer",
                reference = "UTR-1",
                transactionDate = "2026-11-20",
                transactionDateTime = null,
                status = TxnStatus.CREDIT,
                categorySuggestion = "Salary",
                note = "Salary credited",
                sender = "AD-HDFCBK",
                timestampMs = 1700000000000L,
                evidence = "Credited Rs 1000 to a/c XX1234",
            ),
            reason = "Completed credit",
            createdAtMs = 1700000000000L,
        )
        val result = SyncWorker.syncTransaction(
            backendUrl = "http://127.0.0.1:1",
            record = creditRecord,
            activeTypes = emptyList(),
            authToken = "dummy-token",
        )
        assertFalse(result.created)
        assertFalse(result.replayed)
        assertNull(result.expenseId)
        assertNotNull(result.error)
    }
}
