import React, { useEffect } from 'react';
import type { Action, GameState, Heist as HeistState } from '../game';
import { levelFor, MOCK_PLAYERS } from '../game';
import { Btn, ClosenessMeter, Panel, Sprite, fmtEth, fmtTime, playerSprite, sfx, useLoop, closeness } from '../kit';
import { MY_SEAT, RunStage, TableStage, pathToSeat, rivalSeat } from '../stages';
import { Hud, tableSeats } from './Home';
import { TICKET_TIME } from '../game';

type Props = {
  s: GameState;
  send: (a: Action) => void;
  now: number;
  h: HeistState;
  onPulseRadar?: () => void;
  onCancelHeist?: () => void;
};

const left = (h: HeistState, now: number) => (h.deadline ?? now) - now;

// ---------- thief ----------
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
    <main className="screen">
      <Hud s={s} />
      <TableStage
        seats={tableSeats(s, { empty: true }, h.rival.uid, h.phase === 'ticket' ? 4 : h.phase === 'grab' ? 2 : 1)}
        walker={{ avatar: s.avatar, level, state: h.phase === 'disguise' ? 'thief' : 'sneak', path: moving ? path : [end, end], ms: TICKET_TIME }}
      />
      <Panel>
        <div className="heading">{copy[0]}</div>
        <p className="small-text muted">{copy[1]}</p>
        {h.phase !== 'ticket' && <div className="spread" style={{ marginTop: 6 }}><span>Loot <b>{fmtEth(h.amount)} ETH</b></span><span>Bond <b>{fmtEth(h.bond)}</b></span></div>}
      </Panel>
      <p className="small-text muted" style={{ textAlign: 'center' }}>Only you can see this. Everyone else's table looks normal.</p>
    </main>
  );
}

function Running({ s, h, now }: Props) {
  const level = levelFor(s.thefts + s.saves);
  const headstart = h.phase === 'headstart';
  const remaining = headstart ? (h.phaseEnds as number) - now : left(h, now);
  useLoop(s.soundOn ? 'run-loop' : null, 0.5);
  useLoop(s.soundOn ? 'footsteps-loop' : null, 0.4);
  return (
    <main className={`screen center ${headstart ? 'mood-night' : 'mood-red'}`} style={{ padding: 0 }}>
      <div className="grow" />
      <div className="heading" style={{ color: headstart ? 'var(--gold)' : '#ffd0cb' }}>{headstart ? 'Head start. Go!' : `${h.rival.name.split(' ').slice(0, 2).join(' ')} is hunting you`}</div>
      <div className={`timer ${headstart ? 'gold' : 'red'}`} role="timer">{fmtTime(remaining)}</div>
      <div style={{ width: '100%', margin: '10px 0' }}>
        <RunStage runners={[
          { avatar: s.avatar, level, state: 'thief-run', x: headstart ? 20 : 54, y: 54, label: 'You, running with the loot' },
          ...(headstart ? [] : [{ avatar: h.rival.avatar, level: h.rival.level, state: 'hunt' as const, x: -62, y: 50, label: 'Your victim, hunting you' }]),
        ]} />
      </div>
      <p style={{ padding: '0 20px' }}>{headstart ? "They find out when this hits zero. Get out of range." : 'Stay out of sound range until the timer runs out.'}</p>
      <div className="grow" />
      <div className="frame panel" style={{ margin: '0 19px 20px' }}>
        <div className="spread"><span>Loot <b>{fmtEth(h.amount)} ETH</b></span><span>Bond <b>{fmtEth(h.bond)}</b></span></div>
      </div>
    </main>
  );
}

function Result({ mood, sprite, title, children, action }: { mood: string; sprite: React.ReactNode; title: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <main className={`screen center ${mood}`}>
      <div className="grow" />
      <h1 className="title" style={{ fontSize: 50 }}>{title}</h1>
      {sprite}
      {children}
      <div className="grow" />
      <div style={{ width: '100%' }}>{action}</div>
    </main>
  );
}

function Won({ s, send, h }: Props) {
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('swag'); }, []);
  return (
    <Result mood="mood-gold" title="You got away!" sprite={<Sprite className="hero-sprite" avatar={s.avatar} level={level} state="swag" alt="Your avatar in gold chain and shades" />}
      action={<Btn tone="teal" big block click="jackpot" onClick={() => send({ type: 'claim' })}>Claim +{fmtEth(h.amount + h.bond)} ETH</Btn>}>
      <Panel className="small-text">
        <div className="spread"><span>Stolen from {h.rival.name}</span><b>+{fmtEth(h.amount)}</b></div>
        <div className="spread"><span>Your bond back</span><b>+{fmtEth(h.bond)}</b></div>
      </Panel>
    </Result>
  );
}

function Caught({ s, send, h }: Props) {
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('bang'); sfx('caught'); const id = setTimeout(() => sfx('coin-drop'), 1100); return () => clearTimeout(id); }, []);
  return (
    <Result mood="mood-dark" title="Busted!" sprite={<Sprite className="hero-sprite" avatar={s.avatar} level={level} state="caught" alt="Your avatar, caught, with the loot on the floor" />}
      action={<Btn big block onClick={() => send({ type: 'dismiss' })}>Back to the table</Btn>}>
      <Panel className="small-text">
        <div className="spread"><span>{h.rival.name} found you</span></div>
        <div className="spread"><span>Bond lost</span><b>-{fmtEth(h.bond)} ETH</b></div>
        <div className="spread"><span>Cooldown</span><b>2:00</b></div>
      </Panel>
    </Result>
  );
}

// ---------- victim ----------
function Alert({ s, send, h, now }: Props) {
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('robbed'); if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]); }, []);
  useLoop(s.soundOn ? 'alert' : null, 0.45);
  return (
    <main className="screen center mood-red flash">
      <div className="grow" />
      <h1 className="title" style={{ fontSize: 54 }}>You were robbed!</h1>
      <Sprite className="hero-sprite" avatar={s.avatar} level={level} state="alert" alt="Your avatar panicking" />
      <div className="frame panel small-text" >
        <div className="spread"><span>{h.rival.name}</span><b>-{fmtEth(h.amount)} ETH</b></div>
      </div>
      <div className="timer" role="timer">{fmtTime(left(h, now))}</div>
      <p>Find them before the timer runs out.</p>
      <div className="grow" />
      <div style={{ width: '100%' }}><Btn tone="gold" big block onClick={() => send({ type: 'hunt' })}>Start the hunt</Btn></div>
    </main>
  );
}

function Hunt({ s, send, h, now, onPulseRadar, onCancelHeist }: Props) {
  const level = levelFor(s.thefts + s.saves);
  const shaking = h.phase === 'handshake';
  const remaining = left(h, now);
  return (
    <main className="screen mood-night">
      <div className="spread">
        <div><div className="small-text muted">Hunting</div><b>{h.rival.name}</b></div>
        <div className={`timer ${remaining < 15000 ? 'red pulse' : ''}`} role="timer" style={{ fontSize: 62 }}>{fmtTime(remaining)}</div>
      </div>
      <div className="radar danger">
        <img className="scope" src="/sprites/scenes/radar.svg" alt="Hunt radar" />
        <Sprite avatar={s.avatar} level={level} state="hunt" style={{ position: 'absolute', left: '50%', top: '50%', width: 76, transform: 'translate(-50%,-50%)' }} alt="You" />
        {h.inRange && (
          <div className="blip thief" style={{ left: '76%', top: '24%' }}>
            <img src={playerSprite(h.rival, 'idle')} alt={`${h.rival.name}, in range`} />
          </div>
        )}
      </div>
      <Panel>
        <div className="spread"><b>{h.signal > 0 ? `Signal: ${closeness(h.signal)}` : 'No signal yet'}</b><ClosenessMeter signal={h.signal} hot={h.inRange} /></div>
        <div className="spread small-text muted" style={{ marginTop: 4 }}>
          <span>At stake: {fmtEth(h.amount)} ETH</span><span>Bond to win: {fmtEth(h.bond)}</span>
        </div>
      </Panel>
      <div className="grow" />
      {shaking ? (
        <Panel><b>Catching them...</b><p className="small-text muted">Stay close. Exchanging signed messages, then cancelling on-chain.</p><div className="bar red"><div style={{ width: `${100 - (((h.phaseEnds as number) - now) / 4000) * 100}%` }} /></div></Panel>
      ) : (
        <>
          <Btn big block disabled={h.inRange} click="radar-ping" onClick={() => onPulseRadar ? onPulseRadar() : send({ type: 'pulse' })}>{h.inRange ? 'Thief located' : 'Pulse radar'}</Btn>
          <Btn tone="red" big block disabled={!h.inRange} click="bang" onClick={() => onCancelHeist ? onCancelHeist() : send({ type: 'cancel', now })}>{h.inRange ? 'Catch them! Cancel heist' : 'Pulse radar to locate'}</Btn>
        </>
      )}
    </main>
  );
}

function Saved({ s, send, h }: Props) {
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('saved'); const id = setTimeout(() => sfx('coin'), 1200); return () => clearTimeout(id); }, []);
  return (
    <Result mood="mood-mint" title="Caught them!" sprite={<Sprite className="hero-sprite" avatar={s.avatar} level={level} state="saved" alt="Your avatar cheering" />}
      action={<Btn tone="teal" big block onClick={() => send({ type: 'dismiss' })}>Back to the table</Btn>}>
      <Panel className="small-text">
        <div className="spread"><span>Your stake back</span><b>+{fmtEth(h.amount)}</b></div>
        <div className="spread"><span>{h.rival.name}'s bond</span><b>+{fmtEth(h.bond)}</b></div>
        <div className="spread"><span>Immune for</span><b>5:00</b></div>
      </Panel>
    </Result>
  );
}

function Lost({ s, send, h }: Props) {
  const level = levelFor(s.thefts + s.saves);
  useEffect(() => { sfx('stake-lost'); }, []);
  useLoop(s.soundOn ? 'cry' : null, 0.5);
  return (
    <Result mood="mood-blue" title="They got away..." sprite={<Sprite className="hero-sprite" avatar={s.avatar} level={level} state="cry" alt="Your avatar crying" />}
      action={<Btn big block onClick={() => send({ type: 'dismiss' })}>Back to the table</Btn>}>
      <Panel className="small-text">
        <div className="spread"><span>{h.rival.name} took</span><b>-{fmtEth(h.amount)} ETH</b></div>
        <div className="spread"><span>You still have</span><b>{fmtEth(s.stake)} ETH</b></div>
        <div className="spread"><span>Immune for</span><b>5:00</b></div>
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
