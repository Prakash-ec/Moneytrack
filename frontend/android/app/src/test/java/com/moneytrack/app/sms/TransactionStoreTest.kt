package com.moneytrack.app.sms

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TransactionStoreTest {

    @Test
    fun `parsedFromJson rescues legacy record without classification`() {
        val json = JSONObject().apply {
            put("amountPaise", 1500L)
            put("status", "DEBIT")
            put("evidence", "Paid Rs.15 to Jio via UPI")
            put("timestampMs", 1731050000000L)
        }

        val parsed = TransactionStore.parsedFromJson(json)
        assertNotNull(parsed)
        assertNotEquals(FinancialTxnType.NON_FINANCIAL_SMS, parsed.classification)
        assertEquals(FinancialTxnType.UPI_DEBIT, parsed.classification)
    }

    @Test
    fun `parsedFromJson recovers false-positive NON_FINANCIAL_SMS if amount exists`() {
        val json = JSONObject().apply {
            put("amountPaise", 300300L)
            put("status", "CREDIT")
            put("classification", "NON_FINANCIAL_SMS")
            put("evidence", "Your a/c *8824 is Credited with INR 3003.00 on 08-11-2026. Avail Bal: INR 9140.09")
            put("bankName", "SDCCBL")
            put("availableBalancePaise", 914009L)
            put("accountSuffix", "8824")
        }

        val parsed = TransactionStore.parsedFromJson(json)
        assertNotNull(parsed)
        assertEquals(FinancialTxnType.BANK_CREDIT, parsed.classification)
        assertEquals(300300L, parsed.amountPaise)
    }

    @Test
    fun `parsedFromJson preserves genuine NON_FINANCIAL_SMS for quota alert`() {
        val json = JSONObject().apply {
            put("amountPaise", 0L)
            put("status", "UNKNOWN")
            put("classification", "NON_FINANCIAL_SMS")
            put("evidence", "You have exhausted 100% quota of high speed daily data as on 08-Nov-26.")
        }

        val parsed = TransactionStore.parsedFromJson(json)
        assertEquals(FinancialTxnType.NON_FINANCIAL_SMS, parsed.classification)
    }

    @Test
    fun `parsedFromJson handles unknown future classification by falling back to AMBIGUOUS_REVIEW`() {
        val json = JSONObject().apply {
            put("amountPaise", 0L)
            put("status", "UNKNOWN")
            put("classification", "FUTURE_CRYPTO_SWAP")
            put("evidence", "Unknown alert message")
        }

        val parsed = TransactionStore.parsedFromJson(json)
        assertEquals(FinancialTxnType.AMBIGUOUS_REVIEW, parsed.classification)
    }

    @Test
    fun `positive amount with UNKNOWN status remains AMBIGUOUS_REVIEW and never becomes BANK_DEBIT`() {
        val json = JSONObject().apply {
            put("amountPaise", 50000L)
            put("status", "UNKNOWN")
            put("evidence", "Payment request of Rs. 500 received. Click link to approve.")
        }

        val parsed = TransactionStore.parsedFromJson(json)
        assertNotNull(parsed)
        assertEquals(FinancialTxnType.AMBIGUOUS_REVIEW, parsed.classification)
        assertEquals(TxnStatus.UNKNOWN, parsed.status)
    }

    @Test
    fun `positive amount with PENDING status remains AMBIGUOUS_REVIEW and never becomes BANK_DEBIT`() {
        val json = JSONObject().apply {
            put("amountPaise", 75000L)
            put("status", "PENDING")
            put("evidence", "Transaction of Rs. 750 is pending bank authorization.")
        }

        val parsed = TransactionStore.parsedFromJson(json)
        assertNotNull(parsed)
        assertEquals(FinancialTxnType.AMBIGUOUS_REVIEW, parsed.classification)
        assertEquals(TxnStatus.UNKNOWN, parsed.status)
    }

    @Test
    fun `positive amount with missing or null status remains AMBIGUOUS_REVIEW`() {
        val json = JSONObject().apply {
            put("amountPaise", 100000L)
            put("evidence", "Notice regarding Rs. 1000 on your account.")
        }

        val parsed = TransactionStore.parsedFromJson(json)
        assertNotNull(parsed)
        assertEquals(FinancialTxnType.AMBIGUOUS_REVIEW, parsed.classification)
        assertEquals(TxnStatus.UNKNOWN, parsed.status)
    }

    @Test
    fun `lowercase debit and credit strings are normalized safely without throwing`() {
        val jsonDebit = JSONObject().apply {
            put("amountPaise", 2000L)
            put("status", "debit")
            put("evidence", "Rs.20 debited from a/c")
        }
        val parsedDebit = TransactionStore.parsedFromJson(jsonDebit)
        assertEquals(TxnStatus.DEBIT, parsedDebit.status)
        assertEquals(FinancialTxnType.BANK_DEBIT, parsedDebit.classification)

        val jsonCredit = JSONObject().apply {
            put("amountPaise", 5000L)
            put("status", "credit")
            put("evidence", "Rs.50 credited to account")
        }
        val parsedCredit = TransactionStore.parsedFromJson(jsonCredit)
        assertEquals(TxnStatus.CREDIT, parsedCredit.status)
        assertEquals(FinancialTxnType.BANK_CREDIT, parsedCredit.classification)
    }
}
