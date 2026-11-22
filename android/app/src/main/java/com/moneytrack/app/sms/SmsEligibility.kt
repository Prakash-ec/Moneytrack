package com.moneytrack.app.sms

/**
 * Deterministic eligibility rules. Decides whether a parsed SMS should be
 * auto-recorded, queued for review, or ignored. No LLM authority.
 */
object SmsEligibility {

    private val OTP_KEYWORDS = listOf(
        "otp", "one time password", "verification code", "verify", "verifying",
        "authenticate", "login code", "your otp is"
    )
    private val PROMO_KEYWORDS = listOf(
        "promo", "promotion", "offer", "discount", "cashback offer", "lucky", "winner", "won",
        "click here", "unsubscribe", "advertisement", "market", "reward", "scratch",
    )
    private val BALANCE_ONLY_HINTS = listOf("balance", "avail bal", "available bal", "ac bal", "current balance")

    data class Decision(
        val status: CandidateStatus,
        val reason: String?,
    )

    /**
     * Evaluate a parsed transaction against the eligibility rules.
     *
     * - IGNORED: OTP, promotional, non-financial data quotas, balance-only, failed, reversed, or no amount.
     * - PENDING_REVIEW: genuine transaction but required detail is ambiguous or missing.
     * - READY_TO_SYNC: completed debit, credit, or recharge with amount, date evidence, and identifiable party.
     */
    fun decide(parsed: ParsedTransaction, rawTextLower: String = ""): Decision {
        val text = rawTextLower.lowercase()

        // --- 1. Hard rejections by classification & raw text keywords -----
        if (parsed.classification == FinancialTxnType.OTP || OTP_KEYWORDS.any { text.contains(it) }) {
            return Decision(CandidateStatus.IGNORED, "OTP or verification message")
        }
        if (parsed.classification == FinancialTxnType.PROMOTIONAL_SMS || PROMO_KEYWORDS.any { text.contains(it) }) {
            return Decision(CandidateStatus.IGNORED, "Promotional or marketing message")
        }
        if (parsed.classification == FinancialTxnType.NON_FINANCIAL_SMS) {
            return Decision(CandidateStatus.IGNORED, "Non-financial telecom or data quota alert")
        }
        if (parsed.classification == FinancialTxnType.BALANCE_NOTIFICATION ||
            (BALANCE_ONLY_HINTS.any { text.contains(it) } && parsed.status != TxnStatus.DEBIT && parsed.status != TxnStatus.CREDIT)
        ) {
            return Decision(CandidateStatus.IGNORED, "Balance-only alert with no new transaction")
        }
        if (parsed.classification == FinancialTxnType.FAILED_TRANSACTION || parsed.status == TxnStatus.FAILED) {
            return Decision(CandidateStatus.IGNORED, "Failed, declined, or unsuccessful transaction")
        }
        if (parsed.classification == FinancialTxnType.REVERSAL || parsed.status == TxnStatus.REVERSAL) {
            return Decision(CandidateStatus.IGNORED, "Reversed or rolled-back transaction")
        }

        // --- 2. Mandatory amount ------------------------------------------
        if (parsed.amountPaise == null || parsed.amountPaise <= 0) {
            return Decision(CandidateStatus.IGNORED, "No reliable transaction amount")
        }

        // --- 3. Date evidence (explicit date or Android SMS timestamp) ----
        val hasDate = parsed.transactionDate != null || parsed.timestampMs != null
        if (!hasDate) {
            return Decision(CandidateStatus.PENDING_REVIEW, "No transaction date available")
        }

        // --- 4. Merchant / sender evidence --------------------------------
        val hasParty = (parsed.merchant?.isNotEmpty() == true) || (parsed.sender?.isNotEmpty() == true)
        if (!hasParty) {
            return Decision(CandidateStatus.PENDING_REVIEW, "No merchant or sender identified")
        }

        // --- 5. Pending / ambiguous review --------------------------------
        if (parsed.status == TxnStatus.PENDING || parsed.status == TxnStatus.UNKNOWN) {
            return Decision(CandidateStatus.PENDING_REVIEW, "Transaction status is ambiguous or pending")
        }

        // --- 6. Eligible for sync -----------------------------------------
        val reason = if (parsed.classification.isCredit() || parsed.status == TxnStatus.CREDIT) {
            "Completed credit eligible for income auto-recording"
        } else {
            "Completed debit eligible for auto-recording"
        }
        return Decision(CandidateStatus.READY_TO_SYNC, reason)
    }
}
