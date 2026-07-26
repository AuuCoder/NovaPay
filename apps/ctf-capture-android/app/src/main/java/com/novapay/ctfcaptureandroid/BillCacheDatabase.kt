package com.novapay.ctfcaptureandroid

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

class BillCacheDatabase(context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE captured_bills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                external_bill_id TEXT NOT NULL UNIQUE,
                channel_code TEXT NOT NULL,
                amount TEXT NOT NULL,
                currency TEXT NOT NULL,
                paid_at TEXT NOT NULL,
                payer_account TEXT,
                remark TEXT,
                source TEXT,
                raw_json TEXT NOT NULL,
                captured_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
            """.trimIndent(),
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS captured_bills")
        onCreate(db)
    }

    fun upsertBill(bill: ReceiptBill) {
        val values = ContentValues().apply {
            put("external_bill_id", bill.externalBillId)
            put("channel_code", bill.channelCode)
            put("amount", bill.amount)
            put("currency", bill.currency)
            put("paid_at", bill.paidAt)
            put("payer_account", bill.payerAccount)
            put("remark", bill.remark)
            put("source", bill.source)
            put("raw_json", bill.toJson().toString())
        }
        writableDatabase.insertWithOnConflict(
            "captured_bills",
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE,
        )
    }

    fun listRecentBills(limit: Int = 10): List<CachedBill> {
        val result = mutableListOf<CachedBill>()
        val cursor = readableDatabase.rawQuery(
            """
            SELECT external_bill_id, channel_code, amount, currency, paid_at, payer_account, remark, source, raw_json, captured_at
            FROM captured_bills
            ORDER BY captured_at DESC, id DESC
            LIMIT ?
            """.trimIndent(),
            arrayOf(limit.toString()),
        )
        cursor.use {
            while (it.moveToNext()) {
                result += CachedBill(
                    externalBillId = it.getString(0),
                    channelCode = it.getString(1),
                    amount = it.getString(2),
                    currency = it.getString(3),
                    paidAt = it.getString(4),
                    payerAccount = it.getString(5) ?: "",
                    remark = it.getString(6) ?: "",
                    source = it.getString(7) ?: "",
                    rawJson = it.getString(8),
                    capturedAtEpochSeconds = it.getLong(9),
                )
            }
        }
        return result
    }

    fun exportRecentBillsJson(limit: Int = 10): JSONArray {
        val array = JSONArray()
        listRecentBills(limit).forEach { bill ->
            array.put(JSONObject(bill.rawJson))
        }
        return array
    }

    data class CachedBill(
        val externalBillId: String,
        val channelCode: String,
        val amount: String,
        val currency: String,
        val paidAt: String,
        val payerAccount: String,
        val remark: String,
        val source: String,
        val rawJson: String,
        val capturedAtEpochSeconds: Long,
    ) {
        fun toPrettyJson(): JSONObject = JSONObject(rawJson)
    }

    companion object {
        private const val DATABASE_NAME = "ctf_capture_cache.db"
        private const val DATABASE_VERSION = 1
    }
}
