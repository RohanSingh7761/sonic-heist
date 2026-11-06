// RN port of apps/web/src/ui/UiApp.tsx: routes views and heist phases, plays the automatic sounds, hosts the overlays.
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOCK_PLAYERS, initialState, reduce, type Action, type GameState, type View as ViewId } from './game';
import { AVATARS, Btn, Icon, LEVEL_TITLES, Panel, Spread, Sprite, T, setSoundOn, sfx, useLayout, useNow, type IconName } from './kit';
import { soundFX } from './soundFX';
import { Pick, RoundStart, Setup, Title } from './screens/Intro';
import { Levels, Log, Scan, Settings, TableHome } from './screens/Home';
import { HeistScreen } from './screens/Heist';
import { C, U } from './theme';

const PLAYER_NAME = 'Sly Fox 3F2A'; // mock: comes from the wallet's uid once integrated
const TABS: { view: ViewId; label: string; icon: IconName }[] = [
  { view: 'table', label: 'Table', icon: 'table' },
  { view: 'levels', label: 'Levels', icon: 'star' },
  { view: 'log', label: 'Activity', icon: 'scroll' },
  { view: 'settings', label: 'Settings', icon: 'gear' },
];

// overlay.level-up
function LevelUp({ s, send }: { s: GameState; send: (a: Action) => void }) {
  const { hero } = useLayout();
  const to = s.levelUpTo;
  useEffect(() => { if (to) sfx('level-up'); }, [to]);
  if (!to) return null;
  return (
    <View accessibilityViewIsModal accessibilityLabel="Level up" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, backgroundColor: 'rgba(42,34,48,0.82)', justifyContent: 'center', padding: 20 }}>
      <Panel style={{ padding: 16, gap: 10, alignItems: 'center' }}>
        <T size="title" color={C.red}>Level up!</T>
        <Sprite size={hero} avatar={s.avatar} level={to} state="saved" label={`${AVATARS[s.avatar].name} cheering`} />
        <T center>{`${AVATARS[s.avatar].name} is now a ${LEVEL_TITLES[to]}.`}</T>
        <Btn tone="gold" big style={{ alignSelf: 'stretch' }} onPress={() => send({ type: 'clearLevelUp' })}>Nice</Btn>
      </Panel>
    </View>
  );
}

// overlay.demo: lets you reach every state from one phone, since the mock has no second player.
function DemoControls({ s, send, now }: { s: GameState; send: (a: Action) => void; now: number }) {
  const [open, setOpen] = useState(false);
  const act = (a: Action) => { send(a); setOpen(false); };
  const canCatch = s.heist?.phase === 'headstart' || s.heist?.phase === 'hunted';
  const cell = { width: '48%' as const };
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Demo controls" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={{ position: 'absolute', right: 0, top: '40%', zIndex: 50, backgroundColor: C.ink, paddingVertical: 10, paddingHorizontal: 5 }}>
        {'DEMO'.split('').map((ch, i) => <T key={i} size={16} color={C.gold} center>{ch}</T>)}
      </Pressable>
      {open && (
        <Panel style={{ position: 'absolute', left: 8, right: 8, bottom: 8, zIndex: 60, gap: 6 }}>
          <Spread><T>Demo controls</T><T size="small" muted>Not part of the game</T></Spread>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 4 }}>
            <Btn small style={cell} onPress={() => act({ type: 'incoming', now, rival: MOCK_PLAYERS[Math.floor(Math.random() * 4)], lootRate: 0.05 + Math.random() * 0.2 })}>Someone robs me</Btn>
            <Btn small style={cell} disabled={!canCatch} onPress={() => act({ type: 'victimFoundMe', now })}>Victim finds me</Btn>
            <Btn small style={cell} onPress={() => act({ type: 'skip', now })}>Skip timer</Btn>
            <Btn small style={cell} onPress={() => act({ type: 'addWin' })}>+1 win</Btn>
            <Btn small style={cell} onPress={() => { setOpen(false); send({ type: 'reset', name: PLAYER_NAME }); }}>Restart</Btn>
            <Btn small style={cell} onPress={() => setOpen(false)}>Close</Btn>
          </View>
        </Panel>
      )}
    </>
  );
}

export function UiApp() {
  const [s, send] = useReducer(reduce, PLAYER_NAME, initialState);
  const now = useNow();
  const insets = useSafeAreaInsets();
  useEffect(() => { send({ type: 'tick', now }); }, [now]);
  useEffect(() => { setSoundOn(s.soundOn); }, [s.soundOn]);
  useEffect(() => { soundFX.preload(); }, []);

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
    <View style={{ flex: 1, backgroundColor: C.night }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: C.cream }}>
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
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: C.ink, padding: 6, paddingBottom: Math.max(6, insets.bottom), gap: 4 }}>
            {TABS.map((t) => {
              const here = s.view === t.view;
              return (
                <Pressable key={t.view} accessibilityRole="tab" accessibilityState={{ selected: here }} onPress={() => { sfx('ui-click'); send({ type: 'go', view: t.view }); }}
                  style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: here ? C.plum : 'transparent' }}>
                  <Icon name={t.icon} color={here ? C.gold : '#d6cbd9'} />
                  <T size="small" color={here ? C.gold : '#d6cbd9'}>{t.label}</T>
                </Pressable>
              );
            })}
          </View>
        )}
        {s.notice && (
          <View accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 12, right: 12, bottom: 84 + insets.bottom, zIndex: 30, backgroundColor: C.ink, padding: 10, borderWidth: U, borderColor: C.gold }}>
            <T color={C.paper}>{s.notice}</T>
          </View>
        )}
        <LevelUp s={s} send={send} />
        <DemoControls {...p} />
      </View>
    </View>
  );
}
