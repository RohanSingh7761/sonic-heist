import React, { useEffect, useRef, useState } from 'react';
import type { AvatarId, Level } from './game';
import { spriteUrl, type SpriteState } from './kit';

// Layout in the art's own 240x172 pixels, matching the generated room and table layers.
const W = 240;
const H = 172;
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
export const SEATS: { x: number; y: number; stack: readonly [number, number]; front?: boolean }[] = [
  { x: 66, y: 44, stack: [80, 86] },
  { x: 96, y: 38, stack: [114, 83] },
  { x: 126, y: 44, stack: [148, 86] },
  { x: 8, y: 82, stack: [68, 104], front: true },
  { x: 184, y: 82, stack: [160, 104], front: true },
];
export const MY_SEAT = 3;
const RIVAL_SEATS = [0, 1, 2, 4];
export const rivalSeat = (i: number) => RIVAL_SEATS[i % RIVAL_SEATS.length];

export interface SeatInfo { avatar: AvatarId; level: Level; state?: SpriteState; empty?: boolean; tag?: string; coins?: number; label: string }
export interface Walker { avatar: AvatarId; level: Level; state: SpriteState; path: [number, number][]; ms: number }

// Moves along a path in stepped ticks so the walk stays pixel-snapped.
function useWalk(path: [number, number][] | undefined, ms: number) {
  const [pos, setPos] = useState<[number, number] | null>(path ? path[0] : null);
  const started = useRef(0);
  const key = path ? JSON.stringify(path) : '';
  useEffect(() => {
    if (!path) { setPos(null); return; }
    started.current = performance.now();
    const place = () => {
      const u = Math.min(1, (performance.now() - started.current) / ms) * (path.length - 1);
      const seg = Math.min(path.length - 2, Math.floor(u));
      const k = u - seg;
      setPos([Math.round(path[seg][0] + (path[seg + 1][0] - path[seg][0]) * k), Math.round(path[seg][1] + (path[seg + 1][1] - path[seg][1]) * k)]);
    };
    place();
    const id = setInterval(place, 100);
    return () => clearInterval(id);
  }, [key, ms]);
  return pos;
}

export function TableStage({ seats, walker }: { seats: SeatInfo[]; walker?: Walker }) {
  const pos = useWalk(walker?.path, walker?.ms ?? 1000);
  const seat = (info: SeatInfo, i: number, z: number) => {
    const s = SEATS[i];
    const url = info.empty ? '/sprites/props/chair.svg' : spriteUrl(info.avatar, info.level, info.state ?? 'seated');
    return (
      <div key={i} className="seat" style={{ left: pct(s.x, W), top: pct(s.y, H), zIndex: z }}>
        {info.tag && !info.empty && <span className="seat-tag">{info.tag}</span>}
        <img src={url} alt={info.empty ? 'Empty chair' : info.label} draggable={false} />
      </div>
    );
  };
  return (
    <div className="table-stage frame">
      <img className="layer" src="/sprites/scenes/room.svg" alt="" style={{ zIndex: 0 }} />
      {seats.map((info, i) => (SEATS[i].front ? null : seat(info, i, 1)))}
      <img className="layer" src="/sprites/scenes/table.svg" alt="Round table" style={{ zIndex: 2 }} />
      {seats.map((info, i) => (
        <img key={`stack${i}`} src={`/sprites/props/stack-${info.coins ?? 4}.svg`} alt="" style={{ left: pct(SEATS[i].stack[0], W), top: pct(SEATS[i].stack[1], H), width: pct(13, W), zIndex: 3 }} />
      ))}
      {seats.map((info, i) => (SEATS[i].front ? seat(info, i, 4) : null))}
      {walker && pos && (
        <div className="seat" style={{ left: pct(pos[0], W), top: pct(pos[1], H), zIndex: 5 }}>
          <img src={spriteUrl(walker.avatar, walker.level, walker.state)} alt="You, sneaking" draggable={false} />
        </div>
      )}
    </div>
  );
}

// Route around the front of the table to a seat's coin stack.
export function pathToSeat(from: number, to: number): [number, number][] {
  const a = SEATS[from];
  const b = SEATS[to];
  const endX = b.stack[0] - 18;
  return [[a.x, a.y], [a.x + 18, 118], [endX, 118], ...(b.front ? ([[b.x - 8, 96]] as [number, number][]) : [])];
}

export interface Runner { avatar: AvatarId; level: Level; state: SpriteState; x: number; y: number; label?: string }

// Sprites stay at 2x exact so the tiles and characters share one crisp pixel grid. x is from the centre.
export function RunStage({ runners }: { runners: Runner[] }) {
  return (
    <div className="run-stage">
      <div className="run-wall" />
      <div className="run-floor" />
      {[...runners].sort((a, b) => a.y - b.y).map((r, i) => (
        <img key={i} className="runner" src={spriteUrl(r.avatar, r.level, r.state)} alt={r.label ?? ''} draggable={false} style={{ left: `calc(50% + ${r.x * 2 - 48}px)`, top: r.y * 2 }} />
      ))}
    </div>
  );
}
