import React, { useEffect, useReducer, useRef, useState } from 'react';
import { MOCK_PLAYERS, initialState, levelFor, reduce, type Action, type GameState, type Player, type View } from './game';
import { AVATARS, Btn, Icon, LEVEL_TITLES, Sprite, setSoundOn, sfx, useNow } from './kit';
import { soundFX } from '../game/soundFX';
import { Pick, RoundStart, Setup, Title } from './screens/Intro';
import { Levels, Log, Scan, Settings, TableHome } from './screens/Home';
import { HeistScreen } from './screens/Heist';
import { modem } from '../audio/ggwaveModem';
import {
  MessageType,
  PingMessage,
  PongMessage,
  LootReqMessage,
  CatchMessage,
} from '../protocol/types';
import {
  decodeHeistMessage,
  encodePing,
  encodePong,
  encodeLootReq,
  encodeTicket,
  encodeCatch,
  encodeCaught,
} from '../protocol/codecs';
import { getPlayerName } from '../protocol/signatures';

function getOrCreateBurner() {
  let addr = localStorage.getItem('sonic_heist_addr');
  if (!addr) {
    const randomHex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    addr = `0x${randomHex}`;
    localStorage.setItem('sonic_heist_addr', addr);
  }
  const cleanUid = parseInt(addr.slice(2, 10), 16) >>> 0;
  localStorage.setItem('sonic_heist_uid', cleanUid.toString());
  return { address: addr as `0x${string}`, uid: cleanUid };
}

const TABS: { view: View; label: string; icon: 'table' | 'star' | 'scroll' | 'gear' }[] = [
  { view: 'table', label: 'Table', icon: 'table' },
  { view: 'levels', label: 'Levels', icon: 'star' },
  { view: 'log', label: 'Activity', icon: 'scroll' },
  { view: 'settings', label: 'Settings', icon: 'gear' },
];

function LevelUp({ s, send }: { s: GameState; send: (a: Action) => void }) {
  const to = s.levelUpTo;
  useEffect(() => { if (to) sfx('level-up'); }, [to]);
  if (!to) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Level up">
      <div className="frame">
        <div className="title" style={{ color: 'var(--red)' }}>Level up!</div>
        <Sprite className="hero-sprite" avatar={s.avatar} level={to} state="saved" alt="" />
        <p>{AVATARS[s.avatar].name} is now a <b>{LEVEL_TITLES[to]}</b>.</p>
        <Btn tone="gold" big block autoFocus onClick={() => send({ type: 'clearLevelUp' })}>Nice</Btn>
      </div>
    </div>
  );
}

// Lets you reach every state from one phone, or simulate another device.
function DemoControls({ s, send, now }: { s: GameState; send: (a: Action) => void; now: number }) {
  const [open, setOpen] = useState(false);
  const act = (a: Action) => { send(a); setOpen(false); };
  const canCatch = s.heist?.phase === 'headstart' || s.heist?.phase === 'hunted';
  return (
    <>
      <button type="button" className="demo-tab" aria-expanded={open} onClick={() => setOpen(!open)}>DEMO</button>
      {open && (
        <div className="frame demo-panel" role="dialog" aria-label="Demo controls">
          <div className="spread"><b>Demo controls</b><span className="small-text muted">Single-phone test</span></div>
          <div className="demo-grid">
            <Btn small onClick={() => act({ type: 'incoming', now, rival: MOCK_PLAYERS[Math.floor(Math.random() * 4)], lootRate: 0.05 + Math.random() * 0.2 })}>Someone robs me</Btn>
            <Btn small disabled={!canCatch} onClick={() => act({ type: 'victimFoundMe', now })}>Victim finds me</Btn>
            <Btn small onClick={() => act({ type: 'skip', now })}>Skip timer</Btn>
            <Btn small onClick={() => act({ type: 'addWin' })}>+1 win</Btn>
            <Btn small onClick={() => { setOpen(false); send({ type: 'reset', name: s.name }); }}>Restart</Btn>
            <Btn small onClick={() => setOpen(false)}>Close</Btn>
          </div>
        </div>
      )}
    </>
  );
}

export function UiApp() {
  const [burner] = useState(getOrCreateBurner);
  const playerName = getPlayerName(burner.uid);
  const [s, send] = useReducer(reduce, playerName, initialState);
  const now = useNow();

  const [audioProtocol, setAudioProtocol] = useState<number>(() => {
    const saved = localStorage.getItem('sonic_audio_proto');
    return saved ? Number(saved) : 1; // 1: Audible Fast, 4: Ultrasound Fast, 5: Ultrasound Fastest
  });

  const handleSetAudioProtocol = (proto: number) => {
    setAudioProtocol(proto);
    localStorage.setItem('sonic_audio_proto', proto.toString());
  };

  const sRef = useRef(s);
  const audioProtocolRef = useRef(audioProtocol);
  const burnerRef = useRef(burner);

  useEffect(() => {
    sRef.current = s;
    audioProtocolRef.current = audioProtocol;
    burnerRef.current = burner;
  });

  useEffect(() => { send({ type: 'tick', now }); }, [now]);
  useEffect(() => { setSoundOn(s.soundOn); }, [s.soundOn]);

  // Load sounds on first user tap
  useEffect(() => {
    const first = () => soundFX.preload();
    window.addEventListener('pointerdown', first, { once: true });
    return () => window.removeEventListener('pointerdown', first);
  }, []);

  // Handle incoming acoustic packets
  const handleIncomingAudio = (bytes: Uint8Array) => {
    // 1. Acoustic test chirp
    if (bytes.length === 5 && bytes[0] === 0x53 && bytes[1] === 0x4f && bytes[2] === 0x4e) {
      sfx('coin');
      send({ type: 'soundOk' });
      return;
    }

    const msg = decodeHeistMessage(bytes);
    if (!msg) return;

    const currentBurner = burnerRef.current;
    const currentS = sRef.current;
    const proto = audioProtocolRef.current;
    const vol = 75;

    switch (msg.type) {
      case MessageType.PING: {
        const m = msg as PingMessage;
        const isRunningAsThief = currentS.heist?.role === 'thief' && (currentS.heist.phase === 'headstart' || currentS.heist.phase === 'hunted');
        if (!currentS.patrol && !isRunningAsThief) return;
        if (currentS.shield) return;

        if (m.targetUid === 0 || m.targetUid === currentBurner.uid || isRunningAsThief) {
          sfx('radar-ping');
          setTimeout(() => {
            const pong = encodePong({
              responderUid: currentBurner.uid,
              echoNonce: m.nonce,
            });
            modem.transmit(pong, proto, vol);
          }, 250);
        }
        break;
      }

      case MessageType.PONG: {
        const m = msg as PongMessage;
        sfx('radar-ping');
        const pName = getPlayerName(m.responderUid);
        const discovered: Player = {
          uid: m.responderUid,
          name: pName,
          avatar: (['nib', 'juno', 'rocco'][m.responderUid % 3] || 'nib') as any,
          level: ((m.responderUid % 3) + 1) as any,
          signal: 0.9,
          vault: 0.25,
        };
        send({ type: 'discoveredPlayer', player: discovered });

        // If currently hunting as victim, response confirms thief is caught in range!
        if (currentS.heist?.role === 'victim' && (currentS.heist.phase === 'hunting' || currentS.heist.phase === 'handshake')) {
          sfx('thief-near');
          send({ type: 'thiefInRange', signal: 1.0 });
        }
        break;
      }

      case MessageType.LOOT_REQ: {
        const m = msg as LootReqMessage;
        if (!currentS.patrol || currentS.shield) return;
        if (m.victimUid !== currentBurner.uid) return;
        if (Date.now() < currentS.immuneUntil) return;

        // Auto-sign mock ticket and transmit back over ultrasound
        const ticketBytes = encodeTicket({
          thiefUid: parseInt(m.thiefAddress.slice(2, 10), 16),
          nonce: BigInt(Math.floor(Math.random() * 100000) + 1),
          validBefore: Math.floor(Date.now() / 1000) + 90,
          signature: new Uint8Array(64).fill(0x55),
        });
        modem.transmit(ticketBytes, proto, vol);

        // Schedule victim incoming alert for 10s later (end of headstart)
        const targetThiefUid = parseInt(m.thiefAddress.slice(2, 10), 16);
        const thiefName = getPlayerName(targetThiefUid);
        setTimeout(() => {
          send({
            type: 'incoming',
            now: Date.now(),
            rival: {
              uid: targetThiefUid,
              name: thiefName,
              avatar: (['juno', 'nib', 'rocco'][targetThiefUid % 3] || 'juno') as any,
              level: 2,
              signal: 0.5,
              vault: 0.3,
            },
            lootRate: 0.15,
          });
        }, 10000);
        break;
      }

      case MessageType.TICKET: {
        send({ type: 'ticketReceived' });
        break;
      }

      case MessageType.CATCH: {
        const m = msg as CatchMessage;
        if (currentS.heist?.role !== 'thief') return;
        // Echo CAUGHT signature back over ultrasound
        const caughtBytes = encodeCaught({
          lootId: m.lootId,
          challenge: m.challenge,
          signature: new Uint8Array(64).fill(0x77),
        });
        modem.transmit(caughtBytes, proto, vol);
        send({ type: 'victimFoundMe', now: Date.now() });
        break;
      }

      case MessageType.CAUGHT: {
        if (currentS.heist?.role !== 'victim') return;
        send({ type: 'caughtHandshake' });
        break;
      }
    }
  };

  const ensureListening = async () => {
    await modem.startListening((bytes: Uint8Array) => {
      handleIncomingAudio(bytes);
    });
  };

  // Initialize ggwave audio modem
  useEffect(() => {
    modem.loadLibrary().catch((err) => {
      console.warn('Audio init error:', err);
    });

    return () => {
      modem.stopListening();
    };
  }, []);

  // Ensure modem is listening if patrol is on and mic is granted
  useEffect(() => {
    if (s.micOk && s.patrol) {
      ensureListening().catch(() => {});
    }
  }, [s.micOk, s.patrol]);

  // Button Action Callbacks
  const onAllowMic = async () => {
    try {
      await ensureListening();
      send({ type: 'micOk' });
      sfx('coin');
    } catch (err: any) {
      alert('Microphone permission required for acoustic game: ' + (err?.message || err));
    }
  };

  const onSoundCheck = async () => {
    const testBytes = new Uint8Array([0x53, 0x4f, 0x4e, 0x49, 0x43]); // "SONIC"
    await modem.transmit(testBytes, audioProtocol, 75);
    send({ type: 'soundOk' });
    sfx('coin');
  };

  const onScan = () => {
    const ping = encodePing({
      scannerUid: burner.uid,
      targetUid: 0,
      nonce: Math.floor(Math.random() * 0xffff),
    });
    modem.transmit(ping, audioProtocol, 75);
    send({ type: 'scan', now: Date.now() });
  };

  const onRobTarget = (target: Player) => {
    const req = encodeLootReq({
      thiefAddress: burner.address,
      victimUid: target.uid,
    });
    modem.transmit(req, audioProtocol, 75);
    send({ type: 'rob', now: Date.now(), lootRate: 0.15 });
  };

  const onPulseRadar = () => {
    const ping = encodePing({
      scannerUid: burner.uid,
      targetUid: s.heist?.rival.uid || 0,
      nonce: Math.floor(Math.random() * 0xffff),
    });
    modem.transmit(ping, audioProtocol, 75);
    send({ type: 'pulse' });
  };

  const onCancelHeist = () => {
    const catchMsg = encodeCatch({
      lootId: 101,
      challenge: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      signature: new Uint8Array(64).fill(0x33),
    });
    modem.transmit(catchMsg, audioProtocol, 75);
    send({ type: 'cancel', now: Date.now() });
  };

  const onTestChirp = () => {
    const testBytes = new Uint8Array([0x53, 0x4f, 0x4e, 0x49, 0x43]);
    modem.transmit(testBytes, audioProtocol, 75);
  };

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
    if (remaining !== null && remaining > 0 && remaining <= 10 && (phase === 'hunting' || phase === 'hunted' || phase === 'handshake')) {
      sfx('tick-urgent', 0.5);
    }
  }, [remaining]);

  const p = {
    s,
    send,
    now,
    onScan,
    onRobTarget,
    audioProtocol,
    setAudioProtocol: handleSetAudioProtocol,
    onTestChirp,
    onAllowMic,
    onSoundCheck,
    onPulseRadar,
    onCancelHeist,
  };

  const onTab = !s.heist && TABS.some((t) => t.view === s.view);
  return (
    <div className="phone" data-view={s.heist ? `heist-${s.heist.phase}` : s.view}>
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
        <nav className="nav" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.view} type="button" aria-current={s.view === t.view ? 'page' : undefined} onClick={() => { sfx('ui-click'); send({ type: 'go', view: t.view }); }}>
              <Icon name={t.icon} />{t.label}
            </button>
          ))}
        </nav>
      )}
      {s.notice && <div className="toast" role="status">{s.notice}</div>}
      <LevelUp s={s} send={send} />
      <DemoControls {...p} />
    </div>
  );
}
