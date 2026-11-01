package com.moneytrack.app.sms

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.concurrent.TimeUnit
import org.json.JSONObject

private const val TAG = "WeeklyReportWorker"
private const val WORK_NAME = "moneytrack_weekly_report_sync"

class WeeklyReportWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val store = TransactionStore(applicationContext)
        val settings = store.getSettings()
        val backendUrl = settings.backendUrl?.trim()?.takeIf { it.isNotBlank() } ?: return Result.success()

        if (!settings.notificationsEnabled) {
            Log.d(TAG, "Notifications disabled in settings; skipping weekly report worker.")
            return Result.success()
        }

        try {
            val endpointUrl = SyncWorker.buildEndpointUrl(backendUrl, "/api/reports/weekly")
            val url = URL(endpointUrl)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 10000
                readTimeout = 10000
                setRequestProperty("Accept", "application/json")
            }

            val code = conn.responseCode
            if (code in 200..299) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val responseText = reader.use { it.readText() }
                conn.disconnect()

                val json = JSONObject(responseText)
                val periodLabel = json.optString("period_label", "Last Week")
                val totalExpensePaise = json.optLong("total_expense_paise", 0L)
                val savingsRate = json.optDouble("savings_rate_percent", 0.0)

                SmsNotificationHelper.showWeeklyReportNotification(
                    applicationContext,
                    periodLabel,
                    totalExpensePaise,
                    savingsRate
                )
                Log.i(TAG, "Weekly report notification posted successfully for $periodLabel")
                return Result.success()
            } else {
                Log.w(TAG, "Backend returned HTTP $code when querying weekly report")
                conn.disconnect()
                return Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch weekly report: ${e.message}", e)
            return Result.retry()
        }
    }

    companion object {
        fun scheduleWeeklyWork(context: Context) {
            val now = Calendar.getInstance()
            val nextMonday = Calendar.getInstance().apply {
                set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
                set(Calendar.HOUR_OF_DAY, 9)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
                if (before(now)) {
                    add(Calendar.DAY_OF_YEAR, 7)
                }
            }

            val initialDelayMillis = (nextMonday.timeInMillis - now.timeInMillis).coerceAtLeast(60000L)

            val request = PeriodicWorkRequestBuilder<WeeklyReportWorker>(7, TimeUnit.DAYS)
                .setInitialDelay(initialDelayMillis, TimeUnit.MILLISECONDS)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
            Log.i(TAG, "Enqueued periodic weekly report worker with initial delay: ${initialDelayMillis / 1000}s")
        }
    }
}
