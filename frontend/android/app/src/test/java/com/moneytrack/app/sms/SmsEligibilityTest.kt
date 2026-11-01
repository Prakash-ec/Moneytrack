package com.moneytrack.app.sms

import org.junit.Assert.assertEquals
import org.junit.Test

class SmsEligibilityTest {

    private fun parsed(amount: Long?, status: TxnStatus, merchant: String? = null, sender: String? = null, ts: Long? = null): ParsedTransaction {
        return ParsedTransaction(
            amountPaise = amount, merchant = merchant, reference = "REF123",
            transactionDate = null, transactionDateTime = null, status = status,
            categorySuggestion = "Mobile Recharge", note = "x", sender = sender,
            timestampMs = ts, evidence = "evidence",
        )
    }

    @Test
    fun `ready to sync for complete debit`() {
        val p = parsed(1900L, TxnStatus.DEBIT, "Jio", "VK-JIOMS", 1700000000000L)
        assertEquals(CandidateStatus.READY_TO_SYNC, SmsEligibility.decide(p, "recharge successful").status)
    }

    @Test
    fun `ignored otp`() {
        val p = parsed(1900L, TxnStatus.DEBIT, "Jio", "VK-JIOMS", 1700000000000L)
        assertEquals(CandidateStatus.IGNORED, SmsEligibility.decide(p, "your otp is 123456").status)
    }

    @Test
    fun `ignored promo`() {
        val p = parsed(1900L, TxnStatus.DEBIT, "Jio", "VK-JIOMS", 1700000000000L)
        assertEquals(CandidateStatus.IGNORED, SmsEligibility.decide(p, "flat 50% off promo").status)
    }

    @Test
    fun `ignored credit`() {
        val p = parsed(5000L, TxnStatus.CREDIT, "BANK", "SBI", 1700000000000L)
        assertEquals(CandidateStatus.IGNORED, SmsEligibility.decide(p, "salary credited").status)
    }

    @Test
    fun `ignored failed`() {
        val p = parsed(500L, TxnStatus.FAILED, "BANK", "SBI", 1700000000000L)
        assertEquals(CandidateStatus.IGNORED, SmsEligibility.decide(p, "transaction failed").status)
    }

    @Test
    fun `ignored reversed`() {
        val p = parsed(500L, TxnStatus.REVERSAL, "BANK", "SBI", 1700000000000L)
        assertEquals(CandidateStatus.IGNORED, SmsEligibility.decide(p, "reversal processed").status)
    }

    @Test
    fun `ignored no amount`() {
        val p = parsed(null, TxnStatus.DEBIT, "Jio", "VK-JIOMS", 1700000000000L)
        assertEquals(CandidateStatus.IGNORED, SmsEligibility.decide(p, "recharge successful").status)
    }

    @Test
    fun `pending review when no date`() {
        val p = parsed(1900L, TxnStatus.DEBIT, "Jio", "VK-JIOMS", null)
        assertEquals(CandidateStatus.PENDING_REVIEW, SmsEligibility.decide(p, "recharge successful").status)
    }

    @Test
    fun `pending review when ambiguous status`() {
        val p = parsed(1900L, TxnStatus.UNKNOWN, "Jio", "VK-JIOMS", 1700000000000L)
        assertEquals(CandidateStatus.PENDING_REVIEW, SmsEligibility.decide(p, "jio recharge").status)
    }

    @Test
    fun `ignored balance only`() {
        val p = parsed(100L, TxnStatus.UNKNOWN, "SBI", "SBI", 1700000000000L)
        assertEquals(CandidateStatus.IGNORED, SmsEligibility.decide(p, "your available balance is ₹5000").status)
    }
}
