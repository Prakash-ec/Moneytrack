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
 * Persists transaction candidates and app settings as JSON files in internal
 * storage. Survives process restarts; not an in-memory-only cache.
 */
class TransactionStore(private val context: Context) {

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

    fun upsert(record: TransactionRecord) {
        synchronized(queueLock) {
            val current = readQueue(queueFile())
            val index = current.indexOfFirst { it.id == record.id }
            val updated = current.toMutableList()
            if (index >= 0) updated.set(index, record) else updated.add(record)
            writeQueue(queueFile(), updated)
        }
    }

    fun upsertAll(records: List<TransactionRecord>) {
        if (records.isEmpty()) return
        synchronized(queueLock) {
            val current = readQueue(queueFile()).toMutableList()
            for (record in records) {
                val index = current.indexOfFirst { it.id == record.id }
                if (index >= 0) {
                    current[index] = record
                } else {
                    current.add(record)
                }
            }
            writeQueue(queueFile(), current)
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

    private fun queueFile() = File(context.filesDir, QUEUE_FILE_NAME)
    private fun settingsFile() = File(context.filesDir, SETTINGS_FILE_NAME)

    private fun readQueue(file: File): List<TransactionRecord> {
        if (!file.exists()) return emptyList()
        val obj = JSONObject(file.readText())
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

    private fun recordToJson(r: TransactionRecord): JSONObject {
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

    private fun recordFromJson(obj: JSONObject): TransactionRecord? {
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
        return obj
    }

    private fun parsedFromJson(obj: JSONObject): ParsedTransaction {
        return ParsedTransaction(
            amountPaise = obj.optLong("amountPaise", -1L).takeIf { it > 0 },
            merchant = obj.optNullableString("merchant")?.takeIf { it.isNotBlank() },
            reference = obj.optNullableString("reference")?.takeIf { it.isNotBlank() },
            transactionDate = obj.optNullableString("transactionDate")?.takeIf { it.isNotBlank() },
            transactionDateTime = obj.optNullableString("transactionDateTime")?.takeIf { it.isNotBlank() },
            status = TxnStatus.valueOf(obj.optString("status", TxnStatus.UNKNOWN.name)),
            categorySuggestion = obj.optNullableString("categorySuggestion")?.takeIf { it.isNotBlank() },
            note = obj.optNullableString("note")?.takeIf { it.isNotBlank() },
            sender = obj.optNullableString("sender")?.takeIf { it.isNotBlank() },
            timestampMs = obj.optLong("timestampMs", -1L).takeIf { it > 0 },
            evidence = obj.optNullableString("evidence")?.takeIf { it.isNotBlank() },
        )
    }

    private fun JSONObject.optNullableString(name: String): String? {
        return if (has(name) && !isNull(name)) getString(name) else null
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
