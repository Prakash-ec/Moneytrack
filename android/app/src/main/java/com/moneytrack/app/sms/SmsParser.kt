package com.moneytrack.app.sms

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Deterministic SMS transaction parser. No LLM is involved in eligibility decisions.
 */
object SmsParser {

    // ---------------------------------------------------------------- status
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
        "otp", "one time password", "verification code", "verify", "verifying", "authenticate", "login code", "your otp is",
    )
    private val PROMO_KEYWORDS = listOf(
        "promo", "promotion", "offer", "discount", "cashback offer", "lucky", "winner",
        "won", "click here", "unsubscribe", "market", "advertisement", "flat 50% off",
    )
    private val BALANCE_KEYWORDS = listOf("balance", "avail bal", "available bal", "ac bal", "current balance")
    private val NO_DEBIT_EVIDENCE = listOf("no debit", "no amount debited", "not debited", "amount not debited")

    // ---------------------------------------------------------------- amount
    // Matches explicit balance clauses like "Avail Bal: Rs. 15,200.00", "Bal INR 8,900.00", "ac bal: 5000"
    private val BALANCE_AMOUNT_REGEX = Regex(
        "(?i)(?:avail(?:able)?\\s*bal(?:ance)?|ac(?:count)?\\s*bal(?:ance)?|a/c\\s*bal(?:ance)?|bal(?:ance)?\\s*(?:is|:|=)|current\\s*bal(?:ance)?|cleared\\s*bal(?:ance)?)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})"
    )

    // Debit amount patterns that explicitly associate an amount with a debit / spend / payment action
    private val DEBIT_AMOUNT_PATTERNS = listOf(
        // debited by / with / for Rs. 450.00 or spent Rs 450.00 or paid Rs 450.00 or purchase of INR 500
        Regex("(?i)(?:debited\\s*(?:by|with|for)?|spent|paid|purchase(?:\\s*of)?|charged|withdrawn?|deducted)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})"),
        // Rs. 450.00 debited / spent / paid / deducted
        Regex("(?i)(?:₹|rs\\.?|inr|rupees?)\\s*([0-9][0-9,]*\\.?[0-9]{0,2})\\s*(?:is|has been|was)?\\s*(?:debited|spent|paid|deducted|transferred)"),
        // txn amount / plan name / amount : 19.00
        Regex("(?i)(?:txn\\s*amount|transaction\\s*amount|plan\\s*name|total\\s*amount|amount)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})")
    )

    // Credit amount patterns that associate an amount with an inflow / credit / received action
    private val CREDIT_AMOUNT_PATTERNS = listOf(
        Regex("(?i)(?:credited\\s*(?:by|with|for|to)?|received|refund(?:ed)?|cashback\\s*(?:of)?|deposited)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})"),
        Regex("(?i)(?:₹|rs\\.?|inr|rupees?)\\s*([0-9][0-9,]*\\.?[0-9]{0,2})\\s*(?:is|has been|was)?\\s*(?:credited|received|deposited|refunded)"),
        Regex("(?i)(?:salary\\s*(?:of)?)\\s*[:=]?\\s*(?:₹|rs\\.?|inr|rupees?)?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})")
    )

    private val ACCOUNT_SUFFIX_PATTERNS = listOf(
        Regex("(?i)(?:a/c|acct?|account|card)\\s*(?:no\\.?)?\\s*(?:ending\\s*(?:with)?)?\\s*[:=]?\\s*[*Xx]*([0-9]{3,4})\\b"),
        Regex("(?i)\\b[*Xx]{2,}([0-9]{3,4})\\b"),
        Regex("(?i)(?:from|to|in)\\s+(?:a/c|account)\\s*[*Xx]*([0-9]{3,4})\\b")
    )

    private val CURRENCY_AMOUNT = Regex(
        "(?i)(?:₹|rs\\.?|inr|rupees?)\\s*([0-9][0-9,]*\\.?[0-9]{0,2})"
    )
    private val AMOUNT_AFTER_LABEL = Regex(
        "(?i)(?:amount|txn amount|plan\\s*name|total|rs|₹|inr)\\s*[:=]?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})"
    )
    private val BARE_AMOUNT = Regex(
        "(?<!\\d)([0-9]{1,3}(?:,[0-9]{3})+\\.?[0-9]{0,2})(?!\\d)"
    )
    private val BARE_DECIMAL = Regex(
        "(?<!\\d)([0-9]+\\.[0-9]{1,2})(?!\\d)"
    )

    // ---------------------------------------------------------------- reference
    private val REFERENCE_PATTERNS = listOf(
        Regex("(?i)(?:transaction\\s*(?:id|no|number)|txn\\s*(?:id|no)|txnid|reference|ref)\\s*[:=]?\\s*([A-Za-z0-9]{4,})"),
        Regex("(?i)(?:upi\\s*(?:ref|reference|id)|upi\\s*txn)\\s*[:=]?\\s*([A-Za-z0-9]{4,})"),
        Regex("\\b([A-Z]{2,}[0-9]{6,})\\b"),
    )

    // ---------------------------------------------------------------- dates
    private val DATE_PATTERNS = listOf(
        // Preceded by keyword: on, date, dated, at
        // Matches e.g. "on 28-OCT-26", "on 28-Oct-2026", "on 28Oct26", "on 28 Oct 2026", "on 15-10-2026", "on 15/10/2026"
        Regex("(?i)(?:date|dated|on|at)\\s*[:=]?\\s*([0-9]{1,2}(?:[-/\\s][A-Za-z]{3,9}[-/\\s]|[A-Za-z]{3,9}|[-/][0-9]{1,2}[-/]|\\s+[A-Za-z]{3,9}\\s+)[0-9]{2,4})"),
        // Numeric date with on/date/at: on 15-10-2026 or 15/10/2026
        Regex("(?i)(?:date|dated|on|at)\\s*[:=]?\\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})"),
        // Standalone textual month: 28-OCT-26, 28-Oct-2026, 28Oct26, 28 Oct 2026
        Regex("(?i)\\b([0-9]{1,2}(?:[-/\\s]?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\\s]?)[0-9]{2,4})\\b"),
        // Standalone numeric date: 15-10-2026, 2026-10-28
        Regex("(?i)\\b([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})\\b"),
        Regex("(?i)\\b([0-9]{4}-[0-9]{2}-[0-9]{2})\\b")
    )

    fun parse(
        body: String?,
        sender: String?,
        timestampMs: Long?,
    ): ParsedTransaction {
        val text = body ?: ""
        val normalized = normalize(text)

        val status = detectStatus(normalized)
        val amount = extractAmount(normalized, status)
        val reference = extractReference(normalized)
        val explicitDate = extractExplicitDate(normalized)
        val merchant = extractMerchant(normalized, sender)
        val category = suggestCategory(status, merchant, normalized)
        val note = buildNote(status, reference)
        val availableBalance = extractAvailableBalance(normalized)
        val accountSuffix = extractAccountSuffix(normalized)
        val bankName = resolveBankName(normalized, sender)

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
        )
    }

    private fun normalize(text: String): String {
        return text.replace("\u00A0", " ").replace("\u200B", "").replace(Regex("\\s+"), " ").trim()
    }

    private fun detectStatus(text: String): TxnStatus {
        val lower = text.lowercase()
        if (OTP_KEYWORDS.any { lower.contains(it) }) return TxnStatus.UNKNOWN
        if (PROMO_KEYWORDS.any { lower.contains(it) }) return TxnStatus.UNKNOWN
        if (NO_DEBIT_EVIDENCE.any { lower.contains(it) }) return TxnStatus.FAILED
        if (REVERSAL_KEYWORDS.any { lower.contains(it) }) return TxnStatus.REVERSAL
        if (FAILED_KEYWORDS.any { lower.contains(it) }) return TxnStatus.FAILED
        if (CREDIT_KEYWORDS.any { lower.contains(it) }) return TxnStatus.CREDIT
        if (PENDING_KEYWORDS.any { lower.contains(it) }) return TxnStatus.PENDING
        if (DEBIT_SUCCESS_KEYWORDS.any { lower.contains(it) }) return TxnStatus.DEBIT
        return TxnStatus.UNKNOWN
    }

    private fun extractAmount(text: String, status: TxnStatus = TxnStatus.UNKNOWN): Long? {
        val lower = text.lowercase()
        if (OTP_KEYWORDS.any { lower.contains(it) }) return null
        if (PROMO_KEYWORDS.any { lower.contains(it) }) return null

        val isBalanceOnly = BALANCE_KEYWORDS.any { lower.contains(it) } &&
            !listOf("debited", "spent", "purchase", "paid", "recharged", "credited", "received", "refund", "salary", "cashback").any { lower.contains(it) }
        if (isBalanceOnly) return null

        // Collect all balance amounts mentioned in the SMS so they are never picked as transaction amount
        val balanceMatches = BALANCE_AMOUNT_REGEX.findAll(text).toList()
        val balanceValues = balanceMatches.mapNotNull { toPaise(it.groupValues[1]) }.toSet()

        val primaryPatterns = if (status == TxnStatus.CREDIT) CREDIT_AMOUNT_PATTERNS else DEBIT_AMOUNT_PATTERNS
        val secondaryPatterns = if (status == TxnStatus.CREDIT) DEBIT_AMOUNT_PATTERNS else CREDIT_AMOUNT_PATTERNS

        // 1. Prioritize primary patterns (credit or debit matching the detected status)
        for (pattern in primaryPatterns) {
            val mt = pattern.find(text)
            if (mt != null && mt.groupValues.size > 1) {
                val value = toPaise(mt.groupValues[1])
                if (value != null && !balanceValues.contains(value)) {
                    return value
                }
            }
        }

        // 2. Fall back to secondary patterns if primary patterns didn't match
        for (pattern in secondaryPatterns) {
            val mt = pattern.find(text)
            if (mt != null && mt.groupValues.size > 1) {
                val value = toPaise(mt.groupValues[1])
                if (value != null && !balanceValues.contains(value)) {
                    return value
                }
            }
        }

        // 2. Collect general candidates excluding known balance amounts
        val candidates = mutableListOf<Pair<Long, String>>()

        CURRENCY_AMOUNT.findAll(text).forEach { mt ->
            val raw = mt.groupValues[1]
            val value = toPaise(raw)
            if (value != null && !balanceValues.contains(value)) {
                candidates.add(Pair(value, "currency"))
            }
        }
        AMOUNT_AFTER_LABEL.findAll(text).forEach { mt ->
            val raw = mt.groupValues[1]
            val value = toPaise(raw)
            if (value != null && !balanceValues.contains(value)) {
                candidates.add(Pair(value, "label"))
            }
        }
        BARE_AMOUNT.findAll(text).forEach { mt ->
            val raw = mt.groupValues[1].replace(",", "")
            val value = (raw.toDoubleOrNull() ?: 0.0) * 100.0
            if (value > 0.0 && value <= 100_000_000_000_000.0) {
                val rounded = Math.round(value)
                if (!balanceValues.contains(rounded)) {
                    candidates.add(Pair(rounded, "bare"))
                }
            }
        }
        BARE_DECIMAL.findAll(text).forEach { mt ->
            val raw = mt.groupValues[1]
            val value = (raw.toDoubleOrNull() ?: 0.0) * 100.0
            if (value > 0.0 && value <= 100_000_000_000_000.0) {
                val rounded = Math.round(value)
                if (!balanceValues.contains(rounded)) {
                    candidates.add(Pair(rounded, "decimal"))
                }
            }
        }

        if (candidates.isEmpty()) return null

        val marked = candidates.filter { it.second == "currency" || it.second == "label" }
        return if (marked.isNotEmpty()) marked.first().first
        else candidates.first().first
    }

    private fun toPaise(raw: String): Long? {
        val cleaned = raw.replace(",", "").trim()
        val value = cleaned.toDoubleOrNull() ?: return null
        if (value <= 0.0 || value > 100_000_000_000.0) return null
        return Math.round(value * 100.0)
    }

    private fun extractReference(text: String): String? {
        for (pattern in REFERENCE_PATTERNS) {
            val mt = pattern.find(text)
            if (mt != null && mt.groupValues.size > 1) {
                val group = mt.groupValues[1]
                if (group.isNotEmpty()) return group.trim()
            }
        }
        return null
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
        // 1. Merchant from body takes priority over bank sender ID
        val bodyMerchant = extractMerchantFromBody(text)
        if (bodyMerchant != null) return bodyMerchant

        // 2. Fall back to sender identification if no merchant mentioned in body
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
                else -> null
            }
        }
    }

    private fun extractMerchantFromBody(text: String): String? {
        // Check UPI VPA handle e.g. "to VPA swiggy@icici", "to swiggy@icici", "vpa swiggy@icici"
        val vpaRegex = Regex("(?i)(?:to\\s+(?:vpa\\s+)?|vpa\\s*[:=]?\\s*)([a-zA-Z0-9._-]+)@[a-zA-Z0-9]+")
        val vpaMatch = vpaRegex.find(text)
        if (vpaMatch != null) {
            val handle = vpaMatch.groupValues[1]
            val cleaned = cleanMerchantCandidate(handle)
            if (cleaned != null) return cleaned
        }

        // Check Info: BIL*<merchant> (common in ICICI/HDFC cards e.g. "Info: BIL*ZOMATO")
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

        // Check "at <Merchant>", "at POS <Merchant>" e.g. "at SWIGGY", "at AMAZON INDIA"
        val atRegex = Regex("(?i)\\bat\\s+(?:pos\\s+)?([A-Za-z0-9 .&'-]{2,35})")
        val atMatch = atRegex.find(text)
        if (atMatch != null) {
            val cleaned = cleanMerchantCandidate(atMatch.groupValues[1])
            if (cleaned != null) return cleaned
        }

        // Check "transfer to <Merchant>", "paid to <Merchant>", "spent at <Merchant>"
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
        // Truncate before stop words
        val stopwordRegex = Regex("(?i)\\s+(?:on|dated?|date|ref|reference|txn|txnid|using|via|through|for|bal|avail|val|a/c|account|card|vpa|upi|ending)\\b.*")
        candidate = stopwordRegex.replace(candidate, "").trim()

        // Strip leading/trailing non-alphanumeric chars
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
        if (hasUpper && hasLower) {
            return name
        }
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
                if (digits.length in 3..4) {
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
            else -> null
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

        // Groceries: Blinkit, Zepto, Instamart, BigBasket, supermarkets, provisions
        if (m.contains("blinkit") || m.contains("zepto") || m.contains("instamart") ||
            m.contains("bigbasket") || m.contains("dunzo") ||
            lower.contains("blinkit") || lower.contains("zepto") || lower.contains("instamart") ||
            lower.contains("bigbasket") || lower.contains("grocery") || lower.contains("supermarket") ||
            lower.contains("ration") || lower.contains("provisions")
        ) {
            return "Groceries"
        }

        // Food & Dining: Swiggy, Zomato, restaurants, cafes, food delivery
        if (m.contains("swiggy") || m.contains("zomato") || m.contains("eats") ||
            m.contains("restaurant") || m.contains("cafe") || m.contains("bakery") ||
            lower.contains("swiggy") || lower.contains("zomato") || lower.contains("food") ||
            lower.contains("restaurant") || lower.contains("dining")
        ) {
            return "Food"
        }

        // Transport: Uber, Ola, Rapido, IRCTC, metro, rail, cabs
        if (m.contains("uber") || m.contains("ola") || m.contains("rapido") ||
            m.contains("irctc") || m.contains("metro") || m.contains("railways") ||
            lower.contains("uber") || lower.contains("ola") || lower.contains("rapido") ||
            lower.contains("irctc") || lower.contains("metro")
        ) {
            return "Transport"
        }

        // Bus Travel (preserve existing MoneyTrack category)
        if (m.contains("bus") || lower.contains("bus") || lower.contains("redbus") ||
            m.contains("redbus") || m.contains("travel") || lower.contains("travel")
        ) {
            return "Bus Travel"
        }

        // Fuel: HPCL, BPCL, IOCL, petrol, diesel, shell, fuel
        if (m.contains("hpcl") || m.contains("bpcl") || m.contains("iocl") ||
            m.contains("petrol") || m.contains("shell") || m.contains("fuel") ||
            lower.contains("petrol") || lower.contains("hpcl") || lower.contains("bpcl") ||
            lower.contains("iocl") || lower.contains("fuel pump") || lower.contains("diesel")
        ) {
            return "Fuel"
        }

        // Shopping: Amazon, Flipkart, Myntra, Ajio, Meesho, retail
        if (m.contains("amazon") || m.contains("flipkart") || m.contains("myntra") ||
            m.contains("ajio") || m.contains("meesho") || m.contains("tatacliq") ||
            lower.contains("amazon") || lower.contains("flipkart") || lower.contains("myntra") ||
            lower.contains("ajio") || lower.contains("meesho")
        ) {
            return "Shopping"
        }

        // Mobile Recharge & Data: Jio, Airtel, Vi, Vodafone, BSNL, recharge, data packs
        if (m.contains("jio") || m.contains("airtel") || m.contains("vodafone") ||
            m.contains("vi") || m.contains("bsnl") || lower.contains("recharge") ||
            lower.contains("top up") || m.contains("prepaid") || lower.contains("data pack")
        ) {
            return "Mobile Recharge"
        }

        // Utilities: BESCOM, electricity, water, gas, broadband, piped gas, electricity bill
        if (m.contains("bescom") || m.contains("electricity") || m.contains("billdesk") ||
            m.contains("broadband") || m.contains("gas") || lower.contains("bescom") ||
            lower.contains("electricity") || lower.contains("water bill") || lower.contains("utility") ||
            lower.contains("power") || lower.contains("piped gas")
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
