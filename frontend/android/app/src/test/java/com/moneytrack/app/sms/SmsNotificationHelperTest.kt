package com.moneytrack.app.sms

import java.io.File
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmsNotificationHelperTest {

    private lateinit var tempDir: File
    private lateinit var testStore: TransactionStore
    private lateinit var fakeDispatcher: FakeNotificationDispatcher

    class FakeNotificationDispatcher : NotificationDispatcher {
        data class PostedNotification(
            val tag: String,
            val id: Int,
            val channelId: String,
            val title: String,
            val body: String,
            val actionText: String?,
            val deepLink: String
        )

        val active = mutableMapOf<Pair<String, Int>, PostedNotification>()
        val cancelHistory = mutableListOf<Pair<String, Int>>()

        override fun notify(
            tag: String,
            id: Int,
            channelId: String,
            title: String,
            body: String,
            actionText: String?,
            deepLink: String
        ) {
            active[Pair(tag, id)] = PostedNotification(
                tag, id, channelId, title, body, actionText, deepLink
            )
        }

        override fun cancel(tag: String, id: Int) {
            active.remove(Pair(tag, id))
            cancelHistory.add(Pair(tag, id))
        }
    }

    @Before
    fun setUp() {
        tempDir = Files.createTempDirectory("mt_notif_test").toFile()
        testStore = TransactionStore(tempDir)
        fakeDispatcher = FakeNotificationDispatcher()

        SmsNotificationHelper.dispatcherOverride = fakeDispatcher
        SmsNotificationHelper.storeProvider = { testStore }
    }

    @After
    fun tearDown() {
        SmsNotificationHelper.dispatcherOverride = null
        SmsNotificationHelper.storeProvider = null
        tempDir.deleteRecursively()
    }

    private fun createRecord(
        id: String,
        amountPaise: Long? = 45000L,
        merchant: String? = "Swiggy",
        status: TxnStatus = TxnStatus.DEBIT,
        sender: String? = "AD-HDFCBK"
    ): TransactionRecord {
        return TransactionRecord(
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
                note = "Auto-parsed",
                sender = sender,
                timestampMs = System.currentTimeMillis(),
                evidence = "Test transaction $id"
            ),
            reason = "Test candidate",
            createdAtMs = System.currentTimeMillis()
        )
    }

    // =========================================================================
    // Scenario A — Multiple SMS notifications
    // Generate three pending SMS review notifications. Dismiss the second.
    // Verify the first and third remain visible.
    // =========================================================================
    @Test
    fun `scenario A - multiple SMS notifications and individual dismissal`() {
        val r1 = createRecord("rec-1", 10000L, "Swiggy")
        val r2 = createRecord("rec-2", 25000L, "Zomato")
        val r3 = createRecord("rec-3", 50000L, "Amazon")

        testStore.upsertAll(listOf(r1, r2, r3))

        // Post all 3
        val id1 = SmsNotificationHelper.showReviewNotification(null, r1)
        val id2 = SmsNotificationHelper.showReviewNotification(null, r2)
        val id3 = SmsNotificationHelper.showReviewNotification(null, r3)

        // All 3 IDs must be unique
        assertEquals(3, setOf(id1, id2, id3).size)
        assertEquals(3, fakeDispatcher.active.size)

        // Dismiss second notification individually
        testStore.remove(r2.id)
        SmsNotificationHelper.cancelReviewNotificationById(null, id2)

        // Verify r2 is gone, but r1 and r3 remain visible
        assertFalse(fakeDispatcher.active.containsKey(Pair(TAG_SMS_REVIEW, id2)))
        assertTrue(fakeDispatcher.active.containsKey(Pair(TAG_SMS_REVIEW, id1)))
        assertTrue(fakeDispatcher.active.containsKey(Pair(TAG_SMS_REVIEW, id3)))
        assertEquals(2, fakeDispatcher.active.size)
    }

    // =========================================================================
    // Scenario B — Other notification types
    // Generate an SMS review notification, weekly report, and security alert.
    // Dismiss the SMS review notification. Verify weekly report & security remain.
    // =========================================================================
    @Test
    fun `scenario B - preserving weekly reports and security alerts on review dismissal`() {
        val r1 = createRecord("rec-100", 30000L, "Blinkit")
        testStore.upsert(r1)

        val reviewNotifId = SmsNotificationHelper.showReviewNotification(null, r1)
        val securityNotifId = SmsNotificationHelper.showSecurityAlertNotification(
            context = null,
            alertId = 9991L,
            merchant = "Unknown ATM",
            amountPaise = 1000000L,
            reason = "Rapid consecutive ATM withdrawal"
        )
        val weeklyNotifId = SmsNotificationHelper.showWeeklyReportNotification(
            context = null,
            periodLabel = "01 Nov - 07 Nov",
            totalSpentPaise = 540000L,
            savingsRate = 28.5
        )

        // Verify all 3 families are active
        assertEquals(3, fakeDispatcher.active.size)
        assertTrue(fakeDispatcher.active.containsKey(Pair(TAG_SMS_REVIEW, reviewNotifId)))
        assertTrue(fakeDispatcher.active.containsKey(Pair(TAG_SECURITY, securityNotifId)))
        assertTrue(fakeDispatcher.active.containsKey(Pair(TAG_WEEKLY, weeklyNotifId)))

        // Cancel only the review notification
        SmsNotificationHelper.cancelReviewNotification(null, r1.id)

        // Verify review notification is removed
        assertFalse(fakeDispatcher.active.containsKey(Pair(TAG_SMS_REVIEW, reviewNotifId)))

        // Verify weekly report and security alert are strictly preserved
        assertTrue(fakeDispatcher.active.containsKey(Pair(TAG_SECURITY, securityNotifId)))
        assertTrue(fakeDispatcher.active.containsKey(Pair(TAG_WEEKLY, weeklyNotifId)))
        assertEquals(2, fakeDispatcher.active.size)
    }

    // =========================================================================
    // Scenario C — Confirmation
    // Generate pending notification. Confirm transaction in MoneyTrack.
    // Verify notification disappears. Transaction remains available for syncing.
    // =========================================================================
    @Test
    fun `scenario C - confirmation dismisses notification while preserving record for sync`() {
        val r = createRecord("rec-confirm-1", 45000L, "Uber")
        testStore.upsert(r)

        val notifId = SmsNotificationHelper.showReviewNotification(null, r)
        assertTrue(fakeDispatcher.active.containsKey(Pair(TAG_SMS_REVIEW, notifId)))

        // Simulate confirmation: update status to READY_TO_SYNC and cancel notification
        val loaded = testStore.loadQueue().find { it.id == r.id }!!
        val updated = loaded.copy(status = CandidateStatus.READY_TO_SYNC)
        testStore.upsert(updated)
        SmsNotificationHelper.cancelReviewNotificationById(null, notifId)

        // Verify notification is dismissed from drawer
        assertFalse(fakeDispatcher.active.containsKey(Pair(TAG_SMS_REVIEW, notifId)))

        // Verify transaction record remains in queue and is READY_TO_SYNC
        val queueAfter = testStore.loadQueue()
        val persisted = queueAfter.find { it.id == r.id }
        assertNotNull(persisted)
        assertEquals(CandidateStatus.READY_TO_SYNC, persisted?.status)
    }

    // =========================================================================
    // Scenario D — Application restart
    // Generate multiple pending notifications. Recreate TransactionStore (restart).
    // Generate another notification. Verify identities do not collide.
    // =========================================================================
    @Test
    fun `scenario D - application restart preserves IDs and avoids collisions`() {
        val r1 = createRecord("rec-persist-1", 15000L, "Coffee Day")
        val r2 = createRecord("rec-persist-2", 35000L, "Shell Fuel")
        testStore.upsertAll(listOf(r1, r2))

        val id1 = SmsNotificationHelper.showReviewNotification(null, r1)
        val id2 = SmsNotificationHelper.showReviewNotification(null, r2)

        // Simulate app kill and process restart by creating a new TransactionStore from the same storage
        val restartedStore = TransactionStore(tempDir)
        SmsNotificationHelper.storeProvider = { restartedStore }

        val restored = restartedStore.loadQueue()
        val restoredR1 = restored.find { it.id == r1.id }!!
        val restoredR2 = restored.find { it.id == r2.id }!!

        assertEquals(id1, restoredR1.notificationId)
        assertEquals(id2, restoredR2.notificationId)

        // Now post a 3rd record after restart
        val r3 = createRecord("rec-persist-3", 75000L, "Croma")
        restartedStore.upsert(r3)
        val id3 = SmsNotificationHelper.showReviewNotification(null, r3)

        // Verify all 3 IDs remain completely distinct
        assertNotEquals(id1, id3)
        assertNotEquals(id2, id3)
    }

    // =========================================================================
    // Scenario E — Duplicate processing
    // Process same record twice -> no duplicate notification ID.
    // Two distinct records with identical amounts -> separate notifications.
    // =========================================================================
    @Test
    fun `scenario E - duplicate processing is idempotent and identical amounts get distinct IDs`() {
        val r1 = createRecord("rec-dup-1", 50000L, "Supermarket")
        testStore.upsert(r1)

        val idFirst = SmsNotificationHelper.showReviewNotification(null, r1)

        // Process again with updated record referencing same assigned notificationId
        val updatedR1 = testStore.loadQueue().find { it.id == r1.id }!!
        val idSecond = SmsNotificationHelper.showReviewNotification(null, updatedR1)

        // Must reuse exact same notification ID
        assertEquals(idFirst, idSecond)

        // Generate second distinct transaction with identical amount (₹500.00)
        val r2 = createRecord("rec-dup-2", 50000L, "Supermarket")
        testStore.upsert(r2)
        val idOther = SmsNotificationHelper.showReviewNotification(null, r2)

        // Distinct transactions must have distinct notification IDs
        assertNotEquals(idFirst, idOther)
    }

    // =========================================================================
    // Scenario F — Missing information & neutral wording
    // Test:
    // - Unknown merchant
    // - Missing date
    // - Ambiguous debit/credit direction
    // - Missing amount
    // - Unknown bank sender
    // =========================================================================
    @Test
    fun `scenario F - neutral non-alarmist wording for all edge cases`() {
        // Case 1: Standard debit with known merchant and amount
        val rStandard = createRecord("rec-f1", 45000L, "Swiggy", TxnStatus.DEBIT)
        val content1 = SmsNotificationHelper.buildReviewNotificationContent(rStandard)
        assertEquals("New Transaction Needs Review", content1.title)
        assertEquals("Review Transaction", content1.actionText)
        assertEquals(
            "A transaction of ₹450 at Swiggy needs your review. Confirm its details and choose a category before adding it to your expenses.",
            content1.body
        )

        // Case 2: Unknown merchant
        val rUnknownMerchant = createRecord("rec-f2", 120000L, null, TxnStatus.DEBIT)
        val content2 = SmsNotificationHelper.buildReviewNotificationContent(rUnknownMerchant)
        assertEquals("New Transaction Needs Review", content2.title)
        assertEquals(
            "A bank SMS transaction of ₹1200 (Merchant not identified) needs your review. Confirm its details and choose a category before adding it to your expenses.",
            content2.body
        )
        assertFalse(content2.body.contains("fraud", ignoreCase = true))
        assertFalse(content2.body.contains("unauthorised", ignoreCase = true))

        // Case 3: Credit transaction (Income)
        val rCredit = createRecord("rec-f3", 300000L, "Client Payment", TxnStatus.CREDIT)
        val content3 = SmsNotificationHelper.buildReviewNotificationContent(rCredit)
        assertEquals(
            "A transaction of ₹3000 at Client Payment needs your review. Confirm its details and choose a category before adding it to your income.",
            content3.body
        )

        // Case 4: Ambiguous status / direction
        val rAmbiguous = createRecord("rec-f4", 80000L, "Transfer", TxnStatus.UNKNOWN)
        val content4 = SmsNotificationHelper.buildReviewNotificationContent(rAmbiguous)
        assertEquals(
            "A transaction of ₹800 at Transfer needs your review. Confirm its details and choose a category before adding it to your records.",
            content4.body
        )

        // Case 5: Missing amount
        val rNoAmount = createRecord("rec-f5", null, "Merchant Corp", TxnStatus.DEBIT)
        val content5 = SmsNotificationHelper.buildReviewNotificationContent(rNoAmount)
        assertEquals(
            "A transaction at Merchant Corp needs your review. Confirm its details and choose a category before adding it to your expenses.",
            content5.body
        )

        // Case 6: Missing both merchant and amount with ambiguous status
        val rMinimal = createRecord("rec-f6", null, null, TxnStatus.UNKNOWN, sender = null)
        val content6 = SmsNotificationHelper.buildReviewNotificationContent(rMinimal)
        assertEquals(
            "A new transaction (Merchant not identified) needs your review. Confirm its details and choose a category before adding it to your records.",
            content6.body
        )
    }

    // =========================================================================
    // Format INR unit tests
    // =========================================================================
    @Test
    fun `formatInr handles whole rupees and fractions correctly`() {
        assertEquals("₹450", SmsNotificationHelper.formatInr(45000L))
        assertEquals("₹450.50", SmsNotificationHelper.formatInr(45050L))
        assertEquals("₹0.05", SmsNotificationHelper.formatInr(5L))
        assertEquals("₹10000", SmsNotificationHelper.formatInr(1000000L))
    }

    // =========================================================================
    // Concurrency Regression Test — Simultaneous Notification Creation
    // =========================================================================
    @Test
    fun `concurrency test - simultaneous notification creation resolves collision-free IDs`() {
        val threadCount = 10
        val executor = java.util.concurrent.Executors.newFixedThreadPool(threadCount)
        val startLatch = java.util.concurrent.CountDownLatch(1)
        val doneLatch = java.util.concurrent.CountDownLatch(threadCount)
        val assignedIds = java.util.Collections.synchronizedList(mutableListOf<Int>())

        val records = (1..threadCount).map { i ->
            createRecord("concurrent-rec-$i", 10000L * i, "Merchant $i")
        }
        testStore.upsertAll(records)

        for (rec in records) {
            executor.submit {
                try {
                    startLatch.await()
                    val id = SmsNotificationHelper.showReviewNotification(null, rec)
                    assignedIds.add(id)
                } finally {
                    doneLatch.countDown()
                }
            }
        }

        // Release all threads simultaneously
        startLatch.countDown()
        assertTrue("All threads must finish within 10 seconds", doneLatch.await(10, java.util.concurrent.TimeUnit.SECONDS))
        executor.shutdown()

        assertEquals(threadCount, assignedIds.size)
        // All assigned IDs must be completely unique with zero collisions
        val uniqueIds = assignedIds.toSet()
        assertEquals(threadCount, uniqueIds.size)
        assertEquals(threadCount, fakeDispatcher.active.size)
    }

    // =========================================================================
    // Transaction Lifecycle & Evidence Preservation Test
    // =========================================================================
    @Test
    fun `lifecycle test - state transitions and non-downgrading evidence preservation`() {
        // 1. Initial pending review record
        val initial = createRecord("rec-life-1", 50000L, "Swiggy")
        testStore.upsert(initial)
        val notifId = SmsNotificationHelper.showReviewNotification(null, initial)
        assertEquals(1, fakeDispatcher.active.size)

        // 2. PENDING_REVIEW -> READY_TO_SYNC (User confirms)
        val pending = testStore.loadQueue().find { it.id == initial.id }!!
        val confirmed = pending.copy(status = CandidateStatus.READY_TO_SYNC)
        testStore.upsert(confirmed)
        SmsNotificationHelper.cancelReviewNotificationById(null, notifId)

        val inSyncQueue = testStore.loadQueue().find { it.id == initial.id }!!
        assertEquals(CandidateStatus.READY_TO_SYNC, inSyncQueue.status)
        assertEquals(notifId, inSyncQueue.notificationId)
        assertEquals(0, fakeDispatcher.active.size) // Notification dismissed from drawer

        // 3. Repeated confirmation is idempotent
        testStore.upsert(inSyncQueue.copy(status = CandidateStatus.READY_TO_SYNC))
        val idempotentConfirmed = testStore.loadQueue().find { it.id == initial.id }!!
        assertEquals(CandidateStatus.READY_TO_SYNC, idempotentConfirmed.status)

        // 4. Retransmitted incoming SMS must NEVER downgrade READY_TO_SYNC back to PENDING_REVIEW
        val duplicateIncomingSms = initial.copy(status = CandidateStatus.PENDING_REVIEW, notificationId = null)
        testStore.upsert(duplicateIncomingSms)
        val afterDuplicate = testStore.loadQueue().find { it.id == initial.id }!!
        assertEquals(CandidateStatus.READY_TO_SYNC, afterDuplicate.status) // Must remain READY_TO_SYNC!
        assertEquals(notifId, afterDuplicate.notificationId) // Must preserve assigned ID!

        // 5. READY_TO_SYNC -> SYNCED (Background sync finishes successfully)
        val synced = afterDuplicate.copy(status = CandidateStatus.SYNCED, syncedAtMs = System.currentTimeMillis())
        testStore.upsert(synced)
        val finalRecord = testStore.loadQueue().find { it.id == initial.id }!!
        assertEquals(CandidateStatus.SYNCED, finalRecord.status)
        assertNotNull(finalRecord.syncedAtMs)
    }
}
