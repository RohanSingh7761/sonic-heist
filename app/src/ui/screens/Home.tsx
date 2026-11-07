// RN port of apps/web/src/ui/screens/Home.tsx. Screen IDs and assets: docs/SCREENS.md "Main tabs".
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Share, View } from 'react-native';
import type { Action, GameState, Level, Player } from '../game';
import { LEVEL_AT, MOCK_PLAYERS, SCAN_TIME, levelFor } from '../game';
import { AVATARS, Art, BackBar, Bar, Btn, Chip, ClosenessMeter, Grow, Icon, LEVEL_TITLES, Panel, PlayerSprite, Row, Screen, Spread, Sprite, T, closeness, fmtEth, fmtTime, useLayout, useLoop } from '../kit';
import { MY_SEAT, TableStage, rivalSeat, type SeatInfo } from '../stages';
import { CONFIG } from '../../config';
import { batteryUnrestricted, deposit, getSignalMode, logOut, openBatterySettings, robTarget, scan, setSignalMode, withdraw, type SignalMode } from '../../game/engine';
import { fetchLeaderboard, type LeaderboardRow } from '../../game/account';
import { C, U } from '../theme';
import { PickGrid } from './Intro';

type Props = { s: GameState; send: (a: Action) => void; now: number };

export function tableSeats(s: GameState, me?: Partial<SeatInfo>, rivalUid?: number, rivalCoins?: number): SeatInfo[] {
  const level = levelFor(s.thefts + s.saves);
  const seats: SeatInfo[] = [];
  MOCK_PLAYERS.forEach((p, i) => {
    seats[rivalSeat(i)] = { avatar: p.avatar, level: p.level, label: p.name, coins: p.uid === rivalUid ? rivalCoins : 4 };
  });
  seats[MY_SEAT] = { avatar: s.avatar, level, tag: 'YOU', label: `You, ${AVATARS[s.avatar].name}`, coins: Math.max(1, Math.min(4, Math.ceil(s.stake / 0.05))), ...me };
  return seats;
}

export function Hud({ s }: { s: GameState }) {
  const level = levelFor(s.thefts + s.saves);
  return (
    <Panel>
      <Row>
        <Sprite avatar={s.avatar} level={level} state="idle" size={60} style={{ marginVertical: -6, marginLeft: -8 }} label={`You, ${AVATARS[s.avatar].name}`} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Spread><T style={{ flexShrink: 1 }}>{s.name}</T><Chip tone="warn">{`LV ${level}`}</Chip></Spread>
          <Spread>
            <Row style={{ gap: 4 }}><Icon name="coin" small /><T size="small">{`Stake ${fmtEth(s.stake)}`}</T></Row>
            <Row style={{ gap: 4 }}><Icon name="flame" small color={C.muted} /><T size="small" muted>{`Gas ${fmtEth(s.wallet)}`}</T></Row>
          </Spread>
        </View>
      </Row>
    </Panel>
  );
}

// screen.table
export function TableHome({ s, send, now }: Props) {
  const [stakeOpen, setStakeOpen] = useState(false);
  const immune = s.immuneUntil - now;
  const cooldown = s.readyAt - now;
  return (
    <Screen>
      <Hud s={s} />
      <TableStage seats={tableSeats(s)} />
      <Row style={{ flexWrap: 'wrap', gap: 6 }}>
        <Chip tone={s.patrol ? 'good' : 'plain'}><Icon name="mic" small color={C.ink} />{s.patrol ? 'On patrol' : 'Patrol off'}</Chip>
        {immune > 0 && <Chip tone="good"><Icon name="shield" small color={C.ink} />{`Immune ${fmtTime(immune)}`}</Chip>}
        {cooldown > 0 && <Chip tone="bad">{`Cooldown ${fmtTime(cooldown)}`}</Chip>}
      </Row>
      <Btn tone="red" big disabled={cooldown > 0 || s.stake <= 0} click={null} onPress={scan}>
        {cooldown > 0 ? `Lay low ${fmtTime(cooldown)}` : s.stake <= 0 ? 'Stake ETH to start scanning' : 'Scan for targets'}
      </Btn>
      <Row>
        <Btn small style={{ flex: 1 }} pressed={s.patrol} onPress={() => send({ type: 'toggle', key: 'patrol' })}><Icon name="mic" small color={C.ink} />Patrol</Btn>
        <Btn small style={{ flex: 1 }} pressed={stakeOpen} onPress={() => setStakeOpen(!stakeOpen)}><Icon name="coin" small color={C.ink} />Stake</Btn>
      </Row>
      {stakeOpen && (
        <Panel style={{ gap: 6 }}>
          <T size="small" muted>{`Wallet ${fmtEth(s.wallet)} ETH pays for gas. Only your stake can be stolen.`}</T>
          <Row>
            <Btn small style={{ flex: 1 }} click="deposit" onPress={() => deposit(0.005)}>Add 0.005</Btn>
            <Btn small style={{ flex: 1 }} click="deposit" onPress={() => deposit(0.02)}>Add 0.02</Btn>
            <Btn small style={{ flex: 1 }} click={null} onPress={() => withdraw(0.001)}>Take 0.001</Btn>
          </Row>
        </Panel>
      )}
    </Screen>
  );
}

// The animated radar scope; danger tints it red for the hunt. Children are positioned blips.
export function Radar({ danger, children, label }: { danger?: boolean; children?: (size: number) => React.ReactNode; label: string }) {
  const { cw, short } = useLayout();
  const size = Math.min(cw, short ? 214 : 300);
  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <Art name="scenes/radar" width={size} label={label} />
      {danger && <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: size / 2, backgroundColor: 'rgba(229,72,77,0.38)' }} />}
      {children?.(size)}
    </View>
  );
}

export function Blip({ p, x, y, size, ring, onPress }: { p: Player; x: number; y: number; size: number; ring?: string; onPress?: () => void }) {
  const b = 76;
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={p.name} accessibilityState={{ selected: !!ring }}
      style={{ position: 'absolute', left: (x / 100) * size - b / 2, top: (y / 100) * size - b / 2, width: b, height: b, borderWidth: ring ? U : 0, borderColor: ring }}>
      <PlayerSprite p={p} state="idle" size={b - (ring ? U * 2 : 0)} />
    </Pressable>
  );
}

// screen.scan
export function Scan({ s, send, now }: Props) {
  const scanning = s.scanEnds !== null;
  const target = s.nearby.find((p) => p.uid === s.target);
  const left = scanning ? (s.scanEnds as number) - now : 0;
  const footer = scanning ? undefined : (
    <>
      {target ? (
        <Btn tone="red" big click={null} onPress={() => robTarget(target)}>{`Rob ${target.name.split(' ').slice(0, 2).join(' ')}`}</Btn>
      ) : (
        <Btn big click={null} onPress={scan}>Scan again</Btn>
      )}
      {target && <T size="small" muted center>Takes 5% to 25% of their stake, at least 0.001 ETH. Your bond: 20% of the loot.</T>}
    </>
  );
  return (
    <Screen footer={footer}>
      <BackBar title="Who's nearby?" onBack={() => send({ type: 'go', view: 'table' })} />
      <Radar label="Radar">
        {(size) => s.nearby.map((p, i) => {
          const ang = (i / s.nearby.length) * 2 * Math.PI - 0.7;
          const r = 42 - p.signal * 26;
          return <Blip key={p.uid} p={p} size={size} x={50 + Math.cos(ang) * r} y={50 + Math.sin(ang) * r} ring={s.target === p.uid ? C.gold : undefined} onPress={() => send({ type: 'target', uid: p.uid })} />;
        })}
      </Radar>
      {scanning && (
        <Panel>
          <Spread><T>Listening for replies...</T><T muted>{fmtTime(left)}</T></Spread>
          <Bar pct={100 - (left / SCAN_TIME) * 100} />
        </Panel>
      )}
      {!scanning && s.nearby.length === 0 && <T muted center>Nobody answered. Move closer and scan again.</T>}
      {!scanning && s.nearby.length > 0 && (
        <>
          <T size="small" muted>You can't see how much anyone has. Pick your gamble.</T>
          {[...s.nearby].sort((a, b) => b.signal - a.signal).map((p) => (
            <Btn key={p.uid} label={p.name} pressed={s.target === p.uid} onPress={() => send({ type: 'target', uid: p.uid })} style={{ minHeight: 72, justifyContent: 'flex-start', paddingLeft: 4, paddingRight: 10 }}>
              <PlayerSprite p={p} state="idle" size={64} />
              <View style={{ flex: 1, minWidth: 0 }}><T color={C.ink}>{p.name}</T><T size="small" color={C.muted}>{closeness(p.signal)}</T></View>
              <ClosenessMeter signal={p.signal} />
            </Btn>
          ))}
        </>
      )}
    </Screen>
  );
}

// screen.levels
export function Levels({ s, send, now }: Props) {
  const { cw } = useLayout();
  const wins = s.thefts + s.saves;
  const level = levelFor(wins);
  const next = level < 3 ? ((level + 1) as Level) : null;
  return (
    <Screen>
      <T size="title">{`${AVATARS[s.avatar].name}, ${LEVEL_TITLES[level]}`}</T>
      <View>
        <Row style={{ gap: 0, borderBottomWidth: 4, borderColor: C.red }}>
          {([1, 2, 3] as const).map((l) => <Sprite key={l} avatar={s.avatar} level={l} state={l <= level ? 'idle' : 'locked'} size={cw / 3} style={{ marginBottom: -(cw / 3) * 0.04 }} label={`Level ${l}${l <= level ? '' : ', locked'}`} />)}
        </Row>
        <Row style={{ gap: 0 }}>
          {([1, 2, 3] as const).map((l) => (
            <View key={l} style={{ flex: 1, alignItems: 'center' }}>
              <T color={l <= level ? '#4f8f58' : '#a0937f'}>{`LV ${l} ${l <= level ? '✓' : ''}`}</T>
              <T size="small" color={l <= level ? '#4f8f58' : '#a0937f'}>{LEVEL_TITLES[l]}</T>
            </View>
          ))}
        </Row>
      </View>
      <Row style={{ alignItems: 'stretch' }}>
        <Panel style={{ flex: 1 }}><T size="small" muted>Thefts</T><T size="title">{s.thefts}</T></Panel>
        <Panel style={{ flex: 1 }}><T size="small" muted>Saves</T><T size="title">{s.saves}</T></Panel>
      </Row>
      {next ? (
        <Panel>
          <Spread><T size="small">{`Next: ${LEVEL_TITLES[next]}`}</T><T size="small">{`${wins} / ${LEVEL_AT[next]} wins`}</T></Spread>
          <Bar tone="gold" pct={(wins / LEVEL_AT[next]) * 100} />
        </Panel>
      ) : <Panel><T>Top level reached.</T></Panel>}
      <T size="heading">Change avatar</T>
      <PickGrid s={s} send={send} level={level} card={(cw - 16) / 3} />
    </Screen>
  );
}

// screen.log
export function Leaderboard({ s }: Props) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try {
      setRows(await fetchLeaderboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the leaderboard.');
    }
  };
  useEffect(() => { load(); }, []);
  return (
    <Screen>
      <Spread>
        <T size="title">Top thieves</T>
        <Btn small onPress={load}>Refresh</Btn>
      </Spread>
      <Panel style={{ flexGrow: 1 }}>
        {error && <T color={C.redDark}>{error}</T>}
        {!error && rows === null && <T muted>Loading...</T>}
        {rows?.length === 0 && <T muted>No thieves yet. Be the first.</T>}
        {rows?.map((row, i) => {
          const me = row.username.toLowerCase() === s.name.toLowerCase();
          return (
            <Spread key={row.username} style={{ paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 2, borderStyle: 'dashed', borderColor: C.sand, backgroundColor: me ? C.pressed : undefined }}>
              <Row style={{ flexShrink: 1 }}>
                <T color={i < 3 ? C.goldDark : C.muted} style={{ width: 34 }}>{`${i + 1}.`}</T>
                <T style={{ flexShrink: 1 }}>{row.username}{me ? ' (you)' : ''}</T>
              </Row>
              <T>{`${row.robs} ${row.robs === 1 ? 'rob' : 'robs'}`}</T>
            </Spread>
          );
        })}
      </Panel>
    </Screen>
  );
}

const SIGNAL_OPTIONS: { mode: SignalMode; label: string }[] = [
  { mode: 'max', label: 'Max (inaudible)' },
  { mode: 'audible', label: 'Audible' },
];

function SignalDropdown() {
  const [mode, setMode] = useState(getSignalMode());
  const [open, setOpen] = useState(false);
  const pick = (next: SignalMode) => {
    setSignalMode(next);
    setMode(next);
    setOpen(false);
  };
  return (
    <Panel style={{ gap: 6 }}>
      <T>Signal sound</T>
      <T size="small" muted>Sound your phone sends. Use Audible if phones can't find each other.</T>
      <Btn small pressed={open} label={`Signal sound: ${SIGNAL_OPTIONS.find((o) => o.mode === mode)?.label}`} onPress={() => setOpen(!open)}>
        {`${SIGNAL_OPTIONS.find((o) => o.mode === mode)?.label} ${open ? '▲' : '▼'}`}
      </Btn>
      {open && SIGNAL_OPTIONS.map((o) => (
        <Btn key={o.mode} small pressed={o.mode === mode} onPress={() => pick(o.mode)}>{o.label}</Btn>
      ))}
    </Panel>
  );
}

// screen.settings
export function Settings({ s, send }: Props) {
  const [unrestricted, setUnrestricted] = useState(batteryUnrestricted());
  useEffect(() => {
    const id = setInterval(() => setUnrestricted(batteryUnrestricted()), 2000);
    return () => clearInterval(id);
  }, []);
  const setting = (label: string, hint: string, k: 'soundOn' | 'patrol') => (
    <Panel>
      <Spread>
        <View style={{ flex: 1 }}><T>{label}</T><T size="small" muted>{hint}</T></View>
        <Btn small pressed={s[k]} label={label} onPress={() => send({ type: 'toggle', key: k })} style={{ minWidth: 68 }}>{s[k] ? 'On' : 'Off'}</Btn>
      </Spread>
    </Panel>
  );
  return (
    <Screen>
      <T size="title">Settings</T>
      {setting('Game sounds', 'Coins, sirens and music', 'soundOn')}
      {setting('Patrol', 'Listen for game signals nearby', 'patrol')}
      <SignalDropdown />
      <Panel style={{ gap: 6 }}>
        <T>{`Account: ${s.name}`}</T>
        <T size="small" muted>Log out to switch accounts. Log back in with your password to get this wallet back.</T>
        <Btn small onPress={logOut}>Log out</Btn>
      </Panel>
      <Panel style={{ gap: 6 }}>
        <T>Your wallet</T>
        <T size="small" muted>Send Base Sepolia test ETH here. An encrypted copy of the key is on your account, and only your password can open it.</T>
        <T size="small">{s.walletAddress ?? 'Loading...'}</T>
        <Btn small disabled={!s.walletAddress} onPress={() => Share.share({ message: s.walletAddress as string })}>Share address</Btn>
      </Panel>
      <Panel style={{ gap: 6 }}>
        <Spread><T>Background listening</T><Chip tone={unrestricted ? 'good' : 'warn'}>{unrestricted ? 'Allowed' : 'Limited'}</Chip></Spread>
        <T size="small" muted>Some phones stop patrol in your pocket unless battery limits are removed.</T>
        {!unrestricted && <Btn small onPress={openBatterySettings}>Remove battery limits</Btn>}
      </Panel>
      <Panel>
        <T>Privacy</T>
        <T size="small" muted>While patrol is on, a notification stays up and your mic only decodes game signals on this phone. No audio is recorded or uploaded. Turn patrol off and the mic turns off.</T>
      </Panel>
      <Panel>
        <T>Game contract</T>
        <T size="small" muted>{`${CONFIG.chainName}. Testnet only.`}</T>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(CONFIG.blockExplorer)}>
          <T color={C.tealDark}>{CONFIG.heistVaultAddress}</T>
        </Pressable>
      </Panel>
      <Grow />
    </Screen>
  );
}
