// Runs the real game: sound, wallet and chain feed the rules in ui/game.ts.
// Lives outside React on purpose, so a heist keeps going when Android destroys the screen.
import { AppState, PermissionsAndroid, Platform, Vibration } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { runDueTimers } from '../polyfills';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import SonicAudio from '../../modules/sonic-audio';
import {
  LOOT_CANCELLED,
  LOOT_CLAIMED,
  cancelLootOnChain,
  claimLootOnChain,
  clearTimerOnChain,
  depositToVault,
  fetchActiveLoots,
  fetchLootStatus,
  fetchOnChainBalances,
  recoverCatchSigner,
  setChainLogger,
  signCatch,
  signCaught,
  signLootTicket,
  startLootOnChain,
  withdrawFromVault,
  type ChainLoot,
} from '../chain/web3';
import { decodeHeistMessage, encodeCatch, encodeCaught, encodeLootReq, encodePing, encodePong, encodeTicket } from '../protocol/codecs';
import { bytesToHex, getPlayerName } from '../protocol/signatures';
import { logIn, recordRob, signUp } from './account';
import {
  MessageType,
  type CatchMessage,
  type CaughtMessage,
  type LootReqMessage,
  type PingMessage,
  type PongMessage,
  type TicketMessage,
} from '../protocol/types';
import { initialState, reduce, type Action, type GameState, type Player, type SavedProgress } from '../ui/game';
import { setSoundOn } from '../ui/kit';

// Silent on purpose: a sound after a detection or transmission would give a player away to anyone nearby.
const BUZZ_FOUND = [0, 80, 50, 80];
const BUZZ_IN_RANGE = [0, 150, 80, 150];
const BUZZ_STEP = [0, 60];
const BUZZ_RUN = [0, 200, 100, 200];
const PROTOCOL_MAX = 4; // Ultrasound fast, band raised natively in ggwave-jni.cpp
const PROTOCOL_AUDIBLE = 1;
const VOLUME = 85;
const PONG_SLOT_MS = 1500; // A PONG plays for 1.32 s
const PONG_SLOTS = 5;
const MIN_SIGN_STAKE = 0.001; // HeistVault.MIN_LOOT_AMOUNT: every loot takes at least this
const TICKET_GAP_MS = 30_000;
const TICK_MS = 500;
const LOOT_SYNC_MS = 3_000;
const BALANCE_SYNC_MS = 5_000;
const BALANCE_FOLLOW_UPS_MS = [1_500, 4_000]; // RPC nodes can lag just behind a confirmed transaction
const STALL_WARNING_MS = 5_000;
const KEY_NAME = 'sonic_heist_private_key';
const PROGRESS_KEY = 'progress';
const SESSION_KEY = 'sonic_heist_session';
const SIGNAL_KEY = 'signal';
const PENDING_ROBS_KEY = 'pending_robs';
const ROB_RETRY_MS = 30_000;

const uidOf = (address: string) => parseInt(address.slice(2, 10), 16) >>> 0;
const uidHex = (uid: number) => uid.toString(16).toUpperCase().padStart(8, '0');
const seconds = (ms: number) => (ms / 1000).toFixed(1);
const log = (text: string) => SonicAudio.appendLog(text);

const chainError = (err: any): string => {
  const text: string = err?.cause?.data?.errorName ?? err?.shortMessage ?? err?.message ?? 'Transaction failed';
  return text.includes('exceeds the balance') ? 'Not enough test ETH in your wallet to cover this and gas.' : text;
};
// Fuller than the toast: viem's details hold the node's own reason, like "insufficient funds for gas".
const errorDetail = (err: any): string => [chainError(err), err?.details].filter(Boolean).join(' | ');

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

function randomBigUint64(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return new DataView(bytes.buffer).getBigUint64(0, false);
}

// --- State ---
function loadProgress(): Partial<SavedProgress> {
  try {
    return JSON.parse(SonicAudio.getPref(PROGRESS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

let state: GameState = initialState('', loadProgress());
let privateKey: `0x${string}` | null = null;
let savedProgress = '';
let sessionToken: string | null = null;
export type SignalMode = 'max' | 'audible';
let signalMode: SignalMode = SonicAudio.getPref(SIGNAL_KEY) === 'audible' ? 'audible' : 'max';
export const getSignalMode = () => signalMode;
export function setSignalMode(mode: SignalMode) {
  signalMode = mode;
  SonicAudio.setPref(SIGNAL_KEY, mode);
}
const listeners = new Set<() => void>();

export const getState = () => state;
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function send(action: Action) {
  const before = state;
  state = reduce(before, action);
  if (state === before) return;

  if (state.log !== before.log && state.log[0] && state.log[0].id !== before.log[0]?.id) log(state.log[0].text);
  if (state.notice && state.notice !== before.notice) log(`Notice: ${state.notice}`);

  // A finished theft counts on the leaderboard, whether this phone or anyone else sent the claim.
  if (state.thefts > before.thefts && before.heist?.lootId != null) queueRob(before.heist.lootId);

  const h = state.heist;
  const was = before.heist;
  if (h?.phase !== was?.phase) {
    log(h ? `Heist: ${was?.phase ?? 'start'} -> ${h.phase} (${h.role})` : `Heist over (was ${was?.phase})`);
    alertForPhase();
    if (h?.phase === 'grab' || h?.phase === 'disguise') Vibration.vibrate(BUZZ_STEP);
    if (h?.phase === 'headstart' || h?.phase === 'hunted') Vibration.vibrate(BUZZ_RUN);
  }

  const { soundOn, micOk, soundOk, avatar, thefts, saves } = state;
  const progress = JSON.stringify({ soundOn, micOk, soundOk, avatar, thefts, saves });
  if (progress !== savedProgress) {
    savedProgress = progress;
    SonicAudio.setPref(PROGRESS_KEY, progress);
  }

  setSoundOn(state.soundOn && foreground());
  syncMic();
  listeners.forEach((listener) => listener());
}

// --- Background alerts ---
const foreground = () => AppState.currentState === 'active';

function alertForPhase() {
  const h = state.heist;
  if (!h) return;
  try {
    // The robbery alert always fires, because a pocketed phone may not report itself as in the background.
    if (h.phase === 'alert') SonicAudio.alert('You were robbed!', `${h.rival.name} took ${h.amount.toFixed(4)} ETH. Open the app and hunt them.`);
    else if (!foreground() && h.phase === 'won') SonicAudio.alert('You got away!', 'Open the app to claim your loot.');
    else if (!foreground() && h.phase === 'caught') SonicAudio.alert('Busted!', `${h.rival.name} caught you. Your bond is gone.`);
    else if (!foreground() && h.phase === 'saved') SonicAudio.alert('Caught them!', 'Your stake is back.');
  } catch (err) {
    log(`ALERT FAILED: ${errorDetail(err)}`);
  }
}

// --- Mic: on for patrol, a heist or a scan. Patrol off with nothing going on means mic off. ---
function syncMic() {
  const wanted = state.auth === 'in' && state.micOk && (state.patrol || state.heist !== null || state.scanEnds !== null);
  const running = SonicAudio.isPatrolling();
  if (wanted === running) return;
  if (!wanted) {
    SonicAudio.stopPatrol();
    return;
  }
  // Android refuses to start a microphone service from the background. This runs again when the app opens.
  if (!foreground()) return;
  try {
    SonicAudio.startPatrol();
  } catch (err) {
    log(`PATROL FAILED TO START: ${errorDetail(err)}`);
  }
}

// --- Sound ---
function transmit(label: string, bytes: Uint8Array, delayMs = 0) {
  log(`Sound out${delayMs ? ` in ${delayMs} ms` : ''}: ${label}, ${bytes.length} bytes`);
  return SonicAudio.transmit(Array.from(bytes), signalMode === 'max' ? PROTOCOL_MAX : PROTOCOL_AUDIBLE, VOLUME, delayMs).then(
    (played) => {
      log(`Played ${label}, ${seconds(played)} s`);
      return played;
    },
    (err) => {
      log(`SOUND OUT FAILED: ${label}: ${errorDetail(err)}`);
      throw err;
    },
  );
}

let lastTicketAt = 0;
let pendingCatch: { lootId: number; challenge: Uint8Array } | null = null;

function onMessage(raw: number[], heardAt: number) {
  const bytes = Uint8Array.from(raw);
  if (bytes.length === 5 && bytes[0] === 0x53 && bytes[1] === 0x4f && bytes[2] === 0x4e) return log('Sound in: test chirp');

  const msg = decodeHeistMessage(bytes);
  if (!msg) return log(`Sound in: unreadable, ${bytes.length} bytes, starts ${bytesToHex(bytes.slice(0, 4))}`);
  log(`Sound in: ${MessageType[msg.type]}, ${bytes.length} bytes, reached JS after ${Date.now() - heardAt} ms`);
  const ignore = (reason: string) => log(`Ignored ${MessageType[msg.type]}: ${reason}`);

  const current = state;
  const heist = current.heist;
  const myAddress = current.walletAddress;
  if (!myAddress || !privateKey) return ignore('wallet not ready');
  const myUid = uidOf(myAddress);
  const key = privateKey;

  switch (msg.type) {
    case MessageType.PING: {
      const m = msg as PingMessage;
      if (m.scannerUid === myUid) return ignore('my own ping');
      const runningAsThief = heist?.role === 'thief' && (heist.phase === 'headstart' || heist.phase === 'hunted');
      if (!runningAsThief && (!current.patrol || current.shield)) return ignore(current.shield ? 'shield is on' : 'patrol is off');
      if (m.targetUid !== 0 && m.targetUid !== myUid && !runningAsThief) return ignore(`for ${uidHex(m.targetUid)}, not me`);
      // Random slot so phones answering a broadcast don't talk over each other.
      const delay = m.targetUid === 0 ? 250 + Math.floor(Math.random() * PONG_SLOTS) * PONG_SLOT_MS : 250;
      transmit('PONG', encodePong({ responderUid: myUid, echoNonce: m.nonce }), delay).catch(() => {});
      return;
    }

    case MessageType.PONG: {
      const m = msg as PongMessage;
      if (m.responderUid === myUid) return ignore('my own echo');
      log(`Found ${getPlayerName(m.responderUid)} (${uidHex(m.responderUid)})`);
      Vibration.vibrate(BUZZ_FOUND);
      send({ type: 'discoveredPlayer', player: playerFromUid(m.responderUid) });
      if (heist?.role === 'victim' && m.responderUid === heist.rival.uid && (heist.phase === 'hunting' || heist.phase === 'handshake')) {
        Vibration.vibrate(BUZZ_IN_RANGE);
        send({ type: 'thiefInRange', signal: 1 });
      }
      return;
    }

    case MessageType.LOOT_REQ: {
      const m = msg as LootReqMessage;
      // Auto-sign policy (README 9.4). Sound is unauthenticated, so stay silent unless all of this holds; the contract re-checks the rest.
      const refusal =
        m.victimUid !== myUid ? `for ${uidHex(m.victimUid)}, not me`
        : !current.patrol ? 'patrol is off'
        : current.shield ? 'shield is on'
        : heist ? 'already in a heist'
        : Date.now() < current.immuneUntil ? `immune for ${Math.ceil((current.immuneUntil - Date.now()) / 1000)} s`
        : current.stake < MIN_SIGN_STAKE ? `stake ${current.stake} ETH is under ${MIN_SIGN_STAKE}`
        : Date.now() - lastTicketAt < TICKET_GAP_MS ? `already signed a ticket ${Math.round((Date.now() - lastTicketAt) / 1000)} s ago`
        : null;
      if (refusal) return ignore(refusal);
      lastTicketAt = Date.now();
      log(`Signing a ticket for thief ${m.thiefAddress}`);

      const nonce = randomBigUint64();
      // shortcut: uses this phone's clock, not the chain's. 90 s hides normal drift; read the latest block if tickets expire early.
      const validBefore = Math.floor(Date.now() / 1000) + 90;
      signLootTicket(key, m.thiefAddress, nonce, validBefore)
        .then((signature) => transmit('TICKET', encodeTicket({ thiefUid: uidOf(m.thiefAddress), nonce, validBefore, signature })))
        .catch((err) => log(`Ticket failed: ${errorDetail(err)}`));
      return;
    }

    case MessageType.TICKET: {
      const m = msg as TicketMessage;
      if (m.thiefUid !== myUid) return ignore(`for ${uidHex(m.thiefUid)}, not me`);
      if (heist?.phase !== 'ticket') return ignore(`not waiting for one (phase: ${heist?.phase ?? 'no heist'})`);
      log(`Ticket valid for ${m.validBefore - Math.floor(Date.now() / 1000)} s, starting the loot`);
      send({ type: 'ticketReceived' });
      startLootOnChain(key, m.nonce, m.validBefore, m.signature)
        .then((loot) => {
          log(`Loot #${loot.lootId} started: ${loot.amount} ETH from ${loot.victim}, bond ${loot.bond} ETH`);
          send(lootAction('thief', loot));
          refreshBalancesSoon();
        })
        .catch((err) => {
          log(`startLoot failed: ${errorDetail(err)}`);
          send({ type: 'lootFailed', message: `Loot failed: ${chainError(err)}` });
        });
      return;
    }

    case MessageType.CATCH: {
      const m = msg as CatchMessage;
      if (heist?.role !== 'thief') return ignore('not running as a thief');
      if (heist.lootId !== m.lootId || !heist.rivalAddress) return ignore(`for loot #${m.lootId}, mine is #${heist.lootId}`);
      if (!heist.deadline || Date.now() >= heist.deadline) return ignore('the deadline has passed');
      const victim = heist.rivalAddress as `0x${string}`;
      recoverCatchSigner(m.lootId, m.challenge, m.signature)
        .then(async (signer) => {
          if (signer.toLowerCase() !== victim.toLowerCase()) return ignore(`signed by ${signer}, not my victim`);
          log('Victim proved the catch, signing CAUGHT');
          const signature = await signCaught(key, m.lootId, victim, m.challenge);
          await transmit('CAUGHT', encodeCaught({ lootId: m.lootId, challenge: m.challenge, signature }));
        })
        .catch((err) => log(`Catch reply failed: ${errorDetail(err)}`));
      return; // The Busted screen waits for the cancel to land on-chain (see syncLoot)
    }

    case MessageType.CAUGHT: {
      const m = msg as CaughtMessage;
      const pending = pendingCatch;
      if (!pending) return ignore('no catch in progress');
      if (pending.lootId !== m.lootId || bytesToHex(pending.challenge) !== bytesToHex(m.challenge)) return ignore('answers a different catch');
      log(`Thief answered, cancelling loot #${m.lootId}`);
      pendingCatch = null;
      cancelLootOnChain(key, m.lootId, m.challenge, m.signature)
        .then(() => {
          send({ type: 'caughtHandshake' });
          refreshBalancesSoon();
        })
        .catch((err) => {
          log(`cancel failed: ${errorDetail(err)}`);
          send({ type: 'lootFailed', message: `Catch failed: ${chainError(err)}` });
        });
      return;
    }
  }
}

// --- Chain sync ---
async function refreshBalances() {
  const address = state.walletAddress as `0x${string}` | undefined;
  if (!address) return;
  try {
    const res = await fetchOnChainBalances(address);
    if (res.stakeEth !== state.stake || res.walletEth !== state.wallet) log(`Chain: stake ${res.stakeEth} ETH, wallet ${res.walletEth} ETH`);
    send({ type: 'setBalances', wallet: res.walletEth, stake: res.stakeEth, immuneUntil: res.immuneUntilMs, readyAt: res.readyAtMs });
  } catch (err) {
    log(`Chain: balance read failed: ${errorDetail(err)}`);
  }
}

// Reads now, then again shortly after, so a change shows at once even if the first node is a block behind.
function refreshBalancesSoon() {
  nextBalanceSync = Date.now() + BALANCE_SYNC_MS;
  refreshBalances();
  BALANCE_FOLLOW_UPS_MS.forEach((ms) => setTimeout(refreshBalances, ms));
}

// The chain decides how a heist goes. This also tells a victim they were robbed, and restores a heist after a restart.
let lootSyncBusy = false;
async function syncLoot() {
  const address = state.walletAddress as `0x${string}` | undefined;
  if (!address || lootSyncBusy) return;
  lootSyncBusy = true;
  try {
    const h = state.heist;
    if (h?.lootId != null) {
      if (h.phase === 'caught' || h.phase === 'saved') return;
      const status = await fetchLootStatus(h.lootId);
      if (status === LOOT_CANCELLED || status === LOOT_CLAIMED) {
        log(`Chain: loot #${h.lootId} ${status === LOOT_CANCELLED ? 'cancelled' : 'claimed'}`);
        send({ type: 'lootResolved', status: status === LOOT_CANCELLED ? 'cancelled' : 'claimed', now: Date.now() });
        refreshBalancesSoon();
      }
    } else if (!h) {
      const { asThief, asVictim } = await fetchActiveLoots(address);
      if (state.heist) return;
      const now = Date.now();
      if (asThief) {
        log(`Chain: resuming loot #${asThief.lootId} as thief, ${asThief.amount} ETH`);
        send(lootAction('thief', asThief));
      // Stay quiet during the head start. Past the deadline there is nothing left to hunt.
      } else if (asVictim && now >= asVictim.revealAt && now < asVictim.deadline) {
        log(`Chain: robbed in loot #${asVictim.lootId}, ${asVictim.amount} ETH, ${Math.round((asVictim.deadline - now) / 1000)} s left`);
        send(lootAction('victim', asVictim));
        refreshBalancesSoon();
      }
    }
  } catch (err) {
    log(`Chain: loot sync failed: ${errorDetail(err)}`);
  } finally {
    lootSyncBusy = false;
  }
}

// --- Heartbeat: the service drives it in the background, because JavaScript timers can pause there ---
let lastTick = 0;
let lastServiceTick = 0;
let nextLootSync = 0;
let nextBalanceSync = 0;
let nextRobRetry = 0;

function tick(now: number) {
  if (now - lastTick < TICK_MS - 100) return;
  lastTick = now;
  send({ type: 'tick', now });
  if (now >= nextLootSync) {
    nextLootSync = now + LOOT_SYNC_MS;
    syncLoot();
  }
  if (now >= nextBalanceSync) {
    nextBalanceSync = now + BALANCE_SYNC_MS;
    refreshBalances();
  }
  if (now >= nextRobRetry) {
    nextRobRetry = now + ROB_RETRY_MS;
    flushRobs();
  }
}

// --- Actions for the screens ---
export function scan() {
  if (!state.micOk) return send({ type: 'go', view: 'setup' });
  const address = state.walletAddress;
  if (!address) return;
  send({ type: 'scan', now: Date.now() });
  transmit('PING (scan)', encodePing({ scannerUid: uidOf(address), targetUid: 0, nonce: Math.floor(Math.random() * 0xffff) })).catch(() => {});
}

export function robTarget(target: Player) {
  const address = state.walletAddress as `0x${string}` | undefined;
  if (!address) return;
  send({ type: 'rob', now: Date.now() });
  if (state.heist?.phase !== 'ticket') return;
  log(`Robbing ${target.name} (${uidHex(target.uid)})`);
  transmit('LOOT_REQ', encodeLootReq({ thiefAddress: address, victimUid: target.uid })).catch(() => {});
}

export async function pulseRadar() {
  const address = state.walletAddress;
  if (!address) return;
  send({ type: 'pulse' });
  await transmit('PING (radar)', encodePing({ scannerUid: uidOf(address), targetUid: state.heist?.rival.uid ?? 0, nonce: Math.floor(Math.random() * 0xffff) })).catch(() => {});
}

export async function catchThief() {
  const lootId = state.heist?.lootId;
  send({ type: 'cancel', now: Date.now() });
  if (lootId == null || !privateKey) return;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(8));
    pendingCatch = { lootId, challenge };
    const signature = await signCatch(privateKey, lootId, challenge);
    await transmit('CATCH', encodeCatch({ lootId, challenge, signature }));
  } catch (err) {
    log(`Catch failed: ${errorDetail(err)}`);
    send({ type: 'lootFailed', message: `Catch failed: ${chainError(err)}` });
  }
}

export async function claimLoot() {
  const lootId = state.heist?.lootId;
  if (lootId == null || !privateKey) return send({ type: 'claim' });
  try {
    await claimLootOnChain(privateKey, lootId);
    send({ type: 'claim' });
    refreshBalancesSoon();
  } catch (err) {
    log(`claim failed: ${errorDetail(err)}`);
    send({ type: 'lootFailed', message: `Claim failed: ${chainError(err)}` });
  }
}

export async function deposit(amountEth: number) {
  if (!privateKey) return;
  send({ type: 'clearNotice' });
  try {
    await depositToVault(privateKey, amountEth);
    refreshBalancesSoon();
  } catch (err) {
    log(`deposit failed: ${errorDetail(err)}`);
    send({ type: 'lootFailed', message: `Stake failed: ${chainError(err)}` });
  }
}

export async function clearTimer(timer: 'immunity' | 'cooldown') {
  if (!privateKey) return;
  try {
    await clearTimerOnChain(privateKey, timer);
    send({ type: 'timerCleared', timer });
    refreshBalancesSoon();
  } catch (err) {
    log(`clear ${timer} failed: ${errorDetail(err)}`);
    send({ type: 'lootFailed', message: `Could not remove it: ${chainError(err)}` });
  }
}

export async function withdraw(amountEth: number) {
  if (!privateKey) return;
  try {
    await withdrawFromVault(privateKey, amountEth);
    refreshBalancesSoon();
  } catch (err) {
    log(`withdraw failed: ${errorDetail(err)}`);
    const reason = chainError(err);
    send({ type: 'lootFailed', message: reason === 'GameIsActive' ? 'Stakes are locked while the game is on.' : `Withdraw failed: ${reason}` });
  }
}

export async function allowMic() {
  if (Platform.OS !== 'android') return;
  const mic = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone for patrol',
    message: 'While patrol is on, including when your phone is locked, the app listens for game signals. A notification stays up the whole time, audio stays on this phone and nothing is recorded.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  if (Platform.Version >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  if (mic === PermissionsAndroid.RESULTS.GRANTED) send({ type: 'micOk' });
  else send({ type: 'lootFailed', message: 'Patrol needs the microphone. You can allow it in Android settings.' });
}

export async function soundCheck() {
  const native = SonicAudio.selfTest();
  log(`Sound library self-test: ${native}`);
  if (native !== 'passed') {
    send({ type: 'lootFailed', message: 'This phone could not create the signal.' });
    return false;
  }
  try {
    await transmit('test chirp', Uint8Array.from([0x53, 0x4f, 0x4e, 0x49, 0x43]));
    send({ type: 'soundOk' });
    return true;
  } catch (err) {
    send({ type: 'lootFailed', message: `Sound check failed: ${chainError(err)}` });
    return false;
  }
}

export const saveWinsNow = flushRobs;
export const batteryUnrestricted = () => SonicAudio.isBatteryUnrestricted();
export const openBatterySettings = () => SonicAudio.openBatterySettings();

// --- Leaderboard: saved first, so a win still counts if the network is down ---
function pendingRobs(): number[] {
  try {
    return JSON.parse(SonicAudio.getPref(PENDING_ROBS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function queueRob(lootId: number) {
  SonicAudio.setPref(PENDING_ROBS_KEY, JSON.stringify([...new Set([...pendingRobs(), lootId])]));
  nextRobRetry = 0;
}

let flushingRobs = false;
async function flushRobs() {
  if (flushingRobs || !sessionToken) return;
  flushingRobs = true;
  try {
    for (const lootId of pendingRobs()) {
      await recordRob(sessionToken, lootId);
      SonicAudio.setPref(PENDING_ROBS_KEY, JSON.stringify(pendingRobs().filter((id) => id !== lootId)));
    }
  } catch (err) {
    log(`Leaderboard update failed: ${errorDetail(err)}`);
  } finally {
    flushingRobs = false;
  }
}

// --- Accounts ---
// Reuses a wallet already on this phone, so upgrading from a version without accounts keeps its funds.
async function localWalletKey(): Promise<`0x${string}`> {
  const saved = await SecureStore.getItemAsync(KEY_NAME);
  if (saved) return saved as `0x${string}`;
  const created = generatePrivateKey();
  await SecureStore.setItemAsync(KEY_NAME, created);
  log('Created a new wallet on this phone');
  return created;
}

async function startSession(username: string, token: string, key: `0x${string}`, thefts?: number) {
  sessionToken = token;
  privateKey = key;
  const address = privateKeyToAccount(key).address;
  send({ type: 'setUser', name: username, walletAddress: address, thefts });
  log(`Wallet ${address}, uid ${uidHex(uidOf(address))}`);

  // Proves signing works on this phone's JavaScript engine before a heist depends on it.
  const challenge = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const signer = await recoverCatchSigner(1, challenge, await signCatch(key, 1, challenge));
  log(`Signing self-test: ${signer.toLowerCase() === address.toLowerCase() ? 'passed' : 'FAILED'}`);

  // The mic permission can be withdrawn in Android settings while the app is closed.
  if (Platform.OS === 'android' && state.micOk && !(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO))) {
    state = { ...state, micOk: false, view: 'setup' };
    listeners.forEach((listener) => listener());
  }
  syncMic();
  refreshBalancesSoon();
}

async function saveSession(username: string, token: string) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ username, token }));
}

export async function signUpAccount(username: string, password: string) {
  const key = await localWalletKey();
  const session = await signUp(username, password, key, privateKeyToAccount(key).address);
  await saveSession(session.username, session.token);
  await startSession(session.username, session.token, key, 0);
}

export async function logInAccount(username: string, password: string) {
  const session = await logIn(username, password);
  await SecureStore.setItemAsync(KEY_NAME, session.privateKey);
  await saveSession(session.username, session.token);
  await startSession(session.username, session.token, session.privateKey, session.robs);
}

export async function logOut() {
  if (SonicAudio.isPatrolling()) SonicAudio.stopPatrol();
  privateKey = null;
  sessionToken = null;
  pendingCatch = null;
  // The wallet stays recoverable: its encrypted copy is on the account.
  await SecureStore.deleteItemAsync(KEY_NAME);
  await SecureStore.deleteItemAsync(SESSION_KEY);
  send({ type: 'loggedOut' });
}

// --- Startup ---

let booted = false;
export async function boot() {
  if (booted) return;
  booted = true;
  setSoundOn(state.soundOn && foreground());

  setChainLogger((_, text) => log(text));
  SonicAudio.addListener('onMessage', ({ bytes, heardAt }) => onMessage(bytes, heardAt));
  SonicAudio.addListener('onTick', ({ now }) => {
    const gap = lastServiceTick ? now - lastServiceTick : 0;
    if (gap > STALL_WARNING_MS) log(`JS HEARTBEAT GAP of ${seconds(gap)} s`);
    lastServiceTick = now;
    runDueTimers(now);
    tick(now);
  });
  setInterval(() => tick(Date.now()), TICK_MS);
  AppState.addEventListener('change', (next) => {
    log(`App is now ${next}`);
    setSoundOn(state.soundOn && next === 'active');
    lastServiceTick = 0;
    if (next === 'active') {
      syncMic();
      refreshBalances();
    }
  });

  try {
    const saved = await SecureStore.getItemAsync(SESSION_KEY);
    const key = await SecureStore.getItemAsync(KEY_NAME);
    if (saved && key) {
      const { username, token } = JSON.parse(saved);
      await startSession(username, token, key as `0x${string}`);
    } else {
      send({ type: 'loggedOut' });
    }
  } catch (err) {
    log(`WALLET FAILED: ${errorDetail(err)}`);
    send({ type: 'loggedOut' });
    send({ type: 'lootFailed', message: 'Could not open your saved account. Please log in again.' });
  }
}
