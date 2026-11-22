package com.moneytrack.app.sms

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Deterministic SMS transaction parser.
 * Classifies messages into 20 distinct FinancialTxnType categories without any LLM dependency.
 */
object SmsParser {

    // ---------------------------------------------------------------- status keywords
    private val CREDIT_KEYWORDS = listOf(
        "credited", "credit", "salary", "refund", "cashback", "cash back",
        "received", "reversed back", "reversed to", "deposited",
    )
    private val FAILED_KEYWORDS = listOf(
        "failed", "decline", "declined", "unsuccessful", "unsucessful",
        "transaction failed", "could not complete", "technical error",
    )
    private val REVERSAL_KEYWORDS = listOf("reversal", "reversed", "rollback", "rolled back")
    private val PENDING_KEYWORDS = listOf("pending", "processing", "on hold", "awaiting")
    private val DEBIT_SUCCESS_KEYWORDS = listOf(
        "debited", "spent", "purchase", "paid", "payment", "successful", "success",
        "recharged", "recharge successful", "txn", "transaction", "atm", "withdraw",
        "upi", "merchant", "pos", "amount",
    )
    private val OTP_KEYWORDS = listOf(
        "otp", "one time password", "verification code", "verify", "verifying",
        "authenticate", "login code", "your otp is",
    )
    private val PROMO_KEYWORDS = listOf(
        "promo", "promotion", "offer", "discount", "cashback offer", "lucky", "winner",
        "won", "click here", "unsubscribe", "market", "advertisement", "flat 50% off",
        "audible", "coupon", "voucher", "unlimited 5g", "claim now", "earn cash",
    )
    private val BALANCE_KEYWORDS = listOf("balance", "avail bal", "available bal", "ac bal", "current balance")
    private val NO_DEBIT_EVIDENCE = listOf("no debit", "no amount debited", "not debited", "amount not debited")

    // Telecom & Data Quota keywords (English and Tamil)
    private val DATA_QUOTA_KEYWORDS = listOf(
        "quota of", "daily data quota", "exhausted", "data balance",
        "total data quota", "remaining data", "data usage alert", "data pack expired",
        "from your data balance", "used 90% of", "used 50% of", "used 100% of",
        "டேட்டா", "பயன்பாட்டு", "எச்சரிக்கை", "கிடைக்கும் டேட்டா", "டேட்டாவில்",
        "அதிவேக இணையத்தை",
    )

    // ---------------------------------------------------------------- balance regex
    // Matches explicit balance clauses like "Total Balance : Rs. 6,847.09", "Clear Balance : Rs. 6,847.0907/11/2026", "Avail Bal: Rs. 15,200.00"
    private val BALANCE_AMOUNT_REGEX = Regex(
        "(?i)(?:total\\s*bal(?:ance)?|clear(?:ed)?\\s*bal(?:ance)?|avail(?:able)?\\s*bal(?:ance)?|ac(?:count)?\\s*bal(?:ance)?|a/c\\s*bal(?:ance)?|bal(?:ance)?\\s*(?:is|:|=)|current\\s*bal(?:ance)?)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.[0-9]{2}|[0-9][0-9,]*)"
    )

    // ---------------------------------------------------------------- amount patterns
    // Debit amount patterns that associate an amount with a debit / spend / payment action
    private val DEBIT_AMOUNT_PATTERNS = listOf(
        // "debited for Rs.15.00" or "debited by Rs. 15" or "debited by Rs. 3,003"
        Regex("(?i)(?:debited\\s*(?:by|with|for)?|spent|paid|purchase(?:\\s*of)?|charged|withdrawn?|deducted)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})"),
        // "Rs. 450.00 debited / spent / paid"
        Regex("(?i)(?:₹|rs\\.?|inr|rupees?)\\s*([0-9][0-9,]*\\.?[0-9]{0,2})\\s*(?:is|has been|was)?\\s*(?:debited|spent|paid|deducted|transferred)"),
        // "txn amount / total amount : Rs. 15.00"
        Regex("(?i)(?:txn\\s*amount|transaction\\s*amount|total\\s*amount)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})")
    )

    // Credit amount patterns that associate an amount with an inflow / credit / received action
    private val CREDIT_AMOUNT_PATTERNS = listOf(
        Regex("(?i)(?:credited\\s*(?:by|with|for|to)?|received|refund(?:ed)?|cashback\\s*(?:of)?|deposited)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})"),
        Regex("(?i)(?:₹|rs\\.?|inr|rupees?)\\s*([0-9][0-9,]*\\.?[0-9]{0,2})\\s*(?:is|has been|was)?\\s*(?:credited|received|deposited|refunded)"),
        Regex("(?i)(?:salary\\s*(?:of)?)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})")
    )

    // Recharge amount patterns
    private val RECHARGE_AMOUNT_PATTERNS = listOf(
        Regex("(?i)(?:recharge\\s*(?:of)?|recharged\\s*(?:for)?)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})"),
        Regex("(?i)(?:plan\\s*(?:name|amount)?)\\s*[:=]\\s*(?:mrp|₹|rs\\.?|inr)?\\s*([0-9]+(?:\\.[0-9]{1,2})?)"),
        Regex("(?i)(?:திட்டத்தின்\\s*பெயர்)\\s*[:=]\\s*([0-9]+(?:\\.[0-9]{1,2})?)")
    )

    // Currency amount pattern strictly requiring currency symbol
    private val CURRENCY_AMOUNT = Regex(
        "(?i)(?:₹|rs\\.?|inr|rupees?)\\s*([0-9][0-9,]*\\.?[0-9]{0,2})"
    )

    // Non-currency units that disqualify a number from being money
    private val NON_CURRENCY_UNITS = Regex(
        "(?i)^\\s*(?:gb|mb|kb|tb|%|days?|hours?|hrs?|mins?|sec|seconds?|sms|off\\b|cashback\\b|coupon|voucher|quota|pack)"
    )

    private val ACCOUNT_SUFFIX_PATTERNS = listOf(
        Regex("(?i)(?:your|my)\\s+(?:a/c|acct?|account|card)\\s*(?:no\\.?)?\\s*(?:ending\\s*(?:with)?)?\\s*[:=]?\\s*[*Xx]*([0-9]{3,18})\\b"),
        Regex("(?i)(?:a/c|acct?|account|card)\\s*(?:no\\.?)?\\s*(?:ending\\s*(?:with)?)?\\s*[:=]?\\s*[*Xx]*([0-9]{3,18})\\b"),
        Regex("(?i)\\b[*Xx]{2,}([0-9]{3,18})\\b"),
        Regex("(?i)(?:from|in)\\s+(?:a/c|account)\\s*[*Xx]*([0-9]{3,18})\\b"),
        Regex("(?i)(?:to)\\s+(?:a/c|account)\\s*[*Xx]*([0-9]{3,18})\\b")
    )

    // ---------------------------------------------------------------- reference patterns
    private val REFERENCE_PATTERNS = listOf(
        // Specific UPI Ref pattern: (UPI Ref no 631165217684) or UPI:631165217684 or UPI/631165217684
        Regex("(?i)(?:upi(?:\\s*ref(?:erence)?(?:\\s*no\\.?)?|[:/])?)\\s*[:/]?\\s*([0-9]{10,14})\\b"),
        // Specific txn ID pattern: Transaction ID : 10005862230440 or txn id 10005862230440
        Regex("(?i)(?:transaction\\s*(?:id|no|number)|txn\\s*(?:id|no|number)?|txnid|rrn|utr)\\s*[:=/-]?\\s*([A-Za-z0-9]{6,20})\\b"),
        // General reference pattern: Ref no: 132502639405
        Regex("(?i)(?:ref(?:erence)?\\s*(?:no\\.?)?)\\s*[:=/-]?\\s*([A-Za-z0-9]{6,20})\\b")
    )

    // ---------------------------------------------------------------- dates
    private val DATE_PATTERNS = listOf(
        Regex("(?i)(?:date|dated|on|at)\\s*[:=]?\\s*([0-9]{1,2}(?:[-/\\s][A-Za-z]{3,9}[-/\\s]|[A-Za-z]{3,9}|[-/][0-9]{1,2}[-/]|\\s+[A-Za-z]{3,9}\\s+)[0-9]{2,4})"),
        Regex("(?i)(?:date|dated|on|at)\\s*[:=]?\\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})"),
        Regex("(?i)\\b([0-9]{1,2}(?:[-/\\s]?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\\s]?)[0-9]{2,4})\\b"),
        Regex("(?i)\\b([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})\\b"),
        Regex("(?i)([0-9]{2}[-/][0-9]{2}[-/][0-9]{2,4})"),
        Regex("(?i)\\b([0-9]{4}-[0-9]{2}-[0-9]{2})\\b")
    )

    fun parse(
        body: String?,
        sender: String?,
        timestampMs: Long?,
    ): ParsedTransaction {
        val text = body ?: ""
        val normalized = normalize(text)

        // 1. Check for promotional / marketing messages first (including TRAI -P headers)
        if (isPromotional(normalized, sender)) {
            val date = extractExplicitDate(normalized)
            val rawHash = Fingerprint.exactSmsHash(sender, timestampMs, normalized)
            return ParsedTransaction(
                amountPaise = null,
                merchant = null,
                reference = null,
                transactionDate = date,
                transactionDateTime = null,
                status = TxnStatus.UNKNOWN,
                categorySuggestion = null,
                note = "Promotional message",
                sender = sender,
                timestampMs = timestampMs,
                evidence = evidenceSummary(normalized, null, null, date, sender),
                classification = FinancialTxnType.PROMOTIONAL_SMS,
                confidence = "HIGH",
                paymentChannel = null,
                rawHash = rawHash,
            )
        }

        // 2. Check for data quota / usage alerts
        if (isDataQuotaAlert(normalized, sender)) {
            val date = extractExplicitDate(normalized)
            val rawHash = Fingerprint.exactSmsHash(sender, timestampMs, normalized)
            return ParsedTransaction(
                amountPaise = null,
                merchant = null,
                reference = null,
                transactionDate = date,
                transactionDateTime = null,
                status = TxnStatus.UNKNOWN,
                categorySuggestion = null,
                note = "Telecom data quota alert",
                sender = sender,
                timestampMs = timestampMs,
                evidence = evidenceSummary(normalized, null, null, date, sender),
                classification = FinancialTxnType.NON_FINANCIAL_SMS,
                confidence = "HIGH",
                paymentChannel = null,
                rawHash = rawHash,
            )
        }

        val status = detectStatus(normalized)
        val amount = extractAmount(normalized, status, sender)
        val accountSuffix = extractAccountSuffix(normalized)
        val reference = extractReference(normalized, accountSuffix)
        val explicitDate = extractExplicitDate(normalized)
        val merchant = extractMerchant(normalized, sender)
        val category = suggestCategory(status, merchant, normalized)
        val note = buildNote(status, reference)
        val availableBalance = extractAvailableBalance(normalized)
        val bankName = resolveBankName(normalized, sender)
        val classification = classifyTransaction(normalized, status, amount, reference, sender)
        val paymentChannel = resolvePaymentChannel(normalized, classification)
        val rawHash = Fingerprint.exactSmsHash(sender, timestampMs, normalized)

        return ParsedTransaction(
            amountPaise = amount,
            merchant = merchant,
            reference = reference,
            transactionDate = explicitDate,
            transactionDateTime = null,
            status = status,
            categorySuggestion = category,
            note = note,
            sender = sender,
            timestampMs = timestampMs,
            evidence = evidenceSummary(normalized, amount, reference, explicitDate, sender),
            availableBalancePaise = availableBalance,
            accountSuffix = accountSuffix,
            bankName = bankName,
            classification = classification,
            confidence = if (amount != null && status != TxnStatus.UNKNOWN) "HIGH" else "MEDIUM",
            paymentChannel = paymentChannel,
            rawHash = rawHash,
        )
    }

    private fun normalize(text: String): String {
        return text.replace("\u00A0", " ").replace("\u200B", "").replace(Regex("\\s+"), " ").trim()
    }

    private fun isDataQuotaAlert(text: String, sender: String?): Boolean {
        if (Fingerprint.isPromotionalSender(sender)) return false
        val lower = text.lowercase()
        // If message has explicit bank debit or credit evidence, it's not a data quota alert
        if (hasBankConfirmation(lower)) return false

        // Check data quota keywords
        if (DATA_QUOTA_KEYWORDS.any { lower.contains(it) }) return true

        // Check "data pack expired" or "data pack"
        if (lower.contains("data pack") || lower.contains("available data")) return true

        // Check if sender is telecom service (e.g. JioPay, JIOMS) and body contains "remaining data" or "quota"
        val senderNorm = Fingerprint.normalizeSender(sender)
        if (senderNorm.contains("JIO") && (lower.contains("data") || lower.contains("pack name"))) {
            if (!lower.contains("recharge successful") && !lower.contains("வெற்றிகரமாக ரீசார்ஜ்")) {
                return true
            }
        }

        return false
    }

    private fun isPromotional(text: String, sender: String?): Boolean {
        // Indian TRAI promotional headers have -P suffix
        val isPromoSender = Fingerprint.isPromotionalSender(sender)
        val lower = text.lowercase()

        // If message has explicit bank debit or credit evidence, it's not promotional
        if (hasBankConfirmation(lower)) return false

        if (isPromoSender) return true

        // Promotional body hints without financial confirmation
        val promoMatches = PROMO_KEYWORDS.count { lower.contains(it) }
        return promoMatches >= 2 || (promoMatches >= 1 && (lower.contains("claim now") || lower.contains("audible") || lower.contains("win cash")))
    }

    private fun hasBankConfirmation(lower: String): Boolean {
        val bankKeywords = listOf(
            "is debited by", "is debited for", "has been debited", "is credited by",
            "is credited for", "has been credited", "credited to a/c", "debited from a/c",
            "total balance :", "clear balance :"
        )
        return bankKeywords.any { lower.contains(it) }
    }

    private fun detectStatus(text: String): TxnStatus {
        val lower = text.lowercase()
        if (OTP_KEYWORDS.any { lower.contains(it) }) return TxnStatus.UNKNOWN
        if (NO_DEBIT_EVIDENCE.any { lower.contains(it) }) return TxnStatus.FAILED
        if (REVERSAL_KEYWORDS.any { lower.contains(it) }) return TxnStatus.REVERSAL
        if (FAILED_KEYWORDS.any { lower.contains(it) }) return TxnStatus.FAILED

        // Explicit recharge confirmation
        if (lower.contains("recharge successful") || lower.contains("வெற்றிகரமாக ரீசார்ஜ்")) {
            return TxnStatus.DEBIT
        }

        // Explicit compound: "Your a/c is debited ... and credited to a/c"
        val userDebited = Regex("(?i)(?:your|my)\\s+(?:a/c|account|card)\\s*(?:no\\.?)?\\s*[*Xx0-9]*\\s*(?:is|has been|was)?\\s*(?:debited|spent|deducted)")
        val userCredited = Regex("(?i)(?:your|my)\\s+(?:a/c|account|card)\\s*(?:no\\.?)?\\s*[*Xx0-9]*\\s*(?:is|has been|was)?\\s*(?:credited|deposited|refunded)")

        if (userDebited.containsMatchIn(text) && !userCredited.containsMatchIn(text)) {
            return TxnStatus.DEBIT
        }
        if (userCredited.containsMatchIn(text) && !userDebited.containsMatchIn(text)) {
            return TxnStatus.CREDIT
        }

        // "credited to a/c XXXXXX" when message also contains "debited" -> debited from user
        if (lower.contains("debited") && (lower.contains("credited to a/c") || lower.contains("credited to beneficiary") || lower.contains("credited to vpa") || lower.contains("credited to"))) {
            return TxnStatus.DEBIT
        }

        // "credited ... debited from a/c" -> credited to user
        if (lower.contains("credited") && (lower.contains("debited from a/c") || lower.contains("debited from"))) {
            return TxnStatus.CREDIT
        }

        // Clear credit / income keywords
        if (CREDIT_KEYWORDS.any { lower.contains(it) } && !lower.contains("debited")) {
            return TxnStatus.CREDIT
        }

        if (PENDING_KEYWORDS.any { lower.contains(it) }) return TxnStatus.PENDING

        // Debit keywords
        if (DEBIT_SUCCESS_KEYWORDS.any { lower.contains(it) }) return TxnStatus.DEBIT

        return TxnStatus.UNKNOWN
    }

    private fun extractAmount(text: String, status: TxnStatus = TxnStatus.UNKNOWN, sender: String? = null): Long? {
        val lower = text.lowercase()
        if (OTP_KEYWORDS.any { lower.contains(it) }) return null

        val isBalanceOnly = BALANCE_KEYWORDS.any { lower.contains(it) } &&
            !listOf("debited", "spent", "purchase", "paid", "recharged", "recharge successful", "credited", "received", "refund", "salary", "cashback").any { lower.contains(it) }
        if (isBalanceOnly) return null

        // Collect all balance amounts mentioned in the SMS so they are never picked as transaction amount
        val balanceMatches = BALANCE_AMOUNT_REGEX.findAll(text).toList()
        val balanceValues = balanceMatches.mapNotNull { toPaise(it.groupValues[1]) }.toSet()

        // 1. Recharge patterns (e.g. JioPay Plan Name : 15.0 or MRP 15)
        if (lower.contains("recharge") || lower.contains("ரீசார்ஜ்") || lower.contains("plan") || sender?.contains("jio", ignoreCase = true) == true) {
            for (pattern in RECHARGE_AMOUNT_PATTERNS) {
                val mt = pattern.find(text)
                if (mt != null && mt.groupValues.size > 1) {
                    val rawVal = mt.groupValues[1]
                    val paise = toPaise(rawVal)
                    if (paise != null && !balanceValues.contains(paise)) {
                        return paise
                    }
                }
            }
        }

        // 2. Primary direction patterns
        val primaryPatterns = if (status == TxnStatus.CREDIT) CREDIT_AMOUNT_PATTERNS else DEBIT_AMOUNT_PATTERNS
        val secondaryPatterns = if (status == TxnStatus.CREDIT) DEBIT_AMOUNT_PATTERNS else CREDIT_AMOUNT_PATTERNS

        for (pattern in primaryPatterns) {
            val mt = pattern.find(text)
            if (mt != null && mt.groupValues.size > 1) {
                val value = toPaise(mt.groupValues[1])
                if (value != null && !balanceValues.contains(value)) {
                    // Check non-currency units following the match
                    val endIdx = mt.range.last + 1
                    val remaining = text.substring(endIdx.coerceAtMost(text.length))
                    if (!NON_CURRENCY_UNITS.containsMatchIn(remaining)) {
                        return value
                    }
                }
            }
        }

        // 3. Secondary direction patterns
        for (pattern in secondaryPatterns) {
            val mt = pattern.find(text)
            if (mt != null && mt.groupValues.size > 1) {
                val value = toPaise(mt.groupValues[1])
                if (value != null && !balanceValues.contains(value)) {
                    val endIdx = mt.range.last + 1
                    val remaining = text.substring(endIdx.coerceAtMost(text.length))
                    if (!NON_CURRENCY_UNITS.containsMatchIn(remaining)) {
                        return value
                    }
                }
            }
        }

        // 4. Fallback strictly to CURRENCY_AMOUNT (requires ₹, Rs, INR, Rupees)
        CURRENCY_AMOUNT.findAll(text).forEach { mt ->
            val raw = mt.groupValues[1]
            val value = toPaise(raw)
            if (value != null && !balanceValues.contains(value)) {
                val endIdx = mt.range.last + 1
                val remaining = text.substring(endIdx.coerceAtMost(text.length))
                if (!NON_CURRENCY_UNITS.containsMatchIn(remaining)) {
                    return value
                }
            }
        }

        // IMPORTANT: Bare decimals (BARE_DECIMAL) are permanently eliminated here to prevent data quota leaks
        return null
    }

    private fun toPaise(raw: String): Long? {
        val cleaned = raw.replace(",", "").trim()
        val value = cleaned.toDoubleOrNull() ?: return null
        if (value <= 0.0 || value > 100_000_000_000.0) return null
        return Math.round(value * 100.0)
    }

    private fun extractReference(text: String, accountSuffix: String? = null): String? {
        for (pattern in REFERENCE_PATTERNS) {
            val mt = pattern.find(text)
            if (mt != null && mt.groupValues.size > 1) {
                val group = mt.groupValues[1].trim()
                // Never treat masked accounts or account suffix as a transaction reference
                if (isValidReference(group, accountSuffix)) {
                    return group
                }
            }
        }
        return null
    }

    private fun isValidReference(ref: String, accountSuffix: String?): Boolean {
        if (ref.length < 6 || ref.length > 30) return false
        if (Fingerprint.isMaskedAccount(ref)) return false
        if (accountSuffix != null && (ref.endsWith(accountSuffix) || ref == accountSuffix)) {
            // Check if it's purely account digits
            if (ref.all { it.isDigit() } && ref.length <= 10) return false
        }
        // UPI references are 12 digits
        val isUpiRef = ref.length == 12 && ref.all { it.isDigit() }
        if (isUpiRef) return true

        // Transaction IDs from JioPay/Telco e.g. 10005862230440 (14 digits)
        val isNumericRef = ref.length in 10..18 && ref.all { it.isDigit() }
        if (isNumericRef) return true

        // Alphanumeric transaction IDs (must contain at least one digit)
        val hasDigit = ref.any { it.isDigit() }
        return hasDigit
    }

    private fun extractExplicitDate(text: String): String? {
        for (pattern in DATE_PATTERNS) {
            val mt = pattern.find(text)
            if (mt != null && mt.groupValues.size > 1) {
                val parsed = parseIshDate(mt.groupValues[1])
                if (parsed != null) return parsed
            }
        }
        return null
    }

    private fun parseIshDate(raw: String): String? {
        val cleaned = raw.trim().replace("/", "-").replace(Regex("\\s+"), " ")
        val formats = listOf(
            "dd-MMM-yyyy",
            "dd-MMM-yy",
            "ddMMMyyyy",
            "ddMMMyy",
            "dd MMM yyyy",
            "dd MMM yy",
            "dd-MM-yyyy",
            "dd-MM-yy",
            "MM-dd-yyyy",
            "yyyy-MM-dd"
        )
        for (fmt in formats) {
            try {
                val f = SimpleDateFormat(fmt, Locale.ENGLISH)
                f.isLenient = false
                val d = f.parse(cleaned) ?: continue
                val cal = Calendar.getInstance()
                cal.time = d
                val year = cal.get(Calendar.YEAR)
                if (year in 1..99) {
                    cal.set(Calendar.YEAR, year + 2000)
                }
                return SimpleDateFormat("yyyy-MM-dd", Locale.ENGLISH).format(cal.time)
            } catch (_: Exception) {
                // try next format
            }
        }
        return null
    }

    private fun extractMerchant(text: String, sender: String?): String? {
        // 1. Merchant from body takes priority
        val bodyMerchant = extractMerchantFromBody(text)
        if (bodyMerchant != null) return bodyMerchant

        // 2. Fall back to sender identification
        return sender?.takeIf { it.isNotBlank() }?.let { s ->
            val upper = s.uppercase()
            when {
                upper.contains("JIO") -> "Jio"
                upper.contains("ICICI") -> "ICICI Bank"
                upper.contains("HDFC") -> "HDFC Bank"
                upper.contains("AXIS") -> "Axis Bank"
                upper.contains("SBI") -> "SBI Bank"
                upper.contains("PAYTM") -> "Paytm"
                upper.contains("PHONEPE") || upper.contains("PHONE PE") -> "PhonePe"
                upper.contains("GOOGLE") || upper.contains("GPA") -> "Google Pay"
                upper.contains("AMAZON") -> "Amazon"
                upper.contains("FLIPKART") -> "Flipkart"
                upper.contains("SDCCB") || upper.contains("SDCCBL") -> "Salem Central Co-op Bank"
                else -> null
            }
        }
    }

    private fun extractMerchantFromBody(text: String): String? {
        // Check UPI VPA handle e.g. "to VPA swiggy@icici"
        val vpaRegex = Regex("(?i)(?:to\\s+(?:vpa\\s+)?|vpa\\s*[:=]?\\s*)([a-zA-Z0-9._-]+)@[a-zA-Z0-9]+")
        val vpaMatch = vpaRegex.find(text)
        if (vpaMatch != null) {
            val handle = vpaMatch.groupValues[1]
            val cleaned = cleanMerchantCandidate(handle)
            if (cleaned != null) return cleaned
        }

        // Check Info: BIL*<merchant>
        val bilRegex = Regex("(?i)(?:info\\s*[:=]?\\s*)?bil\\*([A-Za-z0-9 .&'-]+)")
        val bilMatch = bilRegex.find(text)
        if (bilMatch != null) {
            val cleaned = cleanMerchantCandidate(bilMatch.groupValues[1])
            if (cleaned != null) return cleaned
        }

        // Check explicit merchant label
        val labelRegex = Regex("(?i)(?:merchant|vendor)\\s*[:=]?\\s*([A-Za-z0-9 .&'-]{2,35})")
        val labelMatch = labelRegex.find(text)
        if (labelMatch != null) {
            val cleaned = cleanMerchantCandidate(labelMatch.groupValues[1])
            if (cleaned != null) return cleaned
        }

        // Check "at <Merchant>", "at POS <Merchant>"
        val atRegex = Regex("(?i)\\bat\\s+(?:pos\\s+)?([A-Za-z0-9 .&'-]{2,35})")
        val atMatch = atRegex.find(text)
        if (atMatch != null) {
            val cleaned = cleanMerchantCandidate(atMatch.groupValues[1])
            if (cleaned != null) return cleaned
        }

        // Check "transfer to <Merchant>", "paid to <Merchant>"
        val actionRegex = Regex("(?i)(?:paid\\s+to|transfer\\s+to|transferred\\s+to|sent\\s+to|spent\\s+at)\\s+([A-Za-z0-9 .&'-]{2,35})")
        val actionMatch = actionRegex.find(text)
        if (actionMatch != null) {
            val cleaned = cleanMerchantCandidate(actionMatch.groupValues[1])
            if (cleaned != null) return cleaned
        }

        // Check generic "to <CapitalizedMerchant>"
        val toRegex = Regex("(?i)\\bto\\s+([A-Z][A-Za-z0-9 .&'-]{2,35})")
        val toMatch = toRegex.find(text)
        if (toMatch != null) {
            val cleaned = cleanMerchantCandidate(toMatch.groupValues[1])
            if (cleaned != null) return cleaned
        }

        return null
    }

    private fun cleanMerchantCandidate(raw: String): String? {
        var candidate = raw.trim()
        val delimIdx = candidate.indexOfAny(charArrayOf('.', ',', ';', ':', '\n', '\r'))
        if (delimIdx >= 0) {
            candidate = candidate.substring(0, delimIdx).trim()
        }
        val stopwordRegex = Regex("(?i)\\s+(?:on|dated?|date|ref|reference|txn|txnid|using|via|through|for|bal|avail|val|a/c|account|card|vpa|upi|ending)\\b.*")
        candidate = stopwordRegex.replace(candidate, "").trim()
        candidate = candidate.trim { !it.isLetterOrDigit() }

        if (candidate.length < 2 || candidate.length > 40) return null

        val lower = candidate.lowercase()
        val ignored = setOf(
            "account", "acct", "your account", "bank", "card", "vpa", "upi",
            "transfer", "payment", "txn", "ref", "balance", "avail bal", "cash", "atm",
            "inr", "rs", "self", "another", "beneficiary", "not debited"
        )
        if (ignored.contains(lower) || ignored.any { lower.startsWith("$it ") }) return null

        return formatMerchantName(candidate)
    }

    private fun formatMerchantName(name: String): String {
        val hasUpper = name.any { it.isUpperCase() }
        val hasLower = name.any { it.isLowerCase() }
        if (hasUpper && hasLower) return name
        return name.split(" ")
            .filter { it.isNotBlank() }
            .joinToString(" ") { word ->
                word.lowercase().replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ENGLISH) else it.toString() }
            }
    }

    private fun extractAvailableBalance(text: String): Long? {
        val mt = BALANCE_AMOUNT_REGEX.find(text)
        if (mt != null && mt.groupValues.size > 1) {
            return toPaise(mt.groupValues[1])
        }
        return null
    }

    private fun extractAccountSuffix(text: String): String? {
        for (pattern in ACCOUNT_SUFFIX_PATTERNS) {
            val mt = pattern.find(text)
            if (mt != null && mt.groupValues.size > 1) {
                val digits = mt.groupValues[1].trim()
                if (digits.length >= 4) {
                    return digits.takeLast(4)
                } else if (digits.length == 3) {
                    return digits
                }
            }
        }
        return null
    }

    private fun resolveBankName(text: String, sender: String?): String? {
        val combined = "${sender ?: ""} $text".uppercase()
        return when {
            combined.contains("HDFC") -> "HDFC Bank"
            combined.contains("ICICI") -> "ICICI Bank"
            combined.contains("SBI") || combined.contains("STATE BANK") -> "State Bank of India"
            combined.contains("AXIS") -> "Axis Bank"
            combined.contains("KOTAK") -> "Kotak Mahindra Bank"
            combined.contains("PNB") || combined.contains("PUNJAB") -> "Punjab National Bank"
            combined.contains("BOB") || combined.contains("BARODA") -> "Bank of Baroda"
            combined.contains("CANARA") || combined.contains("CNRB") -> "Canara Bank"
            combined.contains("UNION") || combined.contains("UBIN") -> "Union Bank of India"
            combined.contains("IDBI") -> "IDBI Bank"
            combined.contains("INDUSIND") || combined.contains("INDB") -> "IndusInd Bank"
            combined.contains("YES") || combined.contains("YESB") -> "Yes Bank"
            combined.contains("FEDERAL") || combined.contains("FDRL") -> "Federal Bank"
            combined.contains("PAYTM") || combined.contains("PYTM") -> "Paytm Payments Bank"
            combined.contains("AIRTEL") || combined.contains("ATMP") -> "Airtel Payments Bank"
            combined.contains("JIO") -> "Jio Payments Bank"
            combined.contains("SDCCB") || combined.contains("SDCCBL") -> "Salem District Central Co-operative Bank"
            else -> null
        }
    }

    fun classifyTransaction(
        text: String,
        status: TxnStatus,
        amount: Long?,
        reference: String?,
        sender: String?
    ): FinancialTxnType {
        val lower = text.lowercase()
        val s = (sender ?: "").lowercase()

        if (status == TxnStatus.FAILED) return FinancialTxnType.FAILED_TRANSACTION
        if (status == TxnStatus.REVERSAL) return FinancialTxnType.REVERSAL

        // Balance-only notification
        if (amount == null && BALANCE_KEYWORDS.any { lower.contains(it) }) {
            return FinancialTxnType.BALANCE_NOTIFICATION
        }

        // Telecom recharge
        if (lower.contains("recharge") || lower.contains("ரீசார்ஜ்") || (s.contains("jiopay") && lower.contains("plan"))) {
            return FinancialTxnType.RECHARGE
        }

        // ATM cash withdrawal
        if (lower.contains("atm") || lower.contains("cash withdrawal")) {
            return FinancialTxnType.ATM_WITHDRAWAL
        }

        // Card payment / POS
        if (lower.contains("pos") || lower.contains("card") || lower.contains("swiped")) {
            return FinancialTxnType.CARD_PAYMENT
        }

        // IMPS / NEFT / RTGS
        if (lower.contains("imps")) return FinancialTxnType.IMPS
        if (lower.contains("neft")) return FinancialTxnType.NEFT
        if (lower.contains("rtgs")) return FinancialTxnType.RTGS

        // UPI Debit / Credit
        val isUpi = lower.contains("upi") || lower.contains("vpa") || (reference != null && reference.length == 12 && reference.all { it.isDigit() })
        if (isUpi) {
            return if (status == TxnStatus.CREDIT) FinancialTxnType.UPI_CREDIT else FinancialTxnType.UPI_DEBIT
        }

        // Bank Debit / Credit
        if (status == TxnStatus.CREDIT) return FinancialTxnType.BANK_CREDIT
        if (status == TxnStatus.DEBIT) return FinancialTxnType.BANK_DEBIT

        return FinancialTxnType.AMBIGUOUS_REVIEW
    }

    private fun resolvePaymentChannel(text: String, classification: FinancialTxnType): String {
        return when (classification) {
            FinancialTxnType.UPI_DEBIT, FinancialTxnType.UPI_CREDIT -> "UPI"
            FinancialTxnType.ATM_WITHDRAWAL -> "ATM"
            FinancialTxnType.CARD_PAYMENT -> "CARD"
            FinancialTxnType.IMPS -> "IMPS"
            FinancialTxnType.NEFT -> "NEFT"
            FinancialTxnType.RTGS -> "RTGS"
            FinancialTxnType.RECHARGE -> "RECHARGE"
            FinancialTxnType.BANK_DEBIT, FinancialTxnType.BANK_CREDIT -> "BANK"
            else -> "OTHER"
        }
    }

    private fun suggestCategory(status: TxnStatus, merchant: String?, text: String): String? {
        val lower = text.lowercase()
        val m = (merchant ?: "").lowercase()

        if (status == TxnStatus.CREDIT) {
            return when {
                lower.contains("salary") -> "Salary"
                lower.contains("cashback") || lower.contains("cash back") -> "Cashback"
                lower.contains("refund") || lower.contains("reversal") -> "Refund"
                lower.contains("interest") -> "Interest"
                lower.contains("freelance") || lower.contains("upwork") || lower.contains("fiverr") -> "Freelance"
                lower.contains("gift") -> "Gift"
                lower.contains("deposit") || lower.contains("cash deposit") -> "Cash Deposit"
                else -> "Other Income"
            }
        }

        if (status != TxnStatus.DEBIT && status != TxnStatus.PENDING) return null

        // Mobile Recharge
        if (lower.contains("recharge") || lower.contains("ரீசார்ஜ்") || lower.contains("top up") ||
            m.contains("jio") || m.contains("airtel") || m.contains("vi") || m.contains("bsnl")
        ) {
            return "Mobile Recharge"
        }

        // Groceries
        if (m.contains("blinkit") || m.contains("zepto") || m.contains("instamart") ||
            m.contains("bigbasket") || m.contains("dunzo") ||
            lower.contains("blinkit") || lower.contains("zepto") || lower.contains("instamart") ||
            lower.contains("bigbasket") || lower.contains("grocery") || lower.contains("supermarket")
        ) {
            return "Groceries"
        }

        // Food & Dining
        if (m.contains("swiggy") || m.contains("zomato") || m.contains("eats") ||
            m.contains("restaurant") || m.contains("cafe") || m.contains("bakery") ||
            lower.contains("swiggy") || lower.contains("zomato") || lower.contains("food")
        ) {
            return "Food"
        }

        // Transport
        if (m.contains("uber") || m.contains("ola") || m.contains("rapido") ||
            m.contains("irctc") || m.contains("metro") || m.contains("railways") ||
            lower.contains("uber") || lower.contains("ola") || lower.contains("rapido")
        ) {
            return "Transport"
        }

        // Fuel
        if (m.contains("hpcl") || m.contains("bpcl") || m.contains("iocl") ||
            m.contains("petrol") || m.contains("shell") || m.contains("fuel") ||
            lower.contains("petrol") || lower.contains("hpcl") || lower.contains("bpcl") ||
            lower.contains("iocl") || lower.contains("fuel pump") || lower.contains("diesel")
        ) {
            return "Fuel"
        }

        // Shopping
        if (m.contains("amazon") || m.contains("flipkart") || m.contains("myntra") ||
            m.contains("ajio") || m.contains("meesho") ||
            lower.contains("amazon") || lower.contains("flipkart") || lower.contains("myntra")
        ) {
            return "Shopping"
        }

        // Utilities
        if (m.contains("bescom") || m.contains("electricity") || m.contains("billdesk") ||
            m.contains("broadband") || m.contains("gas") ||
            lower.contains("bescom") || lower.contains("electricity") || lower.contains("water bill")
        ) {
            return "Utilities"
        }

        // Entertainment: BookMyShow, PVR, INOX, Netflix, Spotify, Prime Video, Hotstar, movies
        if (m.contains("bookmyshow") || m.contains("pvr") || m.contains("inox") ||
            m.contains("netflix") || m.contains("spotify") || m.contains("hotstar") ||
            lower.contains("bookmyshow") || lower.contains("pvr") || lower.contains("cinema") ||
            lower.contains("netflix") || lower.contains("spotify") || lower.contains("movie")
        ) {
            return "Entertainment"
        }

        // Health: Pharmacy, medical, hospital, clinic, Apollo, Netmeds, 1mg, Practo
        if (m.contains("medical") || m.contains("pharmacy") || m.contains("apollo") ||
            m.contains("netmeds") || m.contains("1mg") || m.contains("practo") ||
            lower.contains("hospital") || lower.contains("clinic") || lower.contains("pharmacy") ||
            lower.contains("medicine") || lower.contains("diagnostic")
        ) {
            return "Health"
        }

        // Bus Travel
        if (m.contains("bus") || lower.contains("bus") || lower.contains("redbus") ||
            m.contains("redbus") || m.contains("travel") || lower.contains("travel")
        ) {
            return "Bus Travel"
        }

        return null
    }

    private fun buildNote(status: TxnStatus, reference: String?): String? {
        val parts = mutableListOf<String>()
        if (reference != null) parts.add("ref: $reference")
        parts.add("sms-status: ${status.name.lowercase()}")
        return parts.joinToString("; ")
    }

    private fun evidenceSummary(
        text: String,
        amount: Long?,
        reference: String?,
        date: String?,
        sender: String?,
    ): String {
        val parts = mutableListOf<String>()
        if (amount != null) parts.add("amount=${formatInr(amount)}")
        if (reference != null) parts.add("ref=$reference")
        if (date != null) parts.add("date=$date")
        if (sender != null) parts.add("sender=$sender")
        val preview = text.take(120).replace(Regex("\\s+"), " ")
        parts.add("preview=\"$preview\"")
        return parts.joinToString("; ")
    }

    private fun formatInr(paise: Long): String {
        val negative = paise < 0
        val whole = Math.abs(paise / 100)
        val fraction = Math.abs(paise % 100)
        val digits = whole.toString()
        val grouped = if (digits.length > 3) {
            val lastThree = digits.substring(digits.length - 3)
            var rest = digits.substring(0, digits.length - 3)
            val groups = mutableListOf<String>()
            while (rest.length > 2) {
                groups.add(0, rest.substring(rest.length - 2))
                rest = rest.substring(0, rest.length - 2)
            }
            if (rest.isNotEmpty()) groups.add(0, rest)
            (groups + lastThree).joinToString(",")
        } else digits
        return "${if (negative) "-" else ""}₹$grouped.${String.format("%02d", fraction)}"
    }
}
