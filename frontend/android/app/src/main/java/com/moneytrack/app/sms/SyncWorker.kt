package com.moneytrack.app.sms

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit
import org.json.JSONObject

private const val TAG = "MoneytrackSyncWorker"

/**
 * Durable background worker that persists across retries and process restarts.
 * Sends ready-to-sync transaction candidates to the expense API with a stable
 * idempotency key so retries never create duplicates.
 */
class SyncWorker(context: Context, params: WorkerParameters) :
    Worker(context, params) {

    private val store = TransactionStore(applicationContext)

    override fun doWork(): Result {
        val settings = store.getSettings()
        val backendUrl = settings.backendUrl?.trim()?.takeIf { it.isNotBlank() } ?: return Result.failure()
        if (!settings.smsAutomationEnabled) {
            return Result.success()
        }

        val queue = store.loadQueue()
        val ready = queue.filter { it.status == CandidateStatus.READY_TO_SYNC }
        if (ready.isEmpty()) return Result.success()

        // Fetch active expense types dynamically from backend
        val activeTypes = fetchActiveExpenseTypes(backendUrl)
        if (activeTypes.isEmpty()) {
            Log.w(TAG, "No active expense types available from backend; will retry.")
            return Result.retry()
        }

        var allOk = true
        for (record in ready) {
            val result = syncTransaction(backendUrl, record, activeTypes)
            val updated = when {
                result.created || result.replayed -> record.copy(
                    status = CandidateStatus.SYNCED,
                    syncedAtMs = System.currentTimeMillis(),
                    error = null,
                )
                else -> {
                    allOk = false
                    val nextRetry = (record.retryCount + 1).coerceAtMost(5)
                    val delaySeconds = (30L * (1L shl (nextRetry - 1))).coerceAtMost(86400L)
                    record.copy(
                        status = CandidateStatus.FAILED,
                        error = result.error,
                        retryCount = nextRetry,
                    ).also {
                        // Reschedule with backoff via delayed work request.
                        enqueueRetry(applicationContext, delaySeconds)
                    }
                }
            }
            store.upsert(updated)
        }

        return if (allOk) Result.success() else Result.retry()
    }

    private fun enqueueRetry(context: Context, delaySeconds: Long) {
        val workManager = WorkManager.getInstance(context)
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork("sms-sync-retry", ExistingWorkPolicy.KEEP, request)
    }

    companion object {

        /**
         * Normalizes backend URL and target endpoint path safely.
         * Handles backend URLs with or without trailing slashes, with or without '/api',
         * or with accidental endpoint suffix.
         */
        fun buildEndpointUrl(backendUrl: String, endpoint: String): String {
            val trimmed = backendUrl.trim()
            if (trimmed.isEmpty()) {
                throw IllegalArgumentException("Backend URL cannot be blank")
            }

            val uri = try {
                val parsed = URI(trimmed)
                val scheme = parsed.scheme
                if (scheme == null || (!scheme.equals("http", ignoreCase = true) && !scheme.equals("https", ignoreCase = true))) {
                    throw IllegalArgumentException("Unsupported scheme in backend URL: $scheme")
                }
                if (parsed.host.isNullOrBlank()) {
                    throw IllegalArgumentException("Missing host in backend URL: $trimmed")
                }
                parsed
            } catch (e: IllegalArgumentException) {
                throw e
            } catch (e: Exception) {
                throw IllegalArgumentException("Malformed backend URL: $trimmed", e)
            }

            val scheme = uri.scheme
            val host = uri.host
            val port = uri.port
            val portPart = if (port != -1) ":$port" else ""
            val authority = "$scheme://$host$portPart"

            var rawPath = uri.rawPath ?: ""
            rawPath = rawPath.trim().trimEnd('/')

            // Strip trailing /expenses or /expense-types if user saved endpoint in base URL
            if (rawPath.endsWith("/expenses")) {
                rawPath = rawPath.removeSuffix("/expenses").trimEnd('/')
            } else if (rawPath.endsWith("/expense-types")) {
                rawPath = rawPath.removeSuffix("/expense-types").trimEnd('/')
            }

            val apiPath = if (rawPath.endsWith("/api")) {
                rawPath
            } else if (rawPath.isEmpty() || rawPath == "/") {
                "/api"
            } else {
                "$rawPath/api"
            }

            var cleanEndpoint = endpoint.trim().trimStart('/')
            if (cleanEndpoint.startsWith("api/")) {
                cleanEndpoint = cleanEndpoint.removePrefix("api/").trimStart('/')
            }

            val cleanApiPath = apiPath.trimEnd('/')
            return if (cleanEndpoint.isEmpty()) {
                "$authority$cleanApiPath"
            } else {
                "$authority$cleanApiPath/$cleanEndpoint"
            }
        }

        /**
         * Parses JSON response from /api/expense-types?archived=exclude.
         * Handles both wrapped object { "items": [...] } and bare array [...].
         * Robust against missing fields and filters out archived types.
         */
        fun parseExpenseTypesJson(jsonString: String): List<ActiveExpenseType> {
            val result = mutableListOf<ActiveExpenseType>()
            val blockRegex = Regex("""\{([^{}]+)\}""")
            for (match in blockRegex.findAll(jsonString)) {
                val block = match.groupValues[1]

                // Check archived flag
                val archivedMatch = Regex("""(?i)"(?:is_archived|archived)"\s*:\s*(true|false)""").find(block)
                val isArchived = archivedMatch?.groupValues?.get(1)?.equals("true", ignoreCase = true) == true
                if (isArchived) continue

                // Extract id
                val idMatch = Regex("""(?i)"id"\s*:\s*(\d+)""").find(block) ?: continue
                val id = idMatch.groupValues[1].toIntOrNull() ?: continue
                if (id <= 0) continue

                // Extract name
                val nameMatch = Regex("""(?i)"name"\s*:\s*"([^"]+)"""").find(block) ?: continue
                val name = nameMatch.groupValues[1].trim()
                if (name.isEmpty()) continue

                // Extract category
                val catMatch = Regex("""(?i)"category"\s*:\s*(?:"([^"]+)"|null)""").find(block)
                val category = catMatch?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotEmpty() }

                result.add(ActiveExpenseType(id = id, name = name, category = category))
            }
            return result
        }

        /**
         * Resolves the best matching active expense type ID using a 7-tier matching strategy.
         */
        fun resolveExpenseTypeId(
            suggestion: String?,
            merchant: String?,
            activeTypes: List<ActiveExpenseType>
        ): Int? {
            if (activeTypes.isEmpty()) return null

            val cleanSuggestion = suggestion?.trim()?.takeIf { it.isNotBlank() }
            val cleanMerchant = merchant?.trim()?.takeIf { it.isNotBlank() }

            // 1. Exact expense-type name match
            if (cleanSuggestion != null) {
                val match = activeTypes.firstOrNull { it.name.equals(cleanSuggestion, ignoreCase = true) }
                if (match != null) return match.id
            }

            // 2. Exact category match
            if (cleanSuggestion != null) {
                val match = activeTypes.firstOrNull { it.category?.equals(cleanSuggestion, ignoreCase = true) == true }
                if (match != null) return match.id
            }

            // 3. Explicit alias mapping
            if (cleanSuggestion != null) {
                val mappedCategory = when (cleanSuggestion.lowercase()) {
                    "transport" -> "Travel"
                    "groceries" -> "Food"
                    "fuel" -> "Travel"
                    "mobile recharge" -> "Utilities"
                    "health" -> "Health"
                    "entertainment" -> "Entertainment"
                    "shopping" -> "Shopping"
                    "food" -> "Food"
                    "bus travel" -> "Travel"
                    else -> null
                }
                if (mappedCategory != null) {
                    val byCat = activeTypes.firstOrNull { it.category?.equals(mappedCategory, ignoreCase = true) == true }
                    if (byCat != null) return byCat.id
                    val byName = activeTypes.firstOrNull { it.name.equals(mappedCategory, ignoreCase = true) }
                    if (byName != null) return byName.id
                }
            }

            // 4. Partial or normalized substring match on name
            if (cleanSuggestion != null) {
                val lowerS = cleanSuggestion.lowercase()
                val match = activeTypes.firstOrNull {
                    val lowerName = it.name.lowercase()
                    lowerName.contains(lowerS) || lowerS.contains(lowerName)
                }
                if (match != null) return match.id
            }

            // 5. Merchant-based matching
            if (cleanMerchant != null) {
                val lowerM = cleanMerchant.lowercase()
                val match = activeTypes.firstOrNull {
                    val lowerName = it.name.lowercase()
                    lowerName.contains(lowerM) || lowerM.contains(lowerName)
                }
                if (match != null) return match.id
            }

            // 6. Active type named or categorized Other or General
            val otherType = activeTypes.firstOrNull {
                it.name.equals("Other", ignoreCase = true) ||
                it.category?.equals("Other", ignoreCase = true) == true ||
                it.name.equals("General", ignoreCase = true) ||
                it.category?.equals("General", ignoreCase = true) == true
            }
            if (otherType != null) return otherType.id

            // 7. First active expense type fallback
            return activeTypes.first().id
        }

        /**
         * Fetches active expense types from the backend API.
         */
        fun fetchActiveExpenseTypes(backendUrl: String): List<ActiveExpenseType> {
            val urlStr = buildEndpointUrl(backendUrl, "expense-types?archived=exclude")
            var conn: HttpURLConnection? = null
            return try {
                conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 10000
                    readTimeout = 10000
                    setRequestProperty("Accept", "application/json")
                }
                if (conn.responseCode in 200 until 300) {
                    val responseBody = conn.inputStream.use { it.readBytes() }.toString(Charsets.UTF_8)
                    parseExpenseTypesJson(responseBody)
                } else {
                    Log.w(TAG, "Failed to fetch expense types: HTTP ${conn.responseCode}")
                    emptyList()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Exception fetching expense types from $urlStr", e)
                emptyList()
            } finally {
                conn?.disconnect()
            }
        }

        /**
         * Synchronizes a transaction candidate, preferring the enhanced /api/sms/ingest endpoint
         * which handles both credit (income) and debit (expense) transactions, bank account linking,
         * balance updates, and idempotency. Falls back to /api/expenses if needed.
         */
        fun syncTransaction(
            backendUrl: String,
            record: TransactionRecord,
            activeTypes: List<ActiveExpenseType>
        ): SyncResult {
            val parsed = record.parsed
            if (parsed.amountPaise == null) {
                return SyncResult(false, false, null, "Missing amount")
            }

            // Attempt enhanced SMS ingest endpoint first (/api/sms/ingest)
            val ingestResult = ingestSms(backendUrl, record)
            if (ingestResult != null) {
                return ingestResult
            }

            // Fallback to traditional /api/expenses endpoint
            return createExpense(backendUrl, record, activeTypes)
        }

        /**
         * Posts a transaction to the backend /api/sms/ingest endpoint.
         */
        fun ingestSms(
            backendUrl: String,
            record: TransactionRecord
        ): SyncResult? {
            val parsed = record.parsed
            val amount = parsed.amountPaise ?: return null
            val url = buildEndpointUrl(backendUrl, "sms/ingest")
            val direction = if (parsed.status == TxnStatus.CREDIT) "CREDIT" else "DEBIT"
            val expenseDate = parsed.transactionDate ?: toIsoDate(parsed.timestampMs ?: System.currentTimeMillis())

            var connection: HttpURLConnection? = null
            return try {
                connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15000
                    readTimeout = 15000
                    doOutput = true
                    addRequestProperty("Content-Type", "application/json")
                    addRequestProperty("Accept", "application/json")
                    addRequestProperty("Idempotency-Key", record.id)
                }

                val obj = JSONObject().apply {
                    put("amount_paise", amount)
                    put("direction", direction)
                    put("reference", parsed.reference ?: JSONObject.NULL)
                    put("transaction_date", expenseDate)
                    put("merchant_or_payer", parsed.merchant ?: JSONObject.NULL)
                    put("suggested_category", parsed.categorySuggestion ?: JSONObject.NULL)
                    put("account_suffix", parsed.accountSuffix ?: JSONObject.NULL)
                    put("bank_name", parsed.bankName ?: JSONObject.NULL)
                    put("available_balance_paise", parsed.availableBalancePaise ?: JSONObject.NULL)
                    put("idempotency_key", record.id)
                    put("sender", parsed.sender ?: JSONObject.NULL)
                    put("raw_text", parsed.evidence ?: JSONObject.NULL)
                }

                connection.outputStream.use { it.write(obj.toString().toByteArray(Charsets.UTF_8)) }
                val code = connection.responseCode
                if (code == 404) {
                    // Endpoint not found on legacy backend; return null to trigger fallback
                    return null
                }

                if (code in 200 until 300) {
                    val resp = connection.inputStream.use { it.readBytes() }.toString(Charsets.UTF_8)
                    val idMatch = Regex("""(?i)"(?:entity_)?id"\s*:\s*(\d+)""").find(resp)
                    val entityId = idMatch?.groupValues?.get(1)?.toIntOrNull()
                    val isCreated = resp.contains(""""status":"created"""") || resp.contains(""""created":\s*true""") || resp.contains(""""created":true""")
                    val isReplayed = resp.contains(""""status":"replayed"""") || resp.contains(""""replayed":\s*true""") || resp.contains(""""replayed":true""")
                    SyncResult(
                        created = isCreated,
                        replayed = isReplayed,
                        expenseId = entityId,
                        error = null,
                    )
                } else {
                    val err = try {
                        connection.errorStream?.use { it.readBytes() }?.toString(Charsets.UTF_8)
                    } catch (_: Exception) { null }
                    SyncResult(false, false, null, "HTTP $code: ${err ?: "Request failed"}")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Ingest failed; will retry or fall back", e)
                null
            } finally {
                connection?.disconnect()
            }
        }

        /**
         * Posts a single transaction to the backend expenses endpoint.
         */
        fun createExpense(
            backendUrl: String,
            record: TransactionRecord,
            activeTypes: List<ActiveExpenseType>
        ): SyncResult {
            val parsed = record.parsed
            val typeId = resolveExpenseTypeId(parsed.categorySuggestion, parsed.merchant, activeTypes)
                ?: return SyncResult(false, false, null, "No matching expense type; queued for review")

            if (parsed.amountPaise == null) {
                return SyncResult(false, false, null, "Missing amount")
            }
            val expenseDate = parsed.transactionDate ?: toIsoDate(parsed.timestampMs ?: System.currentTimeMillis())
            val note = buildNote(parsed)
            val merchant = parsed.merchant

            val url = buildEndpointUrl(backendUrl, "expenses")
            val idempotencyKey = record.id

            var connection: HttpURLConnection? = null
            return try {
                connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15000
                    readTimeout = 15000
                    doOutput = true
                    addRequestProperty("Content-Type", "application/json")
                    addRequestProperty("Accept", "application/json")
                    addRequestProperty("Idempotency-Key", idempotencyKey)
                }
                val body = buildJsonExpense(typeId, parsed.amountPaise, expenseDate, note, merchant)
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                val responseCode = connection.responseCode
                val replayed = connection.headerFields["X-Idempotent-Replay"]?.any {
                    it.equals("true", ignoreCase = true)
                } == true

                if (responseCode in 200 until 300) {
                    val responseBody = connection.inputStream.use { it.readBytes() }.toString(Charsets.UTF_8)
                    val expenseId = parseExpenseId(responseBody)
                    SyncResult(
                        created = (responseCode == 201),
                        replayed = replayed || (responseCode == 200),
                        expenseId = expenseId,
                        error = null,
                    )
                } else {
                    val errBody = try {
                        connection.errorStream?.use { it.readBytes() }?.toString(Charsets.UTF_8)
                    } catch (_: Exception) { null }
                    SyncResult(false, false, null, "HTTP $responseCode: ${errBody ?: "Request failed"}")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Expense creation failed", e)
                SyncResult(false, false, null, e.message ?: "Network error")
            } finally {
                connection?.disconnect()
            }
        }

        fun buildJsonExpense(
            expenseTypeId: Int,
            amountPaise: Long,
            expenseDate: String,
            note: String?,
            merchant: String?,
        ): String {
            val obj = JSONObject()
            obj.put("expense_type_id", expenseTypeId)
            obj.put("amount_paise", amountPaise)
            obj.put("expense_date", expenseDate)
            obj.put("note", note ?: JSONObject.NULL)
            obj.put("merchant", merchant ?: JSONObject.NULL)
            obj.put("payment_method", JSONObject.NULL)
            return obj.toString()
        }

        fun buildNote(parsed: ParsedTransaction): String {
            val parts = mutableListOf<String>()
            parsed.reference?.let { parts.add("SMS ref: $it") }
            parsed.sender?.let { parts.add("Sender: $it") }
            return if (parts.isNotEmpty()) parts.joinToString("; ") else "Auto-detected from SMS"
        }

        fun parseExpenseId(body: String): Int? {
            val idMatch = Regex("""(?i)"id"\s*:\s*(\d+)""").find(body)
            return idMatch?.groupValues?.get(1)?.toIntOrNull()?.takeIf { it > 0 }
        }

        fun toIsoDate(millis: Long): String {
            return SimpleDateFormat("yyyy-MM-dd", Locale.ENGLISH).format(Date(millis))
        }
    }
}
