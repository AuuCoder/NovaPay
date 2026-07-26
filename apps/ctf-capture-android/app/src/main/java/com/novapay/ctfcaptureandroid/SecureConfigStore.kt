package com.novapay.ctfcaptureandroid

import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object SecureConfigStore {
    private const val ANDROID_KEY_STORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "novapay_capture_sensitive_config_v1"
    private const val CIPHER_TRANSFORMATION = "AES/GCM/NoPadding"
    private const val ENCRYPTED_PREFIX = "secure."
    private val supportedKeys = setOf("token", "collectorSecret")

    fun read(prefs: SharedPreferences, key: String): String {
        requireSupportedKey(key)
        val encrypted = prefs.getString(encryptedPreferenceKey(key), null)

        if (!encrypted.isNullOrBlank()) {
            return decrypt(key, encrypted)
        }

        val legacy = prefs.getString(key, "")?.trim().orEmpty()
        if (legacy.isNotBlank()) {
            write(prefs, key, legacy)
        }
        return legacy
    }

    fun write(prefs: SharedPreferences, key: String, value: String) {
        requireSupportedKey(key)
        val normalized = value.trim()
        val editor = prefs.edit().remove(key)

        if (normalized.isBlank()) {
            editor.remove(encryptedPreferenceKey(key)).commit()
            return
        }

        editor.putString(encryptedPreferenceKey(key), encrypt(key, normalized)).commit()
    }

    private fun encrypt(key: String, plaintext: String): String {
        val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        cipher.updateAAD(aad(key))
        val ciphertext = cipher.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8))

        return JSONObject()
            .put("version", 1)
            .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .toString()
    }

    private fun decrypt(key: String, envelope: String): String {
        val payload = JSONObject(envelope)
        require(payload.optInt("version") == 1) { "Unsupported secure config version." }
        val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateSecretKey(),
            GCMParameterSpec(128, Base64.decode(payload.getString("iv"), Base64.NO_WRAP)),
        )
        cipher.updateAAD(aad(key))
        return String(
            cipher.doFinal(Base64.decode(payload.getString("ciphertext"), Base64.NO_WRAP)),
            StandardCharsets.UTF_8,
        )
    }

    @Synchronized
    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    private fun aad(key: String) =
        "novapay-capture:$key:v1".toByteArray(StandardCharsets.UTF_8)

    private fun encryptedPreferenceKey(key: String) = "$ENCRYPTED_PREFIX$key"

    private fun requireSupportedKey(key: String) {
        require(key in supportedKeys) { "Unsupported sensitive config key." }
    }
}
