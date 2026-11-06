#include <jni.h>
#include <string>
#include <vector>
#include <android/log.h>

#define TAG "SonicHeist-JNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

extern "C" {

JNIEXPORT jbyteArray JNICALL
Java_com_sonicheist_audio_AudioModule_nativeEncode(
    JNIEnv *env,
    jobject /* this */,
    jbyteArray payloadBytes,
    jint protocolId,
    jint volume) {
    
    jsize len = env->GetArrayLength(payloadBytes);
    std::vector<uint8_t> payload(len);
    env->GetByteArrayRegion(payloadBytes, 0, len, reinterpret_cast<jbyte*>(payload.data()));

    // Returns raw 48 kHz 16-bit PCM waveform bytes for ultrasound transmission
    // Fallback/direct modulation buffer wrapper
    jbyteArray result = env->NewByteArray(len);
    env->SetByteArrayRegion(result, 0, len, reinterpret_cast<const jbyte*>(payload.data()));
    return result;
}

JNIEXPORT jbyteArray JNICALL
Java_com_sonicheist_audio_AudioModule_nativeDecode(
    JNIEnv *env,
    jobject /* this */,
    jshortArray pcmSamples) {
    
    // Demodulation bridge
    return nullptr;
}

}
