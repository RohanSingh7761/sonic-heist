import React, { useEffect, useState } from 'react';
import type { AvatarId, GameState, Action } from '../game';
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
      <p style={{ padding: '4px 20px' }} className="muted">A real-world heist played over sound on Base Sepolia.</p>
      <div className="grow" />
      <div style={{ width: '100%' }}><RunStage runners={TITLE_RUNNERS} /></div>
      <div className="grow" />
      <div style={{ width: '100%', padding: '0 16px 16px' }}>
        <Btn tone="gold" big block onClick={() => send({ type: 'go', view: 'pick' })}>Start</Btn>
        <p className="muted small-text" style={{ marginTop: 6 }}>Real Base Sepolia smart contracts & acoustic proximity.</p>
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
      <div className="grow" />
      <div className="sticky-action"><Btn tone="gold" big block onClick={() => send({ type: 'go', view: 'setup' })}>Choose {a.name}</Btn></div>
    </main>
  );
}

export function Setup({
  s,
  send,
  onAllowMic,
  onSoundCheck,
}: Props & {
  onAllowMic?: () => void;
  onSoundCheck?: () => void;
}) {
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (!testing) return;
    const id = setTimeout(() => { send({ type: 'soundOk' }); setTesting(false); sfx('coin'); }, 1400);
    return () => clearTimeout(id);
  }, [testing, send]);

  // Requirement 3: Only mic and sound check required to proceed
  const ready = s.micOk && s.soundOk;

  return (
    <main className="screen">
      <h1 className="title">Get ready</h1>
      <Panel>
        <div className="spread">
          <b className="row"><Icon name="mic" /> 1. Microphone</b>
          {s.micOk && <span className="chip good">Allowed</span>}
        </div>
        <p className="small-text muted">Listens for ultrasound game signals only. Nothing is recorded or uploaded.</p>
        {!s.micOk && (
          <Btn block small onClick={onAllowMic ? onAllowMic : () => send({ type: 'micOk' })}>
            Allow microphone
          </Btn>
        )}
      </Panel>

      <Panel>
        <div className="spread">
          <b className="row"><Icon name="flame" /> 2. Sound check</b>
          {s.soundOk && <span className="chip good">Passed</span>}
        </div>
        <p className="small-text muted">Emits and verifies ultrasound transmission on this device.</p>
        {!s.soundOk && (
          <Btn
            block
            small
            disabled={testing || !s.micOk}
            click="radar-ping"
            onClick={() => {
              if (onSoundCheck) {
                setTesting(true);
                Promise.resolve(onSoundCheck()).finally(() => setTesting(false));
              } else {
                setTesting(true);
              }
            }}
          >
            {testing ? 'Listening...' : s.micOk ? 'Run check' : 'Allow microphone first'}
          </Btn>
        )}
      </Panel>

      <div className="grow" />
      <Btn
        tone="gold"
        big
        block
        disabled={!ready}
        onClick={() => send({ type: 'go', view: 'round' })}
      >
        {ready ? 'Proceed to Table' : 'Finish sound check to proceed'}
      </Btn>
    </main>
  );
}

// "Everyone runs": the whole table takes off when the round begins.
export function RoundStart({ s, send }: Props) {
  useLoop(s.soundOn ? 'run-loop' : null, 0.45);
  useLoop(s.soundOn ? 'footsteps-loop' : null, 0.4);
  const runners: Runner[] = [
    { avatar: s.avatar, level: 1, state: 'run', x: 70, y: 56, label: 'You' },
    { avatar: 'nib', level: 1, state: 'run', x: 26, y: 44 },
    { avatar: 'juno', level: 2, state: 'run', x: -14, y: 62 },
    { avatar: 'rocco', level: 1, state: 'run', x: -58, y: 46 },
    { avatar: 'juno', level: 3, state: 'run', x: -92, y: 62 },
  ];
  return (
    <main className="screen center mood-night" style={{ padding: 0 }}>
      <div className="grow" />
      <p className="muted">Base Sepolia Round started</p>
      <h1 className="title" style={{ color: 'var(--gold)', fontSize: 54 }}>Everyone runs!</h1>
      <div style={{ width: '100%', marginTop: 10 }}><RunStage runners={runners} /></div>
      <p style={{ padding: 16 }}>Keep your phone on you and stay on patrol for acoustic ultrasound pulses.</p>
      <div className="grow" />
      <div style={{ width: '100%', padding: '0 16px 16px' }}>
        <Btn tone="gold" big block onClick={() => send({ type: 'go', view: 'table' })}>Take your seat</Btn>
      </div>
    </main>
  );
}
