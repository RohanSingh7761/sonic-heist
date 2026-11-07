package com.sonicheist.audio

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class SonicAudioModule : Module() {
    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "React context is gone" }

    override fun definition() = ModuleDefinition {
        Name("SonicAudio")
        Events("onMessage", "onTick")

        OnCreate {
            PatrolEngine.onMessage = { bytes, heardAt ->
                sendEvent("onMessage", mapOf("bytes" to bytes.map { it.toInt() and 0xff }, "heardAt" to heardAt.toDouble()))
            }
            PatrolService.onTick = { now -> sendEvent("onTick", mapOf("now" to now.toDouble())) }
        }

        OnDestroy {
            PatrolLog.add("JS module destroyed")
            PatrolEngine.onMessage = null
            PatrolService.onTick = null
        }

        Function("isPatrolling") { PatrolService.running }

        // Must be called while the app is on screen: Android refuses to start a microphone service from the background.
        Function("startPatrol") {
            ContextCompat.startForegroundService(context, Intent(context, PatrolService::class.java))
        }

        Function("stopPatrol") {
            context.stopService(Intent(context, PatrolService::class.java))
        }

        AsyncFunction("transmit") { bytes: List<Int>, protocol: Int, volume: Int, delayMs: Int, promise: Promise ->
            val payload = ByteArray(bytes.size) { bytes[it].toByte() }
            PatrolEngine.transmit(payload, protocol, volume, delayMs.toLong()) { result ->
                result.fold(
                    { promise.resolve(it.toDouble()) },
                    { promise.reject("ERR_TRANSMIT", it.message ?: "Could not play the message", it) }
                )
            }
        }

        Function("alert") { title: String, body: String ->
            PatrolService.fireAlert(context, title, body)
        }

        Function("selfTest") { PatrolEngine.selfTest() }

        // Native because this takes tens of seconds in JavaScript. Expo runs async functions off the main thread.
        AsyncFunction("pbkdf2") { password: String, salt: String, iterations: Int, bytes: Int ->
            val spec = PBEKeySpec(password.toCharArray(), salt.toByteArray(Charsets.UTF_8), iterations, bytes * 8)
            try {
                SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
                    .joinToString("") { "%02x".format(it) }
            } finally {
                spec.clearPassword()
            }
        }

        Function("appendLog") { text: String -> PatrolLog.add(text) }

        Function("getPref") { key: String ->
            context.getSharedPreferences("sonic_audio", Context.MODE_PRIVATE).getString(key, null)
        }

        Function("setPref") { key: String, value: String ->
            context.getSharedPreferences("sonic_audio", Context.MODE_PRIVATE).edit().putString(key, value).apply()
        }

        Function("isBatteryUnrestricted") {
            context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)
        }

        Function("openBatterySettings") {
            context.startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }
}
