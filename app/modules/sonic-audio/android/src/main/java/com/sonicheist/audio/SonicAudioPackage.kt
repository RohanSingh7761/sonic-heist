package com.sonicheist.audio

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

// Runs at app start, because Expo's fetch builds its network client as soon as its own module loads.
class SonicAudioPackage : Package {
    override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
        listOf(object : ApplicationLifecycleListener {
            override fun onCreate(application: Application) {
                NetworkSetup.install()
            }
        })
}
