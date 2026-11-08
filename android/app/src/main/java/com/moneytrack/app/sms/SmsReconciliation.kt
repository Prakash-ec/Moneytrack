package com.moneytrack.app.sms

import kotlin.math.abs

/**
 * Intelligent 4-layer SMS transaction reconciliation engine.
 *
 * Layer A: Exact duplicate detection (same normalized text, sender, and timestamp).
 * Layer B: Transaction reference matching (same UPI UTR, RRN, or bank transaction ID).
 * Layer C: Intra-bank dual notification reconciliation (reconciles CBS balance notification
 *          with UPI debit alert for same bank, account suffix, direction, exact amount, and date).
 * Layer D: Cross-source recharge reconciliation (reconciles telecom recharge confirmation
 *          with bank debit notification for the same payment).
 */
object SmsReconciliation {

    data class ReconciliationOutcome(
        /** Whether the incoming record should be dropped as an exact duplicate */
        val isExactDuplicate: Boolean,
        /** The existing record to update/enrich, if reconciled */
        val matchedRecord: TransactionRecord?,
        /** Updated version of the existing record with enriched metadata */
        val enrichedRecord: TransactionRecord?,
        /** Explanation for the audit trail */
        val reason: String?,
        /** Layer that matched: A, B, C, D or null */
        val matchedLayer: String?
    )

    fun reconcile(
        candidate: TransactionRecord,
        existingQueue: List<TransactionRecord>
    ): ReconciliationOutcome {
        val incoming = candidate.parsed
        val incomingAmount = incoming.amountPaise

        // If candidate is not financial or has no amount, no need to reconcile
        if (incomingAmount == null || incomingAmount <= 0) {
            return ReconciliationOutcome(false, null, null, null, null)
        }

        // --- LAYER A: Exact SMS Duplicate Detection ---
        val incomingHash = incoming.rawHash ?: Fingerprint.exactSmsHash(
            incoming.sender, incoming.timestampMs, incoming.evidence ?: ""
        )
        val exactMatch = existingQueue.find { existing ->
            existing.id == candidate.id ||
            (existing.parsed.rawHash != null && existing.parsed.rawHash == incomingHash)
        }
        if (exactMatch != null) {
            return ReconciliationOutcome(
                isExactDuplicate = true,
                matchedRecord = exactMatch,
                enrichedRecord = null,
                reason = "Exact duplicate of existing transaction ${exactMatch.id}",
                matchedLayer = "A"
            )
        }

        // --- LAYER B: Transaction Reference Matching (UPI Ref / RRN / UTR) ---
        val cleanRef = incoming.reference?.trim()?.takeIf { it.isNotBlank() && !Fingerprint.isMaskedAccount(it) }
        if (cleanRef != null) {
            val refMatch = existingQueue.find { existing ->
                val exRef = existing.parsed.reference?.trim()
                val sameRef = exRef != null && !Fingerprint.isMaskedAccount(exRef) &&
                    exRef.equals(cleanRef, ignoreCase = true)
                val sameAmount = existing.parsed.amountPaise == null || existing.parsed.amountPaise == incomingAmount
                sameRef && sameAmount
            }
            if (refMatch != null) {
                val merged = mergeRecords(refMatch, candidate, "Layer B: Matching transaction reference $cleanRef")
                return ReconciliationOutcome(
                    isExactDuplicate = true,
                    matchedRecord = refMatch,
                    enrichedRecord = merged,
                    reason = "Reconciled via transaction reference $cleanRef",
                    matchedLayer = "B"
                )
            }
        }

        // --- LAYER C: SDCCBL / Bank Dual-Notification Reconciliation (UPI + CBS) ---
        // Match when: same bank, same account suffix, same direction (DEBIT or CREDIT),
        // exact same amount, same date, within a narrow time window.
        val bankName = incoming.bankName ?: Fingerprint.normalizeSender(incoming.sender)
        val acctSuffix = incoming.accountSuffix
        val txnDate = incoming.transactionDate

        if (acctSuffix != null && txnDate != null) {
            val bankMatch = existingQueue.find { existing ->
                val ex = existing.parsed
                val exBank = ex.bankName ?: Fingerprint.normalizeSender(ex.sender)
                val sameBank = exBank.equals(bankName, ignoreCase = true) ||
                    (bankName.contains("SDCCB", ignoreCase = true) && exBank.contains("SDCCB", ignoreCase = true))
                val sameAcct = ex.accountSuffix == acctSuffix
                val sameAmount = ex.amountPaise == incomingAmount
                val sameStatus = (ex.status == incoming.status) ||
                    (ex.classification.isDebit() && incoming.classification.isDebit()) ||
                    (ex.classification.isCredit() && incoming.classification.isCredit())
                val sameDate = ex.transactionDate == txnDate

                // Timing check: if both have timestamps, verify they are within 30 minutes
                val timeDiffOk = if (ex.timestampMs != null && incoming.timestampMs != null) {
                    abs(ex.timestampMs - incoming.timestampMs) <= 30 * 60 * 1000L
                } else true

                // Reference conflict check: if both have distinct, valid references, they are different transactions
                val exRef = ex.reference?.trim()?.takeIf { it.isNotBlank() && !Fingerprint.isMaskedAccount(it) }
                val conflictingRef = cleanRef != null && exRef != null && !exRef.equals(cleanRef, ignoreCase = true)

                // Balance progression check:
                // A dual notification for the SAME transaction will either have identical balances,
                // or one notification will have a balance while the other has none (e.g. UPI alert has no balance).
                // If both notifications report balances and they differ, they represent distinct consecutive transactions!
                val balanceConflict = if (ex.availableBalancePaise != null && incoming.availableBalancePaise != null) {
                    ex.availableBalancePaise != incoming.availableBalancePaise
                } else false

                sameBank && sameAcct && sameAmount && sameStatus && sameDate && timeDiffOk && !conflictingRef && !balanceConflict
            }

            if (bankMatch != null) {
                val merged = mergeRecords(bankMatch, candidate, "Layer C: Reconciled dual bank notification (CBS + UPI)")
                return ReconciliationOutcome(
                    isExactDuplicate = true,
                    matchedRecord = bankMatch,
                    enrichedRecord = merged,
                    reason = "Reconciled with existing bank debit/credit for account $acctSuffix on $txnDate",
                    matchedLayer = "C"
                )
            }
        }

        // --- LAYER D: Cross-Source Recharge Reconciliation (JioPay/Telecom + Bank Debit) ---
        // Reconcile when a telecom recharge confirmation matches an existing bank debit for the same amount.
        val isRecharge = incoming.classification == FinancialTxnType.RECHARGE ||
            incoming.categorySuggestion?.contains("Recharge", ignoreCase = true) == true
        if (isRecharge) {
            val debitMatch = existingQueue.find { existing ->
                val ex = existing.parsed
                val isBankDebit = ex.classification == FinancialTxnType.BANK_DEBIT ||
                    ex.classification == FinancialTxnType.UPI_DEBIT ||
                    ex.status == TxnStatus.DEBIT
                val sameAmount = ex.amountPaise == incomingAmount
                val sameDate = txnDate == null || ex.transactionDate == null || ex.transactionDate == txnDate
                val timeDiffOk = if (ex.timestampMs != null && incoming.timestampMs != null) {
                    abs(ex.timestampMs - incoming.timestampMs) <= 60 * 60 * 1000L
                } else true

                isBankDebit && sameAmount && sameDate && timeDiffOk
            }

            if (debitMatch != null) {
                val enriched = debitMatch.copy(
                    parsed = debitMatch.parsed.copy(
                        merchant = incoming.merchant ?: debitMatch.parsed.merchant ?: "Jio",
                        categorySuggestion = "Mobile Recharge",
                    ),
                    reason = "Reconciled with telecom recharge confirmation: Plan ${incomingAmount / 100}"
                )
                return ReconciliationOutcome(
                    isExactDuplicate = true,
                    matchedRecord = debitMatch,
                    enrichedRecord = enriched,
                    reason = "Reconciled recharge confirmation with bank debit",
                    matchedLayer = "D"
                )
            }
        }

        // --- LAYER E: Chronological Balance Progression Validation ---
        // If an incoming record has identical amount, bank, account, and date to an existing record,
        // and both report available balances that differ by the transaction amount,
        // they are verified distinct consecutive transactions and must never be merged!
        if (acctSuffix != null && txnDate != null && incoming.availableBalancePaise != null) {
            val consecutiveTxn = existingQueue.find { existing ->
                val ex = existing.parsed
                val exBank = ex.bankName ?: Fingerprint.normalizeSender(ex.sender)
                val sameBank = exBank.equals(bankName, ignoreCase = true) ||
                    (bankName.contains("SDCCB", ignoreCase = true) && exBank.contains("SDCCB", ignoreCase = true))
                val sameAcct = ex.accountSuffix == acctSuffix
                val sameAmount = ex.amountPaise == incomingAmount
                val sameDate = ex.transactionDate == txnDate
                val exBal = ex.availableBalancePaise

                if (sameBank && sameAcct && sameAmount && sameDate && exBal != null) {
                    val balDelta = abs(incoming.availableBalancePaise - exBal)
                    balDelta == incomingAmount
                } else false
            }

            if (consecutiveTxn != null) {
                return ReconciliationOutcome(
                    isExactDuplicate = false,
                    matchedRecord = null,
                    enrichedRecord = null,
                    reason = "Verified distinct consecutive ledger transaction via balance progression delta of ${incomingAmount / 100}",
                    matchedLayer = "E"
                )
            }
        }

        return ReconciliationOutcome(false, null, null, null, null)
    }

    fun mergeRecords(primary: TransactionRecord, secondary: TransactionRecord, mergeReason: String = ""): TransactionRecord {
        val p = primary.parsed
        val s = secondary.parsed

        // Best reference (prefer non-null clean reference)
        val bestRef = p.reference?.takeIf { !Fingerprint.isMaskedAccount(it) }
            ?: s.reference?.takeIf { !Fingerprint.isMaskedAccount(it) }

        // Best available balance (prefer whichever has it)
        val bestBalance = p.availableBalancePaise ?: s.availableBalancePaise

        // Best account suffix
        val bestSuffix = p.accountSuffix ?: s.accountSuffix

        // Best bank name
        val bestBank = p.bankName ?: s.bankName

        // Best merchant
        val bestMerchant = p.merchant?.takeIf { it.isNotBlank() && it != "None" }
            ?: s.merchant?.takeIf { it.isNotBlank() && it != "None" }

        // Best classification
        val bestClass = if (p.classification != FinancialTxnType.AMBIGUOUS_REVIEW && p.classification != FinancialTxnType.NON_FINANCIAL_SMS) {
            p.classification
        } else {
            s.classification
        }

        val updatedParsed = p.copy(
            reference = bestRef,
            availableBalancePaise = bestBalance,
            accountSuffix = bestSuffix,
            bankName = bestBank,
            merchant = bestMerchant,
            classification = bestClass
        )

        val bestStatus = when {
            primary.status == CandidateStatus.SYNCED || secondary.status == CandidateStatus.SYNCED -> CandidateStatus.SYNCED
            primary.status == CandidateStatus.READY_TO_SYNC || secondary.status == CandidateStatus.READY_TO_SYNC -> CandidateStatus.READY_TO_SYNC
            else -> primary.status
        }

        return primary.copy(
            parsed = updatedParsed,
            status = bestStatus,
            reason = mergeReason
        )
    }
}
