import React, { useEffect, useReducer, useRef, useState } from 'react';
import { MOCK_PLAYERS, initialState, levelFor, reduce, type Action, type GameState, type View } from './game';
import { AVATARS, Btn, Icon, LEVEL_TITLES, Sprite, setSoundOn, sfx, useNow } from './kit';
import { soundFX } from '../game/soundFX';
import { Pick, RoundStart, Setup, Title } from './screens/Intro';
import { Levels, Log, Scan, Settings, TableHome } from './screens/Home';
import { HeistScreen } from './screens/Heist';

const PLAYER_NAME = 'Sly Fox 3F2A'; // mock: comes from the wallet's uid once integrated
const TABS: { view: View; label: string; icon: 'table' | 'star' | 'scroll' | 'gear' }[] = [
  { view: 'table', label: 'Table', icon: 'table' },
  { view: 'levels', label: 'Levels', icon: 'star' },
  { view: 'log', label: 'Activity', icon: 'scroll' },
  { view: 'settings', label: 'Settings', icon: 'gear' },
];

function LevelUp({ s, send }: { s: GameState; send: (a: Action) => void }) {
  const to = s.levelUpTo;
  useEffect(() => { if (to) sfx('level-up'); }, [to]);
  if (!to) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Level up">
      <div className="frame">
        <div className="title" style={{ color: 'var(--red)' }}>Level up!</div>
        <Sprite className="hero-sprite" avatar={s.avatar} level={to} state="saved" alt="" />
        <p>{AVATARS[s.avatar].name} is now a <b>{LEVEL_TITLES[to]}</b>.</p>
        <Btn tone="gold" big block autoFocus onClick={() => send({ type: 'clearLevelUp' })}>Nice</Btn>
      </div>
    </div>
  );
}

// Lets you reach every state from one phone, since the mock has no second player.
function DemoControls({ s, send, now }: { s: GameState; send: (a: Action) => void; now: number }) {
  const [open, setOpen] = useState(false);
  const act = (a: Action) => { send(a); setOpen(false); };
  const canCatch = s.heist?.phase === 'headstart' || s.heist?.phase === 'hunted';
  return (
    <>
      <button type="button" className="demo-tab" aria-expanded={open} onClick={() => setOpen(!open)}>DEMO</button>
      {open && (
        <div className="frame demo-panel" role="dialog" aria-label="Demo controls">
          <div className="spread"><b>Demo controls</b><span className="small-text muted">Not part of the game</span></div>
          <div className="demo-grid">
            <Btn small onClick={() => act({ type: 'incoming', now, rival: MOCK_PLAYERS[Math.floor(Math.random() * 4)], lootRate: 0.05 + Math.random() * 0.2 })}>Someone robs me</Btn>
            <Btn small disabled={!canCatch} onClick={() => act({ type: 'victimFoundMe', now })}>Victim finds me</Btn>
            <Btn small onClick={() => act({ type: 'skip', now })}>Skip timer</Btn>
            <Btn small onClick={() => act({ type: 'addWin' })}>+1 win</Btn>
            <Btn small onClick={() => { setOpen(false); send({ type: 'reset', name: PLAYER_NAME }); }}>Restart</Btn>
            <Btn small onClick={() => setOpen(false)}>Close</Btn>
          </div>
        </div>
      )}
    </>
  );
}

export function UiApp() {
  const [s, send] = useReducer(reduce, PLAYER_NAME, initialState);
  const now = useNow();
  useEffect(() => { send({ type: 'tick', now }); }, [now]);
  useEffect(() => { setSoundOn(s.soundOn); }, [s.soundOn]);

  // Load sounds on the first tap: browsers won't start audio before one.
  useEffect(() => {
    const first = () => soundFX.preload();
    window.addEventListener('pointerdown', first, { once: true });
    return () => window.removeEventListener('pointerdown', first);
  }, []);

  useEffect(() => {
    if (!s.notice) return;
    sfx('ui-deny');
    const id = setTimeout(() => send({ type: 'clearNotice' }), 3200);
    return () => clearTimeout(id);
  }, [s.notice]);

  // One-off sounds for moments the game state reaches on its own.
  const prev = useRef(s.heist);
  useEffect(() => {
    const was = prev.current;
    const h = s.heist;
    prev.current = h;
    if (!h) return;
    if (h.phase !== was?.phase) {
      if (h.phase === 'grab') sfx('loot-grab');
      if (h.phase === 'disguise') sfx('bling');
      if (h.phase === 'headstart') sfx('dash');
      if (h.phase === 'hunted') sfx('bang');
    }
    if (h.inRange && !was?.inRange) sfx('thief-near');
  }, [s.heist]);

  // Countdown ticks for the last 10 seconds of a hunt.
  const remaining = s.heist?.deadline != null ? Math.ceil((s.heist.deadline - now) / 1000) : null;
  useEffect(() => {
    const phase = s.heist?.phase;
    if (remaining !== null && remaining > 0 && remaining <= 10 && (phase === 'hunting' || phase === 'hunted' || phase === 'handshake')) sfx('tick-urgent', 0.5);
  }, [remaining]);

  const p = { s, send, now };
  const onTab = !s.heist && TABS.some((t) => t.view === s.view);
  return (
    <div className="phone" data-view={s.heist ? `heist-${s.heist.phase}` : s.view}>
      {s.heist ? <HeistScreen {...p} h={s.heist} /> : (
        <>
          {s.view === 'title' && <Title {...p} />}
          {s.view === 'pick' && <Pick {...p} />}
          {s.view === 'setup' && <Setup {...p} />}
          {s.view === 'round' && <RoundStart {...p} />}
          {s.view === 'table' && <TableHome {...p} />}
          {s.view === 'scan' && <Scan {...p} />}
          {s.view === 'levels' && <Levels {...p} />}
          {s.view === 'log' && <Log {...p} />}
          {s.view === 'settings' && <Settings {...p} />}
        </>
      )}
      {onTab && (
        <nav className="nav" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.view} type="button" aria-current={s.view === t.view ? 'page' : undefined} onClick={() => { sfx('ui-click'); send({ type: 'go', view: t.view }); }}>
              <Icon name={t.icon} />{t.label}
            </button>
          ))}
        </nav>
      )}
      {s.notice && <div className="toast" role="status">{s.notice}</div>}
      <LevelUp s={s} send={send} />
      <DemoControls {...p} />
    </div>
  );
}
