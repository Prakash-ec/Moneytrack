package com.moneytrack.app.sms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsParserTest {

    @Test
    fun `parses successful Jio recharge`() {
        val body = """
Recharge Successful !
Plan Name : 19.00
Jio Number : [redacted]
Entitlement:
Benefits: Unlimited Data. Validity: 1Day
Transaction ID : BR000D0ABTKT
""".trimIndent()
        val parsed = SmsParser.parse(body, "VK-JIOMS", 1700000000000L)

        assertEquals(1900L, parsed.amountPaise)
        assertEquals("Jio", parsed.merchant)
        assertEquals("BR000D0ABTKT", parsed.reference)
        assertEquals(TxnStatus.DEBIT, parsed.status)
        assertEquals("Mobile Recharge", parsed.categorySuggestion)
        assertNull(parsed.transactionDate) // no explicit date; plan validity must not be used
        assertNotNull(parsed.timestampMs)
        assertNotNull(parsed.evidence)
    }

    @Test
    fun `parses INR amount variants`() {
        val cases = listOf(
            "₹19 debited from your account" to 1900L,
            "Rs 19 debited" to 1900L,
            "Rs. 19.00 debited" to 1900L,
            "INR 1,234.50 debited" to 123450L,
            "Amount: Rs 1,000.00" to 100000L,
        )
        for ((input, expected) in cases) {
            val parsed = SmsParser.parse(input, "SBI", 1700000000000L)
            assertEquals("input=$input", expected, parsed.amountPaise)
            assertEquals("input=$input", TxnStatus.DEBIT, parsed.status)
        }
    }

    @Test
    fun `parses bank UPI debit message`() {
        val body = "A/c xxxx1234 debited with INR 542.00 on 15-10-2026. UPI ref: 987654321098. Txn ID: AB123456CD."
        val parsed = SmsParser.parse(body, "AD-SBI", 1700000000000L)
        assertEquals(54200L, parsed.amountPaise)
        assertNotNull(parsed.reference)
        assertTrue("ref=${parsed.reference}", parsed.reference!!.length >= 4)
        assertEquals("SBI Bank", parsed.merchant)
        assertEquals(TxnStatus.DEBIT, parsed.status)
        assertEquals("2026-10-15", parsed.transactionDate)
    }

    @Test
    fun `parses HDFC card debit prioritizing debit amount over balance and body merchant over sender`() {
        val body = "Sent from HDFC Bank: Rs. 450.00 spent on your Card ending 1234 on 28-OCT-26 at SWIGGY. Avail Bal: Rs. 15,200.00."
        val parsed = SmsParser.parse(body, "AD-HDFCBK", 1700000000000L)

        // Must extract 45000L (Rs. 450.00), NOT 1520000L (Rs. 15,200.00)
        assertEquals(45000L, parsed.amountPaise)
        // Must extract Swiggy from body, NOT HDFC Bank from sender
        assertEquals("Swiggy", parsed.merchant)
        assertEquals(TxnStatus.DEBIT, parsed.status)
        assertEquals("2026-10-28", parsed.transactionDate)
        assertEquals("Food", parsed.categorySuggestion)
    }

    @Test
    fun `parses SBI UPI debit with compact date and balance`() {
        val body = "SBI: A/c debited by Rs 250.00 on 28Oct26 transfer to ZOMATO Ref: 12345678. Bal: Rs 12,345.00."
        val parsed = SmsParser.parse(body, "SBIINB", 1700000000000L)

        assertEquals(25000L, parsed.amountPaise)
        assertEquals("Zomato", parsed.merchant)
        assertEquals(TxnStatus.DEBIT, parsed.status)
        assertEquals("2026-10-28", parsed.transactionDate)
        assertEquals("12345678", parsed.reference)
        assertEquals("Food", parsed.categorySuggestion)
    }

    @Test
    fun `parses ICICI card debit with Info BIL merchant and balance`() {
        val body = "ICICI Bank: Acct ending 5678 debited with INR 850.00 on 28-Oct-26. Info: BIL*ZOMATO. Avail Bal INR 24,150.00."
        val parsed = SmsParser.parse(body, "ICICIB", 1700000000000L)

        assertEquals(85000L, parsed.amountPaise)
        assertEquals("Zomato", parsed.merchant)
        assertEquals(TxnStatus.DEBIT, parsed.status)
        assertEquals("2026-10-28", parsed.transactionDate)
        assertEquals("Food", parsed.categorySuggestion)
    }

    @Test
    fun `parses Axis UPI debit with VPA handle and full 4-digit year date`() {
        val body = "Axis Bank: INR 520.00 debited from A/c 9012 to VPA swiggy@icici on 28-OCT-2026. Bal INR 8,900.00."
        val parsed = SmsParser.parse(body, "AXISBK", 1700000000000L)

        assertEquals(52000L, parsed.amountPaise)
        assertEquals("Swiggy", parsed.merchant)
        assertEquals(TxnStatus.DEBIT, parsed.status)
        assertEquals("2026-10-28", parsed.transactionDate)
        assertEquals("Food", parsed.categorySuggestion)
    }

    @Test
    fun `parses Indian banking date formats`() {
        val formats = listOf(
            "Debited Rs 100 on 28-OCT-26 to merchant" to "2026-10-28",
            "Debited Rs 100 on 28-Oct-2026 to merchant" to "2026-10-28",
            "Debited Rs 100 on 28Oct26 to merchant" to "2026-10-28",
            "Debited Rs 100 on 28 Oct 2026 to merchant" to "2026-10-28",
            "Debited Rs 100 on 28/10/2026 to merchant" to "2026-10-28",
            "Debited Rs 100 on 28-10-2026 to merchant" to "2026-10-28",
        )
        for ((sms, expectedDate) in formats) {
            val parsed = SmsParser.parse(sms, "BANK", 1700000000000L)
            assertEquals("sms=$sms", expectedDate, parsed.transactionDate)
        }
    }

    @Test
    fun `suggests categories for common Indian merchants`() {
        val cases = listOf(
            Triple("Paid Rs 300 to Zomato", "Food", "Zomato"),
            Triple("Debited Rs 500 at Blinkit", "Groceries", "Blinkit"),
            Triple("Paid Rs 220 to Uber", "Transport", "Uber"),
            Triple("Debited Rs 1500 at HPCL Petrol Pump", "Fuel", "Hpcl"),
            Triple("Paid Rs 999 to Amazon", "Shopping", "Amazon"),
            Triple("Paid Rs 850 to Bescom Electricity", "Utilities", "Bescom Electricity"),
            Triple("Paid Rs 400 to BookMyShow", "Entertainment", "BookMyShow"),
            Triple("Paid Rs 350 to Apollo Pharmacy", "Health", "Apollo Pharmacy"),
        )
        for ((sms, expectedCategory, _) in cases) {
            val parsed = SmsParser.parse(sms, "BANK", 1700000000000L)
            assertEquals("sms=$sms", expectedCategory, parsed.categorySuggestion)
        }
    }

    @Test
    fun `falls back to bank sender ID when no merchant in body`() {
        val body = "Rs 500.00 debited from A/c 1234 on 28-OCT-26. Avail Bal: Rs 10,000.00."
        val parsed = SmsParser.parse(body, "AD-HDFCBK", 1700000000000L)
        assertEquals("HDFC Bank", parsed.merchant)
        assertEquals(50000L, parsed.amountPaise)
    }

    @Test
    fun `rejects credit refund salary`() {
        val msgs = listOf(
            "₹5000 credited to your account from SALARY",
            "Refund of Rs 200.00 processed",
            "Cashback of ₹100 received",
        )
        for (m in msgs) {
            val parsed = SmsParser.parse(m, "BANK", 1700000000000L)
            assertEquals("msg=$m", TxnStatus.CREDIT, parsed.status)
        }
    }

    @Test
    fun `rejects failed and reversed transactions`() {
        val msgs = listOf(
            "Transaction of ₹500 failed. Please try again.",
            "Your payment of Rs 1,000 was declined.",
            "Reversal of ₹200 processed to your account.",
        )
        for (m in msgs) {
            val parsed = SmsParser.parse(m, "BANK", 1700000000000L)
            assertTrue("msg=$m", parsed.status == TxnStatus.FAILED || parsed.status == TxnStatus.REVERSAL)
        }
    }

    @Test
    fun `rejects OTP and verification messages`() {
        val msgs = listOf(
            "Your OTP is 123456 for login.",
            "Verification code: 987654. Do not share.",
        )
        for (m in msgs) {
            val parsed = SmsParser.parse(m, "BANK", 1700000000000L)
            assertEquals("msg=$m", TxnStatus.UNKNOWN, parsed.status)
            assertNull("msg=$m", parsed.amountPaise)
        }
    }

    @Test
    fun `rejects promotional messages`() {
        val msgs = listOf(
            "Flat 50% off! Use promo code SAVE. Click here.",
            "You won a lucky draw! Claim your reward.",
        )
        for (m in msgs) {
            val parsed = SmsParser.parse(m, "PROMO", 1700000000000L)
            assertEquals("msg=$m", TxnStatus.UNKNOWN, parsed.status)
        }
    }

    @Test
    fun `rejects balance-only alerts`() {
        val body = "Your available balance is ₹12,345.60. AC BAL after txn."
        val parsed = SmsParser.parse(body, "SBI", 1700000000000L)
        assertNull(parsed.amountPaise)
    }

    @Test
    fun `rejects messages with no amount`() {
        val body = "Recharge successful for your Jio number. Transaction ID: XYZ123."
        val parsed = SmsParser.parse(body, "VK-JIOMS", 1700000000000L)
        assertNull(parsed.amountPaise)
    }

    @Test
    fun `extracts transaction reference`() {
        val body = "UPI payment of ₹250.00 successful. UPI ref: 9876543210, txn id: PQR999000."
        val parsed = SmsParser.parse(body, "GPA", 1700000000000L)
        assertNotNull(parsed.reference)
        assertTrue("ref=${parsed.reference}", parsed.reference!!.length >= 4)
    }

    @Test
    fun `comma separated large amount`() {
        val body = "₹1,23,456.78 debited from your account."
        val parsed = SmsParser.parse(body, "HDFC", 1700000000000L)
        assertEquals(12345678L, parsed.amountPaise)
    }

    @Test
    fun `pending status is not auto-eligible`() {
        val body = "Your transaction of ₹500 is pending."
        val parsed = SmsParser.parse(body, "BANK", 1700000000000L)
        assertEquals(TxnStatus.PENDING, parsed.status)
    }

    @Test
    fun `extracts available balance account suffix and bank name`() {
        val body = "HDFC Bank: Rs. 1,250.00 debited from A/c **8824 on 28-OCT-26 to Swiggy. Avail Bal: Rs. 45,200.50."
        val parsed = SmsParser.parse(body, "AD-HDFCBK", 1700000000000L)

        assertEquals(125000L, parsed.amountPaise)
        assertEquals(4520050L, parsed.availableBalancePaise)
        assertEquals("8824", parsed.accountSuffix)
        assertEquals("HDFC Bank", parsed.bankName)
        assertEquals(TxnStatus.DEBIT, parsed.status)
        assertEquals("Swiggy", parsed.merchant)
    }

    @Test
    fun `parses credit salary transaction with account suffix and balance`() {
        val body = "Your A/c ending 1234 is credited with INR 75,000.00 on 31-Oct-26 towards Salary. Clear Bal is Rs. 1,12,000.00."
        val parsed = SmsParser.parse(body, "SBIINB", 1700000000000L)

        assertEquals(TxnStatus.CREDIT, parsed.status)
        assertEquals(7500000L, parsed.amountPaise)
        assertEquals(11200000L, parsed.availableBalancePaise)
        assertEquals("1234", parsed.accountSuffix)
        assertEquals("State Bank of India", parsed.bankName)
        assertEquals("Salary", parsed.categorySuggestion)
        assertEquals("2026-10-31", parsed.transactionDate)
    }

    @Test
    fun `parses cashback credit transaction`() {
        val body = "Cashback of Rs. 150.00 credited to your ICICI Bank A/c XX5678. Avail Bal: INR 8,450.00."
        val parsed = SmsParser.parse(body, "ICICIB", 1700000000000L)

        assertEquals(TxnStatus.CREDIT, parsed.status)
        assertEquals(15000L, parsed.amountPaise)
        assertEquals(845000L, parsed.availableBalancePaise)
        assertEquals("5678", parsed.accountSuffix)
        assertEquals("ICICI Bank", parsed.bankName)
        assertEquals("Cashback", parsed.categorySuggestion)
    }
}
