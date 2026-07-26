package com.novapay.ctfcaptureandroid

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.Collections
import java.util.LinkedHashMap

class ReceiptNotificationListenerService : NotificationListenerService() {
    companion object {
        private const val TAG = "NovaPayReceiptListener"
        private const val KEEP_ALIVE_CHANNEL_ID = "novapay_receipt_listener"
        private const val KEEP_ALIVE_NOTIFICATION_ID = 7210
        private const val PERIODIC_SCAN_INTERVAL_MS = 5_000L
        private const val PERIODIC_SCAN_MAX_AGE_MS = 10 * 60 * 1000L
        private const val RECENT_HANDLED_LIMIT = 256

        @Volatile
        private var connectedService: ReceiptNotificationListenerService? = null

        fun scanConnectedActiveNotifications(source: String = "manual_scan"): Boolean {
            val service = connectedService ?: return false
            service.scanActiveNotifications(source)
            return true
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val recentHandledNotifications = Collections.synchronizedMap(
        object : LinkedHashMap<String, Long>(RECENT_HANDLED_LIMIT, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean {
                return size > RECENT_HANDLED_LIMIT
            }
        },
    )
    private val periodicScanRunnable = object : Runnable {
        override fun run() {
            scanActiveNotifications(source = "periodic_scan")
            mainHandler.postDelayed(this, PERIODIC_SCAN_INTERVAL_MS)
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        connectedService = this
        Log.i(TAG, "notification listener connected")
        startKeepAliveForeground()
        scanActiveNotifications(source = "listener_connected")
        mainHandler.removeCallbacks(periodicScanRunnable)
        mainHandler.postDelayed(periodicScanRunnable, PERIODIC_SCAN_INTERVAL_MS)
    }

    override fun onListenerDisconnected() {
        Log.w(TAG, "notification listener disconnected")
        mainHandler.removeCallbacks(periodicScanRunnable)
        connectedService = null
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(periodicScanRunnable)
        stopKeepAliveForeground()
        if (connectedService === this) {
            connectedService = null
        }
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) {
            return
        }
        Log.i(TAG, "notification posted package=${sbn.packageName} id=${sbn.id} postTime=${sbn.postTime}")
        handleNotification(sbn, source = "posted")
    }

    private fun scanActiveNotifications(source: String) {
        val notifications = activeNotifications.orEmpty()
        Log.i(TAG, "scan active notifications source=$source count=${notifications.size}")
        notifications.forEach { notification ->
            handleNotification(notification, source = source)
        }
    }

    private fun handleNotification(sbn: StatusBarNotification, source: String) {
        val rawNotification = ReceiptNotificationParser.buildRawNotificationJson(sbn)
            ?: run {
                if (sbn.packageName == "com.eg.android.AlipayGphone" || sbn.packageName == "com.tencent.mm") {
                    Log.w(TAG, "target package notification ignored before raw build package=${sbn.packageName} id=${sbn.id}")
                }
                return
            }
        if (source == "periodic_scan" && System.currentTimeMillis() - sbn.postTime > PERIODIC_SCAN_MAX_AGE_MS) {
            return
        }
        val notificationKey = listOf(
            sbn.packageName,
            sbn.id.toString(),
            sbn.postTime.toString(),
            rawNotification.optString("mergedText").hashCode().toString(),
        ).joinToString("|")
        if (source != "manual_refresh" && source != "manual_refresh_delayed") {
            synchronized(recentHandledNotifications) {
                if (recentHandledNotifications.containsKey(notificationKey)) {
                    return
                }
                recentHandledNotifications[notificationKey] = System.currentTimeMillis()
            }
        }
        rawNotification.put("listenerSource", source)
        val config = CaptureConfigStore.readConfig(this)
        val notificationChannelCode = rawNotification.optString("channelCode")
        if (config.listenerChannelCode.isNotBlank() && config.listenerChannelCode != notificationChannelCode) {
            Log.i(TAG, "notification filtered channel=$notificationChannelCode configured=${config.listenerChannelCode}")
            CaptureConfigStore.writeNotificationDebugState(
                context = this,
                state = "raw_seen_filtered",
                payload = rawNotification,
                error = "Notification channel does not match the configured listener target.",
            )
            return
        }
        CaptureConfigStore.writeNotificationDebugState(
            context = this,
            state = "raw_seen",
            payload = rawNotification,
        )

        val parsed = ReceiptNotificationParser.parse(sbn)
        if (parsed == null) {
            Log.w(TAG, "notification raw_seen_unparsed package=${sbn.packageName} id=${sbn.id} text=${rawNotification.optString("mergedText").take(120)}")
            CaptureConfigStore.writeNotificationDebugState(
                context = this,
                state = "raw_seen_unparsed",
                payload = rawNotification,
                error = "Notification reached listener, but parser did not classify it as a receipt bill.",
            )
            return
        }
        val payload = parsed.bill.toJson().put("rawNotification", parsed.rawJson)

        runCatching {
            BillCacheDatabase(this).use { database ->
                database.upsertBill(parsed.bill)
            }
            Log.i(TAG, "bill captured externalBillId=${parsed.bill.externalBillId} amount=${parsed.bill.amount} paidAt=${parsed.bill.paidAt} source=$source")
        }

        CaptureConfigStore.writeNotificationState(
            context = this,
            state = "captured",
            payload = payload,
        )

        postCapturePayload(
            config = config,
            payload = payload,
            externalBillId = parsed.bill.externalBillId,
            label = "bill",
        )
    }

    private fun postCapturePayload(
        config: CaptureConfigStore.Config,
        payload: org.json.JSONObject,
        externalBillId: String,
        label: String,
    ) {
        if (!config.autoPostNotifications) {
            Log.i(TAG, "auto post disabled externalBillId=$externalBillId")
            return
        }

        val captureUrl = CaptureConfigStore.buildCaptureUrl(config)
        if (captureUrl.isNullOrBlank()) {
            Log.w(TAG, "capture url missing externalBillId=$externalBillId")
            CaptureConfigStore.writeNotificationState(
                context = this,
                state = "captured_not_posted",
                payload = payload,
                error = "captureUrl missing",
            )
            return
        }

        Thread {
            runCatching {
                val response = CaptureHttpClient.postJson(
                    url = captureUrl,
                    collectorSecret = config.collectorSecret,
                    tlsPin = config.tlsPin,
                    body = payload,
                )
                Log.i(TAG, "$label posted externalBillId=$externalBillId ok=${response.optBoolean("ok", false)} status=${response.optString("status")} matched=${response.optBoolean("matched", false)}")
                writePostResult(label, payload, response)
            }.onFailure { error ->
                Log.e(TAG, "$label post failed externalBillId=$externalBillId", error)
                writePostFailure(label, payload, error.message ?: error.javaClass.simpleName)
            }
        }.start()
    }

    private fun writePostResult(label: String, payload: org.json.JSONObject, response: org.json.JSONObject) {
        val ok = response.optBoolean("ok", false)
        if (ok || label == "bill") {
            CaptureConfigStore.writeNotificationState(
                context = this,
                state = if (ok) "posted" else "post_failed",
                payload = payload,
                result = response,
                error = if (ok) null else response.optString("message"),
            )
            return
        }

        CaptureConfigStore.writeNotificationDebugState(
            context = this,
            state = "voice_helper_post_ignored",
            payload = payload,
            error = response.optString("message").ifBlank { "voice helper hint was not accepted" },
        )
    }

    private fun writePostFailure(label: String, payload: org.json.JSONObject, message: String) {
        if (label == "bill") {
            CaptureConfigStore.writeNotificationState(
                context = this,
                state = "post_failed",
                payload = payload,
                error = message,
            )
            return
        }

        CaptureConfigStore.writeNotificationDebugState(
            context = this,
            state = "voice_helper_post_failed",
            payload = payload,
            error = message,
        )
    }

    private fun startKeepAliveForeground() {
        runCatching {
            val notification = buildKeepAliveNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    KEEP_ALIVE_NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
                )
            } else {
                startForeground(KEEP_ALIVE_NOTIFICATION_ID, notification)
            }
            Log.i(TAG, "keep-alive foreground started")
        }.onFailure { error ->
            Log.w(TAG, "keep-alive foreground unavailable: ${error.message}")
        }
    }

    private fun stopKeepAliveForeground() {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        }
    }

    private fun buildKeepAliveNotification(): Notification {
        ensureKeepAliveChannel()
        return NotificationCompat.Builder(this, KEEP_ALIVE_CHANNEL_ID)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle("NovaPay 收款监听")
            .setContentText("正在监听支付宝 / 微信到账通知")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun ensureKeepAliveChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(KEEP_ALIVE_CHANNEL_ID) != null) {
            return
        }
        manager.createNotificationChannel(
            NotificationChannel(
                KEEP_ALIVE_CHANNEL_ID,
                "NovaPay 收款监听",
                NotificationManager.IMPORTANCE_MIN,
            ).apply {
                description = "保持收款通知监听稳定运行"
                setShowBadge(false)
            },
        )
    }
}
