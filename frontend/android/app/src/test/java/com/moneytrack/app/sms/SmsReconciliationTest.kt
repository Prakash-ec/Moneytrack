package com.moneytrack.app.sms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsReconciliationTest {

    private fun makeRecord(
        id: String,
        amountPaise: Long,
        status: TxnStatus,
        classification: FinancialTxnType,
        reference: String? = null,
        sender: String? = null,
        transactionDate: String? = null,
        accountSuffix: String? = null,
        bankName: String? = null,
        availableBalancePaise: Long? = null,
        timestampMs: Long = 1794043054213L
    ): TransactionRecord {
        val parsed = ParsedTransaction(
            amountPaise = amountPaise,
            merchant = null,
            reference = reference,
            transactionDate = transactionDate,
            transactionDateTime = null,
            status = status,
            categorySuggestion = null,
            note = null,
            sender = sender,
            timestampMs = timestampMs,
            evidence = "evidence",
            availableBalancePaise = availableBalancePaise,
            accountSuffix = accountSuffix,
            bankName = bankName,
            classification = classification,
            confidence = "HIGH",
            paymentChannel = null,
            rawHash = Fingerprint.exactSmsHash(sender, timestampMs, "body_$id")
        )
        return TransactionRecord(
            id = id,
            status = CandidateStatus.READY_TO_SYNC,
            parsed = parsed,
            reason = "Test record",
            createdAtMs = timestampMs
        )
    }

    // =========================================================================
    // Core Layer Tests
    // =========================================================================

    @Test
    fun `Layer A rejects exact duplicate record with same id or rawHash`() {
        val r1 = makeRecord("rec1", 1500L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT)
        val r2 = makeRecord("rec1", 1500L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT)

        val outcome = SmsReconciliation.reconcile(r2, listOf(r1))
        assertTrue(outcome.isExactDuplicate)
        assertEquals("A", outcome.matchedLayer)
    }

    @Test
    fun `Layer B matches and enriches records with same UPI reference`() {
        val r1 = makeRecord(
            id = "rec1",
            amountPaise = 1500L,
            status = TxnStatus.DEBIT,
            classification = FinancialTxnType.UPI_DEBIT,
            reference = "631165217684",
            sender = "JX-SDCCBL-S",
            transactionDate = "2026-11-07",
            accountSuffix = "4375"
        )
        val r2 = makeRecord(
            id = "rec2",
            amountPaise = 1500L,
            status = TxnStatus.DEBIT,
            classification = FinancialTxnType.BANK_DEBIT,
            reference = "631165217684",
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-07",
            accountSuffix = "4375",
            availableBalancePaise = 1211809L
        )

        val outcome = SmsReconciliation.reconcile(r2, listOf(r1))
        assertTrue(outcome.isExactDuplicate)
        assertEquals("B", outcome.matchedLayer)
        assertNotNull(outcome.enrichedRecord)
        assertEquals(1211809L, outcome.enrichedRecord!!.parsed.availableBalancePaise)
        assertEquals("631165217684", outcome.enrichedRecord!!.parsed.reference)
    }

    @Test
    fun `Layer C merges SDCCBL dual notifications for CBS ledger and UPI debit`() {
        val upiRecord = makeRecord(
            id = "upi_rec",
            amountPaise = 1500L,
            status = TxnStatus.DEBIT,
            classification = FinancialTxnType.UPI_DEBIT,
            reference = "631165217684",
            sender = "JX-SDCCBL-S",
            transactionDate = "2026-11-07",
            accountSuffix = "4375",
            bankName = "Salem District Central Co-operative Bank",
            timestampMs = 1794043054213L
        )

        val cbsRecord = makeRecord(
            id = "cbs_rec",
            amountPaise = 1500L,
            status = TxnStatus.DEBIT,
            classification = FinancialTxnType.BANK_DEBIT,
            reference = null,
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-07",
            accountSuffix = "4375",
            bankName = "Salem District Central Co-operative Bank",
            availableBalancePaise = 1211809L,
            timestampMs = 1794043089744L
        )

        val outcome = SmsReconciliation.reconcile(cbsRecord, listOf(upiRecord))
        assertTrue("Dual notification must be reconciled", outcome.isExactDuplicate)
        assertEquals("C", outcome.matchedLayer)
        assertNotNull(outcome.enrichedRecord)
        assertEquals("631165217684", outcome.enrichedRecord!!.parsed.reference)
        assertEquals(1211809L, outcome.enrichedRecord!!.parsed.availableBalancePaise)
    }

    @Test
    fun `Layer D merges telecom recharge confirmation with bank debit`() {
        val bankDebit = makeRecord(
            id = "bank_debit",
            amountPaise = 1500L,
            status = TxnStatus.DEBIT,
            classification = FinancialTxnType.UPI_DEBIT,
            reference = "631165217684",
            sender = "JX-SDCCBL-S",
            transactionDate = "2026-11-07",
            timestampMs = 1794043054213L
        )

        val rechargeConf = makeRecord(
            id = "recharge_conf",
            amountPaise = 1500L,
            status = TxnStatus.DEBIT,
            classification = FinancialTxnType.RECHARGE,
            reference = "10005862230440",
            sender = "JZ-JioPay-S",
            transactionDate = "2026-11-07",
            timestampMs = 1794043062507L
        )

        val outcome = SmsReconciliation.reconcile(rechargeConf, listOf(bankDebit))
        assertTrue("Recharge confirmation should merge with bank debit", outcome.isExactDuplicate)
        assertEquals("D", outcome.matchedLayer)
        assertNotNull(outcome.enrichedRecord)
        assertEquals("Mobile Recharge", outcome.enrichedRecord!!.parsed.categorySuggestion)
    }

    // =========================================================================
    // 10 Adversarial Duplicate & Fingerprinting Audit Scenarios
    // =========================================================================

    @Test
    fun `Adversarial 1 - Same SMS delivered twice is dropped via Layer A`() {
        val r1 = makeRecord("dup1", 25000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "REF999", "VM-HDFCBK")
        val r2 = makeRecord("dup1", 25000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "REF999", "VM-HDFCBK")

        val outcome = SmsReconciliation.reconcile(r2, listOf(r1))
        assertTrue(outcome.isExactDuplicate)
        assertEquals("A", outcome.matchedLayer)
        assertNull(outcome.enrichedRecord) // Exact duplicate drops cleanly
    }

    @Test
    fun `Adversarial 2 - Same financial event from different bank sender templates merges via Layer B`() {
        // SDCCBL sends from JX-SDCCBL-S (UPI gateway) and AD-SDCCBL-S (Core Banking) with same ref
        val r1 = makeRecord("tmpl1", 1000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "132502639405", "JX-SDCCBL-S")
        val r2 = makeRecord("tmpl2", 1000L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, "132502639405", "AD-SDCCBL-S", availableBalancePaise = 1213309L)

        val outcome = SmsReconciliation.reconcile(r2, listOf(r1))
        assertTrue(outcome.isExactDuplicate)
        assertEquals("B", outcome.matchedLayer)
        assertEquals(1213309L, outcome.enrichedRecord?.parsed?.availableBalancePaise)
    }

    @Test
    fun `Adversarial 3 - Two legitimate transactions with identical amounts do not merge when references differ`() {
        val t1 = makeRecord("t1", 5000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "REF001", "VM-HDFCBK", "2026-11-08")
        val t2 = makeRecord("t2", 5000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "REF002", "VM-HDFCBK", "2026-11-08")

        val outcome = SmsReconciliation.reconcile(t2, listOf(t1))
        assertFalse("Legitimate identical amounts with different refs must NOT merge", outcome.isExactDuplicate)
    }

    @Test
    fun `Adversarial 4 - Two credits within seconds validated as distinct consecutive via Layer E`() {
        // Simulates the ₹3,003 dual-credit SDCCBL case: 7 seconds apart, balance incremented by 3,003.00
        val credit1 = makeRecord(
            id = "cr1",
            amountPaise = 300300L,
            status = TxnStatus.CREDIT,
            classification = FinancialTxnType.BANK_CREDIT,
            reference = null,
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-07",
            accountSuffix = "4375",
            bankName = "Salem District Central Co-operative Bank",
            availableBalancePaise = 914009L,
            timestampMs = 1793998480000L
        )

        val credit2 = makeRecord(
            id = "cr2",
            amountPaise = 300300L,
            status = TxnStatus.CREDIT,
            classification = FinancialTxnType.BANK_CREDIT,
            reference = null,
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-07",
            accountSuffix = "4375",
            bankName = "Salem District Central Co-operative Bank",
            availableBalancePaise = 1214309L, // 9,140.09 + 3,003.00 = 12,143.09
            timestampMs = 1793998487000L // 7 seconds later
        )

        val outcome = SmsReconciliation.reconcile(credit2, listOf(credit1))
        assertFalse("Two legitimate credits with balance progression must NOT merge", outcome.isExactDuplicate)
        assertEquals("E", outcome.matchedLayer)
    }

    @Test
    fun `Adversarial 5 - Same reference with different balances updates to latest balance`() {
        val r1 = makeRecord("b1", 12000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "UTR777777", "VM-HDFCBK", availableBalancePaise = 500000L)
        val r2 = makeRecord("b2", 12000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "UTR777777", "AD-HDFCBK", availableBalancePaise = 488000L)

        val outcome = SmsReconciliation.reconcile(r2, listOf(r1))
        assertTrue(outcome.isExactDuplicate)
        assertEquals("B", outcome.matchedLayer)
        assertNotNull(outcome.enrichedRecord)
    }

    @Test
    fun `Adversarial 6 - Same transaction with delayed notification timestamp merges within time window`() {
        val r1 = makeRecord("w1", 3000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "TXN555", "VM-HDFCBK", timestampMs = 1000000L)
        val r2 = makeRecord("w2", 3000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "TXN555", "VM-HDFCBK", timestampMs = 1000000L + 1200000L) // 20 mins later

        val outcome = SmsReconciliation.reconcile(r2, listOf(r1))
        assertTrue(outcome.isExactDuplicate)
        assertEquals("B", outcome.matchedLayer)
    }

    @Test
    fun `Adversarial 7 - Missing reference numbers on different dates or accounts remain distinct`() {
        val r1 = makeRecord("m1", 20000L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, null, "AD-SDCCBL-S", "2026-11-01", "4375", "SDCCBL")
        val r2 = makeRecord("m2", 20000L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, null, "AD-SDCCBL-S", "2026-11-02", "4375", "SDCCBL")

        val outcome = SmsReconciliation.reconcile(r2, listOf(r1))
        assertFalse("Different transaction dates without reference must remain distinct", outcome.isExactDuplicate)
    }

    @Test
    fun `Adversarial 8 - Out-of-order delivery with CBS arriving before UPI notification merges symmetrically`() {
        // CBS notification arrives FIRST (has balance, no UPI ref)
        val cbsFirst = makeRecord(
            id = "cbs_first",
            amountPaise = 1500L,
            status = TxnStatus.DEBIT,
            classification = FinancialTxnType.BANK_DEBIT,
            reference = null,
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-07",
            accountSuffix = "4375",
            bankName = "Salem District Central Co-operative Bank",
            availableBalancePaise = 1211809L,
            timestampMs = 1794043050000L
        )

        // UPI notification arrives SECOND (has UPI ref, no balance)
        val upiSecond = makeRecord(
            id = "upi_second",
            amountPaise = 1500L,
            status = TxnStatus.DEBIT,
            classification = FinancialTxnType.UPI_DEBIT,
            reference = "631165217684",
            sender = "JX-SDCCBL-S",
            transactionDate = "2026-11-07",
            accountSuffix = "4375",
            bankName = "Salem District Central Co-operative Bank",
            timestampMs = 1794043080000L
        )

        val outcome = SmsReconciliation.reconcile(upiSecond, listOf(cbsFirst))
        assertTrue("Out-of-order CBS then UPI must reconcile", outcome.isExactDuplicate)
        assertEquals("C", outcome.matchedLayer)
        assertEquals("631165217684", outcome.enrichedRecord?.parsed?.reference)
        assertEquals(1211809L, outcome.enrichedRecord?.parsed?.availableBalancePaise)
    }

    @Test
    fun `Adversarial 9 - Bank SMS followed by UPI notification merges correctly`() {
        val bankFirst = makeRecord("bk1", 8000L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, "UPI123456", "AD-HDFCBK")
        val upiLater = makeRecord("up1", 8000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "UPI123456", "VM-HDFCBK")

        val outcome = SmsReconciliation.reconcile(upiLater, listOf(bankFirst))
        assertTrue(outcome.isExactDuplicate)
        assertEquals("B", outcome.matchedLayer)
    }

    @Test
    fun `Adversarial 10 - UPI notification followed by Bank SMS merges correctly`() {
        val upiFirst = makeRecord("up2", 8000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "UPI998877", "VM-HDFCBK")
        val bankLater = makeRecord("bk2", 8000L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, "UPI998877", "AD-HDFCBK", availableBalancePaise = 900000L)

        val outcome = SmsReconciliation.reconcile(bankLater, listOf(upiFirst))
        assertTrue(outcome.isExactDuplicate)
        assertEquals("B", outcome.matchedLayer)
        assertEquals(900000L, outcome.enrichedRecord?.parsed?.availableBalancePaise)
    }

    // =========================================================================
    // Phase D — 8 Specific Adversarial Reconciliation Gate Tests
    // =========================================================================

    @Test
    fun `Phase D 1 - Two legitimate identical credits validated via Layer E`() {
        val cr1 = makeRecord("pd_cr1", 300300L, TxnStatus.CREDIT, FinancialTxnType.BANK_CREDIT, null, "AD-SDCCBL-S", "2026-11-07", "8824", "SDCCBL", availableBalancePaise = 914009L, timestampMs = 1000L)
        val cr2 = makeRecord("pd_cr2", 300300L, TxnStatus.CREDIT, FinancialTxnType.BANK_CREDIT, null, "AD-SDCCBL-S", "2026-11-07", "8824", "SDCCBL", availableBalancePaise = 1214309L, timestampMs = 1028L)

        val outcome = SmsReconciliation.reconcile(cr2, listOf(cr1))
        assertFalse("Two legitimate credits with delta = amount must remain distinct", outcome.isExactDuplicate)
        assertEquals("E", outcome.matchedLayer)
    }

    @Test
    fun `Phase D 2 - One duplicate notification with updated balance text enriches record`() {
        val orig = makeRecord("pd_d1", 50000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "UTR554433", "VM-HDFCBK", availableBalancePaise = null)
        val update = makeRecord("pd_d2", 50000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "UTR554433", "AD-HDFCBK", availableBalancePaise = 450000L)

        val outcome = SmsReconciliation.reconcile(update, listOf(orig))
        assertTrue("Duplicate notification with reference must merge", outcome.isExactDuplicate)
        assertEquals("B", outcome.matchedLayer)
        assertEquals(450000L, outcome.enrichedRecord?.parsed?.availableBalancePaise)
    }

    @Test
    fun `Phase D 3 - Out-of-order balance snapshots validated via Layer E`() {
        // Cr2 arrived first with 12143.09 balance; Cr1 arrives second with 9140.09 balance
        val cr2 = makeRecord("pd_cr2_rev", 300300L, TxnStatus.CREDIT, FinancialTxnType.BANK_CREDIT, null, "AD-SDCCBL-S", "2026-11-07", "8824", "SDCCBL", availableBalancePaise = 1214309L, timestampMs = 1028L)
        val cr1 = makeRecord("pd_cr1_rev", 300300L, TxnStatus.CREDIT, FinancialTxnType.BANK_CREDIT, null, "AD-SDCCBL-S", "2026-11-07", "8824", "SDCCBL", availableBalancePaise = 914009L, timestampMs = 1000L)

        val outcome = SmsReconciliation.reconcile(cr1, listOf(cr2))
        assertFalse("Out-of-order snapshots with absolute delta = amount must remain distinct", outcome.isExactDuplicate)
        assertEquals("E", outcome.matchedLayer)
    }

    @Test
    fun `Phase D 4 - Same reference with conflicting amounts does NOT merge silently`() {
        val r1 = makeRecord("pd_ref1", 5000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "CONFLICT_UTR", "VM-HDFCBK")
        val r2 = makeRecord("pd_ref2", 50000L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "CONFLICT_UTR", "VM-HDFCBK")

        val outcome = SmsReconciliation.reconcile(r2, listOf(r1))
        assertFalse("Same reference with conflicting amounts (50 vs 500) must NOT merge as exact duplicate", outcome.isExactDuplicate)
    }

    @Test
    fun `Phase D 5 - Same amount on different accounts remain distinct`() {
        val r1 = makeRecord("pd_acct1", 100000L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, null, "AD-SDCCBL-S", "2026-11-07", "4375", "SDCCBL")
        val r2 = makeRecord("pd_acct2", 100000L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, null, "AD-SDCCBL-S", "2026-11-07", "8824", "SDCCBL")

        val outcome = SmsReconciliation.reconcile(r2, listOf(r1))
        assertFalse("Same amount on different accounts must not merge", outcome.isExactDuplicate)
    }

    @Test
    fun `Phase D 6 - Intervening debit between two credit messages preserves both credits as distinct`() {
        // Cr1 bal: 9140.09. Intervening debit of 50 -> 9090.09. Cr2 of 3003 -> bal: 12093.09.
        // balDelta = abs(12093.09 - 9140.09) = 2953.00 != 3003.00.
        val cr1 = makeRecord("pd_cr1_int", 300300L, TxnStatus.CREDIT, FinancialTxnType.BANK_CREDIT, null, "AD-SDCCBL-S", "2026-11-07", "8824", "SDCCBL", availableBalancePaise = 914009L)
        val cr2 = makeRecord("pd_cr2_int", 300300L, TxnStatus.CREDIT, FinancialTxnType.BANK_CREDIT, null, "AD-SDCCBL-S", "2026-11-07", "8824", "SDCCBL", availableBalancePaise = 1209309L)

        val outcome = SmsReconciliation.reconcile(cr2, listOf(cr1))
        assertFalse("Differing balance snapshots without reference must not merge as duplicate", outcome.isExactDuplicate)
    }

    @Test
    fun `Phase D 7 - Missing balance on either message allows Layer C dual notification merge`() {
        val upiNoBal = makeRecord("pd_c_upi", 1500L, TxnStatus.DEBIT, FinancialTxnType.UPI_DEBIT, "631165217684", "JX-SDCCBL-S", "2026-11-07", "4375", "SDCCBL", availableBalancePaise = null)
        val cbsWithBal = makeRecord("pd_c_cbs", 1500L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, null, "AD-SDCCBL-S", "2026-11-07", "4375", "SDCCBL", availableBalancePaise = 1211809L)

        val outcome = SmsReconciliation.reconcile(cbsWithBal, listOf(upiNoBal))
        assertTrue("Dual notification with one missing balance merges cleanly", outcome.isExactDuplicate)
        assertEquals("C", outcome.matchedLayer)
        assertEquals(1211809L, outcome.enrichedRecord?.parsed?.availableBalancePaise)
    }

    @Test
    fun `Phase D 8 - Repeated identical balance snapshots merge via Layer C as duplicate alert`() {
        val msg1 = makeRecord("pd_rep1", 2000L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, null, "AD-SDCCBL-S", "2026-11-07", "4375", "SDCCBL", availableBalancePaise = 1000000L)
        val msg2 = makeRecord("pd_rep2", 2000L, TxnStatus.DEBIT, FinancialTxnType.BANK_DEBIT, null, "AD-SDCCBL-S", "2026-11-07", "4375", "SDCCBL", availableBalancePaise = 1000000L)

        val outcome = SmsReconciliation.reconcile(msg2, listOf(msg1))
        assertTrue("Repeated identical balance snapshots for same transaction must merge", outcome.isExactDuplicate)
        assertEquals("C", outcome.matchedLayer)
    }

    // =========================================================================
    // Core Engine Invariant & High-Volume Duplicate Tests (Sections C, D, J)
    // =========================================================================

    @Test
    fun `Section C - One 10 rupee debit and 100 duplicate notifications maintain single record and stable balance`() {
        val initialBal = 100000L // ₹1,000.00
        val debitAmount = 1000L  // ₹10.00
        val resultingBal = 99000L // ₹990.00

        val originalRecord = makeRecord(
            id = "debit_10_orig",
            amountPaise = debitAmount,
            status = TxnStatus.DEBIT,
            classification = FinancialTxnType.BANK_DEBIT,
            reference = "REF_10_DEBIT",
            sender = "VM-HDFCBK",
            transactionDate = "2026-11-08",
            accountSuffix = "4375",
            bankName = "HDFC",
            availableBalancePaise = resultingBal,
            timestampMs = 1794043000000L
        )

        val queue = mutableListOf(originalRecord)

        // Repeat test with 100 duplicate notifications
        for (i in 1..100) {
            val duplicate = makeRecord(
                id = "debit_10_dup_$i",
                amountPaise = debitAmount,
                status = TxnStatus.DEBIT,
                classification = FinancialTxnType.BANK_DEBIT,
                reference = "REF_10_DEBIT",
                sender = "VM-HDFCBK",
                transactionDate = "2026-11-08",
                accountSuffix = "4375",
                bankName = "HDFC",
                availableBalancePaise = resultingBal,
                timestampMs = 1794043000000L + (i * 1000L)
            )

            val outcome = SmsReconciliation.reconcile(duplicate, queue)
            assertTrue("Duplicate $i must be identified as exact duplicate", outcome.isExactDuplicate)
            assertEquals("B", outcome.matchedLayer) // Matched via reference
        }

        // Queue size remains strictly 1 and balance remains 99,000 paise (₹990)
        assertEquals(1, queue.size)
        assertEquals(resultingBal, queue[0].parsed.availableBalancePaise)
    }

    @Test
    fun `One 10 rupee credit and 100 duplicate notifications maintain single record`() {
        val creditAmount = 1000L // ₹10.00
        val resultingBal = 101000L // ₹1,010.00

        val originalRecord = makeRecord(
            id = "credit_10_orig",
            amountPaise = creditAmount,
            status = TxnStatus.CREDIT,
            classification = FinancialTxnType.BANK_CREDIT,
            reference = "REF_10_CREDIT",
            sender = "VM-HDFCBK",
            transactionDate = "2026-11-08",
            accountSuffix = "4375",
            bankName = "HDFC",
            availableBalancePaise = resultingBal,
            timestampMs = 1794043000000L
        )

        val queue = mutableListOf(originalRecord)

        for (i in 1..100) {
            val duplicate = makeRecord(
                id = "credit_10_dup_$i",
                amountPaise = creditAmount,
                status = TxnStatus.CREDIT,
                classification = FinancialTxnType.BANK_CREDIT,
                reference = "REF_10_CREDIT",
                sender = "VM-HDFCBK",
                transactionDate = "2026-11-08",
                accountSuffix = "4375",
                bankName = "HDFC",
                availableBalancePaise = resultingBal,
                timestampMs = 1794043000000L + (i * 1000L)
            )

            val outcome = SmsReconciliation.reconcile(duplicate, queue)
            assertTrue("Credit duplicate $i must be rejected", outcome.isExactDuplicate)
        }

        assertEquals(1, queue.size)
        assertEquals(resultingBal, queue[0].parsed.availableBalancePaise)
    }

    @Test
    fun `Section D - Two genuine 3003 credits with duplicates preserve both records and balance progression`() {
        val crAmount = 300300L // ₹3,003.00
        val bal1 = 1214309L   // ₹12,143.09
        val bal2 = 1514609L   // ₹15,146.09 (progression +3003.00)

        // 1. First genuine credit
        val cr1 = makeRecord(
            id = "cr_3003_1",
            amountPaise = crAmount,
            status = TxnStatus.CREDIT,
            classification = FinancialTxnType.BANK_CREDIT,
            reference = "CR_REF_001",
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-08",
            accountSuffix = "8824",
            bankName = "SDCCBL",
            availableBalancePaise = bal1,
            timestampMs = 1794043000000L
        )
        val queue = mutableListOf(cr1)

        // 2. Duplicate 1 of first message
        val dup1 = makeRecord(
            id = "cr_3003_1_dup1",
            amountPaise = crAmount,
            status = TxnStatus.CREDIT,
            classification = FinancialTxnType.BANK_CREDIT,
            reference = "CR_REF_001",
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-08",
            accountSuffix = "8824",
            bankName = "SDCCBL",
            availableBalancePaise = bal1,
            timestampMs = 1794043005000L
        )
        val o1 = SmsReconciliation.reconcile(dup1, queue)
        assertTrue("Duplicate 1 of first message must merge", o1.isExactDuplicate)

        // 3. Duplicate 2 of first message
        val dup2 = makeRecord(
            id = "cr_3003_1_dup2",
            amountPaise = crAmount,
            status = TxnStatus.CREDIT,
            classification = FinancialTxnType.BANK_CREDIT,
            reference = "CR_REF_001",
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-08",
            accountSuffix = "8824",
            bankName = "SDCCBL",
            availableBalancePaise = bal1,
            timestampMs = 1794043010000L
        )
        val o2 = SmsReconciliation.reconcile(dup2, queue)
        assertTrue("Duplicate 2 of first message must merge", o2.isExactDuplicate)

        // 4. Second genuine credit (new reference, new balance snapshot)
        val cr2 = makeRecord(
            id = "cr_3003_2",
            amountPaise = crAmount,
            status = TxnStatus.CREDIT,
            classification = FinancialTxnType.BANK_CREDIT,
            reference = "CR_REF_002",
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-08",
            accountSuffix = "8824",
            bankName = "SDCCBL",
            availableBalancePaise = bal2,
            timestampMs = 1794043100000L
        )
        val o3 = SmsReconciliation.reconcile(cr2, queue)
        assertFalse("Second genuine credit must NOT be merged as duplicate", o3.isExactDuplicate)
        queue.add(cr2)

        // 5. Duplicate of second message
        val dup3 = makeRecord(
            id = "cr_3003_2_dup",
            amountPaise = crAmount,
            status = TxnStatus.CREDIT,
            classification = FinancialTxnType.BANK_CREDIT,
            reference = "CR_REF_002",
            sender = "AD-SDCCBL-S",
            transactionDate = "2026-11-08",
            accountSuffix = "8824",
            bankName = "SDCCBL",
            availableBalancePaise = bal2,
            timestampMs = 1794043105000L
        )
        val o4 = SmsReconciliation.reconcile(dup3, queue)
        assertTrue("Duplicate of second message must merge", o4.isExactDuplicate)

        // Result: exactly two genuine income records, total 6006.00 INR
        assertEquals(2, queue.size)
        val totalPaise = queue.sumOf { it.parsed.amountPaise ?: 0L }
        assertEquals(600600L, totalPaise)
    }
}
