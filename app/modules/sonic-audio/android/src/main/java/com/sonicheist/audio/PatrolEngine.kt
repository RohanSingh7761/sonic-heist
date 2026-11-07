package com.sonicheist.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.concurrent.Executors
import kotlin.math.sqrt

// Owns the mic and speaker. Half-duplex: anything heard while we are playing is dropped.
object PatrolEngine {
    private const val SAMPLE_RATE = 48000
    private const val FRAME = 1024 // ggwave's samplesPerFrame
    private const val STATS_EVERY_MS = 60_000L
    private const val PAUSE_WARNING_MS = 5_000L

    var onMessage: ((ByteArray, Long) -> Unit)? = null

    private val ggwaveLock = Any()
    private var rxInstance = -1
    private var txInstance = -1
    private var testInstance = -1

    private val transmitter = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile private var capturing = false
    @Volatile private var transmitting = false
    private var record: AudioRecord? = null
    private var thread: Thread? = null

    private fun instance(current: Int): Int = if (current >= 0) current else Ggwave.nativeInit(SAMPLE_RATE)

    fun isCapturing() = capturing

    @SuppressLint("MissingPermission") // JavaScript requests RECORD_AUDIO before starting patrol
    fun startCapture(context: Context) {
        if (capturing) return
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        // UNPROCESSED skips the filters that can remove ultrasound, but not every phone has it.
        val unprocessed = audio.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true" &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
        val source = if (unprocessed) MediaRecorder.AudioSource.UNPROCESSED else MediaRecorder.AudioSource.VOICE_RECOGNITION
        val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val created = AudioRecord(source, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuffer, FRAME * 8))
        if (created.state != AudioRecord.STATE_INITIALIZED) {
            created.release()
            throw IllegalStateException("The microphone could not be opened")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            created.registerAudioRecordingCallback(context.mainExecutor, object : AudioManager.AudioRecordingCallback() {
                private var silenced = false
                override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
                    val mine = created.activeRecordingConfiguration ?: return
                    if (mine.isClientSilenced != silenced) {
                        silenced = mine.isClientSilenced
                        PatrolLog.add(if (silenced) "MIC SILENCED by Android, another app has it" else "Mic is back")
                    }
                }
            })
        }
        created.startRecording()
        record = created
        capturing = true
        PatrolLog.add("Mic on, ${if (unprocessed) "UNPROCESSED" else "VOICE_RECOGNITION"} source, Android ${Build.VERSION.SDK_INT}, ${Build.MANUFACTURER} ${Build.MODEL}")
        thread = Thread({ captureLoop(created) }, "patrol-mic").also { it.start() }
    }

    fun stopCapture() {
        capturing = false
        thread?.join(1000)
        thread = null
        record?.let {
            runCatching { it.stop() }
            it.release()
        }
        record = null
        PatrolLog.add("Mic off")
    }

    private fun captureLoop(source: AudioRecord) {
        val buffer = ShortArray(FRAME)
        var lastRead = System.currentTimeMillis()
        var windowStart = lastRead
        var energy = 0.0
        var samples = 0L
        var silentFrames = 0
        var frames = 0
        var heard = 0

        while (capturing) {
            val read = source.read(buffer, 0, FRAME)
            val now = System.currentTimeMillis()
            if (read < 0) {
                PatrolLog.add("MIC ERROR $read")
                Thread.sleep(500)
                continue
            }
            if (now - lastRead > PAUSE_WARNING_MS) PatrolLog.add("MIC THREAD PAUSED for ${(now - lastRead) / 1000} s")
            lastRead = now

            var frameEnergy = 0.0
            for (i in 0 until read) frameEnergy += buffer[i].toDouble() * buffer[i]
            energy += frameEnergy
            samples += read
            frames++
            if (frameEnergy == 0.0) silentFrames++

            if (read == FRAME && !transmitting) {
                val message = synchronized(ggwaveLock) {
                    rxInstance = instance(rxInstance)
                    Ggwave.nativeDecode(rxInstance, buffer, FRAME)
                }
                if (message != null) {
                    heard++
                    PatrolLog.add("Decoded ${message.size} bytes")
                    val listener = onMessage
                    if (listener == null) PatrolLog.add("JS NOT CONNECTED, message dropped") else listener(message, now)
                }
            }

            if (now - windowStart >= STATS_EVERY_MS) {
                val rms = if (samples > 0) sqrt(energy / samples).toInt() else 0
                PatrolLog.add("Mic alive: level $rms, ${silentFrames * 100 / maxOf(frames, 1)}% silent, heard $heard")
                windowStart = now
                energy = 0.0
                samples = 0
                silentFrames = 0
                frames = 0
                heard = 0
            }
        }
    }

    fun transmit(payload: ByteArray, protocol: Int, volume: Int, delayMs: Long, done: (Result<Long>) -> Unit) {
        // Scheduled natively because JavaScript timers can pause in the background.
        mainHandler.postDelayed({
            transmitter.execute { done(runCatching { play(payload, protocol, volume) }) }
        }, delayMs)
    }

    private fun play(payload: ByteArray, protocol: Int, volume: Int): Long {
        val waveform = synchronized(ggwaveLock) {
            txInstance = instance(txInstance)
            Ggwave.nativeEncode(txInstance, payload, protocol, volume)
        } ?: throw IllegalStateException("ggwave could not encode ${payload.size} bytes")

        // Plays at whatever media volume the player has set: never changes it.
        val bytes = waveform.size * 2
        val track = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(SAMPLE_RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(bytes)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        val durationMs = waveform.size * 1000L / SAMPLE_RATE
        transmitting = true
        try {
            val written = track.write(waveform, 0, waveform.size)
            if (written != waveform.size) throw IllegalStateException("Audio output took $written of ${waveform.size} samples")
            track.play()
            Thread.sleep(durationMs + 150)
            track.stop()
        } finally {
            transmitting = false
            track.release()
        }
        return durationMs
    }

    // Encodes and decodes in memory, which proves the native library works without needing sound.
    fun selfTest(): String {
        val message = ByteArray(81) { (it * 3 + 1).toByte() }
        for (protocol in intArrayOf(4, 1)) {
            val heard = synchronized(ggwaveLock) {
                testInstance = instance(testInstance)
                val waveform = Ggwave.nativeEncode(testInstance, message, protocol, 85)
                    ?: return "FAILED: could not encode protocol $protocol"
                var result: ByteArray? = null
                var offset = 0
                val frame = ShortArray(FRAME)
                while (result == null && offset < waveform.size + FRAME * 200) {
                    frame.fill(0)
                    if (offset < waveform.size) {
                        System.arraycopy(waveform, offset, frame, 0, minOf(FRAME, waveform.size - offset))
                    }
                    result = Ggwave.nativeDecode(testInstance, frame, FRAME)
                    offset += FRAME
                }
                result
            }
            if (heard == null) return "FAILED: protocol $protocol never decoded"
            if (!heard.contentEquals(message)) return "FAILED: protocol $protocol decoded wrong bytes"
        }
        return "passed"
    }
}
