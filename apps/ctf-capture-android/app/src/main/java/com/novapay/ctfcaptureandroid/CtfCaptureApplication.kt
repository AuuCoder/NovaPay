package com.novapay.ctfcaptureandroid

import android.app.Application

class CtfCaptureApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SecurityGuards.assertAllowed(BuildConfig.ANTI_DEBUG_DEFAULT && !BuildConfig.DEBUG)
    }
}
