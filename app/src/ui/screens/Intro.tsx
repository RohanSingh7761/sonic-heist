// RN port of apps/web/src/ui/screens/Intro.tsx. Screen IDs and assets: docs/SCREENS.md "Getting started".
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Action, AvatarId, GameState } from '../game';
import { MOCK_PLAYERS, levelFor } from '../game';
import { AVATARS, Art, Btn, Chip, Grow, Icon, Panel, Row, Screen, Spread, Sprite, T, fmtEth, sfx, useLayout, useLoop } from '../kit';
import { RunStage, type Runner } from '../stages';
import { C } from '../theme';

type Props = { s: GameState; send: (a: Action) => void };

const TITLE_RUNNERS: Runner[] = [
  { avatar: 'rocco', level: 2, state: 'thief-run', x: 62, y: 56, label: 'Rocco running with a bundle' },
  { avatar: 'juno', level: 1, state: 'run', x: 8, y: 44, label: 'Juno chasing' },
  { avatar: 'nib', level: 2, state: 'run', x: -48, y: 60, label: 'Nib chasing' },
];

// screen.title
export function Title({ send }: Props) {
  const { cw } = useLayout();
  return (
    <Screen mood="night" center flush footer={
      <>
        <Btn tone="gold" big onPress={() => send({ type: 'go', view: 'pick' })}>Start</Btn>
        <T size="small" muted center style={{ marginTop: 6 }}>Test ETH only. Real people, real running.</T>
      </>
    }>
      <Grow />
      <Art name="logo" width={Math.min(cw * 0.74, 300)} label="Sonic Heist" />
      <T muted center style={{ paddingHorizontal: 20 }}>A real-world heist played over sound.</T>
      <Grow />
      <RunStage runners={TITLE_RUNNERS} />
      <Grow />
    </Screen>
  );
}

// screen.pick
export function Pick({ s, send }: Props) {
  const { cw } = useLayout();
  const a = AVATARS[s.avatar];
  const card = (cw - 16) / 3;
  return (
    <Screen footer={<Btn tone="gold" big onPress={() => send({ type: 'go', view: 'setup' })}>{`Choose ${a.name}`}</Btn>}>
      <T size="title">Pick your thief</T>
      <PickGrid s={s} send={send} level={1} card={card} />
      <Panel style={{ gap: 4 }}>
        <Spread><T size="heading">{a.name}</T><Chip>{a.kind}</Chip></Spread>
        <T>{a.blurb}</T>
        <Row style={{ gap: 2, marginTop: 6 }}>
          {(['thief', 'swag', 'cry', 'saved'] as const).map((st) => (
            <View key={st} style={{ flex: 1, alignItems: 'center' }}>
              <Sprite avatar={s.avatar} level={1} state={st} size={(cw - 40) / 4} label={`${a.name}, ${st}`} />
              <T size="small">{st}</T>
            </View>
          ))}
        </Row>
      </Panel>
      <Panel>
        <T size="small">Rob people and catch thieves to level up.</T>
        <Row style={{ justifyContent: 'space-around' }}>
          {([1, 2, 3] as const).map((l) => <Sprite key={l} avatar={s.avatar} level={l} state="idle" size={84} label={`Level ${l}`} />)}
        </Row>
      </Panel>
    </Screen>
  );
}

// Three avatar cards; shared by Pick and Levels.
export function PickGrid({ s, send, level, card }: Props & { level: 1 | 2 | 3; card: number }) {
  return (
    <Row style={{ gap: 8, alignItems: 'stretch' }}>
      {(Object.keys(AVATARS) as AvatarId[]).map((id) => (
        <Btn key={id} pressed={s.avatar === id} tone={s.avatar === id ? 'gold' : undefined} label={AVATARS[id].name} onPress={() => send({ type: 'pickAvatar', avatar: id })} style={{ flex: 1, flexDirection: 'column', gap: 0, paddingHorizontal: 4 }}>
          <Sprite avatar={id} level={level} state="idle" size={card - 14} />
          <T color={C.ink}>{AVATARS[id].name}</T>
        </Btn>
      ))}
    </Row>
  );
}

// screen.setup
export function Setup({ s, send }: Props) {
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (!testing) return;
    const id = setTimeout(() => { send({ type: 'soundOk' }); setTesting(false); sfx('coin'); }, 1400);
    return () => clearTimeout(id);
  }, [testing, send]);
  const ready = s.micOk && s.soundOk && s.stake > 0;
  return (
    <Screen footer={<Btn tone="gold" big disabled={!ready} onPress={() => send({ type: 'go', view: 'round' })}>{ready ? 'Join the table' : 'Finish all 3 steps'}</Btn>}>
      <T size="title">Get ready</T>
      <Panel style={{ gap: 6 }}>
        <Spread><Row><Icon name="mic" /><T>1. Microphone</T></Row>{s.micOk && <Chip tone="good">Allowed</Chip>}</Spread>
        <T size="small" muted>Listens for game signals only. Nothing is recorded, stored or uploaded.</T>
        {!s.micOk && <Btn small onPress={() => send({ type: 'micOk' })}>Allow microphone</Btn>}
      </Panel>
      <Panel style={{ gap: 6 }}>
        <Spread><Row><Icon name="flame" /><T>2. Sound check</T></Row>{s.soundOk && <Chip tone="good">Passed</Chip>}</Spread>
        <T size="small" muted>Checks that this phone can send and hear the signal.</T>
        {!s.soundOk && <Btn small disabled={testing || !s.micOk} click="radar-ping" onPress={() => setTesting(true)}>{testing ? 'Listening...' : s.micOk ? 'Run check' : 'Allow microphone first'}</Btn>}
      </Panel>
      <Panel style={{ gap: 6 }}>
        <Spread><Row><Icon name="coin" /><T>3. Your stake</T></Row>{s.stake > 0 && <Chip tone="good">{`${fmtEth(s.stake)} ETH`}</Chip>}</Spread>
        <T size="small" muted>{`This is what others can steal, 5% to 25% at a time. Gas stays in your wallet (${fmtEth(s.wallet)} ETH).`}</T>
        <Row>
          {[0.05, 0.1, 0.2].map((v) => <Btn key={v} small click="deposit" style={{ flex: 1 }} onPress={() => send({ type: 'deposit', amount: v })}>{`+${v}`}</Btn>)}
        </Row>
      </Panel>
    </Screen>
  );
}

// screen.round: the whole table takes off when the round begins.
export function RoundStart({ s, send }: Props) {
  useLoop(s.soundOn ? 'run-loop' : null, 0.45);
  useLoop(s.soundOn ? 'footsteps-loop' : null, 0.4);
  const cast = MOCK_PLAYERS.slice(0, 4);
  const runners: Runner[] = [
    { avatar: s.avatar, level: levelFor(s.thefts + s.saves), state: 'run', x: 70, y: 56, label: 'You' },
    { avatar: cast[0].avatar, level: cast[0].level, state: 'run', x: 26, y: 44 },
    { avatar: cast[1].avatar, level: cast[1].level, state: 'run', x: -14, y: 62 },
    { avatar: cast[2].avatar, level: cast[2].level, state: 'run', x: -58, y: 46 },
    { avatar: cast[3].avatar, level: cast[3].level, state: 'run', x: -92, y: 62 },
  ];
  return (
    <Screen mood="night" center flush footer={<Btn tone="gold" big onPress={() => send({ type: 'go', view: 'table' })}>Take your seat</Btn>}>
      <Grow />
      <T muted>Round started</T>
      <T size={54} color={C.gold} center>Everyone runs!</T>
      <RunStage runners={runners} />
      <T center style={{ padding: 16 }}>Your stake is locked in. Keep your phone on you and stay on patrol.</T>
      <Grow />
    </Screen>
  );
}
