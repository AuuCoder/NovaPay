package com.novapay.ctfcaptureandroid

import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

object BillEnvelopeCodec {
    private const val AES_MODE = "AES/CBC/PKCS5Padding"

    fun wrap(payload: JSONObject, secretMaterial: String): JSONObject {
        val raw = payload.toString().toByteArray(StandardCharsets.UTF_8)
        val gzipped = gzip(raw)
        val keyBytes = sha256(secretMaterial).copyOfRange(0, 16)
        val ivBytes = sha256("iv:$secretMaterial").copyOfRange(0, 16)

        val cipher = Cipher.getInstance(AES_MODE)
        cipher.init(
            Cipher.ENCRYPT_MODE,
            SecretKeySpec(keyBytes, "AES"),
            IvParameterSpec(ivBytes),
        )

        val encrypted = cipher.doFinal(gzipped)
        return JSONObject()
            .put("version", 1)
            .put("algorithm", "aes-128-cbc+gzip+base64")
            .put("keyHint", sha256Hex(secretMaterial).take(16))
            .put("blob", Base64.encodeToString(encrypted, Base64.NO_WRAP))
    }

    fun unwrap(root: JSONObject, secretMaterial: String): JSONObject {
        val blob = root.optString("blob")
        require(blob.isNotBlank()) { "wrapped payload missing blob" }

        val encrypted = Base64.decode(blob, Base64.DEFAULT)
        val keyBytes = sha256(secretMaterial).copyOfRange(0, 16)
        val ivBytes = sha256("iv:$secretMaterial").copyOfRange(0, 16)

        val cipher = Cipher.getInstance(AES_MODE)
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(keyBytes, "AES"),
            IvParameterSpec(ivBytes),
        )

        val decrypted = cipher.doFinal(encrypted)
        val ungzipped = gunzip(decrypted)
        return JSONObject(String(ungzipped, StandardCharsets.UTF_8))
    }

    private fun sha256(input: String): ByteArray {
        return MessageDigest.getInstance("SHA-256")
            .digest(input.toByteArray(StandardCharsets.UTF_8))
    }

    private fun sha256Hex(input: String): String {
        return sha256(input).joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    private fun gzip(input: ByteArray): ByteArray {
        val output = ByteArrayOutputStream()
        GZIPOutputStream(output).use { gzip ->
            gzip.write(input)
        }
        return output.toByteArray()
    }

    private fun gunzip(input: ByteArray): ByteArray {
        val output = ByteArrayOutputStream()
        GZIPInputStream(ByteArrayInputStream(input)).use { gzip ->
            gzip.copyTo(output)
        }
        return output.toByteArray()
    }
}
