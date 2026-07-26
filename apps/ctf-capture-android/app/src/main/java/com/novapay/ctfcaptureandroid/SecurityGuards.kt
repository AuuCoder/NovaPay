package com.novapay.ctfcaptureandroid

import android.os.Debug
import org.json.JSONObject
import java.io.File

object SecurityGuards {
    fun capture(): Snapshot {
        val debuggerAttached = Debug.isDebuggerConnected()
        val waitingForDebugger = Debug.waitingForDebugger()
        val tracerPid = readTracerPid()

        return Snapshot(
            debuggerAttached = debuggerAttached,
            waitingForDebugger = waitingForDebugger,
            tracerPid = tracerPid,
        )
    }

    fun assertAllowed(enabled: Boolean) {
        if (!enabled) {
            return
        }

        val snapshot = capture()
        if (snapshot.suspicious) {
            throw IllegalStateException(
                "anti-debug triggered: debuggerAttached=${snapshot.debuggerAttached}, " +
                    "waitingForDebugger=${snapshot.waitingForDebugger}, tracerPid=${snapshot.tracerPid}",
            )
        }
    }

    private fun readTracerPid(): Int {
        return runCatching {
            File("/proc/self/status")
                .readLines()
                .firstOrNull { line -> line.startsWith("TracerPid:") }
                ?.substringAfter(":")
                ?.trim()
                ?.toIntOrNull() ?: 0
        }.getOrDefault(0)
    }

    data class Snapshot(
        val debuggerAttached: Boolean,
        val waitingForDebugger: Boolean,
        val tracerPid: Int,
    ) {
        val suspicious: Boolean
            get() = debuggerAttached || waitingForDebugger || tracerPid > 0

        fun toJson(): JSONObject {
            return JSONObject()
                .put("debuggerAttached", debuggerAttached)
                .put("waitingForDebugger", waitingForDebugger)
                .put("tracerPid", tracerPid)
                .put("suspicious", suspicious)
        }
    }
}
