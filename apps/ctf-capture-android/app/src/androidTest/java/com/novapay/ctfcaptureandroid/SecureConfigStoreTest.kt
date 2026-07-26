package com.novapay.ctfcaptureandroid

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SecureConfigStoreTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val prefs = context.getSharedPreferences("secure_config_store_test", Context.MODE_PRIVATE)

    @Before
    fun setUp() {
        prefs.edit().clear().commit()
    }

    @After
    fun tearDown() {
        prefs.edit().clear().commit()
    }

    @Test
    fun encryptsSensitiveValuesWithoutKeepingPlaintext() {
        val secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

        SecureConfigStore.write(prefs, "collectorSecret", secret)

        assertFalse(prefs.contains("collectorSecret"))
        val encrypted = prefs.getString("secure.collectorSecret", null)
        assertNotNull(encrypted)
        assertNotEquals(secret, encrypted)
        assertEquals(secret, SecureConfigStore.read(prefs, "collectorSecret"))
    }

    @Test
    fun migratesAndDeletesLegacyPlaintext() {
        val token = "legacy-callback-token"
        prefs.edit().putString("token", token).commit()

        assertEquals(token, SecureConfigStore.read(prefs, "token"))
        assertFalse(prefs.contains("token"))
        assertNotNull(prefs.getString("secure.token", null))
    }
}
