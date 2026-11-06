// RN port of apps/web/src/ui/stages.tsx: the table room and the scrolling run corridor.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import type { AvatarId, Level } from './game';
import { Art, T, spriteKey, type SpriteState } from './kit';
import { C, U } from './theme';

// Layout in the art's own 240x172 pixels, matching the generated room and table layers.
const W = 240;
const H = 172;
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
    started.current = Date.now();
    const place = () => {
      const u = Math.min(1, (Date.now() - started.current) / ms) * (path.length - 1);
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
  const [w, setW] = useState(0);
  const pos = useWalk(walker?.path, walker?.ms ?? 1000);
  const k = w / W;
  const at = (x: number, y: number, z: number) => ({ position: 'absolute' as const, left: x * k, top: y * k, zIndex: z });
  const seat = (info: SeatInfo, i: number, z: number) => {
    const s = SEATS[i];
    return (
      <View key={i} style={at(s.x, s.y, z)}>
        {info.tag && !info.empty && (
          <View style={{ position: 'absolute', top: -8, left: 0, right: 0, alignItems: 'center', zIndex: 2 }}>
            <View style={{ backgroundColor: C.gold, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 4 }}><T size={15} color={C.ink}>{info.tag}</T></View>
          </View>
        )}
        <Art name={info.empty ? 'props/chair' : spriteKey(info.avatar, info.level, info.state ?? 'seated')} width={48 * k} label={info.empty ? 'Empty chair' : info.label} />
      </View>
    );
  };
  return (
    <View style={{ borderWidth: U, borderColor: C.ink, alignSelf: 'stretch' }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%', aspectRatio: W / H, overflow: 'hidden' }}>
        {w > 0 && (
          <>
            <Art name="scenes/room" width={w} style={at(0, 0, 0)} />
            {seats.map((info, i) => (SEATS[i].front ? null : seat(info, i, 1)))}
            <Art name="scenes/table" width={w} style={at(0, 0, 2)} label="Round table" />
            {seats.map((info, i) => <Art key={`stack${i}`} name={`props/stack-${info.coins ?? 4}`} width={13 * k} style={at(SEATS[i].stack[0], SEATS[i].stack[1], 3)} />)}
            {seats.map((info, i) => (SEATS[i].front ? seat(info, i, 4) : null))}
            {walker && pos && <Art name={spriteKey(walker.avatar, walker.level, walker.state)} width={48 * k} style={at(pos[0], pos[1], 5)} label="You, sneaking" />}
          </>
        )}
      </View>
    </View>
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

// A strip of tiles sliding left forever, one tile width per loop so it never jumps.
function Scroller({ name, tileW, tileH, top, ms, width }: { name: string; tileW: number; tileH: number; top: number; ms: number; width: number }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: -tileW, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [x, tileW, ms]);
  const count = Math.ceil(width / tileW) + 1;
  return (
    <Animated.View style={{ position: 'absolute', top, left: 0, flexDirection: 'row', transform: [{ translateX: x }] }}>
      {Array.from({ length: count }, (_, i) => <Art key={i} name={name} width={tileW} style={{ height: tileH }} />)}
    </Animated.View>
  );
}

// Sprites stay at 2x so the tiles and characters share one pixel grid. x is from the centre.
export function RunStage({ runners }: { runners: Runner[] }) {
  const [w, setW] = useState(0);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ alignSelf: 'stretch', height: 224, overflow: 'hidden', backgroundColor: C.plum }}>
      {w > 0 && (
        <>
          <Scroller name="scenes/wall-tile" tileW={112} tileH={116} top={0} ms={5600} width={w} />
          <Scroller name="scenes/floor-tile" tileW={112} tileH={108} top={116} ms={1870} width={w} />
          {[...runners].sort((a, b) => a.y - b.y).map((r, i) => (
            <Art key={i} name={spriteKey(r.avatar, r.level, r.state)} width={96} label={r.label} style={{ position: 'absolute', left: w / 2 + r.x * 2 - 48, top: r.y * 2 }} />
          ))}
        </>
      )}
    </View>
  );
}
