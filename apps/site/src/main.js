import { burst, initFx, ring, setSound, sfx } from './fx.js';
import { initCursor } from './cursor.js';
import { initRoamer } from './roamer.js';

const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let roamer = null;
let phones = null;

initFx();
initCursor(motion);

// ---------- heist tabs: each phone plays its chapter, then hands on to the next ----------
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
let auto = true;
const show = (tab) => tabs.forEach((t) => {
  const on = t === tab;
  t.setAttribute('aria-selected', on);
  t.classList.toggle('pressed', on);
  t.tabIndex = on ? 0 : -1;
  document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
});
tabs.forEach((t, i) => {
  t.addEventListener('click', () => { auto = false; show(t); sfx('ui-click'); });
  t.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const next = tabs[(i + d + tabs.length) % tabs.length];
    auto = false;
    show(next);
    next.focus();
  });
});
show(tabs[0]);
document.addEventListener('story:start', (e) => {
  const panel = e.target.closest('[role="tabpanel"]');
  if (!panel) return;
  const fill = document.querySelector(`[aria-controls="${panel.id}"] i`);
  if (!fill) return;
  // Restart the tab's progress bar for this run of the chapter.
  fill.style.animation = 'none';
  void fill.offsetWidth;
  fill.style.animation = `fill ${e.detail}ms steps(40) forwards`;
});

// ---------- pick a thief: the roaming avatar and every phone switch to them ----------
const levelImgs = [...document.querySelectorAll('.levels img')];
document.querySelectorAll('[data-avatar]').forEach((card) => {
  const img = card.querySelector('img');
  const id = card.dataset.avatar;
  const hover = (st) => () => { img.src = `/sprites/${id}/lv1/${st}.svg`; };
  card.addEventListener('pointerenter', hover('swag'));
  card.addEventListener('pointerleave', hover('idle'));
  card.addEventListener('click', () => {
    document.querySelectorAll('[data-avatar]').forEach((c) => {
      c.classList.toggle('pressed', c === card);
      c.setAttribute('aria-pressed', c === card);
    });
    levelImgs.forEach((im, i) => { im.src = `/sprites/${id}/lv${i + 1}/idle.svg`; });
    const name = card.querySelector('h3').textContent;
    levelImgs.forEach((im, i) => { im.alt = `${name} at level ${i + 1}`; });
    roamer?.setAvatar(id);
    phones?.setAvatar(id);
    sfx('coin');
  });
});

// ---------- sound stays off until asked for ----------
const soundBtn = document.querySelector('.sound');
soundBtn.addEventListener('click', async () => {
  const on = soundBtn.getAttribute('aria-pressed') !== 'true';
  soundBtn.setAttribute('aria-pressed', on);
  soundBtn.querySelector('span').textContent = on ? 'Sound on' : 'Sound off';
  await setSound(on);
  sfx('ui-click');
});

// Lands a coin on the download buttons however they're pressed.
document.querySelectorAll('.get').forEach((a) => a.addEventListener('click', (e) => {
  if (!motion) return;
  const r = a.getBoundingClientRect();
  const x = e.clientX || r.left + r.width / 2;
  const y = e.clientY || r.top + r.height / 2;
  burst(x, y, { n: 26, speed: 380, up: 220 });
  ring(x, y, { r: 110, color: '#f7c948', life: 0.6 });
  sfx('coin');
}));

if (motion) {
  // ---------- reveals: anything above the fold line shows, including sections jumped past ----------
  let unrevealed = [...document.querySelectorAll('[data-reveal]')];
  const reveal = () => {
    unrevealed = unrevealed.filter((el) => {
      if (el.getBoundingClientRect().top > innerHeight * 0.92) return true;
      el.classList.add('in');
      return false;
    });
  };

  // ---------- sonar rings: a low-res circle drawn pixel by pixel, so it stays blocky at any scale ----------
  const R = 30;
  let rects = '';
  for (let py = 0; py < 64; py++) for (let px = 0; px < 64; px++) {
    if (Math.abs(Math.hypot(px - 31.5, py - 31.5) - R) < 0.75) rects += `<rect x="${px}" y="${py}" width="1" height="1"/>`;
  }
  document.documentElement.style.setProperty('--ring', `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' shape-rendering='crispEdges' fill='#2fb3ad'>${rects}</svg>`)}")`);

  // ---------- scroll: fuse along the top, and the chase across the run strip ----------
  const fuse = document.querySelector('.fuse i');
  const strip = document.querySelector('.strip');
  const chasers = [...strip.querySelectorAll('.runner')];
  const heroPhone = document.querySelector('.hero .device');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    reveal();
    const max = document.documentElement.scrollHeight - innerHeight;
    fuse.style.transform = `scaleX(${(Math.round((scrollY / max) * 80) / 80).toFixed(4)})`;
    const r = strip.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) {
      const p = 1 - r.bottom / (innerHeight + r.height);
      chasers.forEach((c, i) => {
        const gap = (chasers.length - 1 - i) * 150;
        c.style.transform = `translateX(${Math.round(p * (innerWidth + 500) - 250 - gap)}px)`;
      });
    }
    heroPhone.style.translate = `0 ${Math.round(scrollY * -0.06 / 3) * 3}px`;
  };
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScroll);
  }, { passive: true });
  onScroll();

  // ---------- the real game screens in the phones ----------
  import('./phones.tsx').then((m) => {
    phones = m;
    m.mountPhones((el) => {
      const panel = el.closest('[role="tabpanel"]');
      if (!panel || !auto) return false;
      const i = tabs.findIndex((t) => t.getAttribute('aria-controls') === panel.id);
      show(tabs[(i + 1) % tabs.length]);
      return true;
    });
  });

  // ---------- the roaming avatar: waits for the font, because headlines move when it loads ----------
  const hud = document.querySelector('.loot b');
  const hudLevel = document.querySelector('.loot .chip');
  document.fonts.ready.then(() => {
    roamer = initRoamer({ onLevel: (loot, level) => {
      hud.textContent = loot;
      hudLevel.textContent = `LV ${level}`;
    } });
  });
} else {
  document.querySelector('.loot').hidden = true;
}
