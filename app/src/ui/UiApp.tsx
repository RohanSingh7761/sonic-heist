// RN port of apps/web/src/ui/UiApp.tsx: routes views and heist phases, plays the automatic sounds, hosts the overlays.
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Action, GameState, View as ViewId } from './game';
import { boot, getState, send, subscribe } from '../game/engine';
import { AVATARS, Btn, Icon, LEVEL_TITLES, Panel, Sprite, T, sfx, useLayout, useNow, type IconName } from './kit';
import { soundFX } from './soundFX';
import { Pick, RoundStart, Setup, Title } from './screens/Intro';
import { Auth } from './screens/Auth';
import { Splash } from './screens/Splash';
import { Leaderboard, Levels, Scan, Settings, TableHome } from './screens/Home';
import { HeistScreen } from './screens/Heist';
import { C, U } from './theme';

const SPLASH_MS = 1800;
const TABS: { view: ViewId; label: string; icon: IconName }[] = [
  { view: 'table', label: 'Table', icon: 'table' },
  { view: 'levels', label: 'Levels', icon: 'star' },
  { view: 'leaders', label: 'Top thieves', icon: 'scroll' },
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

export function UiApp() {
  const s = useSyncExternalStore(subscribe, getState);
  const now = useNow();
  const insets = useSafeAreaInsets();
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSplashDone(true), SPLASH_MS);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    soundFX.preload();
    boot();
  }, []);
  // Back from a tab or the radar returns to the table. Everywhere else it leaves the app, and the game keeps running.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const { heist, view } = getState();
      if (heist || !['scan', 'levels', 'leaders', 'settings'].includes(view)) return false;
      send({ type: 'go', view: 'table' });
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!s.notice) return;
    sfx('ui-deny');
    const id = setTimeout(() => send({ type: 'clearNotice' }), 3200);
    return () => clearTimeout(id);
  }, [s.notice]);

  // Countdown ticks for the last 10 seconds of a hunt.
  const remaining = s.heist?.deadline != null ? Math.ceil((s.heist.deadline - now) / 1000) : null;
  useEffect(() => {
    const phase = s.heist?.phase;
    if (remaining !== null && remaining > 0 && remaining <= 10 && (phase === 'hunting' || phase === 'hunted' || phase === 'handshake')) sfx('tick-urgent', 0.5);
  }, [remaining]);

  const p = { s, send, now };
  if (!splashDone || s.auth === 'loading') return <Splash />;
  if (s.auth === 'out') return <Auth />;
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
            {s.view === 'leaders' && <Leaderboard {...p} />}
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
      </View>
    </View>
  );
}
