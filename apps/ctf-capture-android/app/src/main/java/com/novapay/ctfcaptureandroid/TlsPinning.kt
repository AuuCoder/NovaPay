package com.novapay.ctfcaptureandroid

import java.net.HttpURLConnection
import java.security.MessageDigest
import java.security.cert.X509Certificate
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLPeerUnverifiedException

object TlsPinning {
    fun verify(connection: HttpURLConnection, expectedPin: String?): String? {
        val normalizedExpected = expectedPin?.trim().orEmpty()
        if (connection !is HttpsURLConnection) {
            return null
        }

        val certificates = connection.serverCertificates
        val leafCertificate = certificates.firstOrNull() as? X509Certificate
            ?: throw SSLPeerUnverifiedException("No X509 leaf certificate found.")
        val actualPin = sha256Pin(leafCertificate)

        if (normalizedExpected.isBlank()) {
            return actualPin
        }

        if (!normalizedExpected.equals(actualPin, ignoreCase = true)) {
            throw SSLPeerUnverifiedException(
                "TLS pin mismatch. expected=$normalizedExpected actual=$actualPin",
            )
        }

        return actualPin
    }

    private fun sha256Pin(certificate: X509Certificate): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(certificate.publicKey.encoded)
        return "sha256/${android.util.Base64.encodeToString(hash, android.util.Base64.NO_WRAP)}"
    }
}
