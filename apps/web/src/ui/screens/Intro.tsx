import React, { useEffect, useState } from 'react';
import type { AvatarId, GameState, Action } from '../game';
import { MOCK_PLAYERS } from '../game';
import { AVATARS, Btn, Icon, Panel, Sprite, fmtEth, sfx, useLoop } from '../kit';
import { RunStage, type Runner } from '../stages';

type Props = { s: GameState; send: (a: Action) => void };

const TITLE_RUNNERS: Runner[] = [
  { avatar: 'rocco', level: 2, state: 'thief-run', x: 62, y: 56, label: 'Rocco running with a bundle' },
  { avatar: 'juno', level: 1, state: 'run', x: 8, y: 44, label: 'Juno chasing' },
  { avatar: 'nib', level: 2, state: 'run', x: -48, y: 60, label: 'Nib chasing' },
];

export function Title({ send }: Props) {
  return (
    <main className="screen center mood-night" style={{ padding: 0 }}>
      <div className="grow" />
      <img src="/sprites/logo.svg" alt="Sonic Heist" style={{ width: 'min(74%, 300px)' }} />
      <p style={{ padding: '4px 20px' }} className="muted">A real-world heist played over sound.</p>
      <div className="grow" />
      <div style={{ width: '100%' }}><RunStage runners={TITLE_RUNNERS} /></div>
      <div className="grow" />
      <div style={{ width: '100%', padding: '0 16px 16px' }}>
        <Btn tone="gold" big block onClick={() => send({ type: 'go', view: 'pick' })}>Start</Btn>
        <p className="muted small-text" style={{ marginTop: 6 }}>Test ETH only. Real people, real running.</p>
      </div>
    </main>
  );
}

export function Pick({ s, send }: Props) {
  const a = AVATARS[s.avatar];
  return (
    <main className="screen">
      <h1 className="title">Pick your thief</h1>
      <div className="pick-grid" role="group" aria-label="Avatars">
        {(Object.keys(AVATARS) as AvatarId[]).map((id) => (
          <Btn key={id} className="pick-card" pressed={s.avatar === id} onClick={() => send({ type: 'pickAvatar', avatar: id })}>
            <Sprite avatar={id} level={1} state="idle" />
            {AVATARS[id].name}
          </Btn>
        ))}
      </div>
      <Panel>
        <div className="spread"><span className="heading">{a.name}</span><span className="chip">{a.kind}</span></div>
        <p>{a.blurb}</p>
        <div className="state-strip" style={{ marginTop: 6 }}>
          {(['thief', 'swag', 'cry', 'saved'] as const).map((st) => (
            <div key={st}><Sprite avatar={s.avatar} level={1} state={st} />{st}</div>
          ))}
        </div>
      </Panel>
      <Panel>
        <p className="small-text">Rob people and catch thieves to level up.</p>
        <div className="row" style={{ justifyContent: 'space-around' }}>
          {([1, 2, 3] as const).map((l) => <Sprite key={l} avatar={s.avatar} level={l} state="idle" style={{ width: 84 }} alt={`Level ${l}`} />)}
        </div>
      </Panel>
      <div className="grow" />
      <div className="sticky-action"><Btn tone="gold" big block onClick={() => send({ type: 'go', view: 'setup' })}>Choose {a.name}</Btn></div>
    </main>
  );
}

export function Setup({ s, send, onAllowMic, onSoundCheck }: Props & { onAllowMic?: () => void; onSoundCheck?: () => void }) {
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (!testing) return;
    const id = setTimeout(() => { send({ type: 'soundOk' }); setTesting(false); sfx('coin'); }, 1400);
    return () => clearTimeout(id);
  }, [testing, send]);
  const ready = s.micOk && s.soundOk && s.stake > 0;
  return (
    <main className="screen">
      <h1 className="title">Get ready</h1>
      <Panel>
        <div className="spread"><b className="row"><Icon name="mic" /> 1. Microphone</b>{s.micOk && <span className="chip good">Allowed</span>}</div>
        <p className="small-text muted">Listens for game signals only. Nothing is recorded, stored or uploaded.</p>
        {!s.micOk && <Btn block small onClick={onAllowMic ? onAllowMic : () => send({ type: 'micOk' })}>Allow microphone</Btn>}
      </Panel>
      <Panel>
        <div className="spread"><b className="row"><Icon name="flame" /> 2. Sound check</b>{s.soundOk && <span className="chip good">Passed</span>}</div>
        <p className="small-text muted">Checks that this phone can send and hear the signal.</p>
        {!s.soundOk && <Btn block small disabled={testing || !s.micOk} click="radar-ping" onClick={() => { if (onSoundCheck) { setTesting(true); Promise.resolve(onSoundCheck()).finally(() => setTesting(false)); } else { setTesting(true); } }}>{testing ? 'Listening...' : s.micOk ? 'Run check' : 'Allow microphone first'}</Btn>}
      </Panel>
      <Panel>
        <div className="spread"><b className="row"><Icon name="coin" /> 3. Your stake</b>{s.stake > 0 && <span className="chip good">{fmtEth(s.stake)} ETH</span>}</div>
        <p className="small-text muted">This is what others can steal, 5% to 25% at a time. Gas stays in your wallet ({fmtEth(s.wallet)} ETH).</p>
        <div className="row">
          {[0.05, 0.1, 0.2].map((v) => <Btn key={v} small click="deposit" onClick={() => send({ type: 'deposit', amount: v })}>+{v}</Btn>)}
        </div>
      </Panel>
      <div className="grow" />
      <Btn tone="gold" big block disabled={!ready} onClick={() => send({ type: 'go', view: 'round' })}>{ready ? 'Join the table' : 'Finish all 3 steps'}</Btn>
    </main>
  );
}

// "Everyone runs": the whole table takes off when the round begins.
export function RoundStart({ s, send }: Props) {
  useLoop(s.soundOn ? 'run-loop' : null, 0.45);
  useLoop(s.soundOn ? 'footsteps-loop' : null, 0.4);
  const cast = MOCK_PLAYERS.slice(0, 4);
  const runners: Runner[] = [
    { avatar: s.avatar, level: 1, state: 'run', x: 70, y: 56, label: 'You' },
    { avatar: cast[0].avatar, level: cast[0].level, state: 'run', x: 26, y: 44 },
    { avatar: cast[1].avatar, level: cast[1].level, state: 'run', x: -14, y: 62 },
    { avatar: cast[2].avatar, level: cast[2].level, state: 'run', x: -58, y: 46 },
    { avatar: cast[3].avatar, level: cast[3].level, state: 'run', x: -92, y: 62 },
  ];
  return (
    <main className="screen center mood-night" style={{ padding: 0 }}>
      <div className="grow" />
      <p className="muted">Round started</p>
      <h1 className="title" style={{ color: 'var(--gold)', fontSize: 54 }}>Everyone runs!</h1>
      <div style={{ width: '100%', marginTop: 10 }}><RunStage runners={runners} /></div>
      <p style={{ padding: 16 }}>Your stake is locked in. Keep your phone on you and stay on patrol.</p>
      <div className="grow" />
      <div style={{ width: '100%', padding: '0 16px 16px' }}>
        <Btn tone="gold" big block onClick={() => send({ type: 'go', view: 'table' })}>Take your seat</Btn>
      </div>
    </main>
  );
}
