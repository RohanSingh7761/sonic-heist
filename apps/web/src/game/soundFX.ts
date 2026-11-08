// Retro game sounds: plays the chiptune WAVs rendered by scripts/gen-sfx.mjs into public/sfx.

// Checked against the rendered files whenever gen-sfx runs.
export const SFX_NAMES = [
  'coin', 'coin-drop', 'loot-grab', 'deposit', 'jackpot', 'stake-lost',
  'footsteps-loop', 'run-loop', 'sneak-loop', 'dash', 'heist-start',
  'cry', 'tear',
  'swag', 'bling',
  'alert', 'bang', 'robbed', 'tick', 'tick-urgent', 'radar-ping', 'thief-near',
  'caught', 'saved', 'level-up', 'ui-click', 'ui-deny', 'shield-on',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

class SoundFX {
  private ctx: AudioContext | null = null;
  private bytes = new Map<SfxName, Promise<ArrayBuffer>>();
  private buffers = new Map<SfxName, Promise<AudioBuffer>>();

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private fetchBytes(name: SfxName, priority: RequestPriority = 'auto'): Promise<ArrayBuffer> {
    let bytes = this.bytes.get(name);
    if (!bytes) {
      bytes = fetch(`sfx/${name}.wav`, { priority }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      });
      // Let a failed download (e.g. a network blip) retry on the next play.
      bytes.catch(() => this.bytes.delete(name));
      this.bytes.set(name, bytes);
    }
    return bytes;
  }

  private load(name: SfxName): Promise<AudioBuffer> {
    let buffer = this.buffers.get(name);
    if (!buffer) {
      buffer = this.fetchBytes(name).then((bytes) => this.getContext().decodeAudioData(bytes));
      buffer.catch(() => {
        this.buffers.delete(name);
        this.bytes.delete(name); // decoding consumes the bytes, so a retry needs a fresh copy
      });
      this.buffers.set(name, buffer);
    }
    return buffer;
  }

  // Download everything ahead of time, at low priority. Needs no tap: audio only starts on the first play.
  preload() {
    SFX_NAMES.forEach((name) => this.fetchBytes(name, 'low').catch(() => {}));
  }

  // Sound problems must never break the game, so failures only warn. Returns a function that stops the sound.
  play(name: SfxName, { loop = false, volume = 0.6 } = {}): () => void {
    let stopped = false;
    let source: AudioBufferSourceNode | null = null;
    const ctx = this.getContext(); // resume now: browsers only allow it during the user's tap, not after the await
    this.load(name)
      .then((buffer) => {
        if (stopped) return;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
      })
      .catch((err) => console.warn(`Sound "${name}" failed:`, err));
    return () => {
      stopped = true;
      source?.stop();
    };
  }

  playRadarPing() {
    this.play('radar-ping');
  }

  playHeistStart() {
    this.play('heist-start');
  }

  playAlarm() {
    this.play('alert');
  }

  playCatchLock() {
    this.play('saved');
  }
}

export const soundFX = new SoundFX();
