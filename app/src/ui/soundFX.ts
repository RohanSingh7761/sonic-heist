// Retro game sounds from apps/web/public/sfx (rendered by scripts/gen-sfx.mjs), played with expo-audio.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Metro needs static requires, so every sound is listed here.
const FILES = {
  'alert': require('../../assets/sfx/alert.wav'),
  'bang': require('../../assets/sfx/bang.wav'),
  'bling': require('../../assets/sfx/bling.wav'),
  'caught': require('../../assets/sfx/caught.wav'),
  'coin': require('../../assets/sfx/coin.wav'),
  'coin-drop': require('../../assets/sfx/coin-drop.wav'),
  'cry': require('../../assets/sfx/cry.wav'),
  'dash': require('../../assets/sfx/dash.wav'),
  'deposit': require('../../assets/sfx/deposit.wav'),
  'footsteps-loop': require('../../assets/sfx/footsteps-loop.wav'),
  'heist-start': require('../../assets/sfx/heist-start.wav'),
  'jackpot': require('../../assets/sfx/jackpot.wav'),
  'level-up': require('../../assets/sfx/level-up.wav'),
  'loot-grab': require('../../assets/sfx/loot-grab.wav'),
  'radar-ping': require('../../assets/sfx/radar-ping.wav'),
  'robbed': require('../../assets/sfx/robbed.wav'),
  'run-loop': require('../../assets/sfx/run-loop.wav'),
  'saved': require('../../assets/sfx/saved.wav'),
  'shield-on': require('../../assets/sfx/shield-on.wav'),
  'sneak-loop': require('../../assets/sfx/sneak-loop.wav'),
  'stake-lost': require('../../assets/sfx/stake-lost.wav'),
  'swag': require('../../assets/sfx/swag.wav'),
  'tear': require('../../assets/sfx/tear.wav'),
  'thief-near': require('../../assets/sfx/thief-near.wav'),
  'tick': require('../../assets/sfx/tick.wav'),
  'tick-urgent': require('../../assets/sfx/tick-urgent.wav'),
  'ui-click': require('../../assets/sfx/ui-click.wav'),
  'ui-deny': require('../../assets/sfx/ui-deny.wav'),
} as const;

export type SfxName = keyof typeof FILES;
export const SFX_NAMES = Object.keys(FILES) as SfxName[];

// These were too hectic at full speed.
const LOOP_RATE: Partial<Record<SfxName, number>> = { 'run-loop': 0.65, 'footsteps-loop': 0.65, 'sneak-loop': 0.75 };

class SoundFX {
  // One reusable player per one-shot sound; loops get their own player so they can overlap a one-shot.
  private shots = new Map<SfxName, AudioPlayer>();

  private shot(name: SfxName) {
    let p = this.shots.get(name);
    if (!p) {
      p = createAudioPlayer(FILES[name]);
      this.shots.set(name, p);
    }
    return p;
  }

  // Create every player up front so the first play of a sound has no delay.
  preload() {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
    SFX_NAMES.forEach((n) => this.shot(n));
  }

  // Sound problems must never break the game, so failures only warn. Returns a function that stops the sound.
  play(name: SfxName, { loop = false, volume = 0.6 } = {}): () => void {
    try {
      if (loop) {
        const p = createAudioPlayer(FILES[name]);
        p.loop = true;
        p.volume = volume;
        p.play();
        p.setPlaybackRate(LOOP_RATE[name] ?? 1);
        return () => p.remove();
      }
      const p = this.shot(name);
      p.volume = volume;
      p.seekTo(0).catch(() => {});
      p.play();
      return () => p.pause();
    } catch (err) {
      console.warn(`Sound "${name}" failed:`, err);
      return () => {};
    }
  }
}

export const soundFX = new SoundFX();
