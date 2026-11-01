package com.moneytrack.app.sms

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
        transactionDate: String? = null
    ): String {
        val cleanRef = reference?.trim()?.takeIf { it.isNotBlank() }
        val cleanAmount = amountPaise?.toString() ?: "unknown-amount"
        val cleanSender = normalizeSender(sender)

        val key = if (cleanRef != null) {
            val normalizedRef = cleanRef.uppercase()
            "ref:$cleanSender:$normalizedRef:$cleanAmount"
        } else {
            val dateOrBucket = transactionDate?.trim()?.takeIf { it.isNotBlank() }
                ?: timestampMs?.let { toDayBucket(it) }
                ?: "unknown-date"
            "fallback:$cleanSender:$dateOrBucket:$cleanAmount"
        }
        return sha256(key)
    }

    fun normalizeSender(sender: String?): String {
        if (sender == null || sender.isBlank()) return "unknown-sender"
        val upper = sender.trim().uppercase()
        val dashIdx = upper.indexOf('-')
        // Telecom prefixes in India are 2-4 letters before hyphen (e.g. AD-HDFCBK, VK-JIOMS, BZ-SBIINB)
        return if (dashIdx in 1..4 && dashIdx < upper.length - 1) {
            upper.substring(dashIdx + 1).trim()
        } else {
            upper
        }
    }

    private fun toDayBucket(millis: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.ENGLISH)
        return sdf.format(Date(millis))
    }

    private fun sha256(input: String): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        return digest.digest(input.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }
}
