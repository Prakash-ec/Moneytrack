package com.moneytrack.app

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.moneytrack.app.plugins.SmsPlugin
import com.moneytrack.app.sms.CandidateStatus
import com.moneytrack.app.sms.ParsedTransaction
import com.moneytrack.app.sms.SmsNotificationHelper
import com.moneytrack.app.sms.TransactionRecord
import com.moneytrack.app.sms.TransactionStore
import com.moneytrack.app.sms.TxnStatus

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SmsPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Set dark obsidian background for window decor behind system bars
        window.decorView.setBackgroundColor(Color.parseColor("#0B0F19"))

        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        android.util.Log.i("MoneyTrackTest", "handleIntent called with action=${intent.action}, data=${intent.dataString}")

        intent.dataString?.let { uriString ->
            val plugin = bridge?.getPlugin("SmsPlugin")?.instance as? SmsPlugin
            plugin?.handleDeepLink(uriString)
        }

        if (intent.action == "com.moneytrack.app.TEST_NOTIFICATION") {
            handleTestNotificationAction(intent)
        }
    }

    private fun handleTestNotificationAction(intent: Intent) {
        val actionType = intent.getStringExtra("test_action") ?: return
        android.util.Log.i("MoneyTrackTest", "handleTestNotificationAction actionType=$actionType, extras=${intent.extras}")
        val store = TransactionStore(this)

        when (actionType) {
            "show_review" -> {
                val id = intent.getStringExtra("record_id") ?: "test-${System.currentTimeMillis()}"
                val merchant = intent.getStringExtra("merchant") ?: "Swiggy"
                val amountPaise = intent.getLongExtra("amount_paise", 45000L)
                val statusStr = intent.getStringExtra("status") ?: "DEBIT"
                val status = if (statusStr == "CREDIT") TxnStatus.CREDIT else TxnStatus.DEBIT

                val record = TransactionRecord(
                    id = id,
                    status = CandidateStatus.PENDING_REVIEW,
                    parsed = ParsedTransaction(
                        amountPaise = amountPaise,
                        merchant = merchant,
                        reference = "REF-$id",
                        transactionDate = "2026-11-08",
                        transactionDateTime = null,
                        status = status,
                        categorySuggestion = "Food",
                        note = "ADB physical device test",
                        sender = "AD-HDFCBK",
                        timestampMs = System.currentTimeMillis(),
                        evidence = "ADB test $id"
                    ),
                    reason = "ADB Test Notification",
                    createdAtMs = System.currentTimeMillis()
                )
                val upserted = store.upsert(record)
                android.util.Log.i("MoneyTrackTest", "Upserted record: ${upserted.id}, now showing notification")
                val notifId = SmsNotificationHelper.showReviewNotification(this, upserted)
                android.util.Log.i("MoneyTrackTest", "ShowReviewNotification finished with id=$notifId")
            }
            "dismiss_review" -> {
                val id = intent.getStringExtra("record_id")
                val notifId = intent.getIntExtra("notif_id", -1)
                if (notifId > 0) {
                    SmsNotificationHelper.cancelReviewNotificationById(this, notifId)
                } else if (id != null) {
                    SmsNotificationHelper.cancelReviewNotification(this, id)
                }
            }
            "confirm_review" -> {
                val id = intent.getStringExtra("record_id") ?: return
                val record = store.loadQueue().find { it.id == id } ?: return
                val updated = record.copy(status = CandidateStatus.READY_TO_SYNC)
                store.upsert(updated)
                if (record.notificationId != null) {
                    SmsNotificationHelper.cancelReviewNotificationById(this, record.notificationId!!)
                } else {
                    SmsNotificationHelper.cancelReviewNotification(this, id)
                }
            }
            "show_security" -> {
                val alertId = intent.getLongExtra("alert_id", 99991L)
                val merchant = intent.getStringExtra("merchant") ?: "Unrecognised ATM"
                val amountPaise = intent.getLongExtra("amount_paise", 1000000L)
                val reason = intent.getStringExtra("reason") ?: "Rapid multiple ATM withdrawals detected"
                SmsNotificationHelper.showSecurityAlertNotification(this, alertId, merchant, amountPaise, reason)
            }
            "show_weekly" -> {
                val period = intent.getStringExtra("period") ?: "01 Nov - 07 Nov"
                val totalSpent = intent.getLongExtra("total_spent", 540000L)
                val savingsRate = intent.getDoubleExtra("savings_rate", 28.5)
                SmsNotificationHelper.showWeeklyReportNotification(this, period, totalSpent, savingsRate)
            }
            "cancel_all_review" -> {
                SmsNotificationHelper.cancelAllReviewNotifications(this)
            }
        }
    }
}
