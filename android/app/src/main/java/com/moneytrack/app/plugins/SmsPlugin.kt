package com.moneytrack.app.plugins

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.moneytrack.app.security.SecureTokenStore
import com.moneytrack.app.sms.CandidateStatus
import com.moneytrack.app.sms.Fingerprint
import com.moneytrack.app.sms.SmsEligibility
import com.moneytrack.app.sms.SmsNotificationHelper
import com.moneytrack.app.sms.SmsParser
import com.moneytrack.app.sms.SyncWorker
import com.moneytrack.app.sms.TransactionRecord
import com.moneytrack.app.sms.TransactionStore
import java.util.concurrent.TimeUnit

@CapacitorPlugin(
    name = "SmsPlugin",
    permissions = [
        Permission(
            strings = [Manifest.permission.RECEIVE_SMS],
            alias = "sms"
        ),
        Permission(
            strings = [Manifest.permission.READ_SMS],
            alias = "readSms"
        ),
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications"
        )
    ]
)
class SmsPlugin : Plugin() {

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        val ctx = context
        val sms = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECEIVE_SMS)
        val readSms = ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS)
        val notif = ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
        val store = TransactionStore(ctx)
        val settings = store.getSettings()
        val result = JSObject()
        result.put("receiveSms", permissionState(sms))
        result.put("readSms", permissionState(readSms))
        result.put("postNotifications", permissionState(notif))
        result.put("automationEnabled", settings.smsAutomationEnabled)
        result.put("notificationsEnabled", settings.notificationsEnabled)
        result.put("granted", sms == PackageManager.PERMISSION_GRANTED)
        call.resolve(result)
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        val aliases = mutableListOf("sms", "readSms")
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            aliases.add("notifications")
        }
        requestPermissionForAliases(aliases.toTypedArray(), call, "permissionsCallback")
    }

    @PermissionCallback
    fun permissionsCallback(call: PluginCall) {
        checkPermissions(call)
    }

    @PluginMethod
    fun setAutomationEnabled(call: PluginCall) {
        val enabled = if (call.getBoolean("enabled") == null) false else call.getBoolean("enabled")!!
        val ctx = context
        val store = TransactionStore(ctx)
        val settings = store.getSettings()
        settings.smsAutomationEnabled = enabled
        store.saveSettings(settings)
        val result = JSObject()
        result.put("automationEnabled", enabled)
        call.resolve(result)
    }

    @PluginMethod
    fun setBackendUrl(call: PluginCall) {
        val url = call.getString("url")?.trim()
        if (url == null || url.isEmpty()) { call.reject("url required"); return }
        val ctx = context
        val store = TransactionStore(ctx)
        val settings = store.getSettings()
        settings.backendUrl = url
        store.saveSettings(settings)
        val result = JSObject()
        result.put("backendUrl", url)
        call.resolve(result)
    }

    @PluginMethod
    fun getSettings(call: PluginCall) {
        val ctx = context
        val store = TransactionStore(ctx)
        val settings = store.getSettings()
        val result = JSObject()
        result.put("smsAutomationEnabled", settings.smsAutomationEnabled)
        result.put("backendUrl", settings.backendUrl ?: "")
        result.put("notificationsEnabled", settings.notificationsEnabled)
        call.resolve(result)
    }

    @PluginMethod
    fun setAuthToken(call: PluginCall) {
        val token = call.getString("token")?.trim()
        if (token.isNullOrEmpty()) {
            call.reject("token required")
            return
        }
        val secureStore = SecureTokenStore(context)
        secureStore.saveToken(token)
        val result = JSObject()
        result.put("saved", true)
        call.resolve(result)
    }

    @PluginMethod
    fun getAuthToken(call: PluginCall) {
        val secureStore = SecureTokenStore(context)
        val result = JSObject()
        result.put("hasToken", secureStore.hasToken())
        call.resolve(result)
    }

    @PluginMethod
    fun clearAuthToken(call: PluginCall) {
        val secureStore = SecureTokenStore(context)
        secureStore.clearToken()
        val result = JSObject()
        result.put("cleared", true)
        call.resolve(result)
    }

    @PluginMethod
    fun getPendingTransactions(call: PluginCall) {
        val ctx = context
        val store = TransactionStore(ctx)
        val records = store.loadQueue()
        val arr = JSArray()
        records.forEach { arr.put(recordToJson(it)) }
        val result = JSObject()
        result.put("items", arr)
        call.resolve(result)
    }

    @PluginMethod
    fun confirmTransaction(call: PluginCall) {
        val id = call.getString("id") ?: run { call.reject("id required"); return }
        val ctx = context
        val store = TransactionStore(ctx)
        val record = store.loadQueue().find { it.id == id } ?: run { call.reject("not found"); return }
        val updated = record.copy(status = CandidateStatus.READY_TO_SYNC)
        store.upsert(updated)
        enqueueSync(ctx)
        call.resolve(recordToJson(updated))
    }

    @PluginMethod
    fun rejectTransaction(call: PluginCall) {
        val id = call.getString("id") ?: run { call.reject("id required"); return }
        val ctx = context
        val store = TransactionStore(ctx)
        val record = store.loadQueue().find { it.id == id } ?: run { call.reject("not found"); return }
        val updated = record.copy(status = CandidateStatus.IGNORED, reason = "Rejected by user")
        store.upsert(updated)
        call.resolve(recordToJson(updated))
    }

    @PluginMethod
    fun dismissTransaction(call: PluginCall) {
        val id = call.getString("id") ?: run { call.reject("id required"); return }
        val ctx = context
        val store = TransactionStore(ctx)
        store.remove(id)
        SmsNotificationHelper.cancelAll(ctx)
        call.resolve(JSObject().apply { put("id", id) })
    }

    @PluginMethod
    fun clearPendingQueue(call: PluginCall) {
        val ctx = context
        val store = TransactionStore(ctx)
        store.saveQueue(emptyList())
        SmsNotificationHelper.cancelAll(ctx)
        val result = JSObject()
        result.put("cleared", true)
        call.resolve(result)
    }

    @PluginMethod
    fun updateTransaction(call: PluginCall) {
        val id = call.getString("id") ?: run { call.reject("id required"); return }
        val amount = call.getString("amount")?.trim()
        val merchant = call.getString("merchant")?.trim()
        val date = call.getString("date")?.trim()
        val note = call.getString("note")?.trim()
        val typeName = (call.getString("type") ?: call.getString("typeName") ?: call.getString("category"))?.trim()
        val ctx = context
        val store = TransactionStore(ctx)
        val record = store.loadQueue().find { it.id == id } ?: run { call.reject("not found"); return }

        var amountPaise = record.parsed.amountPaise
        if (amount != null) {
            val parsed = parseRupeesToPaise(amount)
            if (parsed == null) { call.reject("invalid amount"); return }
            amountPaise = parsed
        }
        if (date != null && !isValidIsoDate(date)) { call.reject("invalid date"); return }

        val updatedParsed = record.parsed.copy(
            amountPaise = amountPaise,
            merchant = merchant?.takeIf { it.isNotBlank() } ?: record.parsed.merchant,
            note = note?.takeIf { it.isNotBlank() } ?: record.parsed.note,
            transactionDate = date?.takeIf { it.isNotBlank() } ?: record.parsed.transactionDate,
            categorySuggestion = typeName?.takeIf { it.isNotBlank() } ?: record.parsed.categorySuggestion,
        )
        val updated = record.copy(
            parsed = updatedParsed,
            status = CandidateStatus.READY_TO_SYNC,
            reason = "Updated by user",
        )
        store.upsert(updated)
        enqueueSync(ctx)
        call.resolve(recordToJson(updated))
    }

    @PluginMethod
    fun importHistoricalSms(call: PluginCall) {
        val days = call.getInt("days") ?: 30
        val ctx = context
        val permissionCheck = ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS)
        if (permissionCheck != PackageManager.PERMISSION_GRANTED) {
            call.reject("READ_SMS permission not granted")
            return
        }

        val store = TransactionStore(ctx)
        val existingQueue = store.loadQueue()
        val existingIds = existingQueue.map { it.id }.toHashSet()

        var totalScanned = 0
        var eligibleFound = 0
        var duplicatesSkipped = 0
        val newRecords = mutableListOf<TransactionRecord>()

        val selection: String?
        val selectionArgs: Array<String>?
        if (days > 0) {
            val cutoffMs = System.currentTimeMillis() - (days.toLong() * 24L * 60L * 60L * 1000L)
            selection = "${Telephony.Sms.DATE} >= ?"
            selectionArgs = arrayOf(cutoffMs.toString())
        } else {
            selection = null
            selectionArgs = null
        }

        try {
            val projection = arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
            )
            val uri = Telephony.Sms.Inbox.CONTENT_URI
            val cursor = ctx.contentResolver.query(
                uri,
                projection,
                selection,
                selectionArgs,
                "${Telephony.Sms.DATE} DESC"
            )

            cursor?.use { c ->
                val bodyIdx = c.getColumnIndex(Telephony.Sms.BODY)
                val addrIdx = c.getColumnIndex(Telephony.Sms.ADDRESS)
                val dateIdx = c.getColumnIndex(Telephony.Sms.DATE)

                while (c.moveToNext()) {
                    totalScanned++
                    val body = if (bodyIdx >= 0) c.getString(bodyIdx) ?: "" else ""
                    val address = if (addrIdx >= 0) c.getString(addrIdx) ?: "" else ""
                    val dateMs = if (dateIdx >= 0) c.getLong(dateIdx) else System.currentTimeMillis()

                    if (body.isBlank()) continue

                    val parsed = SmsParser.parse(body, address, dateMs)
                    val decision = SmsEligibility.decide(parsed, body.lowercase())

                    if (decision.status == CandidateStatus.IGNORED) {
                        continue
                    }

                    eligibleFound++
                    val id = Fingerprint.of(address, dateMs, parsed.amountPaise, parsed.reference, parsed.transactionDate)

                    if (existingIds.contains(id)) {
                        duplicatesSkipped++
                        continue
                    }

                    existingIds.add(id)
                    val record = TransactionRecord(
                        id = id,
                        status = CandidateStatus.PENDING_REVIEW,
                        parsed = parsed,
                        reason = decision.reason ?: "Imported from historical SMS",
                        createdAtMs = dateMs,
                        notified = false
                    )
                    newRecords.add(record)
                }
            }

            if (newRecords.isNotEmpty()) {
                store.upsertAll(newRecords)
            }

            val result = JSObject()
            result.put("totalScanned", totalScanned)
            result.put("eligibleFound", eligibleFound)
            result.put("duplicatesSkipped", duplicatesSkipped)
            result.put("newImported", newRecords.size)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Error importing SMS: ${e.message}", e)
        }
    }

    @PluginMethod
    fun syncNow(call: PluginCall) {
        val ctx = context
        enqueueSync(ctx)
        call.resolve(JSObject().apply { put("syncStarted", true) })
    }

    @PluginMethod
    fun getLaunchUrl(call: PluginCall) {
        val url = activity?.intent?.dataString
        val res = JSObject()
        res.put("url", url)
        call.resolve(res)
    }

    fun handleDeepLink(url: String) {
        val data = JSObject().apply { put("url", url) }
        notifyListeners("smsReviewRequested", data, true)
        notifyListeners("deepLinkOpen", data, true)
    }

    @PluginMethod
    fun scheduleWeeklyReport(call: PluginCall) {
        com.moneytrack.app.sms.WeeklyReportWorker.scheduleWeeklyWork(context)
        call.resolve(JSObject().apply { put("scheduled", true) })
    }

    @PluginMethod
    fun triggerSecurityNotification(call: PluginCall) {
        val alertId = call.getLong("alertId") ?: 1L
        val merchant = call.getString("merchant") ?: "Unknown Merchant"
        val amountPaise = call.getLong("amountPaise") ?: 100000L
        val reason = call.getString("reason") ?: "Potentially unusual transaction"
        SmsNotificationHelper.showSecurityAlertNotification(context, alertId, merchant, amountPaise, reason)
        call.resolve(JSObject().apply { put("notified", true) })
    }

    @PluginMethod
    fun triggerWeeklyReportNotification(call: PluginCall) {
        val periodLabel = call.getString("periodLabel") ?: "Previous Week"
        val totalSpentPaise = call.getLong("totalSpentPaise") ?: 500000L
        val savingsRate = call.getDouble("savingsRate") ?: 25.0
        SmsNotificationHelper.showWeeklyReportNotification(context, periodLabel, totalSpentPaise, savingsRate)
        call.resolve(JSObject().apply { put("notified", true) })
    }

    // ------------------------------------------------------------------ helpers

    private fun permissionState(code: Int): String {
        return if (code == PackageManager.PERMISSION_GRANTED) "granted"
        else if (code == PackageManager.PERMISSION_DENIED) "denied"
        else "unknown"
    }

    private fun enqueueSync(context: Context) {
        try {
            val workManager = WorkManager.getInstance(context)
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setInitialDelay(1, TimeUnit.SECONDS)
                .build()
            workManager.enqueue(request)
        } catch (_: Exception) {}
    }

    private fun recordToJson(r: TransactionRecord): JSObject {
        val obj = JSObject()
        obj.put("id", r.id)
        obj.put("status", r.status.name.lowercase())
        obj.put("reason", r.reason ?: "")
        obj.put("createdAtMs", r.createdAtMs)
        obj.put("amount", r.parsed.amountPaise?.let { paiseToRupees(it) })
        obj.put("merchant", r.parsed.merchant ?: "")
        obj.put("reference", r.parsed.reference ?: "")
        obj.put("date", r.parsed.transactionDate ?: "")
        obj.put("category", r.parsed.categorySuggestion ?: "")
        obj.put("note", r.parsed.note ?: "")
        obj.put("sender", r.parsed.sender ?: "")
        obj.put("error", r.error ?: "")
        obj.put("retryCount", r.retryCount)
        obj.put("notified", r.notified)
        return obj
    }

    private fun parseRupeesToPaise(input: String): Long? {
        val value = input.trim().replace(",", "")
        if (!Regex("^\\d+(?:\\.\\d{1,2})?$").matches(value)) return null
        val parts = value.split(".")
        val whole = parts[0].toLongOrNull() ?: return null
        val fraction = if (parts.size > 1) parts[1].padEnd(2, '0').substring(0, 2).toLong() else 0L
        return whole * 100L + fraction
    }

    private fun paiseToRupees(paise: Long): String {
        val whole = Math.abs(paise) / 100
        val fraction = Math.abs(paise) % 100
        return "${whole}.${String.format("%02d", fraction)}"
    }

    private fun isValidIsoDate(value: String): Boolean {
        if (!Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(value)) return false
        val parts = value.split("-").map { it.toIntOrNull() }
        if (parts.any { it == null }) return false
        val y = parts[0] ?: return false
        val m = parts[1] ?: return false
        val d = parts[2] ?: return false
        return if (m in 1..12) {
            val daysInMonth = when (m) {
                2 -> if (isLeap(y)) 29 else 28
                4, 6, 9, 11 -> 30
                else -> 31
            }
            d in 1..daysInMonth
        } else false
    }

    private fun isLeap(year: Int): Boolean = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)

    private fun categoryToTypeId(category: String?): Int? {
        if (category == null) return null
        return when (category.lowercase()) {
            "mobile recharge" -> 5
            "bus travel" -> 2
            else -> null
        }
    }
}
