// GGWave Modem wrapper for Web Audio API transmission & reception

// Helper to convert between TypedArray representations without reallocation
function convertTypedArray(src: any, type: any) {
  const buffer = new ArrayBuffer(src.byteLength);
  new src.constructor(buffer).set(src);
  return new type(buffer);
}

export interface GgwaveProtocol {
  id: number;
  name: string;
  isUltrasonic: boolean;
}

export class GgwaveModem {
  private factory: any = null;
  private ggwave: any = null;
  private instance: any = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private isListening = false;
  private isTransmitting = false;

  public availableProtocols: GgwaveProtocol[] = [];
  public defaultProtocolId = 1; // Default Audible Fast

  async init(): Promise<void> {
    if (this.instance) return;

    // Dynamically load ggwave factory
    const ggwaveModule = await import('ggwave');
    this.factory = (ggwaveModule as any).default || ggwaveModule;

    this.ggwave = await this.factory();

    // Lazy create AudioContext on user gesture or init
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();

    const parameters = this.ggwave.getDefaultParameters();
    parameters.sampleRateInp = this.audioContext.sampleRate;
    parameters.sampleRateOut = this.audioContext.sampleRate;

    this.instance = this.ggwave.init(parameters);

    // Populate protocols
    const pIds = this.ggwave.ProtocolId || this.ggwave.TxProtocolId || {};
    this.availableProtocols = [
      { id: pIds.GGWAVE_PROTOCOL_AUDIBLE_FAST ?? 1, name: 'Audible Fast (Recommended)', isUltrasonic: false },
      { id: pIds.GGWAVE_PROTOCOL_AUDIBLE_FASTEST ?? 2, name: 'Audible Fastest', isUltrasonic: false },
      { id: pIds.GGWAVE_PROTOCOL_AUDIBLE_NORMAL ?? 0, name: 'Audible Normal', isUltrasonic: false },
      { id: pIds.GGWAVE_PROTOCOL_ULTRASONIC_FAST ?? 4, name: 'Ultrasonic Fast (Quiet)', isUltrasonic: true },
    ];
    this.defaultProtocolId = this.availableProtocols[0].id;
  }

  getAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // Play audio payload through speakers
  async transmit(
    payload: Uint8Array,
    protocolId?: number,
    volume: number = 25
  ): Promise<{ durationMs: number }> {
    await this.init();
    const ctx = this.getAudioContext();

    const proto = protocolId !== undefined ? protocolId : this.defaultProtocolId;

    // Encode payload into audio waveform
    const waveform = this.ggwave.encode(this.instance, payload, proto, volume);
    if (!waveform || waveform.length === 0) {
      throw new Error('Failed to encode audio waveform: ggwave returned empty buffer');
    }

    const floatBuffer = convertTypedArray(waveform, Float32Array);
    const audioBuffer = ctx.createBuffer(1, floatBuffer.length, ctx.sampleRate);
    audioBuffer.getChannelData(0).set(floatBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    this.isTransmitting = true;
    const durationMs = (floatBuffer.length / ctx.sampleRate) * 1000;

    return new Promise((resolve) => {
      source.onended = () => {
        this.isTransmitting = false;
        resolve({ durationMs });
      };
      source.start(0);
    });
  }

  // Start listening through microphone
  async startListening(
    onPayloadReceived: (bytes: Uint8Array) => void,
    onAudioLevel?: (level: number) => void
  ): Promise<void> {
    if (this.isListening) return;
    await this.init();
    const ctx = this.getAudioContext();

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
      video: false,
    });

    this.mediaStreamSource = ctx.createMediaStreamSource(this.mediaStream);
    const bufferSize = 1024;
    this.scriptProcessor = ctx.createScriptProcessor(bufferSize, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      if (this.isTransmitting) return; // Half-duplex: ignore microphone while transmitting

      const inputBuffer = e.inputBuffer.getChannelData(0);

      // Calculate audio power level for visualizer
      if (onAudioLevel) {
        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sum / inputBuffer.length);
        onAudioLevel(Math.min(1, rms * 5));
      }

      // Pass audio samples to ggwave decoder
      const int8Samples = convertTypedArray(new Float32Array(inputBuffer), Int8Array);
      const res = this.ggwave.decode(this.instance, int8Samples);

      if (res && res.length > 0) {
        const decoded = new Uint8Array(res);
        onPayloadReceived(decoded);
      }
    };

    this.mediaStreamSource.connect(this.scriptProcessor);
    this.scriptProcessor.connect(ctx.destination);
    this.isListening = true;
  }

  // Stop listening through microphone
  stopListening(): void {
    if (!this.isListening) return;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = null;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.isListening = false;
  }

  getListeningStatus(): boolean {
    return this.isListening;
  }

  getTransmittingStatus(): boolean {
    return this.isTransmitting;
  }
}

// Global singleton instance for the app
export const modem = new GgwaveModem();
