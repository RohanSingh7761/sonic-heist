// Generates every Sonic Heist chiptune sound into apps/web/public/sfx/ (8-bit mono WAV + soundboard).
// Run: node scripts/gen-sfx.mjs
// 22.05 kHz keeps all content below ~11 kHz, clear of the ultrasound modem band (15 kHz and up).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/web/public/sfx');
const SR = 22050;
const TICK = 60; // pitch and volume only change 60 times a second, like old console sound chips

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = (note) => {
  const m = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!m) throw new Error(`Bad note "${note}"`);
  const midi = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
};
const DUTY = { p12: 0.125, p25: 0.25, p50: 0.5 };

class Song {
  constructor(seconds) {
    this.buf = new Float32Array(Math.ceil(seconds * SR));
  }
  // wave: p12 | p25 | p50 | tri | noise. For noise, f is the noise clock in Hz.
  tone(wave, t, dur, { f, to = f, vol = 0.5, decay = 'exp', attack = 0, vib = 0, vibRate = 7 }) {
    const f0 = typeof f === 'string' ? hz(f) : f;
    const f1 = typeof to === 'string' ? hz(to) : to;
    const start = Math.round(t * SR);
    const len = Math.round(dur * SR);
    let phase = 0;
    let lfsr = 0x4000;
    let bit = 1;
    for (let i = 0; i < len && start + i < this.buf.length; i++) {
      const sec = i / SR;
      const u = Math.floor(sec * TICK) / TICK / dur; // stepped time drives the chip sound
      const shape = decay === 'hold' ? 1 : decay === 'lin' ? 1 - u : Math.exp(-4 * u);
      const att = attack ? Math.min(1, sec / attack) : 1;
      const level = Math.round(Math.max(0, shape * att) * 15) / 15; // 4-bit volume
      const freq = f0 * (f1 / f0) ** Math.min(1, u) * 2 ** ((vib * Math.sin(2 * Math.PI * vibRate * sec)) / 12);
      const prev = phase;
      phase = (phase + freq / SR) % 1;
      let s;
      if (wave === 'noise') {
        if (phase < prev) {
          bit = (lfsr ^ (lfsr >> 1)) & 1;
          lfsr = (lfsr >> 1) | (bit << 14);
        }
        s = bit ? 1 : -1;
      } else if (wave === 'tri') {
        s = Math.round((Math.abs(phase * 4 - 2) - 1) * 7.5) / 7.5; // 4-bit triangle
      } else {
        s = phase < DUTY[wave] ? 1 : -1;
      }
      this.buf[start + i] += s * vol * level;
    }
    return this;
  }
  // Space-separated notes, one per step. '-' rests, 'E4+G4' plays a chord. len is the note length in steps.
  seq(wave, t, step, notes, { len = 1, ...o } = {}) {
    notes.trim().split(/\s+/).forEach((tok, i) => {
      if (tok === '-') return;
      tok.split('+').forEach((f) => this.tone(wave, t + i * step, step * len, { f, ...o }));
    });
    return this;
  }
  kick(t, vol = 0.8) {
    this.tone('tri', t, 0.1, { f: 170, to: 45, vol });
    return this.tone('noise', t, 0.03, { f: 3000, vol: vol * 0.4 });
  }
  hat(t, vol = 0.14) {
    return this.tone('noise', t, 0.03, { f: 10000, vol });
  }
  coin(t, vol = 0.5) {
    this.seq('p25', t, 0.05, 'E6 G#6', { vol, decay: 'hold' });
    return this.tone('p25', t + 0.1, 0.24, { f: 'B6', vol });
  }
}

// name: [seconds, group, sprite shown on the soundboard, loops seamlessly?, what it is, composer]
const SOUNDS = {
  // ---------- money ----------
  coin: [0.36, 'Money', 'saved', false, 'One coin picked up', (s) => s.coin(0)],
  'coin-drop': [0.62, 'Money', 'caught', false, 'Coins bouncing on the floor', (s) => {
    [0, 0.17, 0.3, 0.4, 0.47, 0.52].forEach((t, i) => {
      s.tone('p12', t, 0.05, { f: 1950 - i * 70, vol: 0.5 - i * 0.06 });
      s.tone('noise', t, 0.015, { f: 9000, vol: 0.2 - i * 0.02 });
    });
  }],
  'loot-grab': [0.85, 'Money', 'sneak', false, "Thief scoops the victim's stake", (s) => {
    s.seq('p25', 0, 0.05, 'C6 D6 E6 G6 A6 C7 D7 E7', { len: 1.6, vol: 0.45 });
    s.seq('p12', 0.025, 0.05, 'C5 D5 E5 G5 A5 C6 D6 E6', { len: 1.2, vol: 0.2 });
    s.tone('noise', 0, 0.45, { f: 9500, vol: 0.09, decay: 'lin' });
    s.tone('p25', 0.42, 0.42, { f: 'G7', vol: 0.4 });
  }],
  deposit: [0.55, 'Money', 'idle', false, 'ETH going into the vault', (s) => {
    s.tone('tri', 0, 0.16, { f: 'E5', to: 'E3', vol: 0.7, decay: 'hold' });
    s.kick(0.15, 0.6);
    s.coin(0.2, 0.42);
  }],
  jackpot: [1.65, 'Money', 'swag', false, 'Big payout: loot claimed', (s) => {
    for (let r = 0; r < 4; r++) {
      s.seq('p25', r * 0.26, 0.043, 'C6 E6 G6 C7 E7 G7', { vol: 0.34, len: 1.3 });
      s.tone('tri', r * 0.26, 0.2, { f: ['C3', 'G3', 'A3', 'F3'][r], vol: 0.45 });
    }
    ['C6', 'E6', 'G6', 'C7'].forEach((f) => s.tone('p25', 1.04, 0.6, { f, vol: 0.24 }));
    s.tone('tri', 1.04, 0.6, { f: 'C3', vol: 0.45 });
    s.tone('noise', 1.04, 0.5, { f: 9500, vol: 0.1 });
  }],
  'stake-lost': [1.4, 'Money', 'cry', false, 'Your stake is gone', (s) => {
    s.seq('p50', 0, 0.17, 'E5 D#5 D5', { vol: 0.38, decay: 'hold', len: 0.9 });
    s.tone('p50', 0.51, 0.85, { f: 'C#5', to: 'A4', vol: 0.4, vib: 0.5, vibRate: 6 });
    s.seq('tri', 0, 0.17, 'A3 G#3 G3', { vol: 0.65, decay: 'hold', len: 0.9 });
    s.tone('tri', 0.51, 0.85, { f: 'F#3', to: 'E3', vol: 0.65 });
  }],

  // ---------- running ----------
  'footsteps-loop': [0.44, 'Running', 'run', true, 'Feet only. Matches the run sprite cycle', (s) => {
    [[0, 110], [0.22, 82]].forEach(([t, f]) => {
      s.tone('tri', t, 0.07, { f, to: f * 0.55, vol: 0.85 });
      s.tone('noise', t, 0.05, { f: 2600, vol: 0.32 });
    });
  }],
  'run-loop': [2.88, 'Running', 'run', true, 'Chase theme for the group run', (s) => {
    const step = 0.09;
    s.seq('tri', 0, step, 'A2 - A2 A3 - A2 G2 - A2 - A2 A3 - A2 C3 D3 F2 - F2 F3 - F2 E2 - E2 - E2 E3 - G#2 B2 D3', { vol: 0.8, decay: 'hold', len: 0.8 });
    s.seq('p25', 0, step, 'A4 - C5 - E5 - A5 G5 - E5 - D5 - C5 - E5 F4 - A4 - C5 - F5 E5 - E5 - G#5 - B5 - -', { vol: 0.3, len: 0.85 });
    for (let i = 0; i < 32; i++) {
      if (i % 4 === 0) s.kick(i * step, 0.5);
      else if (i % 2 === 0) s.hat(i * step, 0.17);
    }
  }],
  'sneak-loop': [1.52, 'Running', 'sneak', true, 'Tiptoe pluck. Matches the sneak sprite cycle', (s) => {
    s.seq('tri', 0, 0.19, 'E3 - G3 - Bb3 - G3 -', { vol: 0.8, len: 0.7 });
    s.seq('p12', 0, 0.19, '- E5 - - - Bb4 - E5', { vol: 0.22, len: 0.45 });
  }],
  dash: [0.46, 'Running', 'thief-run', false, 'Whoosh as the thief takes off', (s) => {
    s.tone('noise', 0, 0.23, { f: 1800, to: 10500, vol: 0.6, decay: 'hold', attack: 0.1 });
    s.tone('noise', 0.23, 0.22, { f: 10500, to: 2000, vol: 0.5, decay: 'lin' });
  }],
  'heist-start': [0.8, 'Running', 'thief', false, 'Sting when the loot lands on-chain', (s) => {
    ['E4', 'G4', 'Bb4'].forEach((f) => {
      s.tone('p50', 0, 0.09, { f, vol: 0.22, decay: 'hold' });
      s.tone('p50', 0.13, 0.13, { f, vol: 0.22, decay: 'hold' });
    });
    s.tone('tri', 0.27, 0.5, { f: 'A4', to: 'A2', vol: 0.75, decay: 'lin' });
    s.tone('noise', 0.27, 0.3, { f: 7000, to: 1500, vol: 0.2 });
  }],

  // ---------- crying ----------
  cry: [2.04, 'Crying', 'cry', true, 'Three wails and hiccups. Matches the cry sprite cycle', (s) => {
    const wail = (t, a, b, d) => {
      s.tone('p50', t, d, { f: a, to: b, vol: 0.4, decay: 'lin', attack: 0.04, vib: 0.9, vibRate: 7 });
      s.tone('p25', t, d, { f: a, to: b, vol: 0.14, decay: 'lin', attack: 0.04, vib: 0.9, vibRate: 7.5 });
    };
    wail(0, 'C5', 'A4', 0.5);
    s.seq('p25', 0.52, 0.06, 'A4 D5', { vol: 0.32, decay: 'hold', len: 0.7 }); // hiccup
    wail(0.68, 'B4', 'G4', 0.5);
    s.seq('p25', 1.2, 0.06, 'G4 C5', { vol: 0.32, decay: 'hold', len: 0.7 });
    wail(1.34, 'A4', 'D4', 0.68);
  }],
  tear: [0.2, 'Crying', 'cry', false, 'A single tear plip', (s) => {
    s.tone('tri', 0, 0.07, { f: 800, to: 1900, vol: 0.8 });
    s.tone('tri', 0.1, 0.06, { f: 800, to: 1900, vol: 0.25 });
  }],

  // ---------- swag ----------
  swag: [2.85, 'Swag', 'swag', true, 'Shades whistle down, thunk, then the groove. Matches the swag sprite cycle', (s) => {
    s.tone('p12', 0, 0.84, { f: 'C7', to: 'C5', vol: 0.34, decay: 'hold' });
    s.kick(0.85, 0.55);
    ['E4', 'G4', 'B4'].forEach((f) => s.tone('p25', 0.85, 0.18, { f, vol: 0.22 }));
    const step = 0.125;
    const t0 = 0.85;
    s.seq('tri', t0, step, 'E2 - E2 - G2 - E2 A2 - - A2 - G2 - D2 -', { vol: 0.55, decay: 'hold', len: 0.85 });
    s.seq('p25', t0, step, '- - E5+G5 - - - E5+G5 - - - A5+C6 - - - G5+B5 -', { vol: 0.17, len: 0.8 });
    for (let i = 0; i < 16; i++) {
      if (i % 4 === 0 && i) s.kick(t0 + i * step, 0.35);
      if (i % 2 === 1) s.hat(t0 + i * step, 0.16);
    }
    s.seq('p12', t0 + 1.62, 0.05, 'B6 E7 G7 B7', { vol: 0.22, len: 1.2 });
  }],
  bling: [0.55, 'Swag', 'swag', false, 'Sparkle off the glasses or chain', (s) => {
    s.seq('p12', 0, 0.06, 'E7 B7 E7', { vol: 0.36, len: 1.3 });
    s.tone('p12', 0.18, 0.36, { f: 'B7', vol: 0.36, vib: 0.3, vibRate: 12 });
    s.tone('noise', 0.04, 0.3, { f: 10500, vol: 0.07 });
  }],

  // ---------- alert ----------
  alert: [0.88, 'Alert', 'alert', true, 'Two-tone siren: you have been robbed. Matches the alert sprite cycle', (s) => {
    [0, 0.44].forEach((t) => {
      s.tone('p50', t, 0.21, { f: 'B5', vol: 0.34, decay: 'hold' });
      s.tone('p25', t, 0.21, { f: 'B4', vol: 0.24, decay: 'hold' });
      s.tone('p50', t + 0.22, 0.21, { f: 'F#5', vol: 0.34, decay: 'hold' });
      s.tone('p25', t + 0.22, 0.21, { f: 'F#4', vol: 0.24, decay: 'hold' });
    });
  }],
  bang: [0.32, 'Alert', 'alert', false, 'The red "!" popping up', (s) => {
    s.seq('p50', 0, 0.035, 'A5 E6', { vol: 0.42, decay: 'hold' });
    s.tone('p50', 0.07, 0.24, { f: 'A6', vol: 0.42 });
    s.tone('noise', 0, 0.07, { f: 6000, vol: 0.3 });
  }],
  robbed: [1.1, 'Alert', 'alert', false, 'Reveal sting before the hunt starts', (s) => {
    s.seq('p50', 0, 0.06, 'B4 C5 B4 C5 B4 C5', { vol: 0.34, decay: 'hold', len: 0.9 });
    ['C5', 'Eb5', 'Gb5'].forEach((f) => s.tone('p25', 0.38, 0.65, { f, vol: 0.23, vib: 0.4, vibRate: 9 }));
    s.tone('tri', 0.38, 0.65, { f: 'C3', to: 'Gb2', vol: 0.75 });
    s.kick(0.38, 0.75);
  }],
  tick: [0.06, 'Alert', 'hunt', false, 'Countdown tick', (s) => s.tone('p12', 0, 0.05, { f: 'A5', vol: 0.6 })],
  'tick-urgent': [0.13, 'Alert', 'hunt', false, 'Countdown tick for the final seconds', (s) => {
    s.tone('p50', 0, 0.055, { f: 'E6', vol: 0.5, decay: 'hold' });
    s.tone('p50', 0.065, 0.055, { f: 'A5', vol: 0.5, decay: 'hold' });
  }],
  'radar-ping': [0.5, 'Alert', 'hunt', false, 'Sonar blip with two echoes', (s) => {
    [[0, 0.8], [0.17, 0.32], [0.34, 0.13]].forEach(([t, vol]) => s.tone('tri', t, 0.12, { f: 'A5', to: 'A6', vol }));
  }],
  'thief-near': [0.22, 'Alert', 'hunt', false, 'Thief in range: hot signal', (s) => {
    s.seq('p25', 0, 0.09, 'C7 C7', { vol: 0.5, len: 0.8 });
    s.seq('tri', 0, 0.09, 'C6 C6', { vol: 0.35, len: 0.8 });
  }],

  // ---------- outcomes and UI ----------
  caught: [1.15, 'Outcomes', 'caught', false, 'Thief busted: bonk, then the fall', (s) => {
    s.kick(0, 0.9);
    s.tone('noise', 0, 0.09, { f: 4500, vol: 0.4 });
    s.seq('p50', 0.1, 0.075, 'C5 B4 Bb4 A4 G#4', { vol: 0.36, decay: 'hold', len: 0.9 });
    s.tone('p50', 0.48, 0.62, { f: 'G4', to: 'E4', vol: 0.36, vib: 0.8, vibRate: 7, decay: 'lin' });
    s.seq('p12', 0.5, 0.11, 'E7 - B6 - E7', { vol: 0.13, len: 0.8 });
  }],
  saved: [1.2, 'Outcomes', 'saved', false, 'Victim got it all back, plus the bond', (s) => {
    s.seq('p25', 0, 0.09, 'G4 C5 E5 G5 - E5 G5', { vol: 0.42, decay: 'hold', len: 0.9 });
    s.seq('tri', 0, 0.18, 'C3 G3 C3 G3', { vol: 0.75, decay: 'hold', len: 0.8 });
    ['C5', 'E5', 'G5', 'C6'].forEach((f) => s.tone('p25', 0.63, 0.55, { f, vol: 0.23 }));
    s.tone('tri', 0.63, 0.55, { f: 'C3', vol: 0.8 });
    s.tone('noise', 0.63, 0.35, { f: 9500, vol: 0.08 });
  }],
  'level-up': [1.05, 'Outcomes', 'idle', false, 'Avatar reached a new level', (s) => {
    s.seq('p25', 0, 0.06, 'C5 E5 G5 C6 E6 G6 C7', { vol: 0.42, len: 1.3 });
    s.seq('tri', 0, 0.12, 'C3 G3 C4', { vol: 0.65, len: 0.9 });
    ['G6', 'C7', 'E7'].forEach((f) => s.tone('p12', 0.45, 0.58, { f, vol: 0.24, vib: 0.25, vibRate: 10 }));
    s.tone('tri', 0.45, 0.58, { f: 'C4', vol: 0.65 });
  }],
  'ui-click': [0.05, 'Outcomes', 'idle', false, 'Button press', (s) => s.tone('p50', 0, 0.04, { f: 1250, to: 950, vol: 0.45 })],
  'ui-deny': [0.26, 'Outcomes', 'locked', false, 'Not allowed: cooldown, immune, locked', (s) => s.seq('p50', 0, 0.12, 'D3 D3', { vol: 0.45, decay: 'hold', len: 0.8 })],
  'shield-on': [0.5, 'Outcomes', 'idle', false, 'Shield mode turned on', (s) => {
    s.tone('tri', 0, 0.3, { f: 'C4', to: 'C6', vol: 0.7, decay: 'hold' });
    s.seq('p12', 0.22, 0.06, 'G6 C7', { vol: 0.28, len: 2 });
  }],
};

// ---------- rendering ----------
// Target loudness in dB (default -15). Small feedback sounds sit back; the siren must cut through.
const LOUDNESS = { 'ui-click': -24, 'ui-deny': -21, tick: -25, 'tick-urgent': -21, tear: -22, 'footsteps-loop': -19, 'sneak-loop': -19, 'run-loop': -17, cry: -14, alert: -13 };

function wav(samples) {
  const out = Buffer.alloc(44 + samples.length);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + samples.length, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR, 28);
  out.writeUInt16LE(1, 32);
  out.writeUInt16LE(8, 34);
  out.write('data', 36);
  out.writeUInt32LE(samples.length, 40);
  samples.forEach((x, i) => out.writeUInt8(Math.max(0, Math.min(255, Math.round(x * 127) + 128)), 44 + i));
  return out;
}

function render(name, seconds, loops, compose) {
  const song = new Song(seconds);
  compose(song);
  const b = song.buf;
  // Pulse waves carry a DC offset; block it so sounds start and end without a pop.
  let px = 0;
  let py = 0;
  for (let i = 0; i < b.length; i++) {
    const y = b[i] - px + 0.995 * py;
    px = b[i];
    py = y;
    b[i] = y;
  }
  const peak = b.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  if (peak < 0.01) throw new Error(`${name} is silent`);
  // Balance by loudness of the audible part, not peak, so a click can't out-shout a jingle.
  let energy = 0;
  let active = 0;
  for (const x of b) if (Math.abs(x) > peak * 0.02) { energy += x * x; active++; }
  const rms = Math.sqrt(energy / active);
  const gain = Math.min(10 ** ((LOUDNESS[name] ?? -15) / 20) / rms, 0.9 / peak);
  for (let i = 0; i < b.length; i++) b[i] *= gain;
  const fade = Math.min(66, b.length >> 2); // 3 ms
  for (let i = 0; i < fade; i++) b[b.length - 1 - i] *= i / fade;
  if (loops) {
    const tail = Math.abs(b[b.length - 1]);
    if (tail > 0.02) throw new Error(`${name} loop would click: tail ${tail}`);
  }
  return b;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, [seconds, , , loops, , compose]] of Object.entries(SOUNDS)) {
  const file = wav(render(name, seconds, loops, compose));
  writeFileSync(join(OUT, `${name}.wav`), file);
  total += file.length;
}

// The game's name list must match what was rendered, or sounds fail silently at runtime.
const declared = /SFX_NAMES = \[(.*?)\]/s.exec(readFileSync(join(ROOT, 'apps/web/src/game/soundFX.ts'), 'utf8'))[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
const missing = [...declared.filter((n) => !SOUNDS[n]), ...Object.keys(SOUNDS).filter((n) => !declared.includes(n))];
if (missing.length) throw new Error(`soundFX.ts SFX_NAMES out of sync: ${missing.join(', ')}`);

// Sound details for scripts/gen-docs.mjs.
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(Object.entries(SOUNDS).map(([name, [seconds, group, , loops, description]]) => ({ name, group, seconds, loops, description })), null, 2)}\n`);

// ---------- soundboard ----------
const groups = [...new Set(Object.values(SOUNDS).map((v) => v[1]))];
const html = `<!doctype html><meta charset="utf-8"><title>Sonic Heist Sounds</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:#fff4e4;color:#4a3a2c;font:600 14px/1.4 ui-monospace,Menlo,monospace;padding:24px 16px}
h1{color:#e5484d;letter-spacing:.12em;margin:0 0 4px}h2{margin:32px 0 10px;text-transform:uppercase;letter-spacing:.1em;border-bottom:4px solid #e5484d;padding-bottom:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}
button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;gap:10px;align-items:center;background:#fffaf1;border:3px solid #2a2230;padding:8px;box-shadow:0 4px 0 #2a2230}
button:focus-visible{outline:3px solid #2fb3ad;outline-offset:2px}
button:active,button[aria-pressed=true]{transform:translateY(4px);box-shadow:none;background:#ffe6b8}
img{width:72px;height:72px;flex:none}b{display:block;color:#2a2230}small{color:#7a6a58;font-weight:500}.loop{color:#2f8f88}
</style>
<h1>SONIC HEIST</h1><div>${Object.keys(SOUNDS).length} chiptune sounds. Tap to play. Tap a loop again to stop it.</div>
${groups.map((g) => `<h2>${g}</h2><div class="grid">${Object.entries(SOUNDS).filter(([, v]) => v[1] === g).map(([n, v]) => `<button data-name="${n}" data-loop="${v[3]}" aria-pressed="false"><img src="../sprites/rocco/lv2/${v[2]}.svg" alt=""><span><b>${n}${v[3] ? ' <span class="loop">↻</span>' : ''}</b><small>${v[4]}</small></span></button>`).join('')}</div>`).join('')}
<script>
const players = {};
document.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const name = btn.dataset.name;
    const a = (players[name] ??= new Audio(name + '.wav'));
    if (btn.dataset.loop === 'true') {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', on);
      a.loop = on;
      if (!on) { a.pause(); a.currentTime = 0; return; }
    } else a.currentTime = 0;
    a.play();
  });
});
</script>`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`Wrote ${Object.keys(SOUNDS).length} sounds (${Math.round(total / 1024)} KB) to ${OUT}`);
