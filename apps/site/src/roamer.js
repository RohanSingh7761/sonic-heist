// The avatar that roams the page: stands on headlines, phones, rules and buttons, and jumps as you scroll.
// It lives in page coordinates, so scrolling carries it along and it only moves when it decides to.
import { burst, ring, sfx, COIN, DUST } from './fx.js';

const STATES = ['idle', 'run', 'sneak', 'saved', 'swag', 'alert', 'hunt', 'thief', 'thief-run', 'cry', 'caught'];
const FACING = new Set(['run', 'sneak', 'thief-run']); // the sprites drawn side-on, which should face their way
const LEVEL_AT = [0, 3, 8];
const SCROLL_HOP = 70;
const SCROLL_NEW_PERCH = 260;
const TOP_MARGIN = 170; // the top bar plus a full sprite, so it never stands with its head under the bar
const BOTTOM_MARGIN = 40;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const inOut = (t) => t * t * (3 - 2 * t);
const between = (a, b) => a + Math.random() * (b - a);

export function initRoamer({ onLevel }) {
  const el = document.createElement('div');
  el.className = 'roamer';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="roamer-body"><img alt="" draggable="false" /></div><div class="bubble" hidden></div>';
  document.body.append(el);
  const body = el.firstElementChild;
  const img = body.firstElementChild;
  const bubble = el.lastElementChild;

  let avatar = 'rocco';
  let loot = 0;
  let level = 1;
  let state = '';
  let facing = 1;
  let x = 0;
  let y = 0;
  let perch = null;
  let mode = 'idle'; // idle | walk | crouch | fly | land
  let t0 = 0; // when the current mode started
  let wait = 0; // when idle ends
  let fly = null;
  let walkTo = 0;
  let scrolled = 0;
  let scrollDir = 1;
  let lastScroll = scrollY;
  let bubbleOff = 0;
  let resettle = 0;

  const perches = [...document.querySelectorAll('[data-perch]')];
  // The bottom of the screen: where it goes when a tall phone leaves nothing else in sight.
  const ground = document.createElement('div');
  ground.className = 'ground';
  ground.dataset.perch = 'idle';
  ground.dataset.still = '';
  document.body.append(ground);
  const warmed = new Map(); // kept referenced so a state swap mid-jump never flashes empty

  const size = () => (innerWidth < 700 ? 72 : 96);

  function warm() {
    for (const st of STATES) {
      const src = `/sprites/${avatar}/lv${level}/${st}.svg`;
      if (warmed.has(src)) continue;
      const im = new Image();
      im.src = src;
      warmed.set(src, im);
    }
  }

  function setState(next) {
    if (next === state) return;
    state = next;
    img.src = `/sprites/${avatar}/lv${level}/${next}.svg`;
  }

  function say(text) {
    if (!text) return;
    // Better silent than covering words. Width is an estimate, since the bubble isn't laid out yet.
    const half = text.length * 6 + 16;
    const top = y - size() - 40;
    if (perch && hits(textBoxes(), perch, x - half, x + half, top, y - size())) return;
    bubble.textContent = text;
    bubble.hidden = false;
    bubbleOff = performance.now() + 1500;
  }

  // The surface to stand on. For a headline, that's the top of its first line of text.
  const range = document.createRange();
  function ledge(target) {
    let rect;
    let inset = 0;
    if (target.matches('h1, h2, h3')) {
      range.selectNodeContents(target);
      rect = range.getClientRects()[0] ?? target.getBoundingClientRect();
      inset = rect.height * 0.12;
    } else rect = target.getBoundingClientRect();
    const half = size() / 2 + 6;
    const l = clamp(rect.left + scrollX, half, innerWidth - half);
    const r = clamp(rect.right + scrollX, half, innerWidth - half);
    return { l, r: Math.max(l, r), y: Math.round(rect.top + scrollY + inset) };
  }

  // Everything it must not stand in front of, in page coordinates.
  const textBoxes = () => [...document.querySelectorAll('h1, h2, h3, p, dt, dd, figcaption, .btn, a')]
    .filter((t) => !t.closest('.device') && !t.closest('.topbar') && t.offsetParent !== null)
    .map((t) => {
      const r = t.getBoundingClientRect();
      return { t, l: r.left + scrollX, r: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY };
    });
  const hits = (boxes, owner, l, r, top, bottom) => boxes.some((b) => !owner.contains(b.t) && !b.t.contains(owner) && l < b.r && r > b.l && top < b.bottom && bottom > b.top);
  const spriteClear = (boxes, owner, px, py) => {
    const w = size() * 0.36; // the art is narrower than its square
    return !hits(boxes, owner, px - w, px + w, py - size() * 0.86, py - 4);
  };
  // A clear spot along this surface, trying the preferred one first.
  function clearSpot(boxes, target, l, want) {
    const tries = [want, ...Array.from({ length: 7 }, (_, i) => lerp(l.l, l.r, (i + 0.5) / 7))];
    return tries.find((px) => spriteClear(boxes, target, px, l.y)) ?? null;
  }

  const inView = (py) => py > scrollY + TOP_MARGIN && py < scrollY + innerHeight - BOTTOM_MARGIN;

  function nextPerch() {
    const boxes = textBoxes();
    const open = perches.filter((p) => {
      if (p === perch || p.offsetParent === null) return false;
      const l = ledge(p);
      return inView(l.y) && clearSpot(boxes, p, l, lerp(l.l, l.r, 0.5)) !== null;
    });
    if (!open.length) return perch === ground ? null : ground;
    const ahead = open.filter((p) => (ledge(p).y - y) * scrollDir > 0);
    const pool = ahead.length ? ahead : open;
    // The nearest one the way you're scrolling, with some wander so it doesn't feel like a track.
    pool.sort((a, b) => Math.abs(ledge(a).y - y) - Math.abs(ledge(b).y - y));
    return pool[Math.floor(Math.random() * Math.min(2, pool.length))];
  }

  function jump(target, tx, ty, big) {
    // Far off-screen after a fast scroll: come in from the nearest edge rather than crossing the whole page.
    if (y < scrollY + TOP_MARGIN) y = scrollY + TOP_MARGIN;
    if (y > scrollY + innerHeight + size()) y = scrollY + innerHeight + size();
    const dist = Math.hypot(tx - x, ty - y);
    fly = {
      target, x0: x, y0: y, x1: tx, y1: ty,
      ms: clamp(320 + dist * 0.55, 340, 880),
      h: big ? clamp(70 + dist * 0.28, 90, 300) : 34,
      spin: big && dist > 420 && Math.random() < 0.4 ? (tx > x ? 1 : -1) : 0,
      big,
    };
    if (tx !== x) facing = tx > x ? 1 : -1;
    bubble.hidden = true;
    mode = 'crouch';
    t0 = performance.now();
  }

  function hopToPerch(next) {
    const l = ledge(next);
    const coin = next.querySelector(':scope > .coin');
    const coinX = coin ? coin.getBoundingClientRect().left + scrollX + 14 : null;
    const want = coinX !== null ? clamp(coinX, l.l, l.r) : lerp(l.l, l.r, between(0.15, 0.85));
    jump(next, clearSpot(textBoxes(), next, l, want) ?? want, l.y, true);
  }

  function hopAlong() {
    if (!perch) return;
    const l = ledge(perch);
    const tx = clamp(x + scrollDir * between(40, 130) * (Math.random() < 0.2 ? -1 : 1), l.l, l.r);
    jump(perch, spriteClear(textBoxes(), perch, tx, l.y) ? tx : x, l.y, false);
  }

  function collect(coin) {
    const r = coin.getBoundingClientRect();
    coin.remove();
    burst(r.left + 14, r.top + 14, { n: 14 });
    ring(r.left + 14, r.top + 14, { color: COIN[0], r: 48 });
    sfx('coin');
    loot++;
    const next = LEVEL_AT.filter((n) => loot >= n).length;
    if (next !== level) {
      level = next;
      warm();
      const keep = state;
      state = '';
      setState(keep);
      say('Level up!');
      sfx('level-up');
      burst(x - scrollX, y - scrollY - size() / 2, { n: 30, speed: 320 });
    }
    onLevel(loot, level);
  }

  function land() {
    perch = fly.target;
    x = fly.x1;
    y = fly.y1;
    mode = 'land';
    t0 = performance.now();
    wait = t0 + between(1300, 2600);
    const cx = x - scrollX;
    const cy = y - scrollY;
    if (fly.big) {
      burst(cx, cy, { n: 12, colors: DUST, speed: 150, up: 60, g: 420, s: 5, life: 0.45 });
      if (!('still' in perch.dataset)) {
        perch.classList.remove('hit');
        void perch.offsetWidth;
        perch.classList.add('hit');
      }
      setState(perch.dataset.perch);
      if (perch.dataset.say && Math.random() < 0.6) say(perch.dataset.say);
      perch.querySelectorAll(':scope > .coin').forEach((coin) => {
        if (Math.abs(coin.getBoundingClientRect().left + 14 - cx) < 90) collect(coin);
      });
    } else setState(perch.dataset.perch);
    fly = null;
  }

  function place(sx = 1, sy = 1, rot = 0) {
    const s = size();
    el.style.transform = `translate3d(${Math.round(x - s / 2)}px, ${Math.round(y - s * 0.93)}px, 0)`;
    const flip = FACING.has(state) ? facing : 1;
    body.style.transform = `scale(${(flip * sx).toFixed(3)}, ${sy.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!perch && !fly) return;
    if (!bubble.hidden && now > bubbleOff) bubble.hidden = true;

    if (mode === 'crouch') {
      const t = (now - t0) / 90;
      const k = Math.sin(Math.min(1, t) * Math.PI * 0.5);
      place(1 + 0.16 * k, 1 - 0.22 * k);
      if (t >= 1) {
        mode = 'fly';
        t0 = now;
        setState(fly.big ? (loot > 0 ? 'thief-run' : 'saved') : 'run');
        if (fly.big) sfx('dash', 0.12);
      }
      return;
    }
    if (mode === 'fly') {
      const t = Math.min(1, (now - t0) / fly.ms);
      x = lerp(fly.x0, fly.x1, inOut(t));
      // The arc never leaves the top of the screen, however high it wanted to go.
      const room = (fly.y0 + fly.y1) / 2 - (scrollY + TOP_MARGIN);
      y = lerp(fly.y0, fly.y1, t) - clamp(fly.h, 28, Math.max(28, room)) * 4 * t * (1 - t);
      // Stretches along its speed: longest at take-off and landing, roundest at the top of the arc.
      const v = Math.abs(1 - 2 * t);
      const stretch = 1 + 0.2 * v * (fly.big ? 1 : 0.4);
      place(1 / stretch, stretch, fly.spin ? fly.spin * 360 * inOut(t) : 0);
      if (t >= 1) land();
      return;
    }
    if (mode === 'land') {
      const t = (now - t0) / 1000;
      // A damped spring: squashes flat on impact and wobbles back to rest.
      const k = Math.exp(-t * 11) * Math.cos(t * 26) * 0.3;
      place(1 + k, 1 - k);
      if (t > 0.45) { mode = 'idle'; place(); }
      return;
    }

    if (perch === ground) {
      y = ledge(ground).y;
      place();
    }
    // Stay glued to the surface if the layout moves underneath, like a tab changing height.
    if (now > resettle) {
      resettle = now + 400;
      y = ledge(perch).y;
      place();
      // Left behind when scrolling stopped: move on without waiting for another scroll.
      if (perch !== ground && !inView(y)) {
        const next = nextPerch();
        if (next) { hopToPerch(next); return; }
      }
    }
    if (mode === 'walk') {
      const dir = Math.sign(walkTo - x);
      x += dir * (state === 'sneak' ? 1 : 2.4);
      place();
      if (Math.abs(walkTo - x) < 3) {
        mode = 'idle';
        setState(perch.dataset.perch);
        wait = now + between(900, 2200);
      }
      return;
    }
    if (now < wait) return;
    // Roams by itself when you stop scrolling.
    const l = ledge(perch);
    const goal = between(l.l, l.r);
    const boxes = textBoxes();
    const walkClear = [0.25, 0.5, 0.75, 1].every((k) => spriteClear(boxes, perch, lerp(x, goal, k), l.y));
    if (Math.random() < 0.55 && l.r - l.l > 120 && walkClear) {
      walkTo = goal;
      facing = walkTo > x ? 1 : -1;
      setState(Math.random() < 0.5 ? 'sneak' : 'run');
      mode = 'walk';
    } else {
      const next = nextPerch();
      if (next) hopToPerch(next);
      else wait = now + 1500;
    }
  }

  addEventListener('scroll', () => {
    const d = scrollY - lastScroll;
    lastScroll = scrollY;
    if (!d) return;
    scrollDir = d > 0 ? 1 : -1;
    scrolled += Math.abs(d);
    if (fly) {
      // Mid-jump, the take-off point travels with the screen so the page can't drag it out of sight.
      fly.y0 += d;
      y += d * (mode === 'crouch' ? 1 : 0);
      return;
    }
    const lost = perch && perch !== ground && !inView(ledge(perch).y);
    if (lost || scrolled >= SCROLL_NEW_PERCH) {
      const next = nextPerch();
      scrolled = 0;
      if (next) hopToPerch(next);
    } else if (scrolled >= SCROLL_HOP && mode !== 'land') {
      scrolled = 0;
      hopAlong();
    }
  }, { passive: true });

  addEventListener('resize', () => {
    if (!perch || fly) return;
    const l = ledge(perch);
    x = clamp(x, l.l, l.r);
    y = l.y;
    place();
  });

  // Clicks pass through to the page, but it still notices being poked.
  addEventListener('pointerdown', (e) => {
    if (fly || !perch) return;
    if (Math.hypot(e.pageX - x, e.pageY - (y - size() / 2)) > size() / 2 + 8) return;
    setState('alert');
    say('Hey!');
    burst(e.clientX, e.clientY, { n: 12 });
    wait = performance.now() + 500;
    mode = 'idle';
  });

  document.querySelectorAll('.coin').forEach((coin) => coin.addEventListener('click', (e) => {
    // Some coins sit on buttons and links: grabbing one must not press what's under it.
    e.preventDefault();
    e.stopPropagation();
    collect(coin);
  }));

  const start = perches.find((p) => inView(ledge(p).y)) ?? perches[0];
  const l = ledge(start);
  perch = start;
  x = lerp(l.l, l.r, 0.7);
  y = l.y;
  warm();
  setState(start.dataset.perch);
  el.classList.add('on');
  place();
  wait = performance.now() + 1500;
  requestAnimationFrame(frame);

  return {
    setAvatar(next) {
      avatar = next;
      warm();
      const keep = state;
      state = '';
      setState(keep);
      ring(x - scrollX, y - scrollY - size() / 2, { color: COIN[0], r: 84 });
      burst(x - scrollX, y - scrollY - size() / 2, { n: 18, speed: 260 });
    },
  };
}
