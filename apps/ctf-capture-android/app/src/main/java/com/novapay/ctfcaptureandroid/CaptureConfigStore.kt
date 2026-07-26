package com.novapay.ctfcaptureandroid

import android.content.Context
import org.json.JSONObject

object CaptureConfigStore {
    private const val PREFS_NAME = "novapay_ctf_capture_android"
    private const val DEFAULT_BASE_URL = "https://pay.muyuai.top"
    private const val DEFAULT_ALIPAY_ACCOUNT_ID = "cmqq33ggv001h0ipboim7y0qq"
    private const val KEY_NOTIFICATION_STATE = "notificationState"
    private const val KEY_NOTIFICATION_PAYLOAD = "notificationPayload"
    private const val KEY_NOTIFICATION_RESULT = "notificationResult"
    private const val KEY_NOTIFICATION_ERROR = "notificationError"
    private const val KEY_NOTIFICATION_DEBUG_STATE = "notificationDebugState"
    private const val KEY_NOTIFICATION_DEBUG_PAYLOAD = "notificationDebugPayload"
    private const val KEY_NOTIFICATION_DEBUG_ERROR = "notificationDebugError"

    fun prefs(context: Context) = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun readConfig(context: Context): Config {
        val prefs = prefs(context)
        return Config(
            baseUrl = prefs.getString("baseUrl", DEFAULT_BASE_URL)?.trim().orEmpty(),
            accountId = prefs.getString("accountId", DEFAULT_ALIPAY_ACCOUNT_ID)?.trim().orEmpty(),
            token = runCatching { SecureConfigStore.read(prefs, "token") }.getOrDefault(""),
            collectorSecret = runCatching {
                SecureConfigStore.read(prefs, "collectorSecret")
            }.getOrDefault(""),
            tlsPin = prefs.getString("tlsPin", "")?.trim().orEmpty(),
            listenerChannelCode = prefs.getString("listenerChannelCode", "ctf.alipay.monitor")?.trim().orEmpty(),
            autoPostNotifications = prefs.getBoolean("autoPostNotifications", true),
        )
    }

    fun buildCaptureUrl(config: Config): String? {
        if (config.baseUrl.isBlank() || config.accountId.isBlank() || config.token.isBlank()) {
            return null
        }
        return config.baseUrl.removeSuffix("/") + "/api/ctf/bill-capture/${config.accountId}/${config.token}"
    }

    fun writeNotificationState(
        context: Context,
        state: String,
        payload: JSONObject? = null,
        result: JSONObject? = null,
        error: String? = null,
    ) {
        prefs(context).edit()
            .putString(KEY_NOTIFICATION_STATE, state)
            .putString(KEY_NOTIFICATION_PAYLOAD, payload?.toString(2))
            .putString(KEY_NOTIFICATION_RESULT, result?.toString(2))
            .putString(KEY_NOTIFICATION_ERROR, error)
            .apply()
    }

    fun readNotificationState(context: Context): NotificationState {
        val prefs = prefs(context)
        return NotificationState(
            state = prefs.getString(KEY_NOTIFICATION_STATE, "idle").orEmpty(),
            payload = prefs.getString(KEY_NOTIFICATION_PAYLOAD, "").orEmpty(),
            result = prefs.getString(KEY_NOTIFICATION_RESULT, "").orEmpty(),
            error = prefs.getString(KEY_NOTIFICATION_ERROR, "").orEmpty(),
        )
    }

    fun writeNotificationDebugState(
        context: Context,
        state: String,
        payload: JSONObject? = null,
        error: String? = null,
    ) {
        prefs(context).edit()
            .putString(KEY_NOTIFICATION_DEBUG_STATE, state)
            .putString(KEY_NOTIFICATION_DEBUG_PAYLOAD, payload?.toString(2))
            .putString(KEY_NOTIFICATION_DEBUG_ERROR, error)
            .apply()
    }

    fun readNotificationDebugState(context: Context): NotificationState {
        val prefs = prefs(context)
        return NotificationState(
            state = prefs.getString(KEY_NOTIFICATION_DEBUG_STATE, "idle").orEmpty(),
            payload = prefs.getString(KEY_NOTIFICATION_DEBUG_PAYLOAD, "").orEmpty(),
            result = "",
            error = prefs.getString(KEY_NOTIFICATION_DEBUG_ERROR, "").orEmpty(),
        )
    }

    data class Config(
        val baseUrl: String,
        val accountId: String,
        val token: String,
        val collectorSecret: String,
        val tlsPin: String,
        val listenerChannelCode: String,
        val autoPostNotifications: Boolean,
    )

    data class NotificationState(
        val state: String,
        val payload: String,
        val result: String,
        val error: String,
    )
}
