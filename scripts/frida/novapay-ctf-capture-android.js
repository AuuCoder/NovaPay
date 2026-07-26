/**
 * Dedicated Frida helper for the NovaPay CTF Capture Android training app.
 *
 * Usage:
 *   frida -U -f com.novapay.ctfcaptureandroid.debug -l scripts/frida/novapay-ctf-capture-android.js --no-pause
 *
 * Targets:
 * - com.novapay.ctfcaptureandroid.TlsPinning.verify
 * - com.novapay.ctfcaptureandroid.BillCacheDatabase.upsertBill
 * - android.database.sqlite.SQLiteDatabase.rawQuery
 */

function safeString(value) {
  try {
    if (value === null || value === undefined) {
      return null;
    }
    return String(value);
  } catch (error) {
    return `<stringify-error:${error}>`;
  }
}

function emit(tag, payload) {
  send({
    tag,
    ts: new Date().toISOString(),
    payload,
  });
}

Java.perform(() => {
  emit("boot", { message: "novapay-ctf-capture-android hook loaded" });

  try {
    const TlsPinning = Java.use("com.novapay.ctfcaptureandroid.TlsPinning");
    TlsPinning.verify.implementation = function (connection, expectedPin) {
      const actual = this.verify(connection, expectedPin);
      emit("tls.verify", {
        expectedPin: safeString(expectedPin),
        actualPin: safeString(actual),
        bypass: false,
      });
      return actual;
    };
  } catch (error) {
    emit("warn", { stage: "TlsPinning.verify trace", error: safeString(error) });
  }

  try {
    const TlsPinning = Java.use("com.novapay.ctfcaptureandroid.TlsPinning");
    const original = TlsPinning.verify.overload("java.net.HttpURLConnection", "java.lang.String");
    original.implementation = function (connection, expectedPin) {
      let actualPin = null;
      try {
        actualPin = original.call(this, connection, "");
      } catch (error) {
        emit("warn", { stage: "TlsPinning.verify bypass pre-read", error: safeString(error) });
      }
      emit("tls.verify.bypass", {
        expectedPin: safeString(expectedPin),
        actualPin: safeString(actualPin),
        bypass: true,
      });
      return actualPin || "sha256/frida-bypassed";
    };
  } catch (error) {
    emit("warn", { stage: "TlsPinning.verify bypass", error: safeString(error) });
  }

  try {
    const BillCacheDatabase = Java.use("com.novapay.ctfcaptureandroid.BillCacheDatabase");
    BillCacheDatabase.upsertBill.implementation = function (bill) {
      let jsonText = null;
      try {
        jsonText = bill.toJson().toString();
      } catch (error) {
        jsonText = `<bill-toJson-error:${error}>`;
      }
      emit("db.upsertBill", {
        bill: jsonText,
      });
      return this.upsertBill(bill);
    };
  } catch (error) {
    emit("warn", { stage: "BillCacheDatabase.upsertBill", error: safeString(error) });
  }

  try {
    const SQLiteDatabase = Java.use("android.database.sqlite.SQLiteDatabase");
    SQLiteDatabase.rawQuery.overload("java.lang.String", "[Ljava.lang.String;").implementation = function (sql, selectionArgs) {
      emit("sqlite.rawQuery", {
        sql: safeString(sql),
        selectionArgs: selectionArgs ? Java.array("java.lang.String", selectionArgs) : null,
      });
      return this.rawQuery(sql, selectionArgs);
    };
  } catch (error) {
    emit("warn", { stage: "SQLiteDatabase.rawQuery", error: safeString(error) });
  }

  emit("ready", {
    hooks: [
      "TlsPinning.verify",
      "BillCacheDatabase.upsertBill",
      "SQLiteDatabase.rawQuery",
    ],
  });
});
