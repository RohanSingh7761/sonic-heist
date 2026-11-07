package com.sonicheist.audio

import android.util.Log

// Developer log only, read with adb logcat. Nothing is kept on the phone or shown to players.
object PatrolLog {
    fun add(text: String) {
        Log.i("SonicPatrol", text)
    }
}
