import React, { useEffect, useReducer, useRef, useState } from 'react';
import { LOG_KEY, MOCK_PLAYERS, initialState, levelFor, reduce, type Action, type GameState, type LogEntry, type Player, type View } from './game';
import { AVATARS, Btn, Icon, LEVEL_TITLES, Sprite, setSoundOn, sfx, useNow } from './kit';
import { soundFX } from '../game/soundFX';
import { Pick, RoundStart, Setup, Title } from './screens/Intro';
import { Levels, Log, Scan, Settings, TableHome } from './screens/Home';
import { HeistScreen } from './screens/Heist';
import { AuthModal } from './screens/Auth';
import { modem } from '../audio/ggwaveModem';
import {
  MessageType,
  PingMessage,
  PongMessage,
  LootReqMessage,
  TicketMessage,
  CatchMessage,
  CaughtMessage,
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
import { bytesToHex, getPlayerName } from '../protocol/signatures';
import {
  fetchOnChainBalances,
  depositToVault,
  withdrawFromVault,
  signLootTicket,
  signCatch,
  signCaught,
  recoverCatchSigner,
  startLootOnChain,
  cancelLootOnChain,
  claimLootOnChain,
  fetchActiveLoots,
  fetchLootStatus,
  setChainLogger,
  LOOT_CANCELLED,
  LOOT_CLAIMED,
  type ChainLoot,
} from '../chain/web3';

const MIN_SIGN_STAKE = 0.001; // HeistVault.MIN_LOOT_AMOUNT: every loot takes at least this, so a smaller vault can't be looted
const TICKET_GAP_MS = 30_000;

const uidOf = (address: string) => parseInt(address.slice(2, 10), 16) >>> 0;

const playerFromUid = (uid: number): Player => ({
  uid,
  name: getPlayerName(uid),
  avatar: (['nib', 'juno', 'rocco'] as const)[uid % 3],
  level: ((uid % 3) + 1) as Player['level'],
  signal: 0.9,
  vault: 0.25,
});

const lootAction = (role: 'thief' | 'victim', loot: ChainLoot): Action => {
  const rivalAddress = role === 'thief' ? loot.victim : loot.thief;
  return { type: 'lootOnChain', now: Date.now(), role, rival: playerFromUid(uidOf(rivalAddress)), rivalAddress, loot };
};

const chainError = (err: any): string => err?.cause?.data?.errorName ?? err?.shortMessage ?? err?.message ?? 'Transaction failed';
// Fuller than the toast: viem's details hold the node's own reason, like "insufficient funds for gas".
const errorDetail = (err: any): string => [chainError(err), err?.details].filter(Boolean).join(' | ');
const uidHex = (uid: number) => uid.toString(16).toUpperCase().padStart(8, '0');

function getInitialUser() {
  const savedUser = localStorage.getItem('sonic_heist_user');
  if (savedUser) {
    try {
      return JSON.parse(savedUser);
    } catch {
      // Fallback
    }
  }

  let addr = localStorage.getItem('sonic_heist_addr');
  if (!addr) {
    const randomHex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    addr = `0x${randomHex}`;
    localStorage.setItem('sonic_heist_addr', addr);
  }
  const cleanUid = parseInt(addr.slice(2, 10), 16) >>> 0;
  localStorage.setItem('sonic_heist_uid', cleanUid.toString());
  return {
    username: getPlayerName(cleanUid),
    walletAddress: addr as `0x${string}`,
    privateKey: localStorage.getItem('sonic_heist_pk') || '',
    uid: cleanUid,
  };
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

// Single-phone demo controls
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
  const [currentUser, setCurrentUser] = useState(getInitialUser);
  const [showAuthModal, setShowAuthModal] = useState(!localStorage.getItem('sonic_heist_user'));
  const [s, send] = useReducer(reduce, currentUser.username, initialState);
  const now = useNow();

  const logEvent = (kind: LogEntry['kind'], text: string) => send({ type: 'logEvent', kind, text, at: Date.now() });

  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(s.log));
    } catch {
      // Storage full or blocked: the log still works until the next refresh.
    }
  }, [s.log]);

  // Anything nothing else caught still reaches the log, and so does anything on-chain.
  useEffect(() => {
    setChainLogger(logEvent);
    const onError = (e: ErrorEvent) => logEvent('bad', `Crash: ${e.message} (${e.filename}:${e.lineno})`);
    const onRejection = (e: PromiseRejectionEvent) => logEvent('bad', `Unhandled error: ${errorDetail(e.reason)}`);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    logEvent('info', `App opened. Wallet ${currentUser.walletAddress}, uid ${uidHex(uidOf(currentUser.walletAddress))}`);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  const transmit = async (label: string, bytes: Uint8Array, protocol: number, volume: number) => {
    logEvent('info', `Sound out: ${label}, ${bytes.length} bytes, protocol ${protocol}, volume ${volume}`);
    try {
      const result = await modem.transmit(bytes, protocol, volume);
      logEvent('info', `Sound out done: ${label}, played ${(result.durationMs / 1000).toFixed(2)} s`);
      return result;
    } catch (err) {
      logEvent('bad', `Sound out failed: ${label}: ${errorDetail(err)}`);
      throw err;
    }
  };

  // Initialize wallet fields in state
  useEffect(() => {
    if (currentUser) {
      send({
        type: 'setUser',
        name: currentUser.username,
        walletAddress: currentUser.walletAddress,
        privateKey: currentUser.privateKey,
      });
    }
  }, [currentUser]);

  const refreshBalances = async () => {
    try {
      const res = await fetchOnChainBalances(currentUserRef.current.walletAddress as `0x${string}`);
      if (res.stakeEth !== sRef.current.stake || res.walletEth !== sRef.current.wallet) {
        logEvent('info', `Chain: stake ${res.stakeEth} ETH, wallet ${res.walletEth} ETH`);
      }
      send({ type: 'setBalances', wallet: res.walletEth, stake: res.stakeEth, immuneUntil: res.immuneUntilMs, readyAt: res.readyAtMs });
    } catch (err) {
      logEvent('bad', `Chain: balance read failed: ${errorDetail(err)}`);
    }
  };

  // Synchronize on-chain Base Sepolia balance and vault stake
  useEffect(() => {
    if (!currentUser.walletAddress) return;
    refreshBalances();
    const interval = setInterval(refreshBalances, 12000); // Poll Base Sepolia every 12s
    return () => clearInterval(interval);
  }, [currentUser.walletAddress]);

  // The chain decides how a heist goes. Polling also tells a victim they were robbed, and restores a heist after a refresh.
  useEffect(() => {
    const address = currentUser.walletAddress as `0x${string}`;
    if (!address) return;
    let busy = false;
    const syncLoot = async () => {
      if (busy) return;
      busy = true;
      try {
        const h = sRef.current.heist;
        if (h?.lootId != null) {
          if (h.phase === 'caught' || h.phase === 'saved') return;
          const status = await fetchLootStatus(h.lootId);
          if (status === LOOT_CANCELLED || status === LOOT_CLAIMED) {
            logEvent('info', `Chain: loot #${h.lootId} ${status === LOOT_CANCELLED ? 'cancelled' : 'claimed'}`);
            send({ type: 'lootResolved', status: status === LOOT_CANCELLED ? 'cancelled' : 'claimed', now: Date.now() });
            refreshBalances();
          }
        } else if (!h) {
          const { asThief, asVictim } = await fetchActiveLoots(address);
          if (sRef.current.heist) return;
          const now = Date.now();
          if (asThief) {
            logEvent('info', `Chain: resuming loot #${asThief.lootId} as thief, ${asThief.amount} ETH`);
            send(lootAction('thief', asThief));
          // Stay quiet during the head start. Past the deadline there is nothing left to hunt.
          } else if (asVictim && now >= asVictim.revealAt && now < asVictim.deadline) {
            logEvent('info', `Chain: robbed in loot #${asVictim.lootId}, ${asVictim.amount} ETH, ${Math.round((asVictim.deadline - now) / 1000)} s left`);
            send(lootAction('victim', asVictim));
          }
        }
      } catch (err) {
        logEvent('bad', `Chain: loot sync failed: ${errorDetail(err)}`);
      } finally {
        busy = false;
      }
    };
    syncLoot();
    const interval = setInterval(syncLoot, 3000);
    return () => clearInterval(interval);
  }, [currentUser.walletAddress]);

  const [audioProtocol, setAudioProtocol] = useState<number>(() => {
    const saved = localStorage.getItem('sonic_audio_proto_v2');
    return saved ? Number(saved) : 4; // Default to 4 (Ultrasound Fast 16.2 kHz, inaudible)
  });

  const handleSetAudioProtocol = (proto: number) => {
    setAudioProtocol(proto);
    localStorage.setItem('sonic_audio_proto_v2', proto.toString());
  };

  const sRef = useRef(s);
  const audioProtocolRef = useRef(audioProtocol);
  const currentUserRef = useRef(currentUser);
  const lastTicketAt = useRef(0);
  const pendingCatch = useRef<{ lootId: number; challenge: Uint8Array } | null>(null);

  useEffect(() => {
    sRef.current = s;
    audioProtocolRef.current = audioProtocol;
    currentUserRef.current = currentUser;
  });

  useEffect(() => { send({ type: 'tick', now }); }, [now]);
  useEffect(() => { setSoundOn(s.soundOn); }, [s.soundOn]);

  // Load sounds & ensure listening and active AudioContext on user interaction
  useEffect(() => {
    const resumeAudio = () => {
      soundFX.preload();
      const ctx = modem.ensureAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch((err) => logEvent('bad', `Audio resume failed: ${errorDetail(err)}`));
      }
      if (sRef.current.micOk && (sRef.current.patrol || sRef.current.heist !== null)) {
        ensureListening().catch(() => {}); // Logged inside
      }
    };
    window.addEventListener('pointerdown', resumeAudio);
    return () => window.removeEventListener('pointerdown', resumeAudio);
  }, []);

  const getUid = () => {
    if (currentUserRef.current.walletAddress) {
      return parseInt(currentUserRef.current.walletAddress.slice(2, 10), 16) >>> 0;
    }
    return 0;
  };

  // Handle incoming acoustic packets
  const handleIncomingAudio = (bytes: Uint8Array) => {
    // 1. Acoustic test chirp
    if (bytes.length === 5 && bytes[0] === 0x53 && bytes[1] === 0x4f && bytes[2] === 0x4e) {
      logEvent('good', 'Sound in: test chirp');
      sfx('coin');
      send({ type: 'soundOk' });
      return;
    }

    const msg = decodeHeistMessage(bytes);
    if (!msg) {
      logEvent('bad', `Sound in: unreadable, ${bytes.length} bytes, starts ${bytesToHex(bytes.slice(0, 4))}`);
      return;
    }
    logEvent('info', `Sound in: ${MessageType[msg.type]}, ${bytes.length} bytes`);
    const ignore = (reason: string) => logEvent('info', `Ignored ${MessageType[msg.type]}: ${reason}`);

    const myUid = getUid();
    const currentS = sRef.current;
    const proto = audioProtocolRef.current;
    const vol = 85;
    const privateKey = currentUserRef.current.privateKey as `0x${string}`;

    switch (msg.type) {
      case MessageType.PING: {
        const m = msg as PingMessage;
        if (m.scannerUid === myUid) return ignore('my own ping');

        const isRunningAsThief = currentS.heist?.role === 'thief' && (currentS.heist.phase === 'headstart' || currentS.heist.phase === 'hunted');
        if (!currentS.patrol && !isRunningAsThief) return ignore('patrol is off');

        if (m.targetUid === 0 || m.targetUid === myUid || isRunningAsThief) {
          const delay = m.targetUid === 0 ? 250 + Math.floor(Math.random() * 5) * 1500 : 250; // Random slot so phones answering a broadcast don't talk over each other; a PONG plays for 1.32 s
          // Respond with PONG over ultrasound (keep speaker quiet from audible sounds to avoid clashing)
          setTimeout(() => {
            const pong = encodePong({
              responderUid: myUid,
              echoNonce: m.nonce,
            });
            transmit('PONG', pong, proto, vol).catch(() => {}); // Logged inside
          }, delay);
          logEvent('info', `Answering ${uidHex(m.scannerUid)} in ${delay} ms`);
        } else {
          ignore(`for ${uidHex(m.targetUid)}, not me`);
        }
        break;
      }

      case MessageType.PONG: {
        const m = msg as PongMessage;
        if (m.responderUid === myUid) return ignore('my own echo');
        logEvent('good', `Found ${getPlayerName(m.responderUid)} (${uidHex(m.responderUid)})`);

        // Target found! Play pleasant chime and vibrate
        sfx('coin');
        if ('vibrate' in navigator) navigator.vibrate?.([80, 50, 80]);

        send({ type: 'discoveredPlayer', player: playerFromUid(m.responderUid) });

        // If currently hunting as victim, response confirms thief is caught in range!
        if (currentS.heist?.role === 'victim' && m.responderUid === currentS.heist.rival.uid && (currentS.heist.phase === 'hunting' || currentS.heist.phase === 'handshake')) {
          sfx('thief-near');
          send({ type: 'thiefInRange', signal: 1.0 });
        }
        break;
      }

      case MessageType.LOOT_REQ: {
        const m = msg as LootReqMessage;
        // Auto-sign policy (README 9.4). Sound is unauthenticated, so stay silent unless all of this holds; the contract re-checks the rest.
        const refusal = m.victimUid !== myUid ? `for ${uidHex(m.victimUid)}, not me`
          : !privateKey ? 'no private key on this phone'
          : !currentS.patrol ? 'patrol is off'
          : currentS.shield ? 'shield is on'
          : currentS.heist ? 'already in a heist'
          : Date.now() < currentS.immuneUntil ? `immune for ${Math.ceil((currentS.immuneUntil - Date.now()) / 1000)} s`
          : currentS.stake < MIN_SIGN_STAKE ? `stake ${currentS.stake} ETH is under ${MIN_SIGN_STAKE}`
          : Date.now() - lastTicketAt.current < TICKET_GAP_MS ? `already signed a ticket ${Math.round((Date.now() - lastTicketAt.current) / 1000)} s ago`
          : null;
        if (refusal) return ignore(refusal);
        lastTicketAt.current = Date.now();
        logEvent('info', `Signing a ticket for thief ${m.thiefAddress}`);

        const nonce = crypto.getRandomValues(new BigUint64Array(1))[0];
        // shortcut: uses this phone's clock, not the chain's. 90 s hides normal drift; read the latest block if tickets expire early.
        const validBefore = Math.floor(Date.now() / 1000) + 90;
        signLootTicket(privateKey, m.thiefAddress, nonce, validBefore)
          .then((signature) => transmit('TICKET', encodeTicket({ thiefUid: uidOf(m.thiefAddress), nonce, validBefore, signature }), proto, vol))
          .catch((err) => logEvent('bad', `Ticket failed: ${errorDetail(err)}`));
        break;
      }

      case MessageType.TICKET: {
        const m = msg as TicketMessage;
        if (m.thiefUid !== myUid) return ignore(`for ${uidHex(m.thiefUid)}, not me`);
        if (currentS.heist?.phase !== 'ticket') return ignore(`not waiting for one (phase: ${currentS.heist?.phase ?? 'no heist'})`);
        logEvent('info', `Ticket valid for ${m.validBefore - Math.floor(Date.now() / 1000)} s, starting the loot`);
        send({ type: 'ticketReceived' });
        startLootOnChain(privateKey, m.nonce, m.validBefore, m.signature)
          .then((loot) => {
            logEvent('good', `Loot #${loot.lootId} started: ${loot.amount} ETH from ${loot.victim}, bond ${loot.bond} ETH`);
            send(lootAction('thief', loot));
            refreshBalances();
          })
          .catch((err) => {
            logEvent('bad', `startLoot failed: ${errorDetail(err)}`);
            send({ type: 'lootFailed', message: `Loot failed: ${chainError(err)}` });
          });
        break;
      }

      case MessageType.CATCH: {
        const m = msg as CatchMessage;
        const h = currentS.heist;
        if (h?.role !== 'thief') return ignore('not running as a thief');
        if (h.lootId !== m.lootId || !h.rivalAddress) return ignore(`for loot #${m.lootId}, mine is #${h.lootId}`);
        if (!h.deadline || Date.now() >= h.deadline) return ignore('the deadline has passed');
        const victim = h.rivalAddress as `0x${string}`;
        recoverCatchSigner(m.lootId, m.challenge, m.signature)
          .then(async (signer) => {
            if (signer.toLowerCase() !== victim.toLowerCase()) return ignore(`signed by ${signer}, not my victim`);
            logEvent('info', 'Victim proved the catch, signing CAUGHT');
            const signature = await signCaught(privateKey, m.lootId, victim, m.challenge);
            await transmit('CAUGHT', encodeCaught({ lootId: m.lootId, challenge: m.challenge, signature }), proto, vol);
          })
          .catch((err) => logEvent('bad', `Catch reply failed: ${errorDetail(err)}`));
        break; // The Busted screen waits for the cancel to land on-chain (see syncLoot)
      }

      case MessageType.CAUGHT: {
        const m = msg as CaughtMessage;
        const pending = pendingCatch.current;
        if (!pending) return ignore('no catch in progress');
        if (pending.lootId !== m.lootId || bytesToHex(pending.challenge) !== bytesToHex(m.challenge)) return ignore('answers a different catch');
        logEvent('info', `Thief answered, cancelling loot #${m.lootId}`);
        pendingCatch.current = null;
        cancelLootOnChain(privateKey, m.lootId, m.challenge, m.signature)
          .then(() => {
            send({ type: 'caughtHandshake' });
            refreshBalances();
          })
          .catch((err) => {
            logEvent('bad', `cancel failed: ${errorDetail(err)}`);
            send({ type: 'lootFailed', message: `Catch failed: ${chainError(err)}` });
          });
        break;
      }
    }
  };

  const ensureListening = async () => {
    if (modem.getListeningStatus()) return;
    try {
      await modem.startListening((bytes: Uint8Array) => {
        handleIncomingAudio(bytes);
      });
      logEvent('good', 'Microphone listening');
    } catch (err) {
      logEvent('bad', `Microphone failed: ${errorDetail(err)}`);
      throw err;
    }
  };

  // Initialize ggwave audio modem
  useEffect(() => {
    modem.loadLibrary().catch((err) => {
      logEvent('bad', `Audio library failed: ${errorDetail(err)}`);
    });

    return () => {
      modem.stopListening();
    };
  }, []);

  // Ensure modem is listening if mic is granted and patrol is on OR heist is active
  useEffect(() => {
    if (s.micOk && (s.patrol || s.heist !== null)) {
      ensureListening().catch(() => {});
    }
  }, [s.micOk, s.patrol, s.heist?.phase]);

  // Button Action Callbacks
  const onAllowMic = async () => {
    try {
      await ensureListening();
      localStorage.setItem('sonic_mic_ok', 'true');
      send({ type: 'micOk' });
      sfx('coin');
    } catch (err: any) {
      alert('Microphone permission required for acoustic game: ' + (err?.message || err));
    }
  };

  const onSoundCheck = async () => {
    const testBytes = new Uint8Array([0x53, 0x4f, 0x4e, 0x49, 0x43]); // "SONIC"
    await transmit('test chirp', testBytes, audioProtocol, 75);
    localStorage.setItem('sonic_sound_ok', 'true');
    send({ type: 'soundOk' });
    sfx('coin');
  };

  const onScan = () => {
    const ping = encodePing({
      scannerUid: getUid(),
      targetUid: 0,
      nonce: Math.floor(Math.random() * 0xffff),
    });
    transmit('PING (scan)', ping, audioProtocol, 85).catch(() => {}); // Logged inside
    send({ type: 'scan', now: Date.now() });
  };

  const onRobTarget = (target: Player) => {
    const myAddr = (currentUserRef.current.walletAddress || '0x0000000000000000000000000000000000000000') as `0x${string}`;
    const req = encodeLootReq({
      thiefAddress: myAddr,
      victimUid: target.uid,
    });
    logEvent('info', `Robbing ${target.name} (${uidHex(target.uid)})`);
    transmit('LOOT_REQ', req, audioProtocol, 85).catch(() => {}); // Logged inside
    send({ type: 'rob', now: Date.now() });
  };

  const onPulseRadar = async () => {
    send({ type: 'pulse' });
    const ping = encodePing({
      scannerUid: getUid(),
      targetUid: s.heist?.rival.uid || 0,
      nonce: Math.floor(Math.random() * 0xffff),
    });
    await transmit('PING (radar)', ping, audioProtocol, 85);
  };

  const onCancelHeist = async () => {
    send({ type: 'cancel', now: Date.now() });
    const lootId = s.heist?.lootId;
    if (lootId == null) return; // Demo heist: nothing on-chain
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(8));
      pendingCatch.current = { lootId, challenge };
      const signature = await signCatch(currentUserRef.current.privateKey as `0x${string}`, lootId, challenge);
      await transmit('CATCH', encodeCatch({ lootId, challenge, signature }), audioProtocol, 85);
    } catch (err) {
      logEvent('bad', `Catch failed: ${errorDetail(err)}`);
      send({ type: 'lootFailed', message: `Catch failed: ${chainError(err)}` });
    }
  };

  const onClaimLoot = async () => {
    const lootId = s.heist?.lootId;
    if (lootId == null) return send({ type: 'claim' }); // Demo heist: nothing on-chain
    try {
      await claimLootOnChain(currentUserRef.current.privateKey as `0x${string}`, lootId);
      send({ type: 'claim' });
      await refreshBalances();
    } catch (err) {
      logEvent('bad', `claim failed: ${errorDetail(err)}`);
      send({ type: 'lootFailed', message: `Claim failed: ${chainError(err)}` });
    }
  };

  // Requirement 4: Real on-chain Base Sepolia deposit & withdraw
  const onDepositOnChain = async (amountEth: number) => {
    if (!currentUserRef.current.privateKey) {
      alert('Wallet private key not found. Please log in again.');
      return;
    }
    try {
      send({ type: 'clearNotice' });
      sfx('coin');
      const { hash } = await depositToVault(currentUserRef.current.privateKey as `0x${string}`, amountEth);
      alert(`On-chain deposit sent to Base Sepolia!\nTx: ${hash.slice(0, 16)}...`);
      await refreshBalances();
    } catch (err: any) {
      logEvent('bad', `deposit failed: ${errorDetail(err)}`);
      alert('Base Sepolia Deposit failed: ' + chainError(err));
    }
  };

  const onWithdrawOnChain = async (amountEth: number) => {
    if (!currentUserRef.current.privateKey) {
      alert('Wallet private key not found. Please log in again.');
      return;
    }
    try {
      sfx('coin');
      const { hash } = await withdrawFromVault(currentUserRef.current.privateKey as `0x${string}`, amountEth);
      alert(`On-chain withdrawal completed on Base Sepolia!\nTx: ${hash.slice(0, 16)}...`);
      await refreshBalances();
    } catch (err: any) {
      logEvent('bad', `withdraw failed: ${errorDetail(err)}`);
      alert('Base Sepolia Withdraw failed: ' + chainError(err));
    }
  };

  const onTestChirp = () => {
    const testBytes = new Uint8Array([0x53, 0x4f, 0x4e, 0x49, 0x43]);
    transmit('test chirp', testBytes, audioProtocol, 75).catch(() => {}); // Logged inside
  };

  useEffect(() => {
    if (!s.notice) return;
    logEvent('bad', s.notice);
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
    if (!h) {
      if (was) logEvent('info', `Heist over (was ${was.phase})`);
      return;
    }
    if (h.phase !== was?.phase) {
      logEvent('info', `Heist: ${was?.phase ?? 'start'} -> ${h.phase} (${h.role})`);
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
    onClaimLoot,
    onDepositOnChain,
    onWithdrawOnChain,
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

      {/* Requirement 2: Login / Signup Modal */}
      {showAuthModal && (
        <AuthModal
          onSuccess={(u) => {
            const cleanUid = parseInt(u.walletAddress.slice(2, 10), 16) >>> 0;
            const fullUser = {
              username: u.username,
              walletAddress: u.walletAddress as `0x${string}`,
              privateKey: u.privateKey,
              uid: cleanUid,
            };
            localStorage.setItem('sonic_heist_user', JSON.stringify(fullUser));
            localStorage.setItem('sonic_heist_addr', u.walletAddress);
            localStorage.setItem('sonic_heist_pk', u.privateKey);
            localStorage.setItem('sonic_heist_uid', cleanUid.toString());
            setCurrentUser(fullUser);
            setShowAuthModal(false);
          }}
        />
      )}
    </div>
  );
}
