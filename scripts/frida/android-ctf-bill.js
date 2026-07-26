/**
 * Android CTF bill capture helper for authorized sandbox apps.
 *
 * Usage example:
 *   frida -U -f com.eg.android.AlipayGphone -l scripts/frida/android-ctf-bill.js --no-pause
 *
 * Notes:
 * - This is a generic template. Real sandbox builds may use different package / model names.
 * - Focus points: TLS pinning bypass, OkHttp request/response capture, JSON model capture,
 *   SQLite bill query capture.
 */

const KEYWORDS = /(bill|trade|order|record|amount|totalAmount|payTime|gmtPayment|buyerLogonId|remark|memo|subject|支付|账单|交易|金额)/i;

function safeString(value) {
  try {
    if (value === null || value === undefined) return null;
    return String(value);
  } catch (error) {
    return `<stringify-error:${error}>`;
  }
}

function sendLog(tag, payload) {
  send({
    tag,
    ts: new Date().toISOString(),
    payload,
  });
}

Java.perform(() => {
  sendLog("boot", { message: "android-ctf-bill hook loaded" });

  try {
    const SSLContext = Java.use("javax.net.ssl.SSLContext");
    const X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
    const TrustManager = Java.registerClass({
      name: "org.novapay.ctf.TrustManager",
      implements: [X509TrustManager],
      methods: {
        checkClientTrusted() {},
        checkServerTrusted() {},
        getAcceptedIssuers() {
          return [];
        },
      },
    });
    const trustManagers = [TrustManager.$new()];
    SSLContext.init.overload(
      "[Ljavax.net.ssl.KeyManager;",
      "[Ljavax.net.ssl.TrustManager;",
      "java.security.SecureRandom",
    ).implementation = function (keyManager, trustManager, secureRandom) {
      sendLog("tls.sslcontext.init", { bypass: true });
      return this.init(keyManager, trustManagers, secureRandom);
    };
  } catch (error) {
    sendLog("warn", { stage: "SSLContext.init", error: safeString(error) });
  }

  try {
    const CertificatePinner = Java.use("okhttp3.CertificatePinner");
    CertificatePinner.check.overloads.forEach((overload) => {
      overload.implementation = function () {
        sendLog("tls.okhttp.certificatePinner", {
          bypass: true,
          host: safeString(arguments[0]),
        });
        return;
      };
    });
  } catch (error) {
    sendLog("warn", { stage: "CertificatePinner.check", error: safeString(error) });
  }

  try {
    const TrustManagerImpl = Java.use("com.android.org.conscrypt.TrustManagerImpl");
    TrustManagerImpl.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host) {
      sendLog("tls.conscrypt.verifyChain", {
        bypass: true,
        host: safeString(host),
      });
      return untrustedChain;
    };
  } catch (error) {
    sendLog("warn", { stage: "TrustManagerImpl.verifyChain", error: safeString(error) });
  }

  try {
    const Buffer = Java.use("okio.Buffer");
    const RequestBuilder = Java.use("okhttp3.Request$Builder");
    RequestBuilder.build.implementation = function () {
      const request = this.build();
      try {
        const headers = request.headers();
        const headerNames = headers.names().toArray();
        const headerMap = {};
        for (let index = 0; index < headerNames.length; index += 1) {
          const name = String(headerNames[index]);
          headerMap[name] = safeString(headers.get(name));
        }

        let bodyText = null;
        const body = request.body();
        if (body) {
          const buffer = Buffer.$new();
          body.writeTo(buffer);
          bodyText = safeString(buffer.readUtf8());
        }

        const url = safeString(request.url());
        if (KEYWORDS.test(`${url}\n${bodyText ?? ""}`)) {
          sendLog("http.request", {
            method: safeString(request.method()),
            url,
            headers: headerMap,
            body: bodyText,
          });
        }
      } catch (error) {
        sendLog("warn", { stage: "Request$Builder.build", error: safeString(error) });
      }
      return request;
    };
  } catch (error) {
    sendLog("warn", { stage: "okhttp request hook", error: safeString(error) });
  }

  try {
    const RealCall = Java.use("okhttp3.RealCall");
    RealCall.execute.implementation = function () {
      const response = this.execute();
      try {
        const request = response.request();
        const url = safeString(request.url());
        const bodyText = safeString(response.peekBody(1024 * 1024).string());
        if (KEYWORDS.test(`${url}\n${bodyText ?? ""}`)) {
          sendLog("http.response", {
            code: response.code(),
            url,
            body: bodyText,
          });
        }
      } catch (error) {
        sendLog("warn", { stage: "RealCall.execute", error: safeString(error) });
      }
      return response;
    };
  } catch (error) {
    sendLog("warn", { stage: "okhttp response hook", error: safeString(error) });
  }

  try {
    const JSONObject = Java.use("org.json.JSONObject");
    JSONObject.toString.implementation = function () {
      const result = this.toString();
      if (KEYWORDS.test(result)) {
        sendLog("json.object", { text: safeString(result) });
      }
      return result;
    };
  } catch (error) {
    sendLog("warn", { stage: "JSONObject.toString", error: safeString(error) });
  }

  try {
    const Gson = Java.use("com.google.gson.Gson");
    Gson.fromJson.overloads.forEach((overload) => {
      overload.implementation = function () {
        const input = arguments[0];
        if (typeof input === "string" && KEYWORDS.test(input)) {
          sendLog("json.gson.fromJson", {
            input: safeString(input),
            targetType: safeString(arguments[1]),
          });
        }
        return overload.apply(this, arguments);
      };
    });
  } catch (error) {
    sendLog("warn", { stage: "Gson.fromJson", error: safeString(error) });
  }

  try {
    const SQLiteDatabase = Java.use("android.database.sqlite.SQLiteDatabase");
    SQLiteDatabase.rawQuery.overload("java.lang.String", "[Ljava.lang.String;").implementation = function (sql, selectionArgs) {
      if (KEYWORDS.test(String(sql))) {
        sendLog("sqlite.rawQuery", {
          sql: safeString(sql),
          selectionArgs: selectionArgs ? Java.array("java.lang.String", selectionArgs) : null,
        });
      }
      return this.rawQuery(sql, selectionArgs);
    };
  } catch (error) {
    sendLog("warn", { stage: "SQLiteDatabase.rawQuery", error: safeString(error) });
  }

  sendLog("ready", {
    hooks: [
      "SSLContext.init",
      "CertificatePinner.check",
      "TrustManagerImpl.verifyChain",
      "okhttp3.Request$Builder.build",
      "okhttp3.RealCall.execute",
      "org.json.JSONObject.toString",
      "com.google.gson.Gson.fromJson",
      "android.database.sqlite.SQLiteDatabase.rawQuery",
    ],
  });
});
