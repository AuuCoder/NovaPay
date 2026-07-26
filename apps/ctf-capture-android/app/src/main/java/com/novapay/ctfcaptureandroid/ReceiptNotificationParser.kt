package com.novapay.ctfcaptureandroid

import android.app.Notification
import android.os.Bundle
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import java.text.DecimalFormat

object ReceiptNotificationParser {
    private val amountRegex = Regex("""([0-9]+(?:\.[0-9]{1,2})?)""")
    private val receiptKeywords = listOf("收款", "到账", "成功收款", "二维码收款", "微信支付收款", "支付宝收款")

    fun detectChannelCode(packageName: String): String? {
        return when (packageName) {
            "com.eg.android.AlipayGphone" -> "ctf.alipay.monitor"
            "com.tencent.mm" -> "ctf.wxpay.monitor"
            else -> null
        }
    }

    fun buildRawNotificationJson(sbn: StatusBarNotification): JSONObject? {
        val packageName = sbn.packageName ?: return null
        val channelCode = detectChannelCode(packageName) ?: return null
        val extras = sbn.notification?.extras ?: Bundle.EMPTY
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty()
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            ?.map { it.toString() }
            ?: emptyList()
        val mergedText = listOf(title, text, bigText, subText, *lines.toTypedArray())
            .filter { it.isNotBlank() }
            .joinToString(separator = "\n")

        return JSONObject()
            .put("packageName", packageName)
            .put("channelCode", channelCode)
            .put("channelId", sbn.notification?.channelId.orEmpty())
            .put("postTime", sbn.postTime)
            .put("notificationId", sbn.id)
            .put("title", title)
            .put("text", text)
            .put("bigText", bigText)
            .put("subText", subText)
            .put("textLines", JSONArray(lines))
            .put("mergedText", mergedText)
    }

    fun parse(sbn: StatusBarNotification): ParsedNotification? {
        val packageName = sbn.packageName ?: return null
        val channelCode = detectChannelCode(packageName) ?: return null
        val rawJson = buildRawNotificationJson(sbn) ?: return null
        val title = rawJson.optString("title")
        val text = rawJson.optString("text")
        val bigText = rawJson.optString("bigText")
        val mergedText = rawJson.optString("mergedText")

        if (receiptKeywords.none { mergedText.contains(it) }) {
            return null
        }

        val amountMatch = amountRegex.find(mergedText) ?: return null
        val amount = DecimalFormat("0.00").format(amountMatch.groupValues[1].toDouble())
        val externalBillId = buildExternalBillId(channelCode, sbn.postTime, sbn.id, mergedText)
        val payer = extractPayer(title, text, bigText)
        val remark = extractRemark(mergedText)

        val bill = ReceiptBill(
            channelCode = channelCode,
            amount = amount,
            currency = "CNY",
            paidAt = java.time.Instant.ofEpochMilli(sbn.postTime).toString(),
            externalBillId = externalBillId,
            payerAccount = payer,
            remark = remark,
            source = if (channelCode == "ctf.alipay.monitor") "notif-alipay-listener" else "notif-wechat-listener",
        )

        return ParsedNotification(bill, rawJson)
    }

    private fun buildExternalBillId(channelCode: String, postTime: Long, notificationId: Int, mergedText: String): String {
        val prefix = if (channelCode == "ctf.alipay.monitor") "NOTIFY_ALIPAY" else "NOTIFY_WXPAY"
        val hash = mergedText.hashCode().toUInt().toString(16)
        return "${prefix}_${postTime}_${notificationId}_$hash"
    }

    private fun extractPayer(title: String, text: String, bigText: String): String {
        val source = listOf(title, text, bigText).firstOrNull { it.isNotBlank() }.orEmpty()
        val fromMatch = Regex("""(?:来自|付款方|付款人)[:：]?\s*([^\n，, ]{1,32})""").find(source)
        return fromMatch?.groupValues?.getOrNull(1)?.trim().orEmpty().ifBlank { title.ifBlank { "unknown" } }
    }

    private fun extractRemark(mergedText: String): String {
        val orderMatch = Regex("""ORDER[-_A-Z0-9]{6,}""", RegexOption.IGNORE_CASE).find(mergedText)
        if (orderMatch != null) {
            return orderMatch.value
        }
        return mergedText.take(120)
    }

    data class ParsedNotification(
        val bill: ReceiptBill,
        val rawJson: JSONObject,
    )
}
