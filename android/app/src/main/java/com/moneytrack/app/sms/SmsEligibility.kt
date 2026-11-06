package com.moneytrack.app.sms

import java.util.*

/**
 * Deterministic eligibility rules. Decides whether a parsed SMS should be
 * auto-recorded, queued for review, or ignored. No LLM authority.
 */
object SmsEligibility {

    private val OTP_KEYWORDS = listOf("otp", "one time password", "verification code", "verify", "verifying", "authenticate", "login code", "your otp is")
    private val PROMO_KEYWORDS = listOf(
        "promo", "promotion", "offer", "discount", "cashback offer", "lucky", "winner", "won",
        "click here", "unsubscribe", "advertisement", "market", "reward", "scratch",
    )
    private val BALANCE_ONLY_HINTS = listOf("balance", "avail bal", "available bal", "ac bal", "current balance")
    private val CREDIT_HINTS = listOf("credited", "credit", "salary", "refund", "cashback", "cash back", "received", "deposited")

    data class Decision(
        val status: CandidateStatus,
        val reason: String?,
    )

    private val random = Random()

    /**
     * Evaluate a parsed transaction against the eligibility rules.
     *
     * - IGNORED: OTP/promo/balance-only/credit/refund/failed/reversed/no amount.
     * - PENDING_REVIEW: real transaction but a required detail is ambiguous/missing.
     * - READY_TO_SYNC: completed debit/recharge with amount, date evidence, and a merchant or sender.
     */
    fun decide(parsed: ParsedTransaction, rawTextLower: String): Decision {
        val text = rawTextLower

        // --- Hard rejections first -----------------------------------------
        if (OTP_KEYWORDS.any { text.contains(it) }) {
            return Decision(CandidateStatus.IGNORED, "OTP or verification message")
        }
        if (PROMO_KEYWORDS.any { text.contains(it) }) {
            return Decision(CandidateStatus.IGNORED, "Promotional or marketing message")
        }
        if (parsed.status == TxnStatus.FAILED || parsed.status == TxnStatus.REVERSAL) {
            return Decision(CandidateStatus.IGNORED, "Failed, declined, cancelled or reversed transaction")
        }
        if (parsed.status == TxnStatus.UNKNOWN && !isDebitLikely(text, parsed) && !isCreditLikely(text, parsed)) {
            return Decision(CandidateStatus.IGNORED, "No evidence of a completed transaction")
        }

        // Balance-only alert without a new transaction event.
        if (isBalanceOnly(text) && parsed.status != TxnStatus.DEBIT && parsed.status != TxnStatus.CREDIT) {
            return Decision(CandidateStatus.IGNORED, "Balance-only alert with no new transaction")
        }

        // --- Mandatory amount ----------------------------------------------
        if (parsed.amountPaise == null || parsed.amountPaise <= 0) {
            return Decision(CandidateStatus.IGNORED, "No reliable transaction amount")
        }

        // --- Date evidence (explicit date or Android SMS timestamp) --------
        val hasDate = parsed.transactionDate != null || parsed.timestampMs != null
        if (!hasDate) {
            return Decision(CandidateStatus.PENDING_REVIEW, "No transaction date available")
        }

        // --- Merchant / sender evidence ------------------------------------
        val hasParty = (parsed.merchant?.isNotEmpty() == true) || (parsed.sender?.isNotEmpty() == true)
        if (!hasParty) {
            return Decision(CandidateStatus.PENDING_REVIEW, "No merchant or sender identified")
        }

        // --- Pending / ambiguous -------------------------------------------
        if (parsed.status == TxnStatus.PENDING || parsed.status == TxnStatus.UNKNOWN) {
            return Decision(CandidateStatus.PENDING_REVIEW, "Transaction status is ambiguous or pending")
        }

        val reason = if (parsed.status == TxnStatus.CREDIT) "Completed credit eligible for income auto-recording"
                     else "Completed debit eligible for auto-recording"
        return Decision(CandidateStatus.READY_TO_SYNC, reason)
    }

    private fun isCreditLikely(text: String, parsed: ParsedTransaction): Boolean {
        val creditWords = listOf("credited", "received", "refund", "salary", "cashback", "deposited")
        return creditWords.any { text.contains(it) }
    }

    private fun isDebitLikely(text: String, parsed: ParsedTransaction): Boolean {
        val debitWords = listOf("debited", "spent", "paid", "purchase", "recharged", "successful", "success", "txn", "upi", "atm", "withdraw")
        return debitWords.any { text.contains(it) } || parsed.reference != null || parsed.merchant != null
    }

    private fun isBalanceOnly(text: String): Boolean {
        return BALANCE_ONLY_HINTS.any { text.contains(it) }
    }
}
