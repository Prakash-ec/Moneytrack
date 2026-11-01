package com.moneytrack.app.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.telephony.SmsMessage
import android.util.Log

private const val TAG = "MoneytrackSmsReceiver"

/**
 * Native receiver for incoming SMS messages. Registered in the manifest so it
 * can run while the app is in the background. It only acts when SMS automation
 * has been enabled by the user and the required permission is granted.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != "android.provider.Telephony.SMS_RECEIVED") return

        val store = TransactionStore(context)
        val settings = store.getSettings()
        if (!settings.smsAutomationEnabled) {
            Log.d(TAG, "SMS automation disabled; ignoring message.")
            return
        }

        val messages = messagesFromIntent(intent) ?: return
        for (sms in messages) {
            val body = sms.messageBody ?: ""
            val sender = sms.originatingAddress
            val timestampMs = sms.timestampMillis
            processIncoming(context, store, body, sender, timestampMs)
        }
    }

    private fun messagesFromIntent(intent: Intent): Array<SmsMessage>? {
        val bundle = intent.extras ?: return null
        val pdus = bundle.get("pdus") ?: return null
        val format = bundle.getString("format")
        return if (pdus is Array<*>) {
            pdus.mapNotNull { pdu ->
                val bytes = when (pdu) {
                    is ByteArray -> pdu
                    else -> null
                }
                bytes?.let { SmsMessage.createFromPdu(it, format) }
            }.toTypedArray()
        } else null
    }

    private fun processIncoming(
        context: Context,
        store: TransactionStore,
        body: String,
        sender: String?,
        timestampMs: Long,
    ) {
        val parsed = SmsParser.parse(body, sender, timestampMs)
        val decision = SmsEligibility.decide(parsed, body.lowercase())

        val id = Fingerprint.of(sender, timestampMs, parsed.amountPaise, parsed.reference, parsed.transactionDate)
        val existing = store.loadQueue().find { it.id == id }

        val now = System.currentTimeMillis()
        val record = when (decision.status) {
            CandidateStatus.IGNORED -> TransactionRecord(
                id = id, status = CandidateStatus.IGNORED, parsed = parsed,
                reason = decision.reason, createdAtMs = now,
            )
            CandidateStatus.PENDING_REVIEW -> {
                val notify = existing == null || !existing.notified
                TransactionRecord(
                    id = id,
                    status = CandidateStatus.PENDING_REVIEW,
                    parsed = parsed,
                    reason = decision.reason,
                    createdAtMs = existing?.createdAtMs ?: now,
                    notified = existing?.notified ?: notify,
                    notificationId = existing?.notificationId,
                )
            }
            CandidateStatus.READY_TO_SYNC -> TransactionRecord(
                id = id,
                status = CandidateStatus.READY_TO_SYNC,
                parsed = parsed,
                reason = decision.reason,
                createdAtMs = existing?.createdAtMs ?: now,
                syncedAtMs = existing?.syncedAtMs,
                error = existing?.error,
                retryCount = existing?.retryCount ?: 0,
                notified = existing?.notified ?: false,
                notificationId = existing?.notificationId,
            )
            else -> existing?.let {
                TransactionRecord(
                    id = id, status = decision.status, parsed = parsed,
                    reason = decision.reason, createdAtMs = it.createdAtMs,
                    syncedAtMs = it.syncedAtMs, error = it.error,
                    retryCount = it.retryCount, notified = it.notified,
                    notificationId = it.notificationId,
                )
            } ?: TransactionRecord(
                id = id, status = decision.status, parsed = parsed,
                reason = decision.reason, createdAtMs = now,
            )
        }

        store.upsert(record)

        when (record.status) {
            CandidateStatus.PENDING_REVIEW -> {
                if (!record.notified) {
                    SmsNotificationHelper.showReviewNotification(context, record)
                    val updated = record.copy(notified = true)
                    store.upsert(updated)
                }
            }
            CandidateStatus.READY_TO_SYNC -> {
                enqueueSync(context)
            }
            else -> {}
        }
    }

    private fun enqueueSync(context: Context) {
        try {
            val workManager = androidx.work.WorkManager.getInstance(context)
            val request = androidx.work.OneTimeWorkRequestBuilder<SyncWorker>()
                .setInitialDelay(2, java.util.concurrent.TimeUnit.SECONDS)
                .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 30, java.util.concurrent.TimeUnit.SECONDS)
                .build()
            workManager.enqueue(request)
        } catch (_: Exception) {
            // WorkManager unavailable; sync will be attempted on app resume.
        }
    }
}
