package com.novapay.ctfcaptureandroid

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private val notificationPermissionRequestCode = 7210
    private val productionBaseUrl = "https://pay.muyuai.top"
    private val productionAlipayAccountId = "cmqq33ggv001h0ipboim7y0qq"

    private lateinit var prefs: SharedPreferences

    private lateinit var inputCaptureEndpoint: EditText
    private lateinit var inputBaseUrl: EditText
    private lateinit var inputAccountId: EditText
    private lateinit var inputToken: EditText
    private lateinit var inputCollectorSecret: EditText
    private lateinit var spinnerListenerChannel: Spinner
    private lateinit var checkAutoPostNotifications: CheckBox

    private lateinit var textCaptureUrl: TextView
    private lateinit var textNotificationAccessStatus: TextView
    private lateinit var textNotificationPayload: TextView
    private lateinit var textNotificationPostResult: TextView

    private lateinit var buttonSaveConfig: Button
    private lateinit var buttonOpenNotificationAccess: Button
    private lateinit var buttonRefreshStatus: Button
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences("novapay_ctf_capture_android", MODE_PRIVATE)

        bindViews()
        bindSpinner()
        loadConfig()
        updateCaptureUrlPreview()
        updateNotificationListenerUi()
        requestPostNotificationsIfNeeded()

        buttonSaveConfig.setOnClickListener {
            runCatching {
                saveConfig()
                updateCaptureUrlPreview()
                updateNotificationListenerUi()
            }.onSuccess {
                showToast("监听配置已保存")
            }.onFailure { error ->
                showToast(error.message ?: "监听配置保存失败")
            }
        }
        buttonOpenNotificationAccess.setOnClickListener { openNotificationAccessSettings() }
        buttonRefreshStatus.setOnClickListener { refreshNotificationStatusAndScan() }
    }

    override fun onResume() {
        super.onResume()
        requestListenerRebindIfNeeded()
        updateNotificationListenerUi()
        mainHandler.postDelayed({
            ReceiptNotificationListenerService.scanConnectedActiveNotifications("activity_resume_delayed")
            updateNotificationListenerUi()
        }, 1500)
    }

    private fun bindViews() {
        inputCaptureEndpoint = findViewById(R.id.inputCaptureEndpoint)
        inputBaseUrl = findViewById(R.id.inputBaseUrl)
        inputAccountId = findViewById(R.id.inputAccountId)
        inputToken = findViewById(R.id.inputToken)
        inputCollectorSecret = findViewById(R.id.inputCollectorSecret)
        spinnerListenerChannel = findViewById(R.id.spinnerListenerChannel)
        checkAutoPostNotifications = findViewById(R.id.checkAutoPostNotifications)

        textCaptureUrl = findViewById(R.id.textCaptureUrl)
        textNotificationAccessStatus = findViewById(R.id.textNotificationAccessStatus)
        textNotificationPayload = findViewById(R.id.textNotificationPayload)
        textNotificationPostResult = findViewById(R.id.textNotificationPostResult)

        buttonSaveConfig = findViewById(R.id.buttonSaveConfig)
        buttonOpenNotificationAccess = findViewById(R.id.buttonOpenNotificationAccess)
        buttonRefreshStatus = findViewById(R.id.buttonRefreshStatus)
    }

    private fun bindSpinner() {
        val channels = listOf(
            "ctf.alipay.monitor" to "支付宝收款监听",
            "ctf.wxpay.monitor" to "微信收款监听",
        )
        spinnerListenerChannel.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            channels.map { it.second },
        )
    }

    private fun loadConfig() {
        inputCaptureEndpoint.setText("")
        inputBaseUrl.setText(prefs.getString("baseUrl", defaultBaseUrl()))
        inputAccountId.setText(prefs.getString("accountId", productionAlipayAccountId))
        inputToken.setText(runCatching { SecureConfigStore.read(prefs, "token") }.getOrDefault(""))
        inputCollectorSecret.setText(
            runCatching { SecureConfigStore.read(prefs, "collectorSecret") }.getOrDefault(""),
        )
        checkAutoPostNotifications.isChecked = prefs.getBoolean("autoPostNotifications", true)

        val savedChannel = prefs.getString("listenerChannelCode", "ctf.alipay.monitor") ?: "ctf.alipay.monitor"
        spinnerListenerChannel.setSelection(if (savedChannel == "ctf.wxpay.monitor") 1 else 0)
    }

    private fun saveConfig() {
        applyCaptureEndpointIfPresent()
        val token = inputToken.text.toString().trim()
        val collectorSecret = inputCollectorSecret.text.toString().trim()
        require(token.isNotBlank()) { "token 不能为空" }
        require(collectorSecret.isNotBlank()) { "collectorSecret 不能为空" }
        SecureConfigStore.write(prefs, "token", token)
        SecureConfigStore.write(prefs, "collectorSecret", collectorSecret)
        prefs.edit()
            .remove("captureEndpoint")
            .putString("baseUrl", inputBaseUrl.text.toString().trim())
            .putString("accountId", inputAccountId.text.toString().trim())
            .putString("listenerChannelCode", currentListenerChannelCode())
            .putBoolean("autoPostNotifications", checkAutoPostNotifications.isChecked)
            .apply()
        inputCaptureEndpoint.setText("")
    }

    private fun updateCaptureUrlPreview() {
        textCaptureUrl.text = try {
            buildCaptureUrl()
        } catch (_: Throwable) {
            "请先填写 baseUrl / accountId / token"
        }
    }

    private fun applyCaptureEndpointIfPresent() {
        val endpoint = inputCaptureEndpoint.text.toString().trim()
        if (endpoint.isBlank()) {
            return
        }

        val parsed = parseCaptureEndpoint(endpoint) ?: throw IllegalArgumentException(
            "完整上报地址格式不正确，应为 https://pay.muyuai.top/api/ctf/bill-capture/{accountId}/{token}",
        )
        inputBaseUrl.setText(parsed.baseUrl)
        inputAccountId.setText(parsed.accountId)
        inputToken.setText(parsed.token)
    }

    private fun updateNotificationListenerUi() {
        val enabled = isNotificationListenerEnabled()
        val config = CaptureConfigStore.readConfig(this)
        val state = CaptureConfigStore.readNotificationState(this)
        val debugState = CaptureConfigStore.readNotificationDebugState(this)

        textNotificationAccessStatus.text = JSONObject()
            .put("listenerEnabled", enabled)
            .put("listenerTarget", listenerTargetLabel(config.listenerChannelCode))
            .put("component", notificationListenerComponentName().flattenToShortString())
            .put("autoPostNotifications", config.autoPostNotifications)
            .put("deviceType", if (isEmulator()) "emulator" else "phone")
            .toString(2)

        textNotificationPayload.text = if (state.payload.isNotBlank()) {
            state.payload
        } else if (debugState.payload.isNotBlank()) {
            debugState.payload
        } else {
            "暂无通知记录"
        }

        textNotificationPostResult.text = JSONObject()
            .put("notificationState", state.state.ifBlank { "idle" })
            .put("postResult", if (state.result.isBlank()) JSONObject.NULL else state.result)
            .put("postError", if (state.error.isBlank()) JSONObject.NULL else state.error)
            .put("debugState", debugState.state.ifBlank { "idle" })
            .put("debugError", if (debugState.error.isBlank()) JSONObject.NULL else debugState.error)
            .toString(2)
    }

    private fun refreshNotificationStatusAndScan() {
        val scanned = ReceiptNotificationListenerService.scanConnectedActiveNotifications("manual_refresh")
        if (!scanned) {
            requestListenerRebindIfNeeded()
            showToast("正在重新连接通知监听，请稍后再点一次刷新")
        }

        mainHandler.postDelayed({
            ReceiptNotificationListenerService.scanConnectedActiveNotifications("manual_refresh_delayed")
            updateNotificationListenerUi()
        }, 1200)
        updateNotificationListenerUi()
    }

    private fun requestListenerRebindIfNeeded() {
        if (!isNotificationListenerEnabled()) {
            return
        }

        runCatching {
            NotificationListenerService.requestRebind(notificationListenerComponentName())
        }
    }

    private fun buildCaptureUrl(): String {
        applyCaptureEndpointPreviewOnly()
        val baseUrl = normalizedBaseUrl()
        val accountId = inputAccountId.text.toString().trim().ifBlank { "{accountId}" }
        val token = inputToken.text.toString().trim().ifBlank { "{token}" }
        return "$baseUrl/api/ctf/bill-capture/$accountId/$token"
    }

    private fun applyCaptureEndpointPreviewOnly() {
        val endpoint = inputCaptureEndpoint.text.toString().trim()
        val parsed = parseCaptureEndpoint(endpoint) ?: return
        inputBaseUrl.setText(parsed.baseUrl)
        inputAccountId.setText(parsed.accountId)
        inputToken.setText(parsed.token)
    }

    private fun parseCaptureEndpoint(endpoint: String): CaptureEndpointParts? {
        val marker = "/api/ctf/bill-capture/"
        val markerIndex = endpoint.indexOf(marker)
        if (markerIndex <= 0) {
            return null
        }

        val baseUrl = endpoint.substring(0, markerIndex).trim().removeSuffix("/")
        val parts = endpoint.substring(markerIndex + marker.length)
            .trim()
            .removePrefix("/")
            .split("/")
            .filter { it.isNotBlank() }

        if (baseUrl.isBlank() || parts.size < 2) {
            return null
        }

        return CaptureEndpointParts(
            baseUrl = baseUrl,
            accountId = parts[0],
            token = parts[1],
        )
    }

    private fun normalizedBaseUrl(): String {
        val value = inputBaseUrl.text.toString().trim()
        require(value.isNotBlank()) { "baseUrl 不能为空" }
        return value.removeSuffix("/")
    }

    private fun currentListenerChannelCode(): String {
        return if (spinnerListenerChannel.selectedItemPosition == 1) {
            "ctf.wxpay.monitor"
        } else {
            "ctf.alipay.monitor"
        }
    }

    private fun listenerTargetLabel(channelCode: String): String {
        return if (channelCode == "ctf.wxpay.monitor") "微信收款监听" else "支付宝收款监听"
    }

    private fun notificationListenerComponentName(): ComponentName {
        return ComponentName(this, ReceiptNotificationListenerService::class.java)
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val enabledListeners = Settings.Secure.getString(
            contentResolver,
            "enabled_notification_listeners",
        ).orEmpty()
        return enabledListeners.contains(notificationListenerComponentName().flattenToString())
    }

    private fun openNotificationAccessSettings() {
        runCatching {
            startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"))
        }.onFailure {
            showToast("无法打开通知监听设置，请手动前往系统设置开启")
        }
    }

    private fun requestPostNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return
        }
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            notificationPermissionRequestCode,
        )
    }

    private fun defaultBaseUrl(): String {
        return productionBaseUrl
    }

    private fun isEmulator(): Boolean {
        val fingerprint = Build.FINGERPRINT.lowercase()
        val model = Build.MODEL.lowercase()
        return fingerprint.contains("generic") ||
            fingerprint.contains("emulator") ||
            fingerprint.contains("sdk_gphone") ||
            model.contains("sdk") ||
            model.contains("emulator")
    }

    private fun showToast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private data class CaptureEndpointParts(
        val baseUrl: String,
        val accountId: String,
        val token: String,
    )
}
