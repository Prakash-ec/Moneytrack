package com.moneytrack.app.sms

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The 20 distinct financial and non-financial transaction types supported by MoneyTrack.
 */
enum class FinancialTxnType {
    BANK_DEBIT,
    BANK_CREDIT,
    UPI_DEBIT,
    UPI_CREDIT,
    IMPS,
    NEFT,
    RTGS,
    ATM_WITHDRAWAL,
    CARD_PAYMENT,
    RECHARGE,
    REFUND,
    REVERSAL,
    BANK_CHARGES,
    INTEREST_RECEIVED,
    FAILED_TRANSACTION,
    BALANCE_NOTIFICATION,
    OTP,
    PROMOTIONAL_SMS,
    NON_FINANCIAL_SMS,
    AMBIGUOUS_REVIEW;

    fun isFinancial(): Boolean = this in listOf(
        BANK_DEBIT, BANK_CREDIT, UPI_DEBIT, UPI_CREDIT, IMPS, NEFT, RTGS,
        ATM_WITHDRAWAL, CARD_PAYMENT, RECHARGE, REFUND, REVERSAL,
        BANK_CHARGES, INTEREST_RECEIVED
    )

    fun isDebit(): Boolean = this in listOf(
        BANK_DEBIT, UPI_DEBIT, IMPS, NEFT, RTGS, ATM_WITHDRAWAL,
        CARD_PAYMENT, RECHARGE, BANK_CHARGES
    )

    fun isCredit(): Boolean = this in listOf(
        BANK_CREDIT, UPI_CREDIT, REFUND, INTEREST_RECEIVED
    )

    fun isIgnored(): Boolean = this in listOf(
        OTP, PROMOTIONAL_SMS, NON_FINANCIAL_SMS, FAILED_TRANSACTION,
        REVERSAL, BALANCE_NOTIFICATION
    )
}

/**
 * Result of parsing a single SMS message.
 */
data class ParsedTransaction(
    /** Amount in paise, when a reliable transaction amount was found. */
    val amountPaise: Long?,
    /** Merchant or service provider, when identifiable. */
    val merchant: String?,
    /** Transaction / UPI / reference identifier, when present. */
    val reference: String?,
    /** Explicit transaction date in ISO yyyy-MM-dd, when supplied in the message. */
    val transactionDate: String?,
    /** Explicit transaction date-time in ISO, when supplied in the message. */
    val transactionDateTime: String?,
    /** Detected direction / outcome of the transaction. */
    val status: TxnStatus,
    /** Suggested expense category / type name. */
    val categorySuggestion: String?,
    /** Human-readable description of the transaction. */
    val note: String?,
    /** SMS sender ID (e.g. VK-JIOMS, AD-ICICI). */
    val sender: String?,
    /** Android message timestamp in milliseconds since epoch, when available. */
    val timestampMs: Long?,
    /** Raw evidence summary for review (never a full SMS body/log). */
    val evidence: String?,
    /** Bank available balance in paise, when present in message (e.g. Avail Bal: Rs 15,200). */
    val availableBalancePaise: Long? = null,
    /** Masked account number suffix (e.g. "8824"). */
    val accountSuffix: String? = null,
    /** Bank name (e.g. "HDFC Bank", "State Bank of India"). */
    val bankName: String? = null,
    /** Specific 20-type classification. */
    val classification: FinancialTxnType = FinancialTxnType.AMBIGUOUS_REVIEW,
    /** Confidence rating: HIGH, MEDIUM, LOW. */
    val confidence: String = "HIGH",
    /** Payment channel e.g. UPI, CARD, ATM, IMPS, NEFT, RTGS, RECHARGE, BANK. */
    val paymentChannel: String? = null,
    /** SHA-256 hash of normalized SMS text for Layer A exact duplicate detection. */
    val rawHash: String? = null,
)

enum class TxnStatus {
    DEBIT, CREDIT, FAILED, PENDING, REVERSAL, REFUND, UNKNOWN
}

data class TransactionCandidate(
    val id: String,
    val status: CandidateStatus,
    val parsed: ParsedTransaction,
    val reason: String?,
    val createdAtMs: Long,
)

enum class CandidateStatus {
    RECEIVED, IGNORED, PENDING_REVIEW, READY_TO_SYNC, SYNCED, FAILED
}

data class SyncResult(
    val created: Boolean,
    val replayed: Boolean,
    val expenseId: Int?,
    val error: String?,
)

/**
 * Active expense type model fetched dynamically from backend API.
 */
data class ActiveExpenseType(
    val id: Int,
    val name: String,
    val category: String? = null,
)

object Fingerprint {
    fun of(
        sender: String?,
        timestampMs: Long?,
        amountPaise: Long?,
        reference: String?,
        transactionDate: String? = null,
        accountSuffix: String? = null,
        bankName: String? = null,
        balancePaise: Long? = null,
    ): String {
        val cleanRef = reference?.trim()?.takeIf { it.isNotBlank() && !isMaskedAccount(it) }
        val cleanAmount = amountPaise?.toString() ?: "unknown-amount"
        val bankGroup = normalizedBank(bankName, sender)

        val key = if (cleanRef != null) {
            val normalizedRef = cleanRef.uppercase()
            "ref:$bankGroup:$normalizedRef:$cleanAmount"
        } else {
            val acctPart = accountSuffix?.takeIf { it.isNotBlank() } ?: "no-acct"
            val dateOrBucket = transactionDate?.trim()?.takeIf { it.isNotBlank() }
                ?: timestampMs?.let { toDayBucket(it) }
                ?: "unknown-date"
            // For ledger messages without a transaction reference:
            // If balancePaise is provided, it distinguishes consecutive transactions on the same day (e.g. ₹3,003 credits).
            // If balancePaise is absent, dateOrBucket groups same-day transactions.
            val balPart = balancePaise?.let { "bal:$it" } ?: "no-bal"
            "fallback:$bankGroup:$acctPart:$dateOrBucket:$cleanAmount:$balPart"
        }
        return sha256(key)
    }

    fun normalizedBank(bankName: String?, sender: String?): String {
        val b = (bankName ?: "").uppercase()
        val s = normalizeSender(sender).uppercase()
        return when {
            b.contains("SDCCB") || s.contains("SDCCB") -> "SDCCB"
            b.contains("HDFC") || s.contains("HDFC") -> "HDFC"
            b.contains("SBI") || s.contains("SBI") -> "SBI"
            b.contains("ICICI") || s.contains("ICICI") -> "ICICI"
            b.contains("AXIS") || s.contains("AXIS") -> "AXIS"
            b.contains("JIO") || s.contains("JIO") -> "JIO"
            b.contains("AIRTEL") || s.contains("AIRTEL") -> "AIRTEL"
            s.isNotBlank() && s != "UNKNOWN-SENDER" -> s
            b.isNotBlank() -> b
            else -> "UNKNOWN-BANK"
        }
    }

    fun exactSmsHash(sender: String?, timestampMs: Long?, body: String): String {
        val cleanSender = normalizeSender(sender)
        val normalizedBody = body.trim().replace(Regex("\\s+"), " ")
        val approxTimeBucket = timestampMs?.let { it / 60000L } ?: 0L // 1-minute bucket for network retransmissions
        return sha256("exact:$cleanSender:$approxTimeBucket:$normalizedBody")
    }

    fun isMaskedAccount(value: String): Boolean {
        val upper = value.uppercase()
        return upper.contains("XX") || upper.contains("**") || upper.contains("*") || upper.startsWith("A/C") || upper.startsWith("ACC")
    }

    fun normalizeSender(sender: String?): String {
        if (sender == null || sender.isBlank()) return "unknown-sender"
        val upper = sender.trim().uppercase()
        val dashIdx = upper.indexOf('-')
        // Telecom prefixes in India are 2-4 letters before hyphen (e.g. AD-HDFCBK, VK-JIOMS, BZ-SBIINB)
        val base = if (dashIdx in 1..4 && dashIdx < upper.length - 1) {
            upper.substring(dashIdx + 1).trim()
        } else {
            upper
        }
        // Normalize trailing category suffixes e.g. -S (service) or -P (promotional)
        val lastDash = base.lastIndexOf('-')
        return if (lastDash >= 0 && lastDash == base.length - 2) {
            base.substring(0, lastDash)
        } else {
            base
        }
    }

    fun isPromotionalSender(sender: String?): Boolean {
        if (sender == null) return false
        val upper = sender.trim().uppercase()
        // In Indian TRAI standards, headers with -P suffix (e.g. JD-JIOCPN-P) or starting with numeric shortcodes are promotional
        return upper.endsWith("-P") || upper.endsWith("_P") || Regex("^\\d{5,}$").matches(upper)
    }

    private fun toDayBucket(millis: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.ENGLISH)
        return sdf.format(Date(millis))
    }

    fun sha256(input: String): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        return digest.digest(input.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }
}
