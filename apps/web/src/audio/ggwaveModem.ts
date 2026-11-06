// GGWave Modem wrapper for Web Audio API transmission & reception

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

  public availableProtocols: GgwaveProtocol[] = [
    { id: 1, name: 'Audible Fast (Recommended)', isUltrasonic: false },
    { id: 2, name: 'Audible Fastest', isUltrasonic: false },
    { id: 0, name: 'Audible Normal', isUltrasonic: false },
    { id: 4, name: 'Ultrasound Fast (~16.2 kHz, Inaudible)', isUltrasonic: true },
    { id: 3, name: 'Ultrasound Normal (~15.8 kHz, Quiet)', isUltrasonic: true },
    { id: 5, name: 'Ultrasound Fastest (~17.0 kHz, Inaudible)', isUltrasonic: true },
  ];
  public defaultProtocolId = 4; // Default to Ultrasound Fast (~16.2 kHz, Inaudible)

  // Load WASM and ggwave library (does NOT touch AudioContext yet to avoid iOS restrictions)
  async loadLibrary(): Promise<void> {
    if (this.ggwave) return;

    try {
      const ggwaveModule = await import('ggwave');
      this.factory = (ggwaveModule as any).default || ggwaveModule;
      this.ggwave = await this.factory();
    } catch (err: any) {
      console.error('Failed to load ggwave module:', err);
      throw new Error(`Failed to load ggwave WebAssembly: ${err.message}`);
    }
  }

  // Ensure AudioContext is created and resumed on user gesture
  ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported on this browser.');
      }
      this.audioContext = new AudioContextClass();
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch((e) => console.warn('AudioContext resume error:', e));
    }

    // Initialize or re-initialize ggwave instance with the exact context sample rate
    if (!this.instance && this.ggwave) {
      const parameters = this.ggwave.getDefaultParameters();
      parameters.sampleRateInp = this.audioContext.sampleRate;
      parameters.sampleRateOut = this.audioContext.sampleRate;
      this.instance = this.ggwave.init(parameters);
    }

    return this.audioContext;
  }

  // Play audio payload through speakers
  async transmit(
    payload: Uint8Array,
    protocolId: number = 1,
    volume: number = 30
  ): Promise<{ durationMs: number }> {
    await this.loadLibrary();
    const ctx = this.ensureAudioContext();

    if (!this.instance) {
      const parameters = this.ggwave.getDefaultParameters();
      parameters.sampleRateInp = ctx.sampleRate;
      parameters.sampleRateOut = ctx.sampleRate;
      this.instance = this.ggwave.init(parameters);
    }

    // Resolve proper Emscripten enum object (ggwave requires the enum instance, not a raw JS number)
    const protoObj =
      this.ggwave.ProtocolId?.values?.[protocolId] ||
      this.ggwave.TxProtocolId?.values?.[protocolId] ||
      protocolId;

    // Encode payload into audio waveform
    const waveform = this.ggwave.encode(this.instance, payload, protoObj, volume);
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
    await this.loadLibrary();
    const ctx = this.ensureAudioContext();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access requires HTTPS or localhost and a supported browser.');
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
        video: false,
      });
    } catch {
      // Fallback for mobile browsers with restrictive constraints
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    }

    this.mediaStreamSource = ctx.createMediaStreamSource(this.mediaStream);
    // Use 2048 or 4096 buffer size on iOS Safari for glitch-free audio processing
    const bufferSize = 2048;
    this.scriptProcessor = ctx.createScriptProcessor(bufferSize, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      // Zero out output buffer to prevent audio feedback loop through speaker
      const outputBuffer = e.outputBuffer.getChannelData(0);
      outputBuffer.fill(0);

      if (this.isTransmitting) return; // Half-duplex guard

      const inputBuffer = e.inputBuffer.getChannelData(0);

      // Audio activity indicator
      if (onAudioLevel) {
        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sum / inputBuffer.length);
        onAudioLevel(Math.min(1, rms * 5));
      }

      // Feed PCM samples into ggwave decoder
      const int8Samples = convertTypedArray(new Float32Array(inputBuffer), Int8Array);
      // Ensure instance sample rate matches context sample rate
      if (this.instance && this.ggwave) {
        const res = this.ggwave.decode(this.instance, int8Samples);
        if (res && res.length > 0) {
          const decoded = new Uint8Array(res);
          onPayloadReceived(decoded);
        }
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

export const modem = new GgwaveModem();
