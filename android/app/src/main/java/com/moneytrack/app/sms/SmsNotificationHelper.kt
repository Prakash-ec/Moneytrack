package com.moneytrack.app.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.moneytrack.app.MainActivity

private const val CHANNEL_SMS_REVIEW = "moneytrack_sms_review"
private const val CHANNEL_SECURITY_ALERTS = "moneytrack_security_alerts"
private const val CHANNEL_WEEKLY_REPORTS = "moneytrack_weekly_reports"
private const val TAG = "MoneytrackNotifications"

object SmsNotificationHelper {

    private var lastNotificationId = 100

    fun showReviewNotification(context: Context, record: TransactionRecord) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createChannelsIfNeeded(manager)

        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = android.net.Uri.parse("com.moneytrack.app://review?id=${record.id}")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            record.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val amount = record.parsed.amountPaise?.let { formatInr(it) } ?: "payment"
        val merchant = record.parsed.merchant ?: record.parsed.sender ?: "Unrecognised merchant"
        val title = "Action Required: Authorise Payment"
        val body = "Unrecognised payment of $amount at $merchant detected. Tap to authorise and add to your expenses."

        val builder = NotificationCompat.Builder(context, CHANNEL_SMS_REVIEW)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .addAction(
                android.R.drawable.ic_menu_edit,
                "Authorise Now",
                pendingIntent
            )
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setOnlyAlertOnce(false)

        val id = (record.notificationId ?: nextId()).coerceAtLeast(1)
        manager.notify(TAG, id, builder.build())

        // Persist the assigned id so tapping/updates stay consistent.
        if (record.notificationId == null) {
            val store = TransactionStore(context)
            store.upsert(record.copy(notificationId = id))
        }
    }

    fun showSecurityAlertNotification(
        context: Context,
        alertId: Long,
        merchant: String,
        amountPaise: Long,
        reason: String
    ) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createChannelsIfNeeded(manager)

        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = android.net.Uri.parse("com.moneytrack.app://security?id=$alertId")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            ("sec_$alertId").hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val amountStr = formatInr(amountPaise)
        val title = "⚠️ Unusual Activity: $amountStr at $merchant"
        val body = "MoneyTrack detected an unusual transaction ($reason). Tap to review and protect your account."

        val builder = NotificationCompat.Builder(context, CHANNEL_SECURITY_ALERTS)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .addAction(
                android.R.drawable.ic_menu_search,
                "Review Now",
                pendingIntent
            )
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)

        val id = nextId()
        manager.notify(TAG, id, builder.build())
    }

    fun showWeeklyReportNotification(
        context: Context,
        periodLabel: String,
        totalSpentPaise: Long,
        savingsRate: Double
    ) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createChannelsIfNeeded(manager)

        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = android.net.Uri.parse("com.moneytrack.app://report")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            "weekly_report".hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val spentStr = formatInr(totalSpentPaise)
        val title = "📊 Weekly Spending Summary ($periodLabel)"
        val body = "You spent $spentStr last week with a ${String.format("%.1f", savingsRate)}% savings rate. Tap to view your breakdown."

        val builder = NotificationCompat.Builder(context, CHANNEL_WEEKLY_REPORTS)
            .setSmallIcon(android.R.drawable.ic_menu_agenda)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .addAction(
                android.R.drawable.ic_menu_view,
                "View Report",
                pendingIntent
            )
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)

        val id = nextId()
        manager.notify(TAG, id, builder.build())
    }

    fun cancelAll(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancelAll()
    }

    private fun formatInr(paise: Long): String {
        val whole = Math.abs(paise) / 100
        val fraction = Math.abs(paise) % 100
        return "₹${whole}.${String.format("%02d", fraction)}"
    }

    private fun createChannelsIfNeeded(manager: NotificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (manager.getNotificationChannel(CHANNEL_SMS_REVIEW) == null) {
                val ch1 = NotificationChannel(CHANNEL_SMS_REVIEW, "Payment Authorisation", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "MoneyTrack payment authorisation and unrecognised transaction alerts"
                    enableLights(true)
                    enableVibration(true)
                }
                manager.createNotificationChannel(ch1)
            }
            if (manager.getNotificationChannel(CHANNEL_SECURITY_ALERTS) == null) {
                val ch2 = NotificationChannel(CHANNEL_SECURITY_ALERTS, "Payment Security & Fraud", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Urgent alerts for potentially unusual debits, rapid transactions, and security concerns"
                    enableLights(true)
                    enableVibration(true)
                }
                manager.createNotificationChannel(ch2)
            }
            if (manager.getNotificationChannel(CHANNEL_WEEKLY_REPORTS) == null) {
                val ch3 = NotificationChannel(CHANNEL_WEEKLY_REPORTS, "Weekly Spending Reports", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Scheduled Monday summary of previous week expenses, cashflow, and savings rate"
                }
                manager.createNotificationChannel(ch3)
            }
        }
    }

    private fun nextId(): Int {
        lastNotificationId += 1
        return lastNotificationId
    }
}
