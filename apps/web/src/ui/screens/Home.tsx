import React, { useState } from 'react';
import type { Action, AvatarId, GameState, Level } from '../game';
import { LEVEL_AT, MOCK_PLAYERS, SCAN_TIME, levelFor } from '../game';
import { AVATARS, BackBar, Btn, ClosenessMeter, Icon, LEVEL_TITLES, Panel, Sprite, closeness, fmtEth, fmtTime, playerSprite, useLoop } from '../kit';
import { MY_SEAT, TableStage, rivalSeat, type SeatInfo } from '../stages';
import { CONFIG } from '../../config';

import type { Player } from '../game';

type Props = {
  s: GameState;
  send: (a: Action) => void;
  now: number;
  onScan?: () => void;
  onRobTarget?: (target: Player) => void;
  audioProtocol?: number;
  setAudioProtocol?: (p: number) => void;
  onTestChirp?: () => void;
  onDepositOnChain?: (amt: number) => void;
  onWithdrawOnChain?: (amt: number) => void;
};

export function tableSeats(s: GameState, me?: Partial<SeatInfo>, rivalUid?: number, rivalCoins?: number): SeatInfo[] {
  const level = levelFor(s.thefts + s.saves);
  const seats: SeatInfo[] = [];
  MOCK_PLAYERS.forEach((p, i) => {
    seats[rivalSeat(i)] = { avatar: p.avatar, level: p.level, label: p.name, coins: p.uid === rivalUid ? rivalCoins : 4 };
  });
  if (rivalUid && !MOCK_PLAYERS.some((p) => p.uid === rivalUid)) {
    const sIdx = rivalSeat(Math.abs(rivalUid) % 4);
    seats[sIdx] = { avatar: 'nib', level: 1, label: 'Target', coins: rivalCoins ?? 2 };
  }
  seats[MY_SEAT] = { avatar: s.avatar, level, tag: 'YOU', label: `You, ${AVATARS[s.avatar].name}`, coins: Math.max(1, Math.min(4, Math.ceil(s.stake / 0.05))), ...me };
  return seats;
}

export function Hud({ s }: { s: GameState }) {
  const level = levelFor(s.thefts + s.saves);
  const [copied, setCopied] = useState(false);
  const copyAddress = () => {
    if (!s.walletAddress) return;
    navigator.clipboard.writeText(s.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const shortAddr = s.walletAddress ? `${s.walletAddress.slice(0, 6)}...${s.walletAddress.slice(-4)}` : '';
  return (
    <div className="frame panel">
      <div className="row">
        <Sprite avatar={s.avatar} level={level} state="idle" style={{ width: 60, margin: '-6px 0 -6px -8px' }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="spread"><b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</b><span className="chip warn">LV {level}</span></div>
          {s.walletAddress && (
            <div className="row" style={{ marginTop: 2, marginBottom: 4, gap: 6, alignItems: 'center' }}>
              <span className="small-text muted" style={{ fontFamily: 'monospace', fontSize: 11 }}>{shortAddr}</span>
              <button
                type="button"
                onClick={copyAddress}
                style={{
                  background: 'rgba(235, 184, 82, 0.15)',
                  border: '1px solid var(--gold)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  color: 'var(--gold)',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
          <div className="spread small-text">
            <span className="row" style={{ gap: 4 }}><Icon name="coin" small /> Stake <b>{fmtEth(s.stake)}</b></span>
            <span className="row muted" style={{ gap: 4 }}><Icon name="flame" small /> Bal <b>{fmtEth(s.wallet)}</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TableHome({ s, send, now, onScan, onDepositOnChain, onWithdrawOnChain }: Props) {
  const [stakeOpen, setStakeOpen] = useState(false);
  const immune = s.immuneUntil - now;
  const cooldown = s.readyAt - now;
  return (
    <main className="screen">
      <Hud s={s} />
      <TableStage seats={tableSeats(s)} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} aria-label="Status">
        <span className={`chip ${s.patrol ? 'good' : ''}`}><Icon name="mic" small />{s.patrol ? 'On patrol' : 'Patrol off'}</span>

        {immune > 0 && <span className="chip good"><Icon name="shield" small />Immune {fmtTime(immune)}</span>}
        {cooldown > 0 && <span className="chip bad">Cooldown {fmtTime(cooldown)}</span>}
      </div>
      <Btn tone="red" big block disabled={cooldown > 0} click={null} onClick={() => (onScan ? onScan() : send({ type: 'scan', now }))}>
        {cooldown > 0 ? `Lay low ${fmtTime(cooldown)}` : 'Scan for targets'}
      </Btn>
      <div className="row">
        <Btn small pressed={s.patrol} onClick={() => send({ type: 'toggle', key: 'patrol' })}><Icon name="mic" small />Patrol</Btn>

        <Btn small pressed={stakeOpen} onClick={() => setStakeOpen(!stakeOpen)}><Icon name="coin" small />Stake</Btn>
      </div>
      {stakeOpen && (
        <Panel>
          <p className="small-text muted">Wallet balance pays for gas and stakes. Deposit locks real ETH into Base Sepolia HeistVault.</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <Btn small click="deposit" onClick={() => onDepositOnChain ? onDepositOnChain(0.001) : send({ type: 'deposit', amount: 0.001 })}>Stake 0.001 ETH</Btn>
            <Btn small click="deposit" onClick={() => onDepositOnChain ? onDepositOnChain(0.005) : send({ type: 'deposit', amount: 0.005 })}>Stake 0.005 ETH</Btn>
            <Btn small click={null} onClick={() => onWithdrawOnChain ? onWithdrawOnChain(0.001) : send({ type: 'withdraw', amount: 0.001 })}>Withdraw 0.001 ETH</Btn>
          </div>
        </Panel>
      )}
    </main>
  );
}

export function Scan({ s, send, now, onScan, onRobTarget }: Props) {
  // Silent during ultrasound scan to prevent speaker audio from interfering with mic reception
  const scanning = s.scanEnds !== null;
  const done = !scanning;
  const target = s.nearby.find((p) => p.uid === s.target);
  const left = scanning ? (s.scanEnds as number) - now : 0;
  return (
    <main className="screen">
      <BackBar title="Who's nearby?" onBack={() => send({ type: 'go', view: 'table' })} />
      <div className="radar">
        <img className="scope" src="/sprites/scenes/radar.svg" alt="Radar" />
        {s.nearby.map((p, i) => {
          const ang = (i / s.nearby.length) * 2 * Math.PI - 0.7;
          const r = 42 - p.signal * 26;
          return (
            <button key={p.uid} type="button" className={`blip ${s.target === p.uid ? 'selected' : ''}`} aria-label={p.name} aria-pressed={s.target === p.uid}
              style={{ left: `${50 + Math.cos(ang) * r}%`, top: `${50 + Math.sin(ang) * r}%` }} onClick={() => send({ type: 'target', uid: p.uid })}>
              <img src={playerSprite(p, 'idle')} alt="" />
            </button>
          );
        })}
      </div>
      {scanning && (
        <Panel>
          <div className="spread"><b>Listening for replies...</b><span className="muted">{fmtTime(left)}</span></div>
          <div className="bar"><div style={{ width: `${100 - (left / SCAN_TIME) * 100}%` }} /></div>
        </Panel>
      )}
      {done && s.nearby.length > 0 && (
        <>
          <p className="small-text muted">You can't see how much anyone has. Pick your gamble.</p>
          {[...s.nearby].sort((a, b) => b.signal - a.signal).map((p) => (
            <Btn key={p.uid} className="player-row" pressed={s.target === p.uid} onClick={() => send({ type: 'target', uid: p.uid })}>
              <img src={playerSprite(p, 'idle')} alt="" />
              <span className="grow" style={{ minWidth: 0 }}><b style={{ display: 'block' }}>{p.name}</b><span className="small-text muted">{closeness(p.signal)}</span></span>
              <ClosenessMeter signal={p.signal} />
            </Btn>
          ))}
        </>
      )}
      {done && s.nearby.length === 0 && (
        <Panel>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <b style={{ display: 'block', fontSize: 18, marginBottom: 6 }}>No targets found nearby</b>
            <p className="small-text muted">
              Make sure nearby phones have Patrol ON and are within acoustic range.
            </p>
          </div>
        </Panel>
      )}
      <div className="grow" />
      {done && (
        <div className="sticky-action">
          {target ? (
            <Btn tone="red" big block click="heist-start" onClick={() => (onRobTarget && target ? onRobTarget(target) : send({ type: 'rob', now }))}>Rob {target.name.split(' ').slice(0, 2).join(' ')}</Btn>
          ) : (
            <Btn big block click={null} onClick={() => (onScan ? onScan() : send({ type: 'scan', now }))}>Scan again</Btn>
          )}
          {target && <p className="small-text muted" style={{ textAlign: 'center' }}>Takes 5% to 25% of their stake, at least 0.001 ETH. Your bond: 20% of the loot.</p>}
        </div>
      )}
    </main>
  );
}

export function Levels({ s, send }: Props) {
  const wins = s.thefts + s.saves;
  const level = levelFor(wins);
  const next = level < 3 ? ((level + 1) as Level) : null;
  return (
    <main className="screen">
      <h1 className="title">{AVATARS[s.avatar].name}, {LEVEL_TITLES[level]}</h1>
      <div className="ladder">
        {([1, 2, 3] as const).map((l) => <Sprite key={l} avatar={s.avatar} level={l} state={l <= level ? 'idle' : 'locked'} alt={`Level ${l}${l <= level ? '' : ', locked'}`} />)}
      </div>
      <div className="ladder-labels">
        {([1, 2, 3] as const).map((l) => <div key={l} className={l <= level ? '' : 'locked'}>LV {l} {l <= level ? '✓' : ''}<br /><span className="small-text">{LEVEL_TITLES[l]}</span></div>)}
      </div>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <Panel className="grow"><div className="muted small-text">Thefts</div><div className="title">{s.thefts}</div></Panel>
        <Panel className="grow"><div className="muted small-text">Saves</div><div className="title">{s.saves}</div></Panel>
      </div>
      {next ? (
        <Panel>
          <div className="spread small-text"><b>Next: {LEVEL_TITLES[next]}</b><span>{wins} / {LEVEL_AT[next]} wins</span></div>
          <div className="bar gold"><div style={{ width: `${(wins / LEVEL_AT[next]) * 100}%` }} /></div>
        </Panel>
      ) : <Panel><b>Top level reached.</b></Panel>}
      <h2 className="heading">Change avatar</h2>
      <div className="pick-grid">
        {(Object.keys(AVATARS) as AvatarId[]).map((id) => (
          <Btn key={id} className="pick-card" pressed={s.avatar === id} onClick={() => send({ type: 'pickAvatar', avatar: id })}>
            <Sprite avatar={id} level={level} state="idle" />{AVATARS[id].name}
          </Btn>
        ))}
      </div>
    </main>
  );
}

export function Log({ s, send }: Props) {
  return (
    <main className="screen">
      <div className="spread">
        <h1 className="title">Activity</h1>
        {s.log.length > 0 && <Btn small style={{ flex: 'none' }} onClick={() => send({ type: 'clearLog' })}>Clear</Btn>}
      </div>
      <Panel className="grow">
        {s.log.length === 0 && <p className="muted">Nothing yet. Sound, transactions and errors will show up here.</p>}
        {s.log.map((e) => (
          <div key={e.id} className="log-row">
            <div className={`log-dot ${e.kind}`} />
            <div style={{ overflowWrap: 'anywhere' }}>
              {e.at > 0 && <span className="small-text muted">{new Date(e.at).toLocaleTimeString()} </span>}
              {e.text}
              {e.count && <b> x{e.count}</b>}
            </div>
          </div>
        ))}
      </Panel>
    </main>
  );
}

export function Settings({ s, send, audioProtocol = 4, setAudioProtocol, onTestChirp }: Props) {
  const Setting = ({ label, hint, k }: { label: string; hint: string; k: 'soundOn' | 'shield' | 'patrol' }) => (
    <Panel>
      <div className="spread">
        <div><b>{label}</b><div className="small-text muted">{hint}</div></div>
        <Btn small pressed={s[k]} onClick={() => send({ type: 'toggle', key: k })} style={{ flex: 'none', minWidth: 68 }}>{s[k] ? 'On' : 'Off'}</Btn>
      </div>
    </Panel>
  );
  return (
    <main className="screen">
      <h1 className="title">Settings</h1>
      <Setting label="Game sounds" hint="Coins, sirens and music" k="soundOn" />
      <Setting label="Patrol" hint="Listen for game signals nearby" k="patrol" />

      <Panel>
        <div className="spread">
          <div>
            <b>Acoustic Band</b>
            <div className="small-text muted">{audioProtocol === 4 ? '16.2 kHz Ultrasound Fast (Default, Inaudible)' : audioProtocol === 5 ? '17.5 kHz Ultrasound Fastest (Inaudible)' : '3.6 kHz Audible Fast'}</div>
          </div>
          {setAudioProtocol && (
            <select
              value={audioProtocol}
              onChange={(e) => setAudioProtocol(Number(e.target.value))}
              style={{ background: '#20162b', color: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit' }}
            >
              <option value={1}>3.6 kHz Audible</option>
              <option value={4}>16.2 kHz Ultrasound</option>
              <option value={5}>17.5 kHz Ultrasound</option>
            </select>
          )}
        </div>
        {onTestChirp && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <Btn small block onClick={onTestChirp}>Test Audio Chirp</Btn>
            <Btn small block onClick={() => send({ type: 'go', view: 'setup' })}>Re-test Setup</Btn>
          </div>
        )}
      </Panel>
      <Panel>
        <b>Privacy</b>
        <p className="small-text muted">Your mic only decodes game signals. Nothing is recorded, stored or uploaded.</p>
      </Panel>
      <Panel>
        <b>Game contract</b>
        <p className="small-text muted">{CONFIG.chainName}. Testnet only.</p>
        <a href={CONFIG.blockExplorer} target="_blank" rel="noreferrer" style={{ color: 'var(--teal-dark)', wordBreak: 'break-all' }}>{CONFIG.heistVaultAddress}</a>
      </Panel>
      <Panel>
        <b>Account</b>
        <p className="small-text muted">Your wallet stays on the server. Log in again to get it back.</p>
        <Btn tone="red" small block style={{ marginTop: 8 }} onClick={() => {
          if (!window.confirm('Log out of Sonic Heist?')) return;
          // The mic/sound-check flags are per device, so they stay; everything tied to the account goes.
          ['sonic_heist_user', 'sonic_heist_addr', 'sonic_heist_pk', 'sonic_heist_uid', 'sonic_heist_log'].forEach((k) => localStorage.removeItem(k));
          window.location.reload(); // Fresh start: drops the wallet client and game state, lands on the title and then login.
        }}>Log out</Btn>
      </Panel>
    </main>
  );
}
