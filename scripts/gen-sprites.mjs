// Generates every Sonic Heist pixel-art SVG into apps/web/public/sprites/.
// Run: node scripts/gen-sprites.mjs
// All art is hand-placed character grids; a bad grid or colour key throws, so a clean run is the self-check.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../apps/web/public/sprites');
const S = 48; // avatar canvas size in art pixels

// ---------- helpers ----------
const grid = (s) => {
  const rows = s.trim().split('\n').map((r) => r.trim());
  rows.forEach((r) => {
    if (r.length !== rows[0].length) throw new Error(`Uneven grid row "${r}" in:\n${s}`);
  });
  return rows;
};
const flip = (g) => g.map((r) => [...r].reverse().join(''));

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = Array.from({ length: h }, () => Array(w).fill(null));
  }
  draw(g, x, y) {
    g.forEach((row, j) =>
      [...row].forEach((c, i) => {
        if (c === '.') return;
        const X = x + i;
        const Y = y + j;
        if (X >= 0 && Y >= 0 && X < this.w && Y < this.h) this.px[Y][X] = c;
      }),
    );
    return this;
  }
  dot(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c;
  }
  // Row-run paths grouped by colour: far smaller than one <rect> per pixel.
  svg(pal) {
    const byColour = {};
    this.px.forEach((row, y) => {
      for (let x = 0; x < row.length; ) {
        const c = row[x];
        if (!c) {
          x++;
          continue;
        }
        let e = x + 1;
        while (e < row.length && row[e] === c) e++;
        const col = pal[c];
        if (!col) throw new Error(`No colour for key "${c}"`);
        (byColour[col] ??= []).push(`M${x} ${y}h${e - x}v1h-${e - x}z`);
        x = e;
      }
    });
    return Object.entries(byColour)
      .map(([col, d]) => `<path fill="${col}" d="${d.join('')}"/>`)
      .join('');
  }
}

// Flipbook: [{ body, ms }]. Stepped CSS so it stays pixel-crisp, works in <img> and when inlined.
function flipbook(id, w, h, frames, extraDefs = '') {
  const total = frames.reduce((a, f) => a + f.ms, 0);
  const unique = [...new Set(frames.map((f) => f.body))];
  const fracs = [...new Set(frames.map((f) => f.ms))];
  const kf = fracs
    .map((ms) => `@keyframes ${id}-k${ms}{0%{visibility:visible}${+((ms / total) * 100).toFixed(3)}%,100%{visibility:hidden}}`)
    .join('');
  let t = 0;
  const seq = frames
    .map((f, i) => {
      const u = `<use href="#${id}-${unique.indexOf(f.body)}" class="${id}-p${i === 0 ? ` ${id}-first` : ''}" style="animation-name:${id}-k${f.ms};animation-delay:${t}ms"/>`;
      t += f.ms;
      return u;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 4}" height="${h * 4}" shape-rendering="crispEdges"><style>.${id}-p{visibility:hidden;animation-duration:${total}ms;animation-iteration-count:infinite;animation-timing-function:steps(1,end)}${kf}@media(prefers-reduced-motion:reduce){.${id}-p{animation:none}.${id}-first{visibility:visible}}</style><defs>${extraDefs}${unique
    .map((b, i) => `<g id="${id}-${i}">${b}</g>`)
    .join('')}</defs>${seq}</svg>`;
}

// ---------- shared colours ----------
const BASE = {
  K: '#2a2230', w: '#ffffff', E: '#1d1722', m: '#a8404f', P: '#f59aa0',
  b: '#8fd8ff', l: '#4aa5e8', Y: '#f7c948', y: '#c98a1b', Z: '#fff0a8',
  R: '#e5484d', r: '#a92f3c', n: '#6f6880', N: '#463f54', O: '#a8693a', o: '#7c4a28',
  X: '#efe3cd', u: '#c9b99c', ',': '#2a22302e', '~': '#5fe3d9', '-': '#2fb3ad',
};

// ---------- body parts (shared skeleton, recoloured per character) ----------
const TORSO = grid(`
....KKKKKKKK....
...KCCCCCCCcK...
...KCCDDDDCcK...
...KCCDDDDCcK...
...KCCDDDDCcK...
...KCCCCCCCcK...
...KccccccccK...`);

const ARMS = {
  down: grid(`
................
................
..KK........KK..
.KAK........KBK.
.KAK........KBK.
.KaK........KaK.
..KK........KK..`),
  swingA: grid(`
................
.KK.............
KAAK........KK..
KAK.........KBK.
KaK.........KBK.
.K..........KaK.
.............KK.`),
  swingB: grid(`
................
.............KK.
..KK........KBBK
.KAK.........KBK
.KAK.........KaK
.KaK..........K.
..KK............`),
  // Left hand holds the bindle stick up beside the head.
  carry: grid(`
.KK.............
KaaK............
KAAK.........KK.
.KAAK.......KBK.
..KAK.......KBK.
...KK.......KaK.
.............KK.`),
  reach: grid(`
................
................
..KK........KKKK
.KAK........KBBa
.KAK........KKKK
.KaK............
..KK............`),
  rub: grid(`
..KK........KK..
.KaK........KaK.
.KAK........KBK.
.KAK........KBK.
..KAK......KBK..
...K........K...
................`),
};
// Raised arms sit wider than the torso, so they get their own frame at (10, 24).
const ARMS_UP = grid(`
.KK......................KK.
KaaK....................KaaK
KAAK....................KBBK
.KAK....................KBK.
.KAAK..................KBBK.
..KAAK................KBBK..
...KAAK..............KBBK...
....KAAK............KBBK....
.....KAAK..........KBBK.....
......KKK..........KKK......`);

const LEGS = {
  stand: grid(`
...KTTTTTTTtK...
...KTTTKKTTtK...
...KFFFKKFFfK...
...KKKKKKKKKK...`),
  walkA: grid(`
...KTTTTTTTtK...
...KTTTKKTTtK...
...KFFFKKKKKK...
...KKKKK........`),
  walkB: grid(`
...KTTTTTTTtK...
...KTTKKKTTtK...
...KKKKKKFFfK...
........KKKKK...`),
  run1: grid(`
...KTTTTTTTtK...
..KttKKKKKTTTK..
.KffK.....KFFFK.
.KKK......KKKKK.`),
  run2: grid(`
...KTTTTTTTtK...
...KffKKTTTtK...
...KKK.KFFFfK...
.......KKKKKK...`),
  run3: grid(`
...KTTTTTTTtK...
..KTTKKKKKtttK..
.KFFK.....KfffK.
.KKK......KKKKK.`),
  run4: grid(`
...KTTTTTTTtK...
...KFFKKtttTK...
...KKK.KfffFK...
.......KKKKKK...`),
  sit: grid(`
..KTTTTTTTTTtK..
..KTTTTTTTTTtK..
..KKFFKKKKFfKK..
...KKK....KKK...`),
};

const CHAIR = grid(`
...KKKKKKKKKKKKKKKKKK...
..KOOOOOOOOOOOOOOOOOOK..
..KOooooooooooooooooOK..
..KOoOOOOOOOOOOOOOOoOK..
..KOoOooooooooooooOoOK..
..KOoOOOOOOOOOOOOOOoOK..
..KOooooooooooooooooOK..
..KOOOOOOOOOOOOOOOOOOK..
..KOoooooooooooooooOOK..
..KOoooooooooooooooOOK..
..KOoooooooooooooooOOK..
..KOoooooooooooooooOOK..
.KKKKKKKKKKKKKKKKKKKKKK.
.KOOOOOOOOOOOOOOOOOOOOK.
.KooooooooooooooooooooK.
.KKKKKKKKKKKKKKKKKKKKKK.
...KoK..............KoK.
...KoK..............KoK.
...KKK..............KKK.`);

// ---------- faces (12x5, placed on the head at col 4 row 8) ----------
const FACE = {
  normal: grid(`
..wE....wE..
..EE....EE..
..EE....EE..
PP...mm...PP
............`),
  blink: grid(`
............
............
..EE....EE..
PP...mm...PP
............`),
  left: grid(`
.wE....wE...
.EE....EE...
.EE....EE...
PP...mm...PP
............`),
  right: grid(`
...wE....wE.
...EE....EE.
...EE....EE.
PP...mm...PP
............`),
  happy: grid(`
..EE....EE..
.E..E..E..E.
............
PP..EmmE..PP
.....EE.....`),
  shock: grid(`
..EE....EE..
.EwwE..EwwE.
.EwwE..EwwE.
..EE....EE..
PP...EE...PP`),
  wail: grid(`
.EEE....EEE.
...E....E...
............
PP..mmmm..PP
....mmmm....`),
  sob: grid(`
............
.EEE....EEE.
...E....E...
PP...mm...PP
.....mm.....`),
  hunt: grid(`
.EE......EE.
..EEE..EEE..
..wE....wE..
..EE....EE..
.....mm.....`),
  smirk: grid(`
............
............
............
PP.....mm.PP
.....mm.....`),
  none: grid(`
............
............
............
PP........PP
............`),
};

// Thief glasses: plain black band. Swag shades: oversized with white glints.
const THIEF_SHADES = grid(`
KKKKKKKKKKKKKK
KKNKKKKKKNKKKK
.KKNKK..KKNKK.
..KKK....KKK..`);
const SWAG_SHADES = grid(`
KKKKKKKKKKKKKKKK
.KKwKwKKKKwKwKK.
.KKKwKwKKKKwKwK.
..KKKKK..KKKKK..`);
const CHAIN = grid(`
....YY....YY....
.....YY..YY.....
......YYYY......
......ZYYy......
.......yy.......`);

// ---------- props and effects ----------
const BUNDLE = grid(`
....K....K....
...KNKKKKNK...
....KNNNNK....
.....KNNK.....
...KKKKKKKK...
..KKnKKKKKKKK.
.KKnKKKKKKKKK.
.KnKKKNKKKKKKK
KKKKKKKKKKNKKK
KKKKNKKKKKKKNK
KKKKKKKKNKKKNK
.KKKKKKKKKNNK.
..KKKKKKKKKK..`);
const COIN = grid(`
.KKK.
KYZYK
KYZyK
KYYyK
.KKK.`);
const FIST = grid(`
.KK.
KaaK
KaaK
.KK.`);
const STAR = grid(`
..Y..
.YYY.
YYZYY
.YYY.
..Y..`);
const SPARK = grid(`
.Z.
ZwZ
.Z.`);
const TEAR = grid(`
.b.
bbb
blb`);
const STREAM = grid(`
b
b
l
b
b`);
const STREAM2 = grid(`
l
b
b
l
b`);
const DUST = grid(`
.XXX.
XXXXu
.Xuu.`);
const BANG = grid(`
.KKK.
KRRRK
KRRRK
KRRRK
.KRK.
.KRK.
..K..
.KKK.
.KRK.
.KKK.`);
const SWEAT = grid(`
.b.
bbl
.l.`);
const RADAR = grid(`
.KKKK.
K~~~~K
K~--~K
K~~~~K
KNNNNK
.KKKK.`);
const ARC = [
  grid(`
.~.
..~
..~
.~.`),
  grid(`
.~..
..~.
...~
...~
...~
..~.
.~..`),
  grid(`
.-...
..-..
...-.
....-
....-
....-
....-
...-.
..-..
.-...`),
];
const PUDDLE = [
  grid(`
...lbbl...`),
  grid(`
..lbbbbbl.
.lbbbbbbl.`),
  grid(`
..llbbbbbbll..
.lbbbbbbbbbbbl
..lllbbbblll..`),
];
// Soft pixel ellipse under the feet.
const shadow = (w) =>
  [w - 8, w, w - 8].map((n) => '.'.repeat((24 - n) / 2) + ','.repeat(n) + '.'.repeat((24 - n) / 2));

// ---------- characters (original designs) ----------
const JUNO_HEAD = grid(`
......KKKKKKKK......
....KKHHHHHHHHKK....
...KHHHiiHHHHHHHK...
..KHHiiHHHHHHHHHHK..
..KHHiHHHHHHHHHHhK..
.KHHHHHHHHHHHHHHHhK.
.KHHHHhhHHHhhhHHHhK.
.KHHhSSShHhSSSShHhK.
.KHhSSSSSSSSSSSShhK.
.KHhSSSSSSSSSSSShhK.
.KHhSSSSSSSSSSSShhK.
.KHhSSSSSSSSSSSShhK.
.KHHhSSSSSSSSSShHhK.
.KhhhKKssssssKKhhhK.
..KKKK..KKKK..KKKK..`);

const ROCCO_HEAD = grid(`
..KKK..........KKK..
.KGGGK........KGGGK.
.KGWGKKKKKKKKKKGWGK.
..KKGGGGGGGGGGGGgK..
..KGGGGGGWWGGGGGgK..
.KGGGGGGGWWGGGGGGgK.
.KGMMMMGGWWGGMMMMgK.
.KMMMMMMGGGGMMMMMMK.
.KMMMMMMMGGMMMMMMMK.
.KMMMMMMMGGMMMMMMMK.
.KMMMMMMGWWGMMMMMMK.
.KGMMMGWWWWWWGMMMgK.
..KGGGWWWWWWWWGGgK..
...KgggWWWWWWgggK...
.....KKKKKKKKKK.....`);

const NIB_HEAD = grid(`
..KK....KKKK....KK..
.KQQK..KVVVVK..KQQK.
.KQqK.KKVVVVKK.KqQK.
..KQqKGGGGGGGGKqQK..
..KGGGiiGGGGGGGGgK..
.KGGGiiGGGGGGGGGGgK.
KVKGGGGGGGGGGGGGgKVK
KVVKGGGGGGGGGGGgKVVK
.KVGGGGGGGGGGGGGgVK.
.KVGGGGGGGGGGGGGgVK.
.KGGGGGGGGGGGGGGGgK.
.KGGGQQQQQQQQQQGGgK.
.KGGQQQQQQQQQQQQGgK.
..KgQQqQQQQQQqQQgK..
...KKKKKKKKKKKKKK...`);

const ROCCO_TAIL = grid(`
.....KKK..
....KGGGK.
...KMMMMK.
...KGGGGK.
..KMMMMK..
..KGGGGK..
.KMMMMK...
.KGGGGK...
.KGGGK....
KKKKK.....`);
const NIB_TAIL = grid(`
.......KK.
......KVVK
......KGK.
.....KGGK.
....KGGK..
..KKGGgK..
.KGGGgK...
KGGgKK....
KKKK......`);

const WING_S = grid(`
KK......
KVKK....
KVVVKK..
.KVVVVK.
.KvVVVVK
..KVVVVK
...KKVVK
.....KKK`);
const WING_L = grid(`
KKK.........
KVVKK.......
KVVVVKK.....
.KVVVVVVKK..
.KvVVVVVVVK.
.KVvVVVVVVVK
..KVvVVVVVVK
..KVVvVVVVVK
...KKVVvVVVK
.....KKVVVVK
.......KKKKK`);
const CAPE = grid(`
..KVVVVVVVVVVVVK..
.KVVVVVVVVVVVVVVK.
.KVVVVVVVVVVVVVvK.
KVVVVVVVVVVVVVVVvK
KVVVVVVVVVVVVVVVvK
KVVVVVVVVVVVVVVVvK
KVVVVVVVVVVVVVVVvK
KVVvKVVVvKVVVvKVvK
.KK..KKK..KKK..KK.`);

const HEADPHONES = grid(`
.....KKKKKKKKKKKK.....
...KKJJJJJJJJJJJJKK...
..KJJKKKKKKKKKKKKJjK..
.KJjK............KJjK.
.KJK..............KJK.
.KJK..............KJK.
.KK................KK.
KJJK..............KJJK
KLJK..............KLJK
KLJK..............KLJK
KLJK..............KLJK
KJJK..............KJJK
.KK................KK.`);
const CAP = grid(`
...KKKKKKKK...
..KJJJJJJJjK..
.KJJjJJJjJJjK.
.KJJJJJJJJJjK.
KKKKKKKKKKKKKK
KLLLLLLLLLLLLK
.KKKKKKKKKKKK.`);
const TOP_HAT = grid(`
...KKKKKKKKKK...
...KJJJJJJJjK...
...KJJJJJJJjK...
...KJJJJJJJjK...
...KJJJJJJJjK...
...KJJJJJJJjK...
...KJJJJJJJjK...
...KYYZYYYYyK...
...KYYYYYYYyK...
.KKKKKKKKKKKKKK.
KJJJJJJJJJJJJJjK
KKKKKKKKKKKKKKKK`);
const CROWN = grid(`
.Z....ZZ....Z.
KYK..KYYK..KYK
KYYKKYYYYKKYYK
KYYYYYYYYYYYYK
KRYYYYRRYYYYRK
KyyyyyyyyyyyyK
KKKKKKKKKKKKKK`);
const HAIR_CLIP = grid(`
.ZY.
ZYYy
.Yy.`);
const BANDANA = grid(`
................
...KRRRRRRRRK...
...KrRRRRRRrK...
.....KrRRrK.....
......KrrK......
.......KK.......
................`);
const STRIPES = grid(`
................
................
....LLLLLLLL....
................
....LLLLLLLL....
................
....LLLLLLLL....`);
const TUX = grid(`
................
....wwwwwwww....
.....KwwwwK.....
.....KKwwKK.....
.....ZKwwKZ.....
.....YKwwKY.....
................`);
const ARMOR = grid(`
................
....YYYYYYYY....
....YZZZZZZy....
....YZZRRZZy....
....YZZZZZZy....
....yyyyyyyy....
................`);
const SCARF = grid(`
....RRRRRRRR....
...KRRRRRRRRK...
...KrrrrrrrrK...
..........Rr....
..........rK....
................
................`);

const skin = { S: '#ffd6b0', s: '#eab084', a: '#ffd6b0' };
const juno = (o) => ({ H: '#4b2e5e', h: '#36204a', i: '#7d5a99', ...skin, ...o });
const rocco = (o) => ({ G: '#a5a4b3', g: '#7b7a8f', M: '#5a566b', W: '#f6f1e6', a: '#5a566b', T: '#7b7a8f', t: '#5f5e72', F: '#5a566b', f: '#433f52', A: '#a5a4b3', B: '#7b7a8f', ...o });
const nib = (o) => ({ G: '#5ec9a7', g: '#3a9c83', i: '#a6ecd1', Q: '#fff0c9', q: '#e0c48a', a: '#5ec9a7', T: '#5ec9a7', t: '#3a9c83', F: '#3a9c83', f: '#2a7f69', A: '#5ec9a7', B: '#3a9c83', V: '#f49a8b', v: '#d9705f', ...o });

const AVATARS = {
  juno: {
    head: JUNO_HEAD,
    levels: [
      { title: 'Rookie', pal: juno({ C: '#f2795c', c: '#c9543f', D: '#ffd9a8', A: '#f2795c', B: '#c9543f', T: '#4a6fa5', t: '#365180', F: '#f4efe6', f: '#c8bfb0' }), gear: [[HAIR_CLIP, 16, 21]] },
      { title: 'Prowler', pal: juno({ C: '#2ea99a', c: '#1f7f75', D: '#f7f2e4', A: '#2ea99a', B: '#1f7f75', T: '#39405c', t: '#2a2f46', F: '#f2795c', f: '#c9543f', J: '#3b4468', j: '#2a3050', L: '#5fe3d9' }), gear: [[HEADPHONES, 13, 15]] },
      { title: 'Phantom', pal: juno({ i: '#c9a3e0', C: '#6e3fb5', c: '#4f2a8a', D: '#f7c948', A: '#6e3fb5', B: '#4f2a8a', T: '#2e2648', t: '#211b36', F: '#f7c948', f: '#c98a1b', J: '#f7c948', j: '#c98a1b', L: '#e5484d', V: '#c0304a', v: '#8f2138' }), gear: [[HEADPHONES, 13, 15]], back: [[CAPE, 15, 33]], shine: true },
    ],
  },
  rocco: {
    head: ROCCO_HEAD,
    tail: ROCCO_TAIL,
    tailAt: [29, 33],
    levels: [
      { title: 'Rookie', pal: rocco({ C: '#a5a4b3', c: '#7b7a8f', D: '#f6f1e6' }), deco: [[BANDANA, 16, 31]] },
      { title: 'Prowler', pal: rocco({ C: '#f6f1e6', c: '#cfc7b6', D: '#f6f1e6', L: '#3b5a8c', J: '#c98f4d', j: '#a06f36', A: '#f6f1e6', B: '#cfc7b6', T: '#3b4468', t: '#2a3050' }), deco: [[STRIPES, 16, 31]], gear: [[CAP, 17, 13]] },
      { title: 'Phantom', pal: rocco({ C: '#2e2f4a', c: '#1f2036', D: '#2e2f4a', A: '#2e2f4a', B: '#1f2036', T: '#2e2f4a', t: '#1f2036', J: '#2e2f4a', j: '#1f2036', V: '#c0304a', v: '#8f2138' }), deco: [[TUX, 16, 31]], gear: [[TOP_HAT, 16, 6]], back: [[CAPE, 15, 33]], shine: true },
    ],
  },
  nib: {
    head: NIB_HEAD,
    tail: NIB_TAIL,
    tailAt: [30, 34],
    levels: [
      { title: 'Rookie', pal: nib({ C: '#5ec9a7', c: '#3a9c83', D: '#fff0c9' }) },
      { title: 'Prowler', pal: nib({ C: '#5ec9a7', c: '#3a9c83', D: '#fff0c9' }), deco: [[SCARF, 16, 31]], back: [[WING_S, 8, 29], [flip(WING_S), 32, 29]] },
      { title: 'Phantom', pal: nib({ C: '#3fae8d', c: '#2a7f69', D: '#fff0c9', G: '#4dbf9a', V: '#b45cd6', v: '#8238a8', q: '#f7c948', Q: '#fff0a8' }), deco: [[ARMOR, 16, 31]], gear: [[CROWN, 17, 13]], back: [[WING_L, 4, 24], [flip(WING_L), 32, 24]], shine: true },
    ],
  },
};

// ---------- composing one frame ----------
function pose(av, lvl, o = {}, tick = 0) {
  const {
    dy = 0, headDx = 0, headDy = 0, legs = 'stand', arms = 'down', face = 'normal',
    tailLeft = false, chair = false, under = [], over = [], shades = null, chain = false,
    shadowW = 18, noTail = false,
  } = o;
  const c = new Canvas(S, S);
  const top = dy + 2; // gear and body coordinates were laid out 2 rows higher
  if (shadowW) c.draw(shadow(shadowW), 12, 43);
  if (chair) c.draw(CHAIR, 12, 29);
  under.forEach(([g, x, y]) => c.draw(g, x, y));
  (lvl.back ?? []).forEach(([g, x, y]) => c.draw(g, x, y + top));
  if (av.tail && !noTail) {
    const [tx, ty] = av.tailAt;
    if (tailLeft) c.draw(flip(av.tail), 48 - tx - av.tail[0].length, ty + top);
    else c.draw(av.tail, tx, ty + top);
  }
  if (arms === 'up') c.draw(ARMS_UP, 10, 24 + top);
  c.draw(LEGS[legs], 16, 38 + top);
  c.draw(TORSO, 16, 31 + top);
  (lvl.deco ?? []).forEach(([g, x, y]) => c.draw(g, x, y + top));
  if (chain) c.draw(CHAIN, 16, 32 + top);
  if (ARMS[arms]) c.draw(ARMS[arms], 16, 31 + top);
  const hy = 17 + top + headDy;
  const hx = 14 + headDx;
  c.draw(av.head, hx, hy);
  c.draw(FACE[face], hx + 4, hy + 8);
  (lvl.gear ?? []).forEach(([g, x, y]) => c.draw(g, x + headDx, y + top + headDy));
  if (shades) c.draw(shades[0], hx + (shades[0][0].length === 16 ? 2 : 3), hy + 8 + shades[1]);
  over.forEach(([g, x, y]) => c.draw(g, x, y));
  if (lvl.shine) {
    const twinkle = [[[6, 12], [40, 20]], [[42, 8], [4, 30]], [[10, 22], [38, 34]], [[36, 10], [6, 40]]][tick % 4];
    twinkle.forEach(([x, y]) => c.draw(SPARK, x, y));
  }
  return c;
}

// Stick rises from the left hand, clear of the head, with the black bundle hanging at its tip.
function bindle(dy = 0, sway = 0) {
  const rows = Array.from({ length: 48 }, () => Array(48).fill('.'));
  for (let y = 9; y <= 36; y++) {
    const x = Math.round(5 + ((y - 9) * 12) / 27);
    const Y = y + dy;
    if (Y < 0 || Y >= 48) continue;
    rows[Y][x - 1] = 'K';
    rows[Y][x] = 'O';
    rows[Y][x + 1] = 'o';
    rows[Y][x + 2] = 'K';
  }
  return [
    [rows.map((r) => r.join('')), 0, 0],
    [BUNDLE, 0, 7 + dy + sway],
  ];
}

// ---------- states ----------
const RUN = ['run1', 'run2', 'run3', 'run4'];
const RUN_ARM = ['swingA', 'down', 'swingB', 'down'];
const STATES = {
  idle: (a, l) => [
    [{ face: 'normal' }, 420], [{ headDy: 1 }, 420], [{}, 420], [{ headDy: 1 }, 420],
    [{}, 300], [{ face: 'blink' }, 110], [{}, 300], [{ headDy: 1 }, 420],
    [{ face: 'left' }, 360], [{ face: 'right' }, 360], [{ face: 'blink' }, 110],
  ],
  seated: () => {
    const s = { chair: true, legs: 'sit', shadowW: 22 };
    return [
      [{ ...s }, 520], [{ ...s, headDy: 1 }, 520], [{ ...s }, 520], [{ ...s, face: 'blink' }, 110],
      [{ ...s, headDy: 1 }, 520], [{ ...s, face: 'left' }, 420], [{ ...s, face: 'right' }, 420],
    ];
  },
  sneak: () => {
    const s = (legs, face, dy) => [{ legs, face, dy, arms: 'reach', headDy: 1 }, 190];
    return [s('walkA', 'left', 0), s('stand', 'left', -1), s('walkB', 'left', 0), s('stand', 'blink', -1), s('walkA', 'right', 0), s('stand', 'right', -1), s('walkB', 'right', 0), s('stand', 'right', -1)];
  },
  thief: () => {
    const s = (headDy, sway, glint) => [{ arms: 'carry', face: 'smirk', headDy, shades: [THIEF_SHADES, 0], under: bindle(0, sway), over: glint ? [[SPARK, 18, 23]] : [] }, 280];
    return [s(0, 0), s(1, 1), s(0, 0), s(1, 1), s(0, 0, true), s(0, 0), s(1, 1)];
  },
  run: () => RUN.map((legs, i) => [{ legs, arms: RUN_ARM[i], face: 'right', dy: i % 2 ? -1 : 0, headDx: 1, tailLeft: true, shadowW: i % 2 ? 14 : 18, over: i % 2 === 0 ? [[DUST, 4 + i * 2, 40]] : [[SWEAT, 8, 18]] }, 110]),
  'thief-run': () => RUN.map((legs, i) => {
    const dy = i % 2 ? -1 : 0;
    return [{ legs, arms: 'carry', face: 'smirk', shades: [THIEF_SHADES, 0], dy, headDx: 1, tailLeft: true, shadowW: i % 2 ? 14 : 18, under: bindle(dy, i % 2), over: i === 0 ? [[DUST, 3, 40]] : i === 2 ? [[DUST, 7, 40]] : [[COIN, 12 + i, 39]] }, 100];
  }),
  swag: () => {
    const c = { chain: true, face: 'smirk', arms: 'down' };
    const rain = (t) => [[COIN, 5, (t * 7) % 40], [COIN, 38, ((t + 3) * 7) % 40], [SPARK, 10, (t * 5 + 6) % 30]];
    const f = [
      [{ ...c, shades: [SWAG_SHADES, -16], over: rain(0) }, 170],
      [{ ...c, shades: [SWAG_SHADES, -12], over: rain(1) }, 170],
      [{ ...c, shades: [SWAG_SHADES, -8], over: rain(2) }, 170],
      [{ ...c, shades: [SWAG_SHADES, -4], over: rain(3) }, 170],
      [{ ...c, shades: [SWAG_SHADES, 0], headDy: 1, over: rain(4) }, 170],
    ];
    for (let t = 5; t < 15; t++) f.push([{ ...c, shades: [SWAG_SHADES, 0], headDy: t % 2, dy: t % 2 ? -1 : 0, over: [...rain(t), ...(t % 5 === 0 ? [[SPARK, 36, 22]] : [])] }, 200]);
    return f;
  },
  cry: () => {
    // Two streams run down the cheeks; big drops fly off to each side and fall into the puddle.
    const stream = (t, headDy) => [
      [t % 2 ? STREAM : STREAM2, 19, 30 + headDy],
      [t % 2 ? STREAM2 : STREAM, 27, 30 + headDy],
    ];
    const drops = (t) => [
      [TEAR, 11 - (t % 4), 27 + (t % 4) * 4],
      [TEAR, 34 + ((t + 2) % 4), 27 + ((t + 2) % 4) * 4],
      [TEAR, 8 - ((t + 2) % 4), 30 + ((t + 2) % 4) * 3],
      [TEAR, 37 + (t % 4), 30 + (t % 4) * 3],
    ];
    const f = [];
    for (let t = 0; t < 12; t++) {
      const headDy = t % 2;
      const rubbing = t % 6 < 2;
      f.push([{ arms: rubbing ? 'rub' : 'down', face: t % 3 === 2 ? 'sob' : 'wail', headDy, over: [...stream(t, headDy), ...drops(t), [PUDDLE[Math.min(2, t >> 2)], 17, 44], ...(rubbing ? [[FIST, 18, 28 + headDy], [FIST, 26, 28 + headDy]] : [])] }, 170]);
    }
    return f;
  },
  caught: () => {
    const f = [];
    const orbit = [[8, 12], [20, 8], [34, 12], [36, 18], [20, 11], [6, 18]];
    const ground = [[BUNDLE, 33, 32], [COIN, 2, 40], [COIN, 8, 41]];
    for (let t = 0; t < 8; t++) {
      f.push([{ arms: 'up', face: t % 4 === 3 ? 'blink' : 'shock', shades: [THIEF_SHADES, -5], headDy: t % 2, over: [...ground, [STAR, ...orbit[t % 6]], [STAR, ...orbit[(t + 3) % 6]], ...(t < 4 ? [[BANG, 39, 6]] : [])] }, 150]);
    }
    return f;
  },
  saved: () => {
    const jump = [0, -2, -5, -6, -5, -2, 0, 0];
    return jump.map((dy, t) => [{ arms: 'up', face: 'happy', dy, shadowW: dy < -3 ? 12 : 18, over: [[COIN, 6, ((t * 6) % 30) + 2], [COIN, 37, (((t + 4) * 6) % 30) + 2], [SPARK, 20, ((t * 5 + 8) % 14)], ...(t % 3 === 0 ? [[STAR, 42, 22], [STAR, 2, 26]] : [])] }, 110]);
  },
  alert: () => {
    const f = [];
    for (let t = 0; t < 8; t++) {
      f.push([{ arms: 'up', face: 'shock', headDx: t % 2 ? 1 : -1, over: t % 4 < 3 ? [[BANG, 40, 4 + (t % 2)], [SWEAT, 6, 20 + t % 3]] : [[SWEAT, 6, 20]] }, 110]);
    }
    return f;
  },
  hunt: () => {
    const legs = ['walkA', 'stand', 'walkB', 'stand'];
    const f = [];
    for (let t = 0; t < 8; t++) {
      const arc = ARC[t % 3];
      f.push([{ legs: legs[t % 4], arms: 'reach', face: 'hunt', dy: t % 2 ? -1 : 0, tailLeft: true, over: [[RADAR, 33, 33 + (t % 2 ? -1 : 0)], [arc, 39 + (t % 3), 32 - (t % 3)]] }, 170]);
    }
    return f;
  },
};

// Faded silhouette for the locked rung of the level ladder.
const fade = (pal) =>
  Object.fromEntries(
    Object.entries(pal).map(([k, v]) => {
      if (v.length !== 7) return [k, v];
      const n = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
      const g = 0.3 * n[0] + 0.59 * n[1] + 0.11 * n[2];
      const mix = [0, 1, 2].map((i) => Math.round(g * 0.45 + [255, 244, 228][i] * 0.55));
      return [k, `#${mix.map((x) => x.toString(16).padStart(2, '0')).join('')}`];
    }),
  );

// ---------- avatar output ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const palFor = (lvl) => ({ ...BASE, ...lvl.pal });
let count = 0;
const write = (name, svg) => {
  const p = join(OUT, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, svg);
  count++;
};

for (const [name, av] of Object.entries(AVATARS)) {
  av.levels.forEach((lvl, li) => {
    const pal = palFor(lvl);
    for (const [state, make] of Object.entries(STATES)) {
      const frames = make(av, lvl).map(([o, ms], tick) => ({ body: pose(av, lvl, o, tick).svg(pal), ms }));
      write(`${name}/lv${li + 1}/${state}.svg`, flipbook(`${name}${li + 1}${state.replace('-', '')}`, S, S, frames));
    }
    const lockedLvl = { ...lvl, shine: false };
    write(`${name}/lv${li + 1}/locked.svg`, flipbook(`${name}${li + 1}locked`, S, S, [{ body: pose(av, lockedLvl).svg(fade(pal)), ms: 1000 }]));
  });
}

// ---------- scenes ----------
// Sprites live once in <defs>; each scene frame is just a list of <use> placements.
function sceneSvg(id, w, h, background, frames) {
  const defs = new Map();
  const ref = (key, build) => {
    if (!defs.has(key)) defs.set(key, `<g id="${id}s${defs.size}">${build()}</g>`);
    return [...defs.keys()].indexOf(key);
  };
  const body = frames.map((f) =>
    f.map(({ key, build, x, y, mirror, sw = S }) => {
      const u = `<use href="#${id}s${ref(key, build)}"/>`;
      return `<g transform="translate(${mirror ? x + sw : x} ${y})${mirror ? ' scale(-1 1)' : ''}">${u}</g>`;
    }).join(''),
  );
  return flipbook(id, w, h, body.map((b) => ({ body: b, ms: 100 })), `<g id="${id}bg">${background}</g>${[...defs.values()].join('')}`)
    .replace(/<g id="([a-z0-9]+)-(\d+)">/g, `<g id="$1-$2"><use href="#${id}bg"/>`);
}

const avatarSprite = (name, li, state, frame) => {
  const av = AVATARS[name];
  const lvl = av.levels[li];
  const list = STATES[state](av, lvl);
  const [o] = list[frame % list.length];
  return { key: `${name}${li}${state}${frame % list.length}`, build: () => pose(av, lvl, o, frame % 4).svg(palFor(lvl)) };
};
const canvasSprite = (key, c) => ({ key, build: () => c.svg(BASE) });
const emptyChair = canvasSprite('chair', new Canvas(S, S).draw(shadow(22), 12, 43).draw(CHAIR, 12, 29));

const FLOOR = { 1: '#b27a48', 2: '#99653a', 3: '#c98f5a', 4: '#6e4526', 5: '#d9534f', 6: '#b43c3c', 7: '#f2b03d', 8: '#efe3cd', ...BASE };
function planks(w, h, offset = 0) {
  const c = new Canvas(w, h);
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / 14);
    const line = y % 14;
    for (let x = 0; x < w; x++) {
      const joint = (x + offset + row * 21) % 56 === 0;
      c.px[y][x] = line === 0 || line === 13 || joint ? '4' : line === 1 ? '3' : (x + offset + row * 13) % 56 < 18 ? '2' : '1';
    }
  }
  return c;
}
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
function ellipse(c, cx, cy, rx, ry, fill, edge = 'K') {
  const inside = (x, y) => inEllipse(x, y, cx, cy, rx + 0.4, ry + 0.4);
  for (let y = cy - ry - 2; y <= cy + ry + 2; y++)
    for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
      if (inside(x, y)) c.dot(x, y, fill);
      else if (edge && (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1))) c.dot(x, y, edge);
    }
}
const W = 240;
const H = 172;
const CX = 120;
const CY = 106;
function roomBackground() {
  const c = planks(W, H);
  ellipse(c, CX, CY + 10, 96, 44, '5');
  ellipse(c, CX, CY + 10, 90, 39, '6', null);
  ellipse(c, CX, CY + 10, 86, 36, '5', null);
  return c.svg(FLOOR);
}
function tableSprite() {
  const c = new Canvas(W, H);
  ellipse(c, CX, CY + 7, 62, 26, '2');
  ellipse(c, CX, CY, 62, 26, '1');
  ellipse(c, CX, CY, 54, 21, '3', null);
  ellipse(c, CX, CY, 51, 19, '1', null);
  ellipse(c, CX, CY, 18, 8, '4', null);
  ellipse(c, CX, CY, 16, 7, '7', null);
  c.draw(grid(`
..KKK..
.KYZYK.
KYYZYyK
KYYYYyK
.KKKKK.`), CX - 3, CY - 4);
  return { key: 'table', build: () => c.svg(FLOOR), sw: W };
}
const TABLE = tableSprite();
function coinStack(n) {
  const c = new Canvas(13, 16);
  for (let i = 0; i < n; i++) {
    const y = 11 - i * 2;
    c.draw(grid(`
.KKKKKKKKK.
KYYZZYYYYyK
KyyyyyyyyyK
.KKKKKKKKK.`), 1, y);
  }
  return { key: `stack${n}`, build: () => c.svg(BASE), sw: 13 };
}
const SEATS = [
  { name: 'nib', li: 0, x: 66, y: 44, stack: [80, 86] },
  { name: 'juno', li: 2, x: 96, y: 38, stack: [114, 83] },
  { name: 'nib', li: 2, x: 126, y: 44, stack: [148, 86] },
  { name: 'rocco', li: 1, x: 8, y: 82, stack: [68, 104], front: true }, // thief
  { name: 'juno', li: 1, x: 184, y: 82, stack: [160, 104], front: true }, // victim
];
function sceneFrame(t, { thief, victimCoins = 4, extra = [], thiefOffStage = false } = {}) {
  const f = [];
  const seat = (s, i) => {
    if (i === 3 && (thief || thiefOffStage)) return { ...emptyChair, x: s.x, y: s.y };
    // Each sitter idles on a different phase so the table never moves in lockstep.
    return { ...avatarSprite(s.name, s.li, 'seated', Math.floor((t + i * 7) / 5)), x: s.x, y: s.y };
  };
  SEATS.forEach((s, i) => { if (!s.front) f.push(seat(s, i)); });
  f.push({ ...TABLE, x: 0, y: 0 });
  SEATS.forEach((s, i) => {
    const n = i === 4 ? victimCoins : 4;
    f.push({ ...coinStack(n), x: s.stack[0], y: s.stack[1] });
  });
  SEATS.forEach((s, i) => { if (s.front) f.push(seat(s, i)); });
  f.push(...extra);
  if (thief) f.push(thief);
  return f;
}
const lerpPath = (pts, u) => {
  const seg = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1)));
  const k = u * (pts.length - 1) - seg;
  return [Math.round(pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * k), Math.round(pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * k)];
};

function tableIdle() {
  const frames = Array.from({ length: 80 }, (_, t) => sceneFrame(t));
  write('scenes/table-idle.svg', sceneSvg('tableidle', W, H, roomBackground(), frames));
}

function heistThiefView() {
  const frames = [];
  const R = ['rocco', 1];
  for (let t = 0; t < 14; t++) frames.push(sceneFrame(t));
  // Sneak around the front of the table to the victim's stake.
  const path = [[8, 82], [30, 118], [176, 120], [176, 96]];
  for (let t = 0; t < 40; t++) {
    const [x, y] = lerpPath(path, t / 39);
    frames.push(sceneFrame(t + 14, { thief: { ...avatarSprite(...R, 'sneak', Math.floor(t / 2)), x, y, mirror: x > 170 && t > 32 } }));
  }
  // Grab: coins hop from the stake to the thief and the stack shrinks.
  for (let t = 0; t < 16; t++) {
    const coins = 4 - Math.min(3, Math.floor(t / 5));
    const fly = canvasSprite('coin', new Canvas(5, 5).draw(COIN, 0, 0));
    frames.push(sceneFrame(t + 54, { victimCoins: coins, thief: { ...avatarSprite(...R, 'sneak', 2), x: 176, y: 96 }, extra: t % 5 < 4 ? [{ ...fly, x: 164 + (t % 5) * 5, y: 100 - (t % 5) * 3, sw: 5 }] : [] }));
  }
  // Disguise on: black glasses, stick and black bundle.
  for (let t = 0; t < 14; t++) {
    frames.push(sceneFrame(t + 70, { victimCoins: 1, thief: { ...avatarSprite(...R, 'thief', Math.floor(t / 3)), x: 176, y: 96 } }));
  }
  // Back past the table and out of the room. Nobody else reacts: only the thief sees this.
  const out = [[176, 120], [-60, 120]];
  for (let t = 0; t < 26; t++) {
    const [x, y] = lerpPath(out, t / 25);
    frames.push(sceneFrame(t + 84, { victimCoins: 1, thief: { ...avatarSprite(...R, 'thief-run', t), x, y, mirror: true } }));
  }
  for (let t = 0; t < 14; t++) frames.push(sceneFrame(t + 110, { victimCoins: 1, thiefOffStage: true }));
  write('scenes/heist-thief-view.svg', sceneSvg('heistthief', W, H, roomBackground(), frames));
}

const WALL_PAL = { ...FLOOR, 9: '#4a3550', a: '#5c4464', b: '#3b2a42' };
// Wall tiles every 56px so it can slide and loop.
function wallCanvas(w, floorY) {
  const wall = new Canvas(w, floorY);
  for (let y = 0; y < floorY; y++)
    for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 7);
      const mortar = y % 7 === 6 || (x + (row % 2) * 14) % 28 === 0;
      wall.px[y][x] = y > floorY - 6 ? '4' : mortar ? 'b' : (x + row * 9) % 56 < 10 ? 'a' : '9';
    }
  const LAMP = grid(`
..KKKKKKK..
.KYYYYYYYK.
KYZZZZZZZyK
KYZwwwwwZyK
KYZZZZZZZyK
.KYYYYYYyK.
..KKKKKKK..`);
  for (let x = 20; x < w; x += 56) {
    wall.draw(LAMP, x, 12);
    for (let i = 0; i < 6; i++) wall.dot(x + 5, i + 6, 'K');
  }
  return wall;
}

function runAll() {
  const w = 240;
  const h = 112;
  const FLOOR_Y = 58;
  const tile = 56;
  const wall = wallCanvas(w + tile, FLOOR_Y);
  const pal = WALL_PAL;
  const runners = [
    { name: 'rocco', li: 1, state: 'thief-run', x: 176, y: 56, ph: 0 },
    { name: 'juno', li: 0, state: 'run', x: 112, y: 42, ph: 1 },
    { name: 'nib', li: 1, state: 'run', x: 72, y: 62, ph: 2 },
    { name: 'juno', li: 2, state: 'run', x: 28, y: 46, ph: 3 },
    { name: 'nib', li: 2, state: 'run', x: -6, y: 64, ph: 1 },
  ];
  const frames = [];
  // 3px per frame over 56 frames loops the floor exactly.
  for (let t = 0; t < tile; t++) {
    const off = (t * 3) % tile;
    // One extra-wide floor sprite slides left instead of redrawing planks per frame.
    const f = [
      { key: 'wall', build: () => wall.svg(pal), x: -(t % tile), y: 0, sw: w + tile },
      { key: 'floor', build: () => planks(w + tile, h - FLOOR_Y).svg(FLOOR), x: -off, y: FLOOR_Y, sw: w + tile },
    ];
    runners
      .map((r) => ({ ...r, y: r.y }))
      .sort((a, b) => a.y - b.y)
      .forEach((r) => f.push({ ...avatarSprite(r.name, r.li, r.state, t + r.ph), x: r.x, y: r.y }));
    frames.push(f);
  }
  write('scenes/run-all.svg', sceneSvg('runall', w, h, '', frames));
}
tableIdle();
heistThiefView();
runAll();

// ---------- layers for the app UI ----------
// The app composes these with whichever avatars are playing, so the cast is never baked in.
const still = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 4}" height="${h * 4}" shape-rendering="crispEdges">${body}</svg>`;

function uiLayers() {
  write('scenes/room.svg', still(W, H, roomBackground()));
  write('scenes/table.svg', still(W, H, TABLE.build()));
  write('scenes/wall-tile.svg', still(56, 58, wallCanvas(56, 58).svg(WALL_PAL)));
  write('scenes/floor-tile.svg', still(56, 54, planks(56, 54).svg(FLOOR)));
  write('props/chair.svg', still(S, S, emptyChair.build()));
  for (let n = 0; n <= 4; n++) write(`props/stack-${n}.svg`, still(13, 16, coinStack(n).build()));

  // Radar: pixel rings with a sweep that turns in 16 steps.
  const RADAR_PAL = { ...BASE, 1: '#17332f', 2: '#2fb3ad', 3: '#1f5f58', 4: '#7df0e3' };
  const R = 48;
  const bg = new Canvas(97, 97);
  ellipse(bg, R, R, 46, 46, '1');
  [15, 30].forEach((r) => {
    for (let a = 0; a < 720; a++) bg.dot(R + Math.round(Math.cos((a * Math.PI) / 360) * r), R + Math.round(Math.sin((a * Math.PI) / 360) * r), '3');
  });
  for (let i = -44; i <= 44; i++) {
    bg.dot(R + i, R, '3');
    bg.dot(R, R + i, '3');
  }
  const frames = Array.from({ length: 16 }, (_, f) => {
    const sweep = new Canvas(97, 97);
    for (let trail = 3; trail >= 0; trail--) {
      const ang = ((f * 22.5 - trail * 7) * Math.PI) / 180;
      for (let r = 2; r < 45; r++) sweep.dot(R + Math.round(Math.cos(ang) * r), R + Math.round(Math.sin(ang) * r), trail ? '2' : '4');
    }
    return [{ key: `sweep${f}`, build: () => sweep.svg(RADAR_PAL), x: 0, y: 0, sw: 97 }];
  });
  write('scenes/radar.svg', sceneSvg('radar', 97, 97, bg.svg(RADAR_PAL), frames));

  // Logo: SONIC ripples like a sound wave above a steady HEIST.
  const GLYPH = {
    S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
    O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', 'X...X'],
    I: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
    C: ['.XXXX', 'X....', 'X....', 'X....', 'X....', 'X....', '.XXXX'],
    H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
    E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
    T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  };
  const LOGO_PAL = { ...BASE, 1: '#b8fff3', 2: '#2fb3ad', 3: '#1c7f79', 4: '#ffc2bd', 5: '#e5484d', 6: '#a92f3c' };
  // Every glyph pixel is drawn 2 wide so the wordmark has weight at small sizes.
  const word = (c, text, x0, y0, tones, offset) => {
    [...text].forEach((ch, i) => {
      const x = x0 + i * 8;
      const y = y0 + offset(i);
      const each = (fn) => GLYPH[ch].forEach((row, j) => [...row].forEach((v, k) => {
        if (v === 'X') { fn(x + k, y + j, j); if (k === 4 || row[k + 1] !== 'X') fn(x + k + 1, y + j, j); }
      }));
      each((px, py) => {
        for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) if (c.px[py + dy]?.[px + dx] == null) c.dot(px + dx, py + dy, 'K');
      });
      each((px, py, j) => c.dot(px, py, tones[j === 0 ? 0 : j > 4 ? 2 : 1]));
    });
  };
  const logoFrames = Array.from({ length: 10 }, (_, f) => {
    const c = new Canvas(44, 24);
    word(c, 'SONIC', 2, 2, ['1', '2', '3'], (i) => Math.round(Math.sin((f / 10 + i / 5) * 2 * Math.PI)));
    word(c, 'HEIST', 2, 14, ['4', '5', '6'], () => 0);
    return { body: c.svg(LOGO_PAL), ms: 110 };
  });
  write('logo.svg', flipbook('logo', 44, 24, logoFrames));
}
uiLayers();

// ---------- gallery ----------
const stateNames = [...Object.keys(STATES), 'locked'];
const gallery = `<!doctype html><meta charset="utf-8"><title>Sonic Heist Sprites</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:#fff4e4;color:#4a3a2c;font:600 14px/1.4 ui-monospace,Menlo,monospace;padding:24px 16px}
h1{color:#e5484d;letter-spacing:.12em;margin:0 0 4px}h2{margin:40px 0 4px;text-transform:uppercase;letter-spacing:.1em}
.row{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.cell{width:144px;text-align:center}.cell img{width:144px;height:144px;display:block}
.cell small{color:#7a6a58}.lv{color:#62a86a;letter-spacing:.08em;margin-top:18px}
.ladder{display:flex;justify-content:space-around;border-bottom:4px solid #e5484d;max-width:760px}.ladder img{width:144px;height:144px;display:block;margin-bottom:-14px}
.scene{max-width:100%;image-rendering:pixelated;display:block;margin:10px 0;width:720px}
</style>
<h1>SONIC HEIST</h1><div>Sprite sheet: 3 avatars, 3 levels each, ${stateNames.length} states.</div>
<h2>Round table (what everyone sees)</h2><img class="scene" src="scenes/table-idle.svg" alt="Players seated at the round table">
<h2>Heist (thief's screen only)</h2><img class="scene" src="scenes/heist-thief-view.svg" alt="Thief sneaks to the victim, takes the stake and runs">
<h2>Everyone runs</h2><img class="scene" src="scenes/run-all.svg" alt="All avatars running">
${Object.entries(AVATARS).map(([n, av]) => `<h2>${n}</h2><div class="ladder">${av.levels.map((_, i) => `<img src="${n}/lv${i + 1}/idle.svg" alt="${n} level ${i + 1}">`).join('')}</div>
${av.levels.map((l, i) => `<div class="lv">LV ${i + 1} · ${l.title}</div><div class="row">${stateNames.map((s) => `<div class="cell"><img loading="lazy" src="${n}/lv${i + 1}/${s}.svg" alt="${n} ${s}"><small>${s}</small></div>`).join('')}</div>`).join('')}`).join('')}`;
writeFileSync(join(OUT, 'index.html'), gallery);
console.log(`Wrote ${count} SVGs to ${OUT}`);
