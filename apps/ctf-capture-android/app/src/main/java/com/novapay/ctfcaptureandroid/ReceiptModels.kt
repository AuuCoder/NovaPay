package com.novapay.ctfcaptureandroid

import org.json.JSONObject

data class ReceiptBill(
    val channelCode: String,
    val amount: String,
    val currency: String,
    val paidAt: String,
    val externalBillId: String,
    val payerAccount: String,
    val remark: String,
    val source: String,
) {
    fun toJson(): JSONObject {
        return JSONObject()
            .put("channelCode", channelCode)
            .put("amount", amount)
            .put("currency", currency)
            .put("paidAt", paidAt)
            .put("externalBillId", externalBillId)
            .put("payerAccount", payerAccount)
            .put("remark", remark)
            .put("source", source)
    }
}
