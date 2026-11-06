// Pixel cursors drawn to PNG at load. Real CSS cursors, so they never lag behind the mouse.
import { burst, ring, COIN, SONAR } from './fx.js';

const PAL = { K: '#2a2230', G: '#f7c948', D: '#c98a1b', W: '#fffaf1', R: '#e5484d' };

const ARROW = [
  'K...........',
  'KK..........',
  'KGK.........',
  'KGGK........',
  'KGGGK.......',
  'KGGGGK......',
  'KGGGGGK.....',
  'KGGGGGGK....',
  'KGGGGGGGK...',
  'KGGGGGDDDK..',
  'KGGKGDKKKK..',
  'KGK.KDK.....',
  'KK..KDDK....',
  'K....KDK....',
  '.....KDDK...',
  '......KK....',
];
const HAND = [
  '....KK......',
  '...KWWK.....',
  '...KWWK.....',
  '...KWWK.....',
  '...KWWKKK...',
  '...KWWKWWKK.',
  'KK.KWWKWWKWK',
  'KWKKWWWWWWWK',
  'KWWKWWWWWWWK',
  '.KWWWWWWWWWK',
  '.KWWWWWWWWWK',
  '..KWWWWWWWK.',
  '..KGGGGGGGK.',
  '...KDDDDDK..',
  '...KKKKKKK..',
];
const SCOPE = [
  '.....KK.....',
  '.....RR.....',
  '...KKRRKK...',
  '..K..RR..K..',
  '.K...RR...K.',
  'KRRRR..RRRRK',
  'KRRRR..RRRRK',
  '.K...RR...K.',
  '..K..RR..K..',
  '...KKRRKK...',
  '.....RR.....',
  '.....KK.....',
];

function png(grid, scale = 2) {
  const c = document.createElement('canvas');
  c.width = grid[0].length * scale;
  c.height = grid.length * scale;
  const g = c.getContext('2d');
  grid.forEach((row, y) => [...row].forEach((k, x) => {
    if (k === '.') return;
    g.fillStyle = PAL[k];
    g.fillRect(x * scale, y * scale, scale, scale);
  }));
  return c.toDataURL('image/png');
}

export function initCursor(motion) {
  if (!matchMedia('(pointer: fine)').matches) return;
  const root = document.documentElement.style;
  root.setProperty('--cur', `url("${png(ARROW)}") 0 0, auto`);
  root.setProperty('--cur-hand', `url("${png(HAND)}") 10 0, pointer`);
  root.setProperty('--cur-scope', `url("${png(SCOPE)}") 12 12, crosshair`);
  if (!motion) return;

  // A thin trail of pixels, and a sonar ping on every click.
  let lastX = 0;
  let lastY = 0;
  addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - lastX, e.clientY - lastY) < 26) return;
    lastX = e.clientX;
    lastY = e.clientY;
    burst(e.clientX, e.clientY, { n: 1, colors: COIN, speed: 40, up: 0, g: 240, s: 4, life: 0.45 });
  }, { passive: true });
  addEventListener('pointerdown', (e) => ring(e.clientX, e.clientY, { color: SONAR[0] }));
}
