// One canvas for all page particles: square pixels only, and it sleeps when nothing is alive.
const canvas = document.createElement('canvas');
canvas.className = 'fx';
canvas.setAttribute('aria-hidden', 'true');
const ctx = canvas.getContext('2d');
const parts = [];
let running = false;

function size() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}

export const COIN = ['#f7c948', '#fff0a8', '#c98a1b'];
export const DUST = ['#fffaf1', '#f3e4cb', '#d9ccb5'];
export const SONAR = ['#2fb3ad', '#5ec9a7'];

function step(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const dt = Math.min(0.05, (now - p.last) / 1000);
    p.last = now;
    p.age += dt;
    if (p.age >= p.life) { parts.splice(i, 1); continue; }
    ctx.fillStyle = p.color;
    if (p.ring) {
      // Sonar ping: a square ring that steps outward, like the app's stepped motion.
      const r = Math.round((p.age / p.life) * p.ring / 6) * 6;
      const w = 4;
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillRect(p.x - r, p.y - r, r * 2, w);
      ctx.fillRect(p.x - r, p.y + r - w, r * 2, w);
      ctx.fillRect(p.x - r, p.y - r, w, r * 2);
      ctx.fillRect(p.x + r - w, p.y - r, w, r * 2);
      ctx.globalAlpha = 1;
      continue;
    }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Shrinks in whole steps at the end of its life instead of fading, so it stays a crisp pixel.
    const s = p.age > p.life * 0.7 ? Math.max(1, Math.floor(p.s / 2)) : p.s;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
  }
  if (parts.length) requestAnimationFrame(step);
  else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
}

function wake() {
  if (running) return;
  running = true;
  requestAnimationFrame(step);
}

export function burst(x, y, { n = 10, colors = COIN, speed = 240, up = 120, g = 700, s = 6, life = 0.7 } = {}) {
  const last = performance.now();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, g, s, life: life * (0.6 + Math.random() * 0.4), age: 0, last, color: colors[i % colors.length] });
  }
  wake();
}

export function ring(x, y, { r = 72, color = SONAR[0], life = 0.5 } = {}) {
  parts.push({ x, y, ring: r, color, life, age: 0, last: performance.now() });
  wake();
}

export function initFx() {
  document.body.append(canvas);
  size();
  addEventListener('resize', size);
}

// Sounds stay off until asked for: a web page shouldn't surprise anyone.
let audio = null;
const buffers = new Map();
let soundOn = false;

export async function setSound(on) {
  soundOn = on;
  if (!on || audio) return;
  audio = new (window.AudioContext || window.webkitAudioContext)();
  await Promise.all(['coin', 'dash', 'level-up', 'ui-click'].map(async (name) => {
    const res = await fetch(`/sfx/${name}.wav`);
    buffers.set(name, await audio.decodeAudioData(await res.arrayBuffer()));
  }));
}

export function sfx(name, volume = 0.3) {
  const buffer = soundOn && buffers.get(name);
  if (!buffer) return;
  const gain = audio.createGain();
  gain.gain.value = volume;
  gain.connect(audio.destination);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.start();
}
