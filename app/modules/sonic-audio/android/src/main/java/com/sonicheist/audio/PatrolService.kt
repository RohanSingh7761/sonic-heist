package com.sonicheist.audio

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

class PatrolService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            onTick?.invoke(System.currentTimeMillis())
            handler.postDelayed(this, TICK_MS)
        }
    }

    companion object {
        const val ACTION_STOP = "com.sonicheist.audio.STOP_PATROL"
        private const val PATROL_CHANNEL = "sonic_heist_patrol"
        // A new id because Android keeps a channel's old sound setting for as long as that id exists.
        private const val ALERT_CHANNEL = "sonic_heist_alert_silent"
        private const val PATROL_NOTIFICATION = 1337
        private const val ALERT_NOTIFICATION = 1338
        private const val TICK_MS = 500L
        private val BUZZ = longArrayOf(0, 500, 200, 500, 200, 800)

        @Volatile var running = false
            private set

        // JavaScript timers can pause in the background, so this drives them instead.
        var onTick: ((Long) -> Unit)? = null

        private fun openAppIntent(context: Context): PendingIntent? {
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
            return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        @SuppressLint("MissingPermission") // POST_NOTIFICATIONS is requested by JavaScript; without it only the vibration fires
        fun fireAlert(context: Context, title: String, body: String) {
            val manager = context.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(
                    NotificationChannel(ALERT_CHANNEL, "Robbery alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                        description = "Tells you when you have been robbed"
                        enableVibration(true)
                        vibrationPattern = BUZZ
                        setSound(null, null) // Vibration only, so nobody nearby hears the alert
                    }
                )
            }
            manager.notify(
                ALERT_NOTIFICATION,
                NotificationCompat.Builder(context, ALERT_CHANNEL)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(android.R.drawable.ic_dialog_alert)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setVibrate(BUZZ)
                    .setSound(null)
                    .setContentIntent(openAppIntent(context))
                    .setAutoCancel(true)
                    .build()
            )
            // Also buzz directly, because silent mode can mute a notification's vibration.
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(VibratorManager::class.java).defaultVibrator
            } else {
                @Suppress("DEPRECATION") context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(BUZZ, -1), attributes)
            } else {
                @Suppress("DEPRECATION") vibrator.vibrate(BUZZ, -1, attributes)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(PATROL_CHANNEL, "Patrol", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Shows while the microphone is listening for game signals"
                }
            )
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            PatrolLog.add("Patrol stopped from the notification")
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent == null) PatrolLog.add("ANDROID RESTARTED THE SERVICE after killing it")

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(PATROL_NOTIFICATION, patrolNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(PATROL_NOTIFICATION, patrolNotification())
            }
            if (!running) {
                running = true
                @SuppressLint("WakelockTimeout") // Held only while patrol is on, and released in onDestroy
                wakeLock = getSystemService(PowerManager::class.java)
                    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SonicHeist:patrol")
                    .apply { acquire() }
                PatrolEngine.startCapture(this)
                handler.post(tick)
                PatrolLog.add("Patrol service started")
            }
        } catch (e: Exception) {
            // Android refuses a microphone service started from the background, for example after a restart.
            PatrolLog.add("PATROL COULD NOT START: ${e.javaClass.simpleName}: ${e.message}")
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        PatrolLog.add("App swiped away from recents")
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        if (PatrolEngine.isCapturing()) PatrolEngine.stopCapture()
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
        running = false
        PatrolLog.add("Patrol service stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun patrolNotification(): Notification {
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, PatrolService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, PATROL_CHANNEL)
            .setContentTitle("steal-eth patrol is on")
            .setContentText("The microphone is listening for game signals. Nothing is recorded.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setContentIntent(openAppIntent(this))
            .addAction(0, "Stop patrol", stop)
            .build()
    }
}
