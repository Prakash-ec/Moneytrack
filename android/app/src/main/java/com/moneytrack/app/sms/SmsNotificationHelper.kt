package com.moneytrack.app.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import java.util.Locale

const val CHANNEL_SMS_REVIEW = "moneytrack_sms_review"
const val CHANNEL_SECURITY_ALERTS = "moneytrack_security_alerts"
const val CHANNEL_WEEKLY_REPORTS = "moneytrack_weekly_reports"

const val TAG_SMS_REVIEW = "moneytrack_review"
const val TAG_SECURITY = "moneytrack_security"
const val TAG_WEEKLY = "moneytrack_weekly"
const val TAG_LEGACY = "MoneytrackNotifications"

const val WEEKLY_REPORT_NOTIFICATION_ID = 1_001

data class ReviewNotificationContent(
    val title: String,
    val body: String,
    val actionText: String
)

interface NotificationDispatcher {
    fun notify(
        tag: String,
        id: Int,
        channelId: String,
        title: String,
        body: String,
        actionText: String?,
        deepLink: String
    )
    fun cancel(tag: String, id: Int)
}

object SmsNotificationHelper {

    internal var dispatcherOverride: NotificationDispatcher? = null
    internal var storeProvider: ((Context?) -> TransactionStore)? = null

    private fun getStore(context: Context?): TransactionStore {
        return storeProvider?.invoke(context) ?: TransactionStore(context!!)
    }

    private fun getDispatcher(context: Context?): NotificationDispatcher {
        return dispatcherOverride ?: SystemNotificationDispatcher(context!!)
    }

    fun computeStableNotificationId(recordId: String): Int {
        val raw = recordId.hashCode() and 0x7FFFFFFF
        return 10_000 + (raw % 99_000_000)
    }

    fun computeSecurityAlertNotificationId(alertId: Long): Int {
        val raw = alertId.hashCode() and 0x7FFFFFFF
        return 200_000_000 + (raw % 100_000_000)
    }

    fun resolveNotificationId(
        existingId: Int?,
        recordId: String,
        usedIds: Set<Int>
    ): Int {
        if (existingId != null && existingId > 0) {
            return existingId
        }
        var candidate = computeStableNotificationId(recordId)
        var attempts = 0
        while (usedIds.contains(candidate) && attempts < 1000) {
            candidate = if (candidate >= 99_999_999) 10_000 else candidate + 1
            attempts++
        }
        return candidate
    }

    fun formatInr(paise: Long): String {
        val absPaise = Math.abs(paise)
        val whole = absPaise / 100
        val fraction = absPaise % 100
        return if (fraction == 0L) {
            "₹$whole"
        } else {
            "₹$whole.${String.format(Locale.ENGLISH, "%02d", fraction)}"
        }
    }

    fun buildReviewNotificationContent(record: TransactionRecord): ReviewNotificationContent {
        val title = "New Transaction Needs Review"
        val actionText = "Review Transaction"

        val p = record.parsed
        val hasAmount = p.amountPaise != null && p.amountPaise > 0
        val amountFormatted = if (hasAmount) formatInr(p.amountPaise!!) else null

        val rawMerchant = p.merchant?.trim()
        val isGenericMerchant = rawMerchant.isNullOrBlank() ||
            rawMerchant.equals("unknown", ignoreCase = true) ||
            rawMerchant.equals("unknown merchant", ignoreCase = true) ||
            rawMerchant.equals("unrecognised merchant", ignoreCase = true) ||
            rawMerchant.equals("unrecognized merchant", ignoreCase = true)

        val merchant = if (!isGenericMerchant) rawMerchant else null
        val merchantDisplay = merchant ?: "Merchant not identified"

        val destination = when (p.status) {
            TxnStatus.CREDIT -> "adding it to your income"
            TxnStatus.DEBIT -> "adding it to your expenses"
            else -> "adding it to your records"
        }

        val body = when {
            amountFormatted != null && merchant != null ->
                "A transaction of $amountFormatted at $merchant needs your review. Confirm its details and choose a category before $destination."
            amountFormatted != null && merchant == null ->
                "A bank SMS transaction of $amountFormatted ($merchantDisplay) needs your review. Confirm its details and choose a category before $destination."
            amountFormatted == null && merchant != null ->
                "A transaction at $merchant needs your review. Confirm its details and choose a category before $destination."
            else ->
                "A new transaction ($merchantDisplay) needs your review. Confirm its details and choose a category before $destination."
        }

        return ReviewNotificationContent(title, body, actionText)
    }

    @Synchronized
    fun showReviewNotification(context: Context?, record: TransactionRecord): Int {
        val store = getStore(context)
        val usedIds = store.loadQueue()
            .filter { it.id != record.id }
            .mapNotNull { it.notificationId }
            .toSet()

        val notifId = resolveNotificationId(record.notificationId, record.id, usedIds)
        val content = buildReviewNotificationContent(record)
        val deepLink = "com.moneytrack.app://review?id=${record.id}"

        getDispatcher(context).notify(
            tag = TAG_SMS_REVIEW,
            id = notifId,
            channelId = CHANNEL_SMS_REVIEW,
            title = content.title,
            body = content.body,
            actionText = content.actionText,
            deepLink = deepLink
        )

        // Persist the assigned ID in TransactionStore so it remains completely stable across restarts
        if (record.notificationId != notifId) {
            store.upsert(record.copy(notificationId = notifId))
        }

        return notifId
    }

    fun showSecurityAlertNotification(
        context: Context?,
        alertId: Long,
        merchant: String,
        amountPaise: Long,
        reason: String
    ): Int {
        val amountStr = formatInr(amountPaise)
        val cleanMerchant = merchant.takeIf { it.isNotBlank() } ?: "Merchant not identified"
        val title = "⚠️ Unusual Activity: $amountStr at $cleanMerchant"
        val body = "MoneyTrack detected an unusual transaction ($reason). Tap to review and protect your account."
        val notifId = computeSecurityAlertNotificationId(alertId)
        val deepLink = "com.moneytrack.app://security?id=$alertId"

        getDispatcher(context).notify(
            tag = TAG_SECURITY,
            id = notifId,
            channelId = CHANNEL_SECURITY_ALERTS,
            title = title,
            body = body,
            actionText = "Review Now",
            deepLink = deepLink
        )

        return notifId
    }

    fun showWeeklyReportNotification(
        context: Context?,
        periodLabel: String,
        totalSpentPaise: Long,
        savingsRate: Double
    ): Int {
        val spentStr = formatInr(totalSpentPaise)
        val title = "📊 Weekly Spending Summary ($periodLabel)"
        val body = "You spent $spentStr last week with a ${String.format(Locale.ENGLISH, "%.1f", savingsRate)}% savings rate. Tap to view your breakdown."
        val deepLink = "com.moneytrack.app://report"

        getDispatcher(context).notify(
            tag = TAG_WEEKLY,
            id = WEEKLY_REPORT_NOTIFICATION_ID,
            channelId = CHANNEL_WEEKLY_REPORTS,
            title = title,
            body = body,
            actionText = "View Report",
            deepLink = deepLink
        )

        return WEEKLY_REPORT_NOTIFICATION_ID
    }

    fun cancelReviewNotification(context: Context?, recordId: String) {
        val store = getStore(context)
        val record = store.loadQueue().find { it.id == recordId }
        val notifId = record?.notificationId ?: computeStableNotificationId(recordId)
        val dispatcher = getDispatcher(context)
        dispatcher.cancel(TAG_SMS_REVIEW, notifId)
        dispatcher.cancel(TAG_LEGACY, notifId)
    }

    fun cancelReviewNotificationById(context: Context?, notificationId: Int) {
        val dispatcher = getDispatcher(context)
        dispatcher.cancel(TAG_SMS_REVIEW, notificationId)
        dispatcher.cancel(TAG_LEGACY, notificationId)
    }

    fun cancelAllReviewNotifications(context: Context?) {
        val store = getStore(context)
        val queue = store.loadQueue()
        val dispatcher = getDispatcher(context)
        for (record in queue) {
            val notifId = record.notificationId ?: computeStableNotificationId(record.id)
            dispatcher.cancel(TAG_SMS_REVIEW, notifId)
            dispatcher.cancel(TAG_LEGACY, notifId)
        }
    }

    fun cancelSecurityAlertNotification(context: Context?, alertId: Long) {
        val notifId = computeSecurityAlertNotificationId(alertId)
        val dispatcher = getDispatcher(context)
        dispatcher.cancel(TAG_SECURITY, notifId)
        dispatcher.cancel(TAG_LEGACY, notifId)
    }

    fun cancelWeeklyReportNotification(context: Context?) {
        val dispatcher = getDispatcher(context)
        dispatcher.cancel(TAG_WEEKLY, WEEKLY_REPORT_NOTIFICATION_ID)
        dispatcher.cancel(TAG_LEGACY, WEEKLY_REPORT_NOTIFICATION_ID)
    }

    @Deprecated(
        message = "Do not use cancelAll as it clears security alerts and weekly reports. Use cancelReviewNotification or cancelAllReviewNotifications.",
        replaceWith = ReplaceWith("cancelAllReviewNotifications(context)")
    )
    fun cancelAll(context: Context?) {
        cancelAllReviewNotifications(context)
    }

    private class SystemNotificationDispatcher(private val context: Context) : NotificationDispatcher {
        private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        init {
            createChannelsIfNeeded(manager)
        }

        override fun notify(
            tag: String,
            id: Int,
            channelId: String,
            title: String,
            body: String,
            actionText: String?,
            deepLink: String
        ) {
            android.util.Log.i("MoneyTrackNotif", "Posting notification: tag=$tag id=$id channel=$channelId title=$title")
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = android.net.Uri.parse(deepLink)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                id,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            val iconRes = when (channelId) {
                CHANNEL_SECURITY_ALERTS -> android.R.drawable.ic_dialog_alert
                CHANNEL_WEEKLY_REPORTS -> android.R.drawable.ic_menu_agenda
                else -> android.R.drawable.ic_dialog_info
            }

            val priority = when (channelId) {
                CHANNEL_WEEKLY_REPORTS -> NotificationCompat.PRIORITY_DEFAULT
                else -> NotificationCompat.PRIORITY_HIGH
            }

            val builder = NotificationCompat.Builder(context, channelId)
                .setSmallIcon(iconRes)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(priority)
                .setDefaults(Notification.DEFAULT_ALL)
                .setOnlyAlertOnce(false)

            if (!actionText.isNullOrBlank()) {
                val actionIcon = when (channelId) {
                    CHANNEL_SECURITY_ALERTS -> android.R.drawable.ic_menu_search
                    CHANNEL_WEEKLY_REPORTS -> android.R.drawable.ic_menu_view
                    else -> android.R.drawable.ic_menu_edit
                }
                builder.addAction(actionIcon, actionText, pendingIntent)
            }

            manager.notify(tag, id, builder.build())
            android.util.Log.i("MoneyTrackNotif", "Successfully posted notification: tag=$tag id=$id")
        }

        override fun cancel(tag: String, id: Int) {
            android.util.Log.i("MoneyTrackNotif", "Cancelling notification: tag=$tag id=$id")
            manager.cancel(tag, id)
        }

        private fun createChannelsIfNeeded(manager: NotificationManager) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (manager.getNotificationChannel(CHANNEL_SMS_REVIEW) == null) {
                    val ch1 = NotificationChannel(
                        CHANNEL_SMS_REVIEW,
                        "Transaction Review",
                        NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Notifications for new transactions requiring your review before recording."
                        enableLights(true)
                        enableVibration(true)
                    }
                    manager.createNotificationChannel(ch1)
                }
                if (manager.getNotificationChannel(CHANNEL_SECURITY_ALERTS) == null) {
                    val ch2 = NotificationChannel(
                        CHANNEL_SECURITY_ALERTS,
                        "Payment Security & Fraud",
                        NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Urgent alerts for potentially unusual debits, rapid transactions, and security concerns."
                        enableLights(true)
                        enableVibration(true)
                    }
                    manager.createNotificationChannel(ch2)
                }
                if (manager.getNotificationChannel(CHANNEL_WEEKLY_REPORTS) == null) {
                    val ch3 = NotificationChannel(
                        CHANNEL_WEEKLY_REPORTS,
                        "Weekly Spending Reports",
                        NotificationManager.IMPORTANCE_DEFAULT
                    ).apply {
                        description = "Scheduled summary of previous week expenses, cashflow, and savings rate."
                    }
                    manager.createNotificationChannel(ch3)
                }
            }
        }
    }
}
