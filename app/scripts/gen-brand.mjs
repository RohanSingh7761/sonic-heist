// Draws the steal-eth logo and app icons as pixel-art SVGs, then bakes the PNGs the app and Android need.
// Run from app/: node scripts/gen-brand.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(APP, 'assets');
mkdirSync(join(ASSETS, 'art'), { recursive: true });

// Same colours as src/ui/theme.ts.
const INK = '#2a2230';
const ICON_BG = '#e5484d'; // The game's red, so the dark mask stands out
const TEAL = { top: '#b6fff1', main: '#2fb3ad', low: '#1c7f79' };
const RED = { top: '#ffc2bd', main: '#e5484d', low: '#a92f3c' };
const GOLD = { top: '#fff1b0', main: '#f7c948', low: '#c98a1b' };

const GLYPHS = {
  S: ['.#####.', '##...##', '##.....', '.#####.', '.....##', '##...##', '.#####.'],
  T: ['#######', '#######', '..###..', '..###..', '..###..', '..###..', '..###..'],
  E: ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '#######'],
  A: ['.#####.', '##...##', '##...##', '#######', '##...##', '##...##', '##...##'],
  L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######'],
  H: ['##...##', '##...##', '##...##', '#######', '##...##', '##...##', '##...##'],
};
const DIAMOND = ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'];

// --- A small pixel canvas ---
const canvas = (w, h) => ({ w, h, px: new Map() });
const key = (x, y) => `${x},${y}`;
const set = (c, x, y, color) => {
  if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px.set(key(x, y), color);
};

function outline(c, color = INK) {
  for (const k of [...c.px.keys()]) {
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (!c.px.has(key(x + dx, y + dy))) set(c, x + dx, y + dy, color);
    }
  }
}

// Run-length paths, the same shape as the game's other sprites.
function paths(c) {
  const byColor = new Map();
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const color = c.px.get(key(x, y));
      if (!color) continue;
      let run = 1;
      while (c.px.get(key(x + run, y)) === color) run++;
      byColor.set(color, `${byColor.get(color) ?? ''}M${x} ${y}h${run}v1h-${run}z`);
      x += run - 1;
    }
  }
  return [...byColor].map(([color, d]) => `<path fill="${color}" d="${d}"/>`).join('');
}

function stamp(c, glyph, x, y, palette, lastRows = 2) {
  glyph.forEach((row, r) => [...row].forEach((ch, i) => {
    if (ch !== '#') return;
    const color = r === 0 ? palette.top : r >= glyph.length - lastRows ? palette.low : palette.main;
    set(c, x + i, y + r, color);
  }));
}

// --- Logo: same 44x24 size and 10-frame loop as before, with the letters hopping in a wave ---
const W = 44;
const H = 24;
const FRAMES = 10;
const FRAME_MS = 110;
const hop = (i, f) => ((f - i + FRAMES * 4) % FRAMES === 0 ? -1 : 0);

function logoFrame(f) {
  const c = canvas(W, H);
  [...'STEAL'].forEach((ch, i) => stamp(c, GLYPHS[ch], 2 + i * 8, 2 + hop(i, f), TEAL));
  [...'ETH'].forEach((ch, i) => stamp(c, GLYPHS[ch], 11 + i * 8, 14 + hop(i + 5, f), RED));
  stamp(c, DIAMOND, 2, 14 + hop(5, f), GOLD);
  stamp(c, DIAMOND, 35, 14 + hop(7, f), GOLD);
  outline(c);
  return paths(c);
}

const frames = Array.from({ length: FRAMES }, (_, f) => logoFrame(f));
const defs = frames.map((p, i) => `<g id="logo-${i}">${p}</g>`).join('');
const uses = frames
  .map((_, i) => `<use href="#logo-${i}" class="logo-p${i === 0 ? ' logo-first' : ''}" style="animation-name:logo-k${FRAME_MS};animation-delay:${i * FRAME_MS}ms"/>`)
  .join('');
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 4}" height="${H * 4}" shape-rendering="crispEdges"><style>.logo-p{visibility:hidden;animation-duration:${FRAMES * FRAME_MS}ms;animation-iteration-count:infinite;animation-timing-function:steps(1,end)}@keyframes logo-k${FRAME_MS}{0%{visibility:visible}10%,100%{visibility:hidden}}@media(prefers-reduced-motion:reduce){.logo-p{animation:none}.logo-first{visibility:visible}}</style><defs>${defs}</defs>${uses}</svg>`;
writeFileSync(join(ASSETS, 'art/logo.svg'), logoSvg);

const png = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width }, shapeRendering: 0 }).render().asPng();

// The sheet src/ui/sprites.gen.ts expects: 4 columns, every frame, 6 PNG pixels per art pixel.
const COLS = 4;
const ROWS = Math.ceil(FRAMES / COLS);
const cells = frames.map((_, i) => `<use href="#logo-${i}" x="${(i % COLS) * W}" y="${Math.floor(i / COLS) * H}"/>`).join('');
const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLS * W} ${ROWS * H}" shape-rendering="crispEdges"><defs>${defs}</defs>${cells}</svg>`;
writeFileSync(join(ASSETS, 'sprites/logo.png'), png(sheetSvg, COLS * W * 6));

// --- Icon: an Ether diamond wearing a thief's mask ---
function iconPixels({ mono }) {
  const size = 32;
  const c = canvas(size, size);
  const mid = 15.5;
  const paint = (x, y, color) => set(c, x, y, mono ? '#ffffff' : color);
  const widest = 16;
  for (let y = 2; y <= 29; y++) {
    const half = y <= widest ? ((y - 2) * 10.5) / (widest - 2) + 0.5 : ((29 - y) * 10.5) / (29 - widest) + 0.5;
    for (let x = 0; x < size; x++) {
      if (Math.abs(x - mid) > half) continue;
      const left = x < mid;
      let color = left ? GOLD.main : GOLD.low;
      if (y > widest) color = left ? GOLD.low : '#a56f12';
      if (y <= 5 || (left && Math.abs(x - mid) >= half - 1 && y <= widest)) color = GOLD.top;
      if (y === widest || y === widest + 1) color = GOLD.top;
      paint(x, y, color);
    }
  }
  outline(c, mono ? '#ffffff' : INK);
  if (mono) return c;
  // Mask band with two eye holes.
  for (let y = 11; y <= 14; y++) for (let x = 5; x <= 26; x++) c.px.set(key(x, y), INK);
  for (const [x, y] of [[3, 10], [4, 10], [3, 12], [2, 13], [28, 10], [27, 10], [28, 12], [29, 13], [4, 11], [4, 12], [27, 11], [27, 12]]) c.px.set(key(x, y), INK);
  for (const eye of [9, 19]) {
    for (let y = 12; y <= 13; y++) for (let x = eye; x <= eye + 3; x++) c.px.set(key(x, y), '#ffffff');
  }
  return c;
}

const art = (c) => paths(c);
const iconSvg = (inner, { bg, scale = 1 } = {}) => {
  const span = 32 / scale;
  const at = (span - 32) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges">${bg ? `<rect width="${span}" height="${span}" fill="${bg}"/>` : ''}<g transform="translate(${at} ${at})">${inner}</g></svg>`;
};

const iconArt = art(iconPixels({ mono: false }));
const monoArt = art(iconPixels({ mono: true }));
writeFileSync(join(ASSETS, 'art/icon.svg'), iconSvg(iconArt, { bg: ICON_BG, scale: 0.86 }));

writeFileSync(join(ASSETS, 'icon.png'), png(iconSvg(iconArt, { bg: ICON_BG, scale: 0.86 }), 1024));
writeFileSync(join(ASSETS, 'favicon.png'), png(iconSvg(iconArt, { bg: ICON_BG, scale: 0.86 }), 48));
// Android crops adaptive icons to the middle two thirds, so the art stays inside it.
writeFileSync(join(ASSETS, 'android-icon-foreground.png'), png(iconSvg(iconArt, { scale: 0.56 }), 1024));
writeFileSync(join(ASSETS, 'android-icon-background.png'), png(iconSvg('', { bg: ICON_BG }), 1024));
writeFileSync(join(ASSETS, 'android-icon-monochrome.png'), png(iconSvg(monoArt, { scale: 0.56 }), 1024));

// Android 12+ crops the splash image to a circle too, so the logo sits well inside it.
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70" shape-rendering="crispEdges"><g transform="translate(13 23)">${frames[9]}</g></svg>`;
writeFileSync(join(ASSETS, 'splash-logo.png'), png(splashSvg, 1024));

assert.equal(frames.length, FRAMES);
console.log('Drew assets/art and baked the logo and icons');
