#include <jni.h>
#include <vector>
#include "ggwave/ggwave.h"

// Raises the ultrasound band from ggwave's 15-19.5 kHz to 16.5-21 kHz, so less of it falls within human hearing.
// One FFT bin is 46.875 Hz at 48 kHz, and the band always spans 96 bins. Higher means quieter to people but less reach on
// phones whose speakers and mics fade above about 20 kHz. Both phones must use the same value.
static constexpr int16_t ULTRASOUND_FREQ_START = 352;

static void raiseUltrasoundBand() {
    for (auto id : {GGWAVE_PROTOCOL_ULTRASOUND_NORMAL, GGWAVE_PROTOCOL_ULTRASOUND_FAST, GGWAVE_PROTOCOL_ULTRASOUND_FASTEST}) {
        GGWave::Protocols::tx().data[id].freqStart = ULTRASOUND_FREQ_START;
        GGWave::Protocols::rx().data[id].freqStart = ULTRASOUND_FREQ_START;
    }
}

extern "C" {

JNIEXPORT jint JNICALL
Java_com_sonicheist_audio_Ggwave_nativeInit(JNIEnv *, jobject, jint sampleRate) {
    ggwave_setLogFile(nullptr);
    raiseUltrasoundBand();
    ggwave_Parameters parameters = ggwave_getDefaultParameters();
    parameters.sampleRateInp = static_cast<float>(sampleRate);
    parameters.sampleRateOut = static_cast<float>(sampleRate);
    parameters.sampleFormatInp = GGWAVE_SAMPLE_FORMAT_I16;
    parameters.sampleFormatOut = GGWAVE_SAMPLE_FORMAT_I16;
    return ggwave_init(parameters);
}

// Returns 16-bit samples, or null if ggwave rejects the message.
JNIEXPORT jshortArray JNICALL
Java_com_sonicheist_audio_Ggwave_nativeEncode(JNIEnv *env, jobject, jint instance, jbyteArray payload, jint protocolId, jint volume) {
    const jsize size = env->GetArrayLength(payload);
    std::vector<jbyte> bytes(size);
    env->GetByteArrayRegion(payload, 0, size, bytes.data());

    const auto protocol = static_cast<ggwave_ProtocolId>(protocolId);
    const int capacity = ggwave_encode(instance, bytes.data(), size, protocol, volume, nullptr, 1);
    if (capacity <= 0) return nullptr;

    std::vector<jshort> waveform(capacity / sizeof(jshort) + 1);
    const int written = ggwave_encode(instance, bytes.data(), size, protocol, volume, waveform.data(), 0);
    if (written <= 0) return nullptr;

    const jsize samples = written / sizeof(jshort);
    jshortArray result = env->NewShortArray(samples);
    if (result) env->SetShortArrayRegion(result, 0, samples, waveform.data());
    return result;
}

// Returns a message once a whole one has been heard, otherwise null.
JNIEXPORT jbyteArray JNICALL
Java_com_sonicheist_audio_Ggwave_nativeDecode(JNIEnv *env, jobject, jint instance, jshortArray samples, jint count) {
    jshort *data = env->GetShortArrayElements(samples, nullptr);
    if (!data) return nullptr;

    char payload[256];
    const int decoded = ggwave_ndecode(instance, data, count * static_cast<int>(sizeof(jshort)), payload, sizeof(payload));
    env->ReleaseShortArrayElements(samples, data, JNI_ABORT);
    if (decoded <= 0) return nullptr;

    jbyteArray result = env->NewByteArray(decoded);
    if (result) env->SetByteArrayRegion(result, 0, decoded, reinterpret_cast<const jbyte *>(payload));
    return result;
}

}
