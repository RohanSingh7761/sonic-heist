import React, { useEffect, useState } from 'react';
import type { AvatarId, Level, Player } from './game';
import { soundFX, type SfxName } from '../game/soundFX';

export type SpriteState = 'idle' | 'seated' | 'sneak' | 'thief' | 'run' | 'thief-run' | 'swag' | 'cry' | 'caught' | 'saved' | 'alert' | 'hunt' | 'locked';

export const spriteUrl = (avatar: AvatarId, level: Level, state: SpriteState) => `/sprites/${avatar}/lv${level}/${state}.svg`;

export const AVATARS: Record<AvatarId, { name: string; kind: string; blurb: string }> = {
  juno: { name: 'Juno', kind: 'Human', blurb: 'Hears everything. Those headphones are earned, not bought.' },
  rocco: { name: 'Rocco', kind: 'Raccoon', blurb: 'Born with the mask. Has never paid for a snack.' },
  nib: { name: 'Nib', kind: 'Baby dragon', blurb: 'Tiny wings, huge appetite for anything shiny.' },
};
export const LEVEL_TITLES: Record<Level, string> = { 1: 'Rookie', 2: 'Prowler', 3: 'Phantom' };

export function Sprite({ avatar, level, state, alt = '', className, style }: { avatar: AvatarId; level: Level; state: SpriteState; alt?: string; className?: string; style?: React.CSSProperties }) {
  return <img src={spriteUrl(avatar, level, state)} alt={alt} className={className} style={style} draggable={false} />;
}

// ---------- sound ----------
let soundOn = true;
export const setSoundOn = (on: boolean) => { soundOn = on; };
export const sfx = (name: SfxName, volume = 0.6) => { if (soundOn) soundFX.play(name, { volume }); };
// Plays while the component using it is mounted, stops on unmount or when muted.
export function useLoop(name: SfxName | null, volume = 0.5, on = true) {
  useEffect(() => {
    if (!name || !on) return;
    return soundFX.play(name, { loop: true, volume });
  }, [name, volume, on]);
}

// ---------- controls ----------
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'red' | 'gold' | 'teal'; big?: boolean; block?: boolean; small?: boolean; pressed?: boolean; click?: SfxName | null };
export function Btn({ tone, big, block, small, pressed, click = 'ui-click', className = '', onClick, children, ...rest }: BtnProps) {
  const cls = ['btn', tone, big && 'big', block && 'block', small && 'small', pressed && 'pressed', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} aria-pressed={pressed} onClick={(e) => { if (click) sfx(click); onClick?.(e); }} {...rest}>
      {children}
    </button>
  );
}

export const Panel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <div className={`frame panel ${className}`}>{children}</div>;

export const fmtEth = (n: number) => n.toFixed(4);
export const fmtTime = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// Re-renders with the current time so countdowns stay live.
export function useNow(stepMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

export const closeness = (signal: number) => (signal >= 0.8 ? 'very close' : signal >= 0.5 ? 'close' : signal >= 0.25 ? 'near' : 'far');
export function ClosenessMeter({ signal, hot }: { signal: number; hot?: boolean }) {
  const on = signal >= 0.8 ? 4 : signal >= 0.5 ? 3 : signal >= 0.25 ? 2 : signal > 0 ? 1 : 0;
  return (
    <div className="pips" role="img" aria-label={`Closeness: ${signal > 0 ? closeness(signal) : 'no signal'}`}>
      {[1, 2, 3, 4].map((i) => <div key={i} className={`pip ${i <= on ? (hot ? 'hot' : 'on') : ''}`} />)}
    </div>
  );
}

// ---------- pixel icons ----------
const ICONS: Record<string, string[]> = {
  table: ['..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...', '..XXXX..'],
  star: ['...XX...', '...XX...', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '.XXXXXX.', '.XX..XX.', 'XX....XX'],
  scroll: ['XXXXXXX.', 'X.....X.', 'X.XXX.X.', 'X.....X.', 'X.XXX.X.', 'X.....X.', 'X.XX..X.', 'XXXXXXX.'],
  gear: ['..X..X..', '.XXXXXX.', 'XXX..XXX', '.X....X.', '.X....X.', 'XXX..XXX', '.XXXXXX.', '..X..X..'],
  shield: ['XXXXXXXX', 'XXXXXXXX', 'XX.XX.XX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...'],
  mic: ['...XX...', '..XXXX..', '..XXXX..', '..XXXX..', '.X.XX.X.', '.XXXXXX.', '...XX...', '..XXXX..'],
  coin: ['..XXXX..', '.XXXXXX.', 'XXX..XXX', 'XXX.XXXX', 'XXX.XXXX', 'XXX..XXX', '.XXXXXX.', '..XXXX..'],
  flame: ['...X....', '...XX...', '..XXX.X.', '.XXXXXX.', '.XXX.XX.', 'XXX..XXX', 'XXX..XXX', '.XXXXXX.'],
  back: ['...X....', '..XX....', '.XXXXXXX', 'XXXXXXXX', '.XXXXXXX', '..XX....', '...X....', '........'],
};
export function Icon({ name, small }: { name: keyof typeof ICONS; small?: boolean }) {
  return (
    <svg className={`icon ${small ? 'sm' : ''}`} viewBox="0 0 8 8" aria-hidden="true" fill="currentColor">
      {ICONS[name].flatMap((row, y) => [...row].map((c, x) => (c === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null)))}
    </svg>
  );
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="row">
      <Btn small aria-label="Back" onClick={onBack} style={{ flex: 'none' }}><Icon name="back" small /></Btn>
      <h1 className="heading">{title}</h1>
    </div>
  );
}

export const playerSprite = (p: Player, state: SpriteState) => spriteUrl(p.avatar, p.level, state);
