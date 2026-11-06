// RN port of apps/web/src/ui/screens/Heist.tsx. Screen IDs and assets: docs/SCREENS.md "Thief" and "Victim".
import React, { useEffect } from 'react';
import { Vibration, View } from 'react-native';
import type { Action, GameState, Heist as HeistState } from '../game';
import { MOCK_PLAYERS, TICKET_TIME, levelFor } from '../game';
import { Bar, Btn, ClosenessMeter, Grow, Panel, Screen, Spread, Sprite, T, closeness, fmtEth, fmtTime, sfx, useLayout, useLoop } from '../kit';
import { MY_SEAT, RunStage, TableStage, pathToSeat, rivalSeat } from '../stages';
import { Blip, Hud, Radar, tableSeats } from './Home';
import { C, type Mood } from '../theme';

type Props = { s: GameState; send: (a: Action) => void; now: number; h: HeistState };

const left = (h: HeistState, now: number) => (h.deadline ?? now) - now;

function Timer({ ms, color, pulse, size }: { ms: number; color?: string; pulse?: boolean; size?: number }) {
  const { short } = useLayout();
  const blink = pulse && Math.floor(Date.now() / 500) % 2 === 1;
  return <T size={size ?? (short ? 64 : 88)} color={color} center style={{ opacity: blink ? 0.55 : 1, fontVariant: ['tabular-nums'] }}>{fmtTime(ms)}</T>;
}

// ---------- thief ----------
// heist.ticket / heist.grab / heist.disguise
function Sneak({ s, h }: Props) {
  const level = levelFor(s.thefts + s.saves);
  const seatIdx = rivalSeat(MOCK_PLAYERS.findIndex((p) => p.uid === h.rival.uid));
  const path = pathToSeat(MY_SEAT, seatIdx);
  const end = path[path.length - 1];
  const moving = h.phase === 'ticket';
  useLoop(s.soundOn && moving ? 'sneak-loop' : null, 0.55);
  const copy = {
    ticket: ['Sneaking in...', 'Sent the request. Waiting for their phone to sign a ticket.'],
    grab: ['Grabbing the stake!', 'Ticket signed. The loot is locked in escrow on-chain.'],
    disguise: ['Glasses on.', 'Nobody saw a thing. Get ready to run.'],
  }[h.phase as 'ticket' | 'grab' | 'disguise'];
  return (
    <Screen>
      <Hud s={s} />
      <TableStage
        seats={tableSeats(s, { empty: true }, h.rival.uid, h.phase === 'ticket' ? 4 : h.phase === 'grab' ? 2 : 1)}
        walker={{ avatar: s.avatar, level, state: h.phase === 'disguise' ? 'thief' : 'sneak', path: moving ? path : [end, end], ms: TICKET_TIME }}
      />
      <Panel>
        <T size="heading">{copy[0]}</T>
        <T size="small" muted>{copy[1]}</T>
        {h.phase !== 'ticket' && <Spread style={{ marginTop: 6 }}><T>{`Loot ${fmtEth(h.amount)} ETH`}</T><T>{`Bond ${fmtEth(h.bond)}`}</T></Spread>}
      </Panel>
      <T size="small" muted center>Only you can see this. Everyone else's table looks normal.</T>
    </Screen>
  );
}

// heist.headstart / heist.hunted
function Running({ s, h, now }: Props) {
  const level = levelFor(s.thefts + s.saves);
  const headstart = h.phase === 'headstart';
  const remaining = headstart ? (h.phaseEnds as number) - now : left(h, now);
  useLoop(s.soundOn ? 'run-loop' : null, 0.5);
  useLoop(s.soundOn ? 'footsteps-loop' : null, 0.4);
  return (
    <Screen mood={headstart ? 'night' : 'red'} center flush footer={
      <Panel><Spread><T>{`Loot ${fmtEth(h.amount)} ETH`}</T><T>{`Bond ${fmtEth(h.bond)}`}</T></Spread></Panel>
    }>
      <Grow />
      <T size="heading" center color={headstart ? C.gold : '#ffd0cb'}>{headstart ? 'Head start. Go!' : `${h.rival.name.split(' ').slice(0, 2).join(' ')} is hunting you`}</T>
      <Timer ms={remaining} color={headstart ? C.gold : '#ff8a80'} />
      <RunStage runners={[
        { avatar: s.avatar, level, state: 'thief-run', x: headstart ? 20 : 54, y: 54, label: 'You, running with the loot' },
        ...(headstart ? [] : [{ avatar: h.rival.avatar, level: h.rival.level, state: 'hunt' as const, x: -62, y: 50, label: 'Your victim, hunting you' }]),
      ]} />
      <T center style={{ paddingHorizontal: 20 }}>{headstart ? 'They find out when this hits zero. Get out of range.' : 'Stay out of sound range until the timer runs out.'}</T>
      <Grow />
    </Screen>
  );
}

function Result({ mood, sprite, title, children, action }: { mood: Mood; sprite: React.ReactNode; title: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <Screen mood={mood} center footer={action}>
      <Grow />
      <T size={50} center>{title}</T>
      {sprite}
      {children}
      <Grow />
    </Screen>
  );
}

// heist.won
function Won({ s, send, h }: Props) {
  const { hero } = useLayout();
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('swag'); }, []);
  return (
    <Result mood="gold" title="You got away!" sprite={<Sprite size={hero} avatar={s.avatar} level={level} state="swag" label="Your avatar in gold chain and shades" />}
      action={<Btn tone="teal" big click="jackpot" onPress={() => send({ type: 'claim' })}>{`Claim +${fmtEth(h.amount + h.bond)} ETH`}</Btn>}>
      <Panel>
        <Spread><T size="small">{`Stolen from ${h.rival.name}`}</T><T size="small">{`+${fmtEth(h.amount)}`}</T></Spread>
        <Spread><T size="small">Your bond back</T><T size="small">{`+${fmtEth(h.bond)}`}</T></Spread>
      </Panel>
    </Result>
  );
}

// heist.caught
function Caught({ s, send, h }: Props) {
  const { hero } = useLayout();
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('bang'); sfx('caught'); const id = setTimeout(() => sfx('coin-drop'), 1100); return () => clearTimeout(id); }, []);
  return (
    <Result mood="dark" title="Busted!" sprite={<Sprite size={hero} avatar={s.avatar} level={level} state="caught" label="Your avatar, caught, with the loot on the floor" />}
      action={<Btn big onPress={() => send({ type: 'dismiss' })}>Back to the table</Btn>}>
      <Panel>
        <T size="small">{`${h.rival.name} found you`}</T>
        <Spread><T size="small">Bond lost</T><T size="small">{`-${fmtEth(h.bond)} ETH`}</T></Spread>
        <Spread><T size="small">Cooldown</T><T size="small">2:00</T></Spread>
      </Panel>
    </Result>
  );
}

// ---------- victim ----------
// heist.alert: background flashes between the red mood and a darker red.
function Alert({ s, send, h, now }: Props) {
  const { hero } = useLayout();
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('robbed'); Vibration.vibrate([0, 200, 100, 200]); }, []);
  useLoop(s.soundOn ? 'alert' : null, 0.45);
  const flash = Math.floor(now / 500) % 2 === 1;
  return (
    <Screen mood="red" bg={flash ? C.redDark : undefined} center footer={<Btn tone="gold" big onPress={() => send({ type: 'hunt' })}>Start the hunt</Btn>}>
      <Grow />
      <T size={54} center>You were robbed!</T>
      <Sprite size={hero} avatar={s.avatar} level={level} state="alert" label="Your avatar panicking" />
      <Panel><Spread><T size="small">{h.rival.name}</T><T size="small">{`-${fmtEth(h.amount)} ETH`}</T></Spread></Panel>
      <Timer ms={left(h, now)} />
      <T center>Find them before the timer runs out.</T>
      <Grow />
    </Screen>
  );
}

// heist.hunting / heist.handshake
function Hunt({ s, send, h, now }: Props) {
  const level = levelFor(s.thefts + s.saves);
  const shaking = h.phase === 'handshake';
  const remaining = left(h, now);
  const footer = shaking ? (
    <Panel>
      <T>Catching them...</T>
      <T size="small" muted>Stay close. Exchanging signed messages, then cancelling on-chain.</T>
      <Bar tone="red" pct={100 - (((h.phaseEnds as number) - now) / 4000) * 100} />
    </Panel>
  ) : (
    <View style={{ gap: 8 }}>
      <Btn big disabled={h.inRange} click="radar-ping" onPress={() => send({ type: 'pulse' })}>{h.inRange ? 'Thief located' : 'Pulse radar'}</Btn>
      <Btn tone="red" big disabled={!h.inRange} click="bang" onPress={() => send({ type: 'cancel', now })}>{h.inRange ? 'Catch them! Cancel heist' : 'Get closer to catch them'}</Btn>
    </View>
  );
  return (
    <Screen mood="night" footer={footer}>
      <Spread>
        <View style={{ flexShrink: 1 }}><T size="small" muted>Hunting</T><T>{h.rival.name}</T></View>
        <Timer ms={remaining} size={62} color={remaining < 15000 ? '#ff8a80' : undefined} pulse={remaining < 15000} />
      </Spread>
      <Radar danger label="Hunt radar">
        {(size) => (
          <>
            <Sprite avatar={s.avatar} level={level} state="hunt" size={76} label="You" style={{ position: 'absolute', left: size / 2 - 38, top: size / 2 - 38 }} />
            {h.inRange && <Blip p={h.rival} size={size} x={76} y={24} ring={C.red} />}
          </>
        )}
      </Radar>
      <Panel>
        <Spread><T>{h.signal > 0 ? `Signal: ${closeness(h.signal)}` : 'No signal yet'}</T><ClosenessMeter signal={h.signal} hot={h.inRange} /></Spread>
        <Spread style={{ marginTop: 4 }}>
          <T size="small" muted>{`At stake: ${fmtEth(h.amount)} ETH`}</T><T size="small" muted>{`Bond to win: ${fmtEth(h.bond)}`}</T>
        </Spread>
      </Panel>
    </Screen>
  );
}

// heist.saved
function Saved({ s, send, h }: Props) {
  const { hero } = useLayout();
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('saved'); const id = setTimeout(() => sfx('coin'), 1200); return () => clearTimeout(id); }, []);
  return (
    <Result mood="mint" title="Caught them!" sprite={<Sprite size={hero} avatar={s.avatar} level={level} state="saved" label="Your avatar cheering" />}
      action={<Btn tone="teal" big onPress={() => send({ type: 'dismiss' })}>Back to the table</Btn>}>
      <Panel>
        <Spread><T size="small">Your stake back</T><T size="small">{`+${fmtEth(h.amount)}`}</T></Spread>
        <Spread><T size="small">{`${h.rival.name}'s bond`}</T><T size="small">{`+${fmtEth(h.bond)}`}</T></Spread>
        <Spread><T size="small">Immune for</T><T size="small">5:00</T></Spread>
      </Panel>
    </Result>
  );
}

// heist.lost
function Lost({ s, send, h }: Props) {
  const { hero } = useLayout();
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('stake-lost'); }, []);
  useLoop(s.soundOn ? 'cry' : null, 0.5);
  return (
    <Result mood="blue" title="They got away..." sprite={<Sprite size={hero} avatar={s.avatar} level={level} state="cry" label="Your avatar crying" />}
      action={<Btn big onPress={() => send({ type: 'dismiss' })}>Back to the table</Btn>}>
      <Panel>
        <Spread><T size="small">{`${h.rival.name} took`}</T><T size="small">{`-${fmtEth(h.amount)} ETH`}</T></Spread>
        <Spread><T size="small">You still have</T><T size="small">{`${fmtEth(s.stake)} ETH`}</T></Spread>
        <Spread><T size="small">Immune for</T><T size="small">5:00</T></Spread>
      </Panel>
    </Result>
  );
}

export function HeistScreen(p: Props) {
  switch (p.h.phase) {
    case 'ticket':
    case 'grab':
    case 'disguise':
      return <Sneak {...p} />;
    case 'headstart':
    case 'hunted':
      return <Running {...p} />;
    case 'won':
      return <Won {...p} />;
    case 'caught':
      return <Caught {...p} />;
    case 'alert':
      return <Alert {...p} />;
    case 'hunting':
    case 'handshake':
      return <Hunt {...p} />;
    case 'saved':
      return <Saved {...p} />;
    case 'lost':
      return <Lost {...p} />;
  }
}
