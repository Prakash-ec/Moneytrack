package com.moneytrack.app.sms

import android.content.Context
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import org.json.JSONArray
import org.json.JSONObject

const val QUEUE_FILE_NAME = "sms_transaction_queue.json"
const val SETTINGS_FILE_NAME = "sms_settings.json"
const val DEFAULT_PRODUCTION_BACKEND_URL = "https://moneytrack-backend-g5is.onrender.com"

/**
 * Persists transaction candidates and app settings as JSON files in internal storage.
 * Integrates with SmsReconciliation for intelligent multi-layer deduplication.
 */
class TransactionStore(private val storageDir: File) {

    constructor(context: Context) : this(context.filesDir)

    private val queueLock = Any()
    private val settingsLock = Any()

    // ------------------------------------------------------------------ queue

    fun loadQueue(): List<TransactionRecord> {
        synchronized(queueLock) {
            return readQueue(queueFile())
        }
    }

    fun saveQueue(records: List<TransactionRecord>) {
        synchronized(queueLock) {
            writeQueue(queueFile(), records)
        }
    }

    fun upsert(record: TransactionRecord): TransactionRecord {
        synchronized(queueLock) {
            val current = readQueue(queueFile()).toMutableList()
            val existingIndex = current.indexOfFirst { it.id == record.id }

            // If updating an already stored record by exact ID, merge evidence and state safely:
            // 1. Preserve higher status (never downgrade READY_TO_SYNC or SYNCED to PENDING_REVIEW)
            // 2. Preserve notification ID so it is never lost or wiped to null
            // 3. Merge parsed metadata so stronger evidence is never downgraded
            if (existingIndex >= 0) {
                val existing = current[existingIndex]
                val merged = SmsReconciliation.mergeRecords(existing, record, "Updated record ${record.id}").copy(
                    status = if (record.status == CandidateStatus.IGNORED || record.status == CandidateStatus.READY_TO_SYNC || record.status == CandidateStatus.SYNCED) {
                        record.status
                    } else if (existing.status == CandidateStatus.READY_TO_SYNC || existing.status == CandidateStatus.SYNCED) {
                        existing.status
                    } else {
                        record.status
                    },
                    notificationId = record.notificationId ?: existing.notificationId,
                    notified = record.notified || existing.notified,
                    syncedAtMs = record.syncedAtMs ?: existing.syncedAtMs,
                    error = record.error ?: existing.error
                )
                current[existingIndex] = merged
                writeQueue(queueFile(), current)
                return merged
            }

            // Run reconciliation against current queue for new incoming records
            val outcome = SmsReconciliation.reconcile(record, current)
            if (outcome.isExactDuplicate) {
                if (outcome.matchedRecord != null && outcome.enrichedRecord != null) {
                    val idx = current.indexOfFirst { it.id == outcome.matchedRecord.id }
                    if (idx >= 0) {
                        current[idx] = outcome.enrichedRecord
                        writeQueue(queueFile(), current)
                        return outcome.enrichedRecord
                    }
                }
                return outcome.matchedRecord ?: record
            }

            current.add(record)
            writeQueue(queueFile(), current)
            return record
        }
    }

    fun upsertAll(records: List<TransactionRecord>) {
        if (records.isEmpty()) return
        synchronized(queueLock) {
            val current = readQueue(queueFile()).toMutableList()
            for (record in records) {
                val existingIndex = current.indexOfFirst { it.id == record.id }
                if (existingIndex >= 0) {
                    val existing = current[existingIndex]
                    current[existingIndex] = SmsReconciliation.mergeRecords(existing, record, "Updated record ${record.id}").copy(
                        status = if (record.status == CandidateStatus.IGNORED || record.status == CandidateStatus.READY_TO_SYNC || record.status == CandidateStatus.SYNCED) {
                            record.status
                        } else if (existing.status == CandidateStatus.READY_TO_SYNC || existing.status == CandidateStatus.SYNCED) {
                            existing.status
                        } else {
                            record.status
                        },
                        notificationId = record.notificationId ?: existing.notificationId,
                        notified = record.notified || existing.notified,
                        syncedAtMs = record.syncedAtMs ?: existing.syncedAtMs,
                        error = record.error ?: existing.error
                    )
                    continue
                }
                val outcome = SmsReconciliation.reconcile(record, current)
                if (outcome.isExactDuplicate) {
                    if (outcome.matchedRecord != null && outcome.enrichedRecord != null) {
                        val idx = current.indexOfFirst { it.id == outcome.matchedRecord.id }
                        if (idx >= 0) {
                            current[idx] = outcome.enrichedRecord
                        }
                    }
                } else {
                    current.add(record)
                }
            }
            writeQueue(queueFile(), current)
        }
    }

    data class CleanResult(
        val initialCount: Int,
        val quarantinedCount: Int,
        val mergedCount: Int,
        val finalCount: Int,
    )

    /**
     * Re-evaluates all records on disk:
     * 1. Quarantines false positives (data quota alerts, marketing promotions, OTPs, zero amount).
     * 2. Cleans up masked account numbers incorrectly extracted as references.
     * 3. Runs 4-layer deduplication and reconciliation.
     * 4. Persists the clean queue atomically.
     */
    fun cleanQueue(): CleanResult {
        synchronized(queueLock) {
            val original = readQueue(queueFile())
            val initialCount = original.size

            val valid = mutableListOf<TransactionRecord>()
            var quarantinedCount = 0

            for (record in original) {
                val p = record.parsed
                val senderUpper = (p.sender ?: "").uppercase()
                val evidenceLower = (p.evidence ?: "").lowercase()

                val hasFinancialAmount = p.amountPaise != null && p.amountPaise > 0
                val isTrueDataQuota = evidenceLower.contains("quota of") ||
                    evidenceLower.contains("daily data quota") ||
                    evidenceLower.contains("data balance") ||
                    evidenceLower.contains("remaining data") ||
                    evidenceLower.contains("data usage alert") ||
                    evidenceLower.contains("டேட்டா")

                val isPromo = p.classification == FinancialTxnType.PROMOTIONAL_SMS ||
                    Fingerprint.isPromotionalSender(p.sender) ||
                    evidenceLower.contains("audible")

                val isOtp = p.classification == FinancialTxnType.OTP ||
                    evidenceLower.contains("verification code") ||
                    evidenceLower.contains("your otp is")

                // A record is only non-financial if it has NO valid financial amount, or is an explicit OTP/Promo/DataQuota
                val shouldQuarantine = (!hasFinancialAmount) || isTrueDataQuota || isPromo || isOtp

                if (shouldQuarantine) {
                    quarantinedCount++
                } else {
                    // Clean masked account from reference if present
                    val cleanRef = if (p.reference != null && Fingerprint.isMaskedAccount(p.reference)) null else p.reference
                    val cleanAccountSuffix = p.accountSuffix ?: if (p.reference != null && Fingerprint.isMaskedAccount(p.reference)) {
                        p.reference.filter { it.isDigit() }.takeLast(4).takeIf { it.isNotBlank() }
                    } else null

                    // Ensure recovered classification is never left as NON_FINANCIAL_SMS
                    val safeClassification = if (p.classification == FinancialTxnType.NON_FINANCIAL_SMS) {
                        when (p.status) {
                            TxnStatus.CREDIT -> FinancialTxnType.BANK_CREDIT
                            TxnStatus.DEBIT -> FinancialTxnType.BANK_DEBIT
                            else -> FinancialTxnType.AMBIGUOUS_REVIEW
                        }
                    } else {
                        p.classification
                    }

                    // Ambiguous transactions must always require explicit user review, never auto-sync
                    val safeStatus = if (safeClassification == FinancialTxnType.AMBIGUOUS_REVIEW) {
                        CandidateStatus.PENDING_REVIEW
                    } else {
                        record.status
                    }

                    val cleanedParsed = p.copy(
                        reference = cleanRef,
                        accountSuffix = cleanAccountSuffix,
                        classification = safeClassification,
                    )
                    valid.add(record.copy(status = safeStatus, parsed = cleanedParsed))
                }
            }

            val reconciledQueue = mutableListOf<TransactionRecord>()
            var mergedCount = 0

            for (record in valid) {
                val outcome = SmsReconciliation.reconcile(record, reconciledQueue)
                if (outcome.isExactDuplicate) {
                    mergedCount++
                    if (outcome.matchedRecord != null && outcome.enrichedRecord != null) {
                        val idx = reconciledQueue.indexOfFirst { it.id == outcome.matchedRecord.id }
                        if (idx >= 0) {
                            reconciledQueue[idx] = outcome.enrichedRecord
                        }
                    }
                } else {
                    reconciledQueue.add(record)
                }
            }

            writeQueue(queueFile(), reconciledQueue)
            return CleanResult(
                initialCount = initialCount,
                quarantinedCount = quarantinedCount,
                mergedCount = mergedCount,
                finalCount = reconciledQueue.size,
            )
        }
    }

    fun remove(id: String) {
        synchronized(queueLock) {
            val current = readQueue(queueFile())
            val updated = current.filter { it.id != id }
            if (updated.size != current.size) writeQueue(queueFile(), updated)
        }
    }

    // ------------------------------------------------------------- settings

    fun getSettings(): SmsSettings {
        synchronized(settingsLock) {
            return readSettings(settingsFile())
        }
    }

    fun saveSettings(settings: SmsSettings) {
        synchronized(settingsLock) {
            writeSettings(settingsFile(), settings)
        }
    }

    // ------------------------------------------------------------------ io

    private fun queueFile() = File(storageDir, QUEUE_FILE_NAME)
    private fun settingsFile() = File(storageDir, SETTINGS_FILE_NAME)

    private fun readQueue(file: File): List<TransactionRecord> {
        if (!file.exists()) return emptyList()
        val text = file.readText().trim()
        if (text.isEmpty()) return emptyList()
        val obj = JSONObject(text)
        val arr = obj.getJSONArray("records")
        return (0 until arr.length()).map { arr.getJSONObject(it) }.mapNotNull { recordFromJson(it) }
    }

    private fun writeQueue(file: File, records: List<TransactionRecord>) {
        val tmp = File(file.parentFile, "${file.name}.tmp")
        val arr = JSONArray()
        records.forEach { arr.put(recordToJson(it)) }
        val obj = JSONObject().put("records", arr)
        tmp.bufferedWriter().use { it.write(obj.toString()) }
        Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
    }

    private fun readSettings(file: File): SmsSettings {
        if (!file.exists()) return SmsSettings.defaults()
        val obj = JSONObject(file.readText())
        return SmsSettings(
            smsAutomationEnabled = obj.optBoolean("smsAutomationEnabled", false),
            backendUrl = obj.optNullableString("backendUrl")?.takeIf { it.isNotBlank() } ?: DEFAULT_PRODUCTION_BACKEND_URL,
            notificationsEnabled = obj.optBoolean("notificationsEnabled", true),
        )
    }

    private fun writeSettings(file: File, settings: SmsSettings) {
        val tmp = File(file.parentFile, "${file.name}.tmp")
        val obj = JSONObject()
        obj.put("smsAutomationEnabled", settings.smsAutomationEnabled)
        obj.put("backendUrl", settings.backendUrl ?: JSONObject.NULL)
        obj.put("notificationsEnabled", settings.notificationsEnabled)
        tmp.bufferedWriter().use { it.write(obj.toString()) }
        Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
    }

    companion object {
        internal fun recordToJson(r: TransactionRecord): JSONObject {
        val obj = JSONObject()
        obj.put("id", r.id)
        obj.put("status", r.status.name)
        obj.put("reason", r.reason ?: JSONObject.NULL)
        obj.put("createdAtMs", r.createdAtMs)
        r.syncedAtMs?.let { obj.put("syncedAtMs", it) }
        r.error?.let { obj.put("error", it) }
        obj.put("retryCount", r.retryCount)
        obj.put("notified", r.notified)
        r.notificationId?.let { obj.put("notificationId", it) }
        obj.put("parsed", parsedToJson(r.parsed))
        return obj
    }

    internal fun recordFromJson(obj: JSONObject): TransactionRecord? {
        try {
            val parsedObj = obj.getJSONObject("parsed")
            return TransactionRecord(
                id = obj.getString("id"),
                status = CandidateStatus.valueOf(obj.getString("status")),
                parsed = parsedFromJson(parsedObj),
                reason = obj.optNullableString("reason")?.takeIf { it.isNotBlank() },
                createdAtMs = obj.optLong("createdAtMs", System.currentTimeMillis()),
                syncedAtMs = obj.optLong("syncedAtMs", -1L).takeIf { it >= 0 },
                error = obj.optNullableString("error")?.takeIf { it.isNotBlank() },
                retryCount = obj.optInt("retryCount", 0),
                notified = obj.optBoolean("notified", false),
                notificationId = obj.optInt("notificationId", -1).takeIf { it >= 0 },
            )
        } catch (_: Exception) {
            return null
        }
    }

    private fun parsedToJson(p: ParsedTransaction): JSONObject {
        val obj = JSONObject()
        p.amountPaise?.let { obj.put("amountPaise", it) }
        obj.put("merchant", p.merchant ?: JSONObject.NULL)
        obj.put("reference", p.reference ?: JSONObject.NULL)
        obj.put("transactionDate", p.transactionDate ?: JSONObject.NULL)
        obj.put("transactionDateTime", p.transactionDateTime ?: JSONObject.NULL)
        obj.put("status", p.status.name)
        obj.put("categorySuggestion", p.categorySuggestion ?: JSONObject.NULL)
        obj.put("note", p.note ?: JSONObject.NULL)
        obj.put("sender", p.sender ?: JSONObject.NULL)
        p.timestampMs?.let { obj.put("timestampMs", it) }
        obj.put("evidence", p.evidence ?: JSONObject.NULL)
        p.availableBalancePaise?.let { obj.put("availableBalancePaise", it) }
        obj.put("accountSuffix", p.accountSuffix ?: JSONObject.NULL)
        obj.put("bankName", p.bankName ?: JSONObject.NULL)
        obj.put("classification", p.classification.name)
        obj.put("confidence", p.confidence)
        obj.put("paymentChannel", p.paymentChannel ?: JSONObject.NULL)
        obj.put("rawHash", p.rawHash ?: JSONObject.NULL)
        return obj
    }

    internal fun parsedFromJson(obj: JSONObject): ParsedTransaction {
        val classifStr = obj.optNullableString("classification")
        val parsedClassif = if (classifStr != null) {
            try {
                FinancialTxnType.valueOf(classifStr)
            } catch (_: Exception) {
                null
            }
        } else null

        val amountPaise = obj.optLong("amountPaise", -1L).takeIf { it > 0 }
        val statusStr = obj.optNullableString("status")?.trim()?.uppercase()
        val status = when (statusStr) {
            "DEBIT" -> TxnStatus.DEBIT
            "CREDIT" -> TxnStatus.CREDIT
            else -> TxnStatus.UNKNOWN
        }
        val merchant = obj.optNullableString("merchant")?.takeIf { it.isNotBlank() }
        val reference = obj.optNullableString("reference")?.takeIf { it.isNotBlank() }
        val transactionDate = obj.optNullableString("transactionDate")?.takeIf { it.isNotBlank() }
        val transactionDateTime = obj.optNullableString("transactionDateTime")?.takeIf { it.isNotBlank() }
        val categorySuggestion = obj.optNullableString("categorySuggestion")?.takeIf { it.isNotBlank() }
        val note = obj.optNullableString("note")?.takeIf { it.isNotBlank() }
        val sender = obj.optNullableString("sender")?.takeIf { it.isNotBlank() }
        val timestampMs = obj.optLong("timestampMs", -1L).takeIf { it > 0 }
        val evidence = obj.optNullableString("evidence")?.takeIf { it.isNotBlank() }
        val availableBalancePaise = obj.optLong("availableBalancePaise", -1L).takeIf { it >= 0 }
        val accountSuffix = obj.optNullableString("accountSuffix")?.takeIf { it.isNotBlank() }
        val bankName = obj.optNullableString("bankName")?.takeIf { it.isNotBlank() }
        val paymentChannel = obj.optNullableString("paymentChannel")?.takeIf { it.isNotBlank() }
        val rawHash = obj.optNullableString("rawHash")?.takeIf { it.isNotBlank() }

        // Robust classification resolution:
        // A missing or unknown classification must NEVER default to NON_FINANCIAL_SMS!
        val classification = when {
            // Case 1: Known valid classification that is NOT a suspected false-positive NON_FINANCIAL_SMS
            parsedClassif != null && parsedClassif != FinancialTxnType.NON_FINANCIAL_SMS -> parsedClassif

            // Case 2: Suspected false-positive NON_FINANCIAL_SMS or legacy null/unknown
            else -> {
                val hasFinancialEvidence = amountPaise != null && (status == TxnStatus.DEBIT || status == TxnStatus.CREDIT)
                val evidenceLower = (evidence ?: "").lowercase()
                val isTrueDataQuota = evidenceLower.contains("quota of") ||
                    evidenceLower.contains("daily data quota") ||
                    evidenceLower.contains("data balance") ||
                    evidenceLower.contains("remaining data") ||
                    evidenceLower.contains("data usage alert") ||
                    evidenceLower.contains("டேட்டா")
                val isTruePromo = Fingerprint.isPromotionalSender(sender) || evidenceLower.contains("audible")

                if (hasFinancialEvidence && !isTrueDataQuota && !isTruePromo) {
                    // Parser-version-aware recovery: reconstruct true classification
                    val recovered = SmsParser.classifyTransaction(
                        text = evidence ?: note ?: merchant ?: "",
                        status = status,
                        amount = amountPaise,
                        reference = reference,
                        sender = sender
                    )
                    if (recovered != FinancialTxnType.AMBIGUOUS_REVIEW && recovered != FinancialTxnType.NON_FINANCIAL_SMS) {
                        recovered
                    } else if (status == TxnStatus.CREDIT) {
                        FinancialTxnType.BANK_CREDIT
                    } else if (status == TxnStatus.DEBIT) {
                        FinancialTxnType.BANK_DEBIT
                    } else {
                        FinancialTxnType.AMBIGUOUS_REVIEW
                    }
                } else if (parsedClassif == FinancialTxnType.NON_FINANCIAL_SMS && isTrueDataQuota) {
                    FinancialTxnType.NON_FINANCIAL_SMS
                } else {
                    FinancialTxnType.AMBIGUOUS_REVIEW
                }
            }
        }

        return ParsedTransaction(
            amountPaise = amountPaise,
            merchant = merchant,
            reference = reference,
            transactionDate = transactionDate,
            transactionDateTime = transactionDateTime,
            status = status,
            categorySuggestion = categorySuggestion,
            note = note,
            sender = sender,
            timestampMs = timestampMs,
            evidence = evidence,
            availableBalancePaise = availableBalancePaise,
            accountSuffix = accountSuffix,
            bankName = bankName,
            classification = classification,
            confidence = obj.optString("confidence", "HIGH"),
            paymentChannel = paymentChannel,
            rawHash = rawHash,
        )
    }

    private fun JSONObject.optNullableString(name: String): String? {
        return if (has(name) && !isNull(name)) getString(name) else null
    }
    }
}

data class TransactionRecord(
    val id: String,
    val status: CandidateStatus,
    val parsed: ParsedTransaction,
    val reason: String?,
    val createdAtMs: Long,
    var syncedAtMs: Long? = null,
    var error: String? = null,
    var retryCount: Int = 0,
    var notified: Boolean = false,
    var notificationId: Int? = null,
)

data class SmsSettings(
    var smsAutomationEnabled: Boolean = false,
    var backendUrl: String? = DEFAULT_PRODUCTION_BACKEND_URL,
    var notificationsEnabled: Boolean = true,
) {
    companion object {
        fun defaults() = SmsSettings(
            smsAutomationEnabled = false,
            backendUrl = DEFAULT_PRODUCTION_BACKEND_URL,
            notificationsEnabled = true,
        )
    }
}
