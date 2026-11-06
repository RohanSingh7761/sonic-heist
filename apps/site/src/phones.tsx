// Runs the game's real screens and rules inside the site's phone frames, driven by scripted actions.
import React, { useEffect, useReducer, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MOCK_PLAYERS, SCAN_TIME, reduce, type AvatarId } from '../../web/src/ui/game.ts';
import { STORIES, base, type Story } from './stories.ts';
import { setSoundOn, useNow } from '../../web/src/ui/kit';
import { Scan, TableHome } from '../../web/src/ui/screens/Home';
import { HeistScreen } from '../../web/src/ui/screens/Heist';

// The real screens play sounds and buzz the phone. On a web page they must do neither.
setSoundOn(false);
Object.defineProperty(navigator, 'vibrate', { value: () => false, configurable: true });

let avatar: AvatarId = 'rocco';
function Run({ story, onEnd }: { story: Story; onEnd: () => void }) {
  const [s, send] = useReducer(reduce, null, () => { const t = Date.now(); return story.setup(base(avatar), t); });
  const now = useNow(100);
  useEffect(() => { send({ type: 'tick', now }); }, [now]);
  useEffect(() => {
    const ids = story.steps.map(([ms, act]) => setTimeout(() => send(act(Date.now())), ms));
    if (story.end) ids.push(setTimeout(onEnd, story.end));
    const pickAvatar = (e: Event) => send({ type: 'pickAvatar', avatar: (e as CustomEvent).detail });
    addEventListener('heist:avatar', pickAvatar);
    return () => { ids.forEach(clearTimeout); removeEventListener('heist:avatar', pickAvatar); };
  }, []);

  if (s.heist) return <div className="phone" data-view={`heist-${s.heist.phase}`}><HeistScreen s={s} send={send} now={now} h={s.heist} /></div>;
  if (s.view !== 'scan') return <div className="phone" data-view={s.view}><TableHome s={s} send={send} now={now} /></div>;
  // While listening, show players as their replies arrive. Keeps all four in place so the radar positions don't shift.
  const listening = s.scanEnds !== null;
  const left = listening ? (s.scanEnds as number) - now : 0;
  const found = listening ? Math.floor(((SCAN_TIME - left) / SCAN_TIME) * 5) : 4;
  return <div className="phone" data-view="scan" data-found={found}><Scan s={listening ? { ...s, nearby: MOCK_PLAYERS } : s} send={send} now={now} /></div>;
}

// Remounts to replay: every run starts from the same state, so the loop can never drift.
function Demo({ el, story, onEnd }: { el: HTMLElement; story: Story; onEnd: () => boolean }) {
  const [run, setRun] = useState(0);
  useEffect(() => {
    el.classList.add('live');
    el.dispatchEvent(new CustomEvent('story:start', { bubbles: true, detail: story.end }));
    return () => el.classList.remove('live');
  }, [run]);
  return <Run key={run} story={story} onEnd={() => { if (!onEnd()) setRun((r) => r + 1); }} />;
}

export function setAvatar(next: AvatarId) {
  avatar = next;
  dispatchEvent(new CustomEvent('heist:avatar', { detail: next }));
}

// Only phones near the screen run, so a long page costs no more than the two or three in view.
export function mountPhones(onEnd: (el: HTMLElement) => boolean) {
  const roots = new Map<Element, Root>();
  const seen = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      const el = target as HTMLElement;
      if (isIntersecting && !roots.has(el)) {
        const root = createRoot(el.querySelector('.device-live') as HTMLElement);
        root.render(<Demo el={el} story={STORIES[el.dataset.story as string]} onEnd={() => onEnd(el)} />);
        roots.set(el, root);
      } else if (!isIntersecting && roots.has(el)) {
        roots.get(el)?.unmount();
        roots.delete(el);
      }
    }
  }, { rootMargin: '200px' });
  document.querySelectorAll('[data-story]').forEach((el) => seen.observe(el));
}
