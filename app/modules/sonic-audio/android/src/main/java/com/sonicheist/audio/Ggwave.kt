package com.sonicheist.audio

object Ggwave {
    init {
        System.loadLibrary("ggwave_jni")
    }

    external fun nativeInit(sampleRate: Int): Int
    external fun nativeEncode(instance: Int, payload: ByteArray, protocolId: Int, volume: Int): ShortArray?
    external fun nativeDecode(instance: Int, samples: ShortArray, count: Int): ByteArray?
}
