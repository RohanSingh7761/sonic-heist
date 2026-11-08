// Mock game state for the new UI. Pure on purpose: no timers, randomness or DOM, so the rules can be
// tested and the real chain and sound events can later feed in through the same actions.

export type AvatarId = 'juno' | 'rocco' | 'nib';
export type Level = 1 | 2 | 3;
export type View = 'title' | 'pick' | 'setup' | 'round' | 'table' | 'scan' | 'levels' | 'log' | 'settings';
export type ThiefPhase = 'ticket' | 'grab' | 'disguise' | 'headstart' | 'hunted' | 'won' | 'caught';
export type VictimPhase = 'alarm' | 'alert' | 'hunting' | 'handshake' | 'saved' | 'lost';
export type Phase = ThiefPhase | VictimPhase;

export interface Player {
  uid: number;
  name: string;
  avatar: AvatarId;
  level: Level;
  signal: number; // closeness, 0 to 1
  vault: number; // only used for the mock maths, never shown: picking a victim is a blind gamble
}

export interface Heist {
  role: 'thief' | 'victim';
  phase: Phase;
  rival: Player;
  amount: number;
  bond: number;
  phaseEnds: number | null;
  deadline: number | null;
  pulses: number;
  signal: number;
  inRange: boolean;
  // Set once the loot exists on-chain. Demo heists have none of these.
  lootId?: number;
  rivalAddress?: string;
  revealAt?: number;
}

export interface LogEntry {
  id: number;
  at: number;
  kind: 'good' | 'bad' | 'info';
  text: string;
  count?: number; // How many times in a row this line happened
}

export interface GameState {
  view: View;
  avatar: AvatarId;
  name: string;
  walletAddress?: string;
  privateKey?: string;
  stake: number;
  wallet: number;
  thefts: number;
  saves: number;
  losses: number;
  micOk: boolean;
  soundOk: boolean;
  soundOn: boolean;
  patrol: boolean;
  shield: boolean;
  roundActive: boolean;
  immuneUntil: number;
  readyAt: number;
  scanEnds: number | null;
  nearby: Player[];
  target: number | null;
  heist: Heist | null;
  levelUpTo: Level | null;
  notice: string | null;
  noticeGood: boolean;
  alarm: { ends: number } | null; // someone else's stake was stolen: everyone runs, so the thief doesn't stand out
  log: LogEntry[];
  logSeq: number;
}

export const HEAD_START = 10_000;
export const HUNT_WINDOW = 60_000;
export const IMMUNITY = 300_000;
export const COOLDOWN = 120_000;
export const BOND_RATE = 0.2;
export const MIN_LOOT = 0.001;
// The last reply slot ends about 9 s after the tap: PING 1.45 s, then up to 6.25 s of waiting, then PONG 1.32 s.
export const SCAN_TIME = 10_000;
// Signed messages take about 5 s to play over ultrasound, and each of these timers covers two of them.
export const TICKET_TIME = 15_000;
export const DISGUISE_TIME = 1_600;
export const HANDSHAKE_TIME = 20_000;
export const ALERT_TIME = 4_000;
export const PULSES_TO_FIND = 1; // Immediate detection upon acoustic radar pulse

// shortcut: placeholder thresholds, set the real numbers once the team decides them.
export const LEVEL_AT: Record<Level, number> = { 1: 0, 2: 3, 3: 8 };
export const levelFor = (wins: number): Level => (wins >= LEVEL_AT[3] ? 3 : wins >= LEVEL_AT[2] ? 2 : 1);

export const MOCK_PLAYERS: Player[] = [
  { uid: 0x1a7f, name: 'Swift Fox 1A7F', avatar: 'nib', level: 1, signal: 0.35, vault: 0.3 },
  { uid: 0x52c1, name: 'Quiet Owl 52C1', avatar: 'juno', level: 3, signal: 0.9, vault: 0.6 },
  { uid: 0x8e04, name: 'Lucky Moth 8E04', avatar: 'nib', level: 3, signal: 0.6, vault: 0.45 },
  { uid: 0xb3d9, name: 'Sly Newt B3D9', avatar: 'juno', level: 2, signal: 0.15, vault: 0.2 },
];

export const LOG_KEY = 'sonic_heist_log';
const LOG_LIMIT = 300;

function savedLog(): LogEntry[] {
  try {
    const saved = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') : [];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export const initialState = (name: string): GameState => {
  const entries = savedLog();
  const micOk = typeof window !== 'undefined' && localStorage.getItem('sonic_mic_ok') === 'true';
  const soundOk = typeof window !== 'undefined' && localStorage.getItem('sonic_sound_ok') === 'true';
  return {
    view: 'title', // Title's Start button routes to setup or table from micOk/soundOk.
    avatar: 'rocco',
    name,
    stake: 0,
    wallet: 0.3,
    thefts: 0,
    saves: 0,
    losses: 0,
    micOk,
    soundOk,
    soundOn: true,
    patrol: true,
    shield: false,
    roundActive: true,
    immuneUntil: 0,
    readyAt: 0,
    scanEnds: null,
    nearby: [],
    target: null,
    heist: null,
    levelUpTo: null,
    notice: null,
    noticeGood: false,
    alarm: null,
    log: entries,
    logSeq: entries[0]?.id ?? 0,
  };
};

export type Action =
  | { type: 'go'; view: View }
  | { type: 'pickAvatar'; avatar: AvatarId }
  | { type: 'micOk' }
  | { type: 'soundOk' }
  | { type: 'toggle'; key: 'patrol' | 'shield' | 'soundOn' }
  | { type: 'deposit'; amount: number }
  | { type: 'withdraw'; amount: number }
  | { type: 'scan'; now: number }
  | { type: 'target'; uid: number }
  | { type: 'discoveredPlayer'; player: Player }
  | { type: 'ticketReceived' }
  | { type: 'thiefInRange'; signal: number }
  | { type: 'caughtHandshake' }
  | { type: 'rob'; now: number }
  | { type: 'lootOnChain'; now: number; role: 'thief' | 'victim'; rival: Player; rivalAddress: string; loot: { lootId: number; amount: number; bond: number; revealAt: number; deadline: number } }
  | { type: 'lootFailed'; message: string }
  | { type: 'lootResolved'; status: 'cancelled' | 'claimed'; now: number }
  | { type: 'incoming'; now: number; rival: Player; lootRate: number }
  | { type: 'alarm'; now: number }
  | { type: 'allClear'; now: number; caught: boolean }
  | { type: 'hunt' }
  | { type: 'pulse' }
  | { type: 'cancel'; now: number }
  | { type: 'victimFoundMe'; now: number }
  | { type: 'claim' }
  | { type: 'dismiss' }
  | { type: 'clearNotice' }
  | { type: 'clearLevelUp' }
  | { type: 'setBalances'; wallet: number; stake: number; immuneUntil: number; readyAt: number }
  | { type: 'setUser'; name: string; walletAddress: string; privateKey: string }
  | { type: 'addWin' }
  | { type: 'setStats'; thefts: number; saves: number; losses: number }
  | { type: 'logEvent'; kind: LogEntry['kind']; text: string; at: number }
  | { type: 'clearLog' }
  | { type: 'tick'; now: number }
  | { type: 'skip'; now: number }
  | { type: 'reset'; name: string };

const eth = (n: number) => `${n.toFixed(4)} ETH`;

function log(s: GameState, kind: LogEntry['kind'], text: string, at: number): GameState {
  const [latest, ...rest] = s.log;
  // A repeating failure, like a dropped network, counts up instead of pushing everything else out.
  if (latest?.text === text) return { ...s, log: [{ ...latest, at, count: (latest.count ?? 1) + 1 }, ...rest] };
  const id = s.logSeq + 1;
  return { ...s, logSeq: id, log: [{ id, at, kind, text }, ...s.log].slice(0, LOG_LIMIT) };
}

// Applies one win and flags a level-up if it crossed a threshold.
function addWin(s: GameState, key: 'thefts' | 'saves'): GameState {
  const before = levelFor(s.thefts + s.saves);
  const next = { ...s, [key]: s[key] + 1 };
  const after = levelFor(next.thefts + next.saves);
  return after > before ? { ...next, levelUpTo: after } : next;
}

// Moves a heist forward when its phase timer has run out. `at` is when the phase ended, not when we noticed.
function step(s: GameState, h: Heist, at: number): GameState {
  const set = (patch: Partial<Heist>) => ({ ...s, heist: { ...h, ...patch } });
  switch (h.phase) {
    case 'ticket':
      return log({ ...s, heist: null, notice: `${h.rival.name} didn't answer. Get closer and try again.` }, 'info', `No ticket from ${h.rival.name}`, at);
    case 'disguise':
      return set({ phase: 'headstart', phaseEnds: h.revealAt ?? at + HEAD_START, deadline: h.deadline ?? at + HEAD_START + HUNT_WINDOW });
    case 'headstart':
      return set({ phase: 'hunted', phaseEnds: h.deadline });
    case 'hunted':
      return set({ phase: 'won', phaseEnds: null });
    case 'alarm':
      // The reveal: until now the victim's phone looked like everyone else's, so the stake only drops here.
      return log({ ...s, stake: s.stake - h.amount, heist: { ...h, phase: 'alert', phaseEnds: at + ALERT_TIME } }, 'bad', `${h.rival.name} robbed you of ${eth(h.amount)}`, at);
    case 'alert':
      return set({ phase: 'hunting', phaseEnds: h.deadline });
    case 'handshake':
      // A real catch only ends when the cancel lands on-chain, so running out of time here just allows another try.
      if (h.lootId != null) return { ...s, notice: 'No answer from the thief. Stay close and try again.', heist: { ...h, phase: 'hunting', phaseEnds: h.deadline } };
      // The handshake only counts if it finished before the deadline.
      if (at < (h.deadline ?? 0)) {
        const saved = { ...s, stake: s.stake + h.amount + h.bond, immuneUntil: at + IMMUNITY, heist: { ...h, phase: 'saved' as const, phaseEnds: null } };
        return log(addWin(saved, 'saves'), 'good', `Caught ${h.rival.name}: recovered ${eth(h.amount)} and won their ${eth(h.bond)} bond`, at);
      }
      return lost(s, h);
    case 'hunting':
      return lost(s, h);
    default:
      return s;
  }
}

function lost(s: GameState, h: Heist): GameState {
  const at = h.deadline ?? 0;
  return log({ ...s, losses: s.losses + 1, immuneUntil: at + IMMUNITY, heist: { ...h, phase: 'lost', phaseEnds: null } }, 'bad', `${h.rival.name} got away with ${eth(h.amount)}`, at);
}

function endAlarm(s: GameState, caught: boolean, at: number): GameState {
  const text = caught ? 'All clear. The thief was caught.' : 'All clear. The thief got away.';
  return log({ ...s, alarm: null, notice: text, noticeGood: true }, 'info', text, at);
}

function advance(s: GameState, now: number): GameState {
  let next = s;
  if (next.alarm && now >= next.alarm.ends) next = endAlarm(next, false, next.alarm.ends);
  if (next.scanEnds !== null && now >= next.scanEnds) {
    const players = next.nearby;
    next = { ...next, scanEnds: null, nearby: players };
  }
  for (let i = 0; i < 8; i++) {
    const h = next.heist;
    if (!h || h.phaseEnds === null || now < h.phaseEnds) break;
    next = step(next, h, h.phaseEnds);
  }
  return next;
}

export function reduce(s: GameState, a: Action): GameState {
  const h = s.heist;
  switch (a.type) {
    case 'go':
      return { ...s, view: a.view };
    case 'pickAvatar':
      return { ...s, avatar: a.avatar };
    case 'micOk':
      if (typeof window !== 'undefined') localStorage.setItem('sonic_mic_ok', 'true');
      return { ...s, micOk: true };
    case 'soundOk':
      if (typeof window !== 'undefined') localStorage.setItem('sonic_sound_ok', 'true');
      return { ...s, soundOk: true };
    case 'toggle':
      return { ...s, [a.key]: !s[a.key] };
    case 'deposit':
      if (a.amount > s.wallet) return { ...s, notice: 'Not enough ETH in your wallet.' };
      return log({ ...s, wallet: s.wallet - a.amount, stake: s.stake + a.amount }, 'info', `Staked ${eth(a.amount)}`, 0);
    case 'withdraw':
      if (s.roundActive) return { ...s, notice: 'Stakes are locked until the round ends.' };
      if (h) return { ...s, notice: 'Finish the heist first.' };
      if (a.amount > s.stake) return { ...s, notice: 'Not that much in your stake.' };
      return log({ ...s, wallet: s.wallet + a.amount, stake: s.stake - a.amount }, 'info', `Withdrew ${eth(a.amount)}`, 0);
    case 'scan':
      return { ...s, view: 'scan', scanEnds: a.now + SCAN_TIME, nearby: [], target: null };
    case 'discoveredPlayer': {
      const exists = s.nearby.find((p) => p.uid === a.player.uid);
      if (exists) return s;
      return { ...s, nearby: [...s.nearby, a.player] };
    }
    case 'thiefInRange': {
      if (!h || h.role !== 'victim') return s;
      return { ...s, heist: { ...h, signal: a.signal, inRange: true } };
    }
    case 'ticketReceived': {
      if (!h || h.role !== 'thief' || h.phase !== 'ticket') return s;
      return { ...s, heist: { ...h, phase: 'grab', phaseEnds: null } }; // Waits here until startLoot lands
    }
    case 'lootOnChain': {
      const { loot, rival, rivalAddress, now } = a;
      const onChain = { rival, rivalAddress, lootId: loot.lootId, amount: loot.amount, bond: loot.bond, revealAt: loot.revealAt, deadline: loot.deadline, pulses: 0, signal: 0, inRange: false };
      if (a.role === 'victim') {
        if (h) return s;
        return log({ ...s, heist: { ...onChain, role: 'victim', phase: 'alert', phaseEnds: now + 4_000 } }, 'bad', `${rival.name} robbed you of ${eth(loot.amount)}`, now);
      }
      if (h) {
        if (h.phase !== 'grab') return s;
        return log({ ...s, heist: { ...onChain, role: 'thief', phase: 'disguise', phaseEnds: now + DISGUISE_TIME } }, 'info', `Looting ${rival.name}: ${eth(loot.amount)}, bond ${eth(loot.bond)}`, now);
      }
      // No heist on this phone but one on-chain: the page was refreshed, so pick up where the chain says we are.
      const resumed: Pick<Heist, 'phase' | 'phaseEnds'> = now < loot.revealAt ? { phase: 'headstart', phaseEnds: loot.revealAt } : now < loot.deadline ? { phase: 'hunted', phaseEnds: loot.deadline } : { phase: 'won', phaseEnds: null };
      return { ...s, heist: { ...onChain, role: 'thief', ...resumed } };
    }
    case 'lootFailed':
      if (h?.phase === 'grab') return { ...s, heist: null, notice: a.message };
      if (h?.phase === 'handshake') return { ...s, notice: a.message, heist: { ...h, phase: 'hunting', phaseEnds: h.deadline } };
      return { ...s, notice: a.message };
    case 'lootResolved': {
      if (!h) return s;
      if (h.role === 'thief') {
        if (h.phase === 'caught') return s;
        return reduce(a.status === 'cancelled' ? s : { ...s, heist: { ...h, phase: 'won' } }, a.status === 'cancelled' ? { type: 'victimFoundMe', now: a.now } : { type: 'claim' });
      }
      if (a.status === 'cancelled') return reduce(s, { type: 'caughtHandshake' });
      return h.phase === 'lost' || h.phase === 'saved' ? s : lost(s, h);
    }
    case 'caughtHandshake': {
      if (!h || h.role !== 'victim' || h.phase === 'saved') return s;
      const at = Date.now();
      const saved = { ...s, stake: s.stake + h.amount + h.bond, immuneUntil: at + IMMUNITY, heist: { ...h, phase: 'saved' as const, phaseEnds: null } };
      return log(addWin(saved, 'saves'), 'good', `Caught ${h.rival.name}: recovered ${eth(h.amount)} and won their ${eth(h.bond)} bond`, at);
    }
    case 'target':
      return { ...s, target: a.uid };
    case 'rob': {
      const rival = s.nearby.find((p) => p.uid === s.target);
      if (!rival || h || s.alarm) return s;
      if (a.now < s.readyAt) return { ...s, notice: 'Still on cooldown.' };
      // The contract picks the amount when the loot starts.
      return {
        ...s,
        view: 'table',
        heist: { role: 'thief', phase: 'ticket', rival, amount: 0, bond: 0, phaseEnds: a.now + TICKET_TIME, deadline: null, pulses: 0, signal: 0, inRange: false },
      };
    }
    case 'incoming': {
      if (h || s.alarm) return { ...s, notice: 'Already in a heist.' };
      if (!s.patrol || s.shield) return { ...s, notice: 'Patrol must be on and shield off to be robbed.' };
      if (a.now < s.immuneUntil) return { ...s, notice: 'You are immune right now.' };
      const amount = s.stake * a.lootRate;
      if (amount < MIN_LOOT) return { ...s, notice: 'Your stake is too small to loot.' };
      return {
        ...s,
        heist: { role: 'victim', phase: 'alarm', rival: a.rival, amount, bond: amount * BOND_RATE, phaseEnds: a.now + HEAD_START, deadline: a.now + HEAD_START + HUNT_WINDOW, pulses: 0, signal: 0, inRange: false },
      };
    }
    case 'alarm':
      return h || s.alarm ? s : { ...s, alarm: { ends: a.now + HEAD_START + HUNT_WINDOW } };
    case 'allClear':
      return s.alarm ? endAlarm(s, a.caught, a.now) : s;
    case 'hunt':
      return h?.phase === 'alert' ? { ...s, heist: { ...h, phase: 'hunting', phaseEnds: h.deadline } } : s;
    case 'pulse': {
      if (h?.phase !== 'hunting') return s;
      const pulses = h.pulses + 1;
      return { ...s, heist: { ...h, pulses, signal: 0, inRange: false } };
    }
    case 'cancel':
      if (h?.phase !== 'hunting' || !h.inRange) return s;
      return { ...s, heist: { ...h, phase: 'handshake', phaseEnds: a.now + HANDSHAKE_TIME } };
    case 'victimFoundMe':
      if (!h || h.role !== 'thief' || h.phase === 'caught') return s;
      return log({ ...s, losses: s.losses + 1, readyAt: a.now + COOLDOWN, heist: { ...h, phase: 'caught', phaseEnds: null } }, 'bad', `${h.rival.name} caught you. Bond of ${eth(h.bond)} lost`, a.now);
    case 'claim': {
      if (h?.phase !== 'won') return s;
      const claimed = { ...s, stake: s.stake + h.amount + h.bond, readyAt: (h.deadline ?? 0) + COOLDOWN, heist: null };
      return log(addWin(claimed, 'thefts'), 'good', `Stole ${eth(h.amount)} from ${h.rival.name}`, h.deadline ?? 0);
    }
    case 'dismiss':
      return h && (h.phase === 'caught' || h.phase === 'saved' || h.phase === 'lost') ? { ...s, heist: null } : s;
    case 'clearNotice':
      return { ...s, notice: null, noticeGood: false };
    case 'clearLevelUp':
      return { ...s, levelUpTo: null };
    case 'setBalances':
      // Max, because the chain only records these once a loot is cancelled or claimed, which can be after this phone's timer started.
      return { ...s, wallet: a.wallet, stake: a.stake, immuneUntil: Math.max(s.immuneUntil, a.immuneUntil), readyAt: Math.max(s.readyAt, a.readyAt) };
    case 'setUser':
      return { ...s, name: a.name, walletAddress: a.walletAddress, privateKey: a.privateKey };
    case 'addWin':
      return addWin(s, 'thefts');
    case 'setStats':
      return { ...s, thefts: a.thefts, saves: a.saves, losses: a.losses };
    case 'logEvent':
      return log(s, a.kind, a.text, a.at);
    case 'clearLog':
      return { ...s, log: [] };
    case 'tick':
      return advance(s, a.now);
    case 'skip':
      // Demo control: jump to the end of the current timer.
      if (s.alarm) return advance({ ...s, alarm: { ends: a.now } }, a.now);
      if (s.scanEnds !== null) return advance(s, s.scanEnds);
      if (h?.phaseEnds == null) return s;
      {
        // The deadline counts on from these phases, so it must move forward with the skip.
        const shiftsDeadline = h.deadline !== null && (h.phase === 'alarm' || h.phase === 'headstart' || h.phase === 'hunted' || h.phase === 'hunting');
        const skipped = h.phaseEnds - a.now;
        return advance({ ...s, heist: { ...h, phaseEnds: a.now, deadline: shiftsDeadline ? (h.deadline as number) - skipped : h.deadline } }, a.now);
      }
    case 'reset':
      return initialState(a.name);
  }
}
