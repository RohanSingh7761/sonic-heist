// RN port of apps/web/src/ui/kit.tsx: sprites, sound helpers and the pixel controls every screen shares.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Image, Pressable, ScrollView, Text, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import type { AvatarId, Level, Player } from './game';
import { SHEETS } from './sprites.gen';
import { soundFX, type SfxName } from './soundFX';
import { C, FONT, MOODS, U, type Mood } from './theme';

export type SpriteState = 'idle' | 'seated' | 'sneak' | 'thief' | 'run' | 'thief-run' | 'swag' | 'cry' | 'caught' | 'saved' | 'alert' | 'hunt' | 'locked';

export const AVATARS: Record<AvatarId, { name: string; kind: string; blurb: string }> = {
  juno: { name: 'Juno', kind: 'Human', blurb: 'Hears everything. Those headphones are earned, not bought.' },
  rocco: { name: 'Rocco', kind: 'Raccoon', blurb: 'Born with the mask. Has never paid for a snack.' },
  nib: { name: 'Nib', kind: 'Baby dragon', blurb: 'Tiny wings, huge appetite for anything shiny.' },
};
export const LEVEL_TITLES: Record<Level, string> = { 1: 'Rookie', 2: 'Prowler', 3: 'Phantom' };

// ---------- sprites ----------
// Steps through a baked sheet's frames with the same timings as the SVG it came from.
function useFrame(seq: [number, number][]) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (seq.length < 2) return;
    let at = 0;
    let id: ReturnType<typeof setTimeout>;
    const next = () => {
      id = setTimeout(() => { at = (at + 1) % seq.length; setI(at); next(); }, seq[at][1]);
    };
    next();
    return () => clearTimeout(id);
  }, [seq]);
  return seq[Math.min(i, seq.length - 1)][0];
}

export function Art({ name, width, style, label }: { name: string; width: number; style?: StyleProp<ViewStyle>; label?: string }) {
  const sheet = SHEETS[name];
  const frame = useFrame(sheet.seq);
  const height = (width * sheet.h) / sheet.w;
  const frames = Math.max(...sheet.seq.map(([f]) => f)) + 1;
  const rows = Math.ceil(frames / sheet.cols);
  return (
    <View style={[{ width, height, overflow: 'hidden' }, style]} accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}>
      <Image
        source={sheet.src}
        fadeDuration={0}
        style={{ width: width * sheet.cols, height: height * rows, transform: [{ translateX: -(frame % sheet.cols) * width }, { translateY: -Math.floor(frame / sheet.cols) * height }] }}
      />
    </View>
  );
}

export const spriteKey = (avatar: AvatarId, level: Level, state: SpriteState) => `${avatar}/lv${level}/${state}`;
export function Sprite({ avatar, level, state, size, style, label }: { avatar: AvatarId; level: Level; state: SpriteState; size: number; style?: StyleProp<ViewStyle>; label?: string }) {
  return <Art name={spriteKey(avatar, level, state)} width={size} style={style} label={label} />;
}
export const PlayerSprite = ({ p, state, size }: { p: Player; state: SpriteState; size: number }) => <Sprite avatar={p.avatar} level={p.level} state={state} size={size} />;

// ---------- sound ----------
let soundOn = true;
export const setSoundOn = (on: boolean) => { soundOn = on; soundFX.setMuted(!on); };
export const sfx = (name: SfxName, volume = 0.6) => { if (soundOn) soundFX.play(name, { volume }); };
// Plays while the component using it is mounted, stops on unmount or when muted.
export function useLoop(name: SfxName | null, volume = 0.5, on = true) {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setActive(next === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!name || !on || !active) return;
    return soundFX.play(name, { loop: true, volume });
  }, [name, volume, on, active]);
}

// ---------- text and layout ----------
const MoodCtx = createContext(MOODS.cream);
const SIZES = { base: 21, small: 18, heading: 27, title: 36 };
export function T({ size = 'base', muted, color, center, style, children }: { size?: keyof typeof SIZES | number; muted?: boolean; color?: string; center?: boolean; style?: StyleProp<TextStyle>; children: React.ReactNode }) {
  const mood = useContext(MoodCtx);
  const fontSize = typeof size === 'number' ? size : SIZES[size];
  return (
    <Text style={[{ fontFamily: FONT, fontSize, lineHeight: Math.round(fontSize * 1.15), color: color ?? (muted ? mood.muted : mood.fg) }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

// A full screen in one mood colour. Scrolls when the content is taller than the phone.
export function Screen({ mood = 'cream', bg, center, flush, footer, children }: { mood?: Mood; bg?: string; center?: boolean; flush?: boolean; footer?: React.ReactNode; children: React.ReactNode }) {
  const m = MOODS[mood];
  const insets = useSafeAreaInsets();
  return (
    <MoodCtx.Provider value={m}>
      <View style={{ flex: 1, backgroundColor: bg ?? m.bg }}>
        <StatusBar style={m.dark ? 'light' : 'dark'} />
        <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 12, paddingTop: Math.max(14, insets.top), paddingHorizontal: flush ? 0 : 16, paddingBottom: 16, alignItems: center ? 'center' : 'stretch' }}>
          {children}
        </ScrollView>
        {footer && <View style={{ padding: 16, paddingTop: 10, paddingBottom: Math.max(16, insets.bottom + 8), gap: 6, backgroundColor: bg ?? m.bg, borderTopWidth: mood === 'cream' ? U : 0, borderColor: C.ink }}>{footer}</View>}
      </View>
    </MoodCtx.Provider>
  );
}

export const Grow = () => <View style={{ flexGrow: 1 }} />;
export const Row = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
export const Spread = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, style]}>{children}</View>;

// Pixel frame: paper card with an ink border. Always cream-mood text inside.
export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <MoodCtx.Provider value={MOODS.cream}>
      <View style={[{ backgroundColor: C.paper, borderWidth: U, borderColor: C.ink, paddingVertical: 10, paddingHorizontal: 12, alignSelf: 'stretch' }, style]}>{children}</View>
    </MoodCtx.Provider>
  );
}

// RN needs text inside <Text>: runs of strings become one label, other children (icons) pass through.
function textify(children: React.ReactNode, wrap: (t: string) => React.ReactElement) {
  const out: React.ReactNode[] = [];
  let run = '';
  const flush = () => { if (run) { out.push(React.cloneElement(wrap(run), { key: `t${out.length}` })); run = ''; } };
  React.Children.toArray(children).forEach((c) => { // toArray keys the icons
    if (typeof c === 'string' || typeof c === 'number') run += c;
    else { flush(); out.push(c); } // toArray already dropped null and false
  });
  flush();
  return out;
}

type Tone = 'red' | 'gold' | 'teal';
const TONE_BG: Record<Tone, string> = { red: C.red, gold: C.gold, teal: C.teal };
const TONE_FG: Record<Tone, string> = { red: '#fff', gold: C.ink, teal: '#08302d' };
export function Btn({ tone, big, small, pressed, click = 'ui-click', disabled, onPress, label, style, children }: {
  tone?: Tone; big?: boolean; small?: boolean; pressed?: boolean; click?: SfxName | null; disabled?: boolean; onPress?: () => void; label?: string; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const mood = useContext(MoodCtx);
  const bg = disabled ? (mood.dark ? '#8d8493' : C.disabled) : pressed ? (tone ? TONE_BG[tone] : C.pressed) : tone ? TONE_BG[tone] : C.paper;
  const fg = disabled ? (mood.dark ? C.ink : C.disabledText) : tone ? TONE_FG[tone] : C.ink;
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: pressed }}
      onPress={() => { if (click) sfx(click); onPress?.(); }}
      style={({ pressed: down }) => {
        const sunk = (down && !disabled) || pressed;
        return [{
          minHeight: big ? 60 : small ? 44 : 48,
          paddingVertical: small ? 6 : 8,
          paddingHorizontal: small ? 10 : 14,
          backgroundColor: bg,
          borderWidth: U,
          borderBottomWidth: sunk ? U : U * 3,
          borderColor: C.ink,
          marginTop: sunk ? U * 2 : 0,
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          gap: 8,
        }, style];
      }}
    >
      {textify(children, (t) => <T size={big ? 28 : small ? 20 : 'base'} color={fg}>{t}</T>)}
    </Pressable>
  );
}

const CHIP_BG = { good: '#bfe9d6', warn: C.gold, bad: C.pink, plain: C.sand };
export function Chip({ tone = 'plain', children }: { tone?: keyof typeof CHIP_BG; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: CHIP_BG[tone], borderWidth: 2, borderColor: C.ink, alignSelf: 'flex-start' }}>
      {textify(children, (t) => <T size="small" color={C.ink}>{t}</T>)}
    </View>
  );
}

export function Bar({ pct, tone = 'teal' }: { pct: number; tone?: 'teal' | 'red' | 'gold' }) {
  const fill = { teal: C.teal, red: C.red, gold: C.gold }[tone];
  return (
    <View style={{ height: 20, backgroundColor: '#d9ccb5', borderWidth: U, borderColor: C.ink, marginVertical: 3 }}>
      <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: fill }} />
    </View>
  );
}

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
    <View style={{ flexDirection: 'row', gap: 5 }} accessible accessibilityLabel={`Closeness: ${signal > 0 ? closeness(signal) : 'no signal'}`}>
      {[1, 2, 3, 4].map((i) => <View key={i} style={{ width: 18, height: 14, borderWidth: 2, borderColor: C.ink, backgroundColor: i <= on ? (hot ? C.red : C.teal) : '#d9ccb5' }} />)}
    </View>
  );
}

// ---------- pixel icons ----------
const ICONS = {
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
export type IconName = keyof typeof ICONS;
export function Icon({ name, small, color }: { name: IconName; small?: boolean; color?: string }) {
  const mood = useContext(MoodCtx);
  const s = small ? 16 : 24;
  return (
    <Svg width={s} height={s} viewBox="0 0 8 8">
      {ICONS[name].flatMap((row, y) => [...row].map((c, x) => (c === 'X' ? <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color ?? mood.fg} /> : null)))}
    </Svg>
  );
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Row>
      <Btn small label="Back" onPress={onBack}><Icon name="back" small color={C.ink} /></Btn>
      <T size="heading">{title}</T>
    </Row>
  );
}

// Content width inside a screen's 16px gutters, and whether the phone is short (web: max-height 720px).
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const cw = Math.min(width, 440) - 32;
  const short = height < 720;
  return { cw, short, hero: short ? Math.min(cw * 0.44, 170) : Math.min(cw * 0.68, 260) };
}
