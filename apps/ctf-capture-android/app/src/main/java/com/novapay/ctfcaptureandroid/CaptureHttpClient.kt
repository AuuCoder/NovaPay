package com.novapay.ctfcaptureandroid

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

object CaptureHttpClient {
    fun postJson(
        url: String,
        collectorSecret: String?,
        tlsPin: String?,
        body: JSONObject,
    ): JSONObject {
        val endpoint = URL(url)
        require(endpoint.protocol.equals("https", ignoreCase = true)) {
            "Capture endpoint must use HTTPS."
        }
        val connection = (endpoint.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            if (!collectorSecret.isNullOrBlank()) {
                setRequestProperty("x-ctf-capture-secret", collectorSecret)
            }
        }

        return try {
            connection.outputStream.use { output ->
                output.write(body.toString().toByteArray(StandardCharsets.UTF_8))
            }

            val statusCode = connection.responseCode
            val tlsLeafPin = TlsPinning.verify(connection, tlsPin)
            val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
            val text = readText(stream)
            val json = try {
                if (text.isBlank()) JSONObject() else JSONObject(text)
            } catch (_: Throwable) {
                JSONObject().put("ok", statusCode in 200..299).put("rawText", text)
            }
            if (!json.has("httpStatus")) {
                json.put("httpStatus", statusCode)
            }
            if (tlsLeafPin != null && !json.has("tlsLeafPin")) {
                json.put("tlsLeafPin", tlsLeafPin)
            }
            json
        } finally {
            connection.disconnect()
        }
    }

    private fun readText(stream: InputStream?): String {
        if (stream == null) {
            return ""
        }
        return BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
            buildString {
                while (true) {
                    val line = reader.readLine() ?: break
                    append(line).append('\n')
                }
            }.trim()
        }
    }
}
