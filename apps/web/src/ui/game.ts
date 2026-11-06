// Mock game state for the new UI. Pure on purpose: no timers, randomness or DOM, so the rules can be
// tested and the real chain and sound events can later feed in through the same actions.

export type AvatarId = 'juno' | 'rocco' | 'nib';
export type Level = 1 | 2 | 3;
export type View = 'title' | 'pick' | 'setup' | 'round' | 'table' | 'scan' | 'levels' | 'log' | 'settings';
export type ThiefPhase = 'ticket' | 'grab' | 'disguise' | 'headstart' | 'hunted' | 'won' | 'caught';
export type VictimPhase = 'alert' | 'hunting' | 'handshake' | 'saved' | 'lost';
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
}

export interface LogEntry {
  id: number;
  at: number;
  kind: 'good' | 'bad' | 'info';
  text: string;
}

export interface GameState {
  view: View;
  avatar: AvatarId;
  name: string;
  stake: number;
  wallet: number;
  thefts: number;
  saves: number;
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
  log: LogEntry[];
  logSeq: number;
}

export const HEAD_START = 10_000;
export const HUNT_WINDOW = 60_000;
export const IMMUNITY = 300_000;
export const COOLDOWN = 120_000;
export const BOND_RATE = 0.2;
export const MIN_LOOT = 0.001;
export const SCAN_TIME = 6_000;
export const TICKET_TIME = 3_500;
export const GRAB_TIME = 1_800;
export const DISGUISE_TIME = 1_600;
export const HANDSHAKE_TIME = 4_000;
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

export const initialState = (name: string): GameState => ({
  view: 'title',
  avatar: 'rocco',
  name,
  stake: 0,
  wallet: 0.3,
  thefts: 0,
  saves: 0,
  micOk: false,
  soundOk: false,
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
  log: [],
  logSeq: 0,
});

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
  | { type: 'rob'; now: number; lootRate: number }
  | { type: 'incoming'; now: number; rival: Player; lootRate: number }
  | { type: 'hunt' }
  | { type: 'pulse' }
  | { type: 'cancel'; now: number }
  | { type: 'victimFoundMe'; now: number }
  | { type: 'claim' }
  | { type: 'dismiss' }
  | { type: 'clearNotice' }
  | { type: 'clearLevelUp' }
  | { type: 'addWin' }
  | { type: 'tick'; now: number }
  | { type: 'skip'; now: number }
  | { type: 'reset'; name: string };

const eth = (n: number) => `${n.toFixed(4)} ETH`;

function log(s: GameState, kind: LogEntry['kind'], text: string, at: number): GameState {
  const id = s.logSeq + 1;
  return { ...s, logSeq: id, log: [{ id, at, kind, text }, ...s.log].slice(0, 50) };
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
      if (h.bond > s.stake) {
        return log({ ...s, heist: null, notice: `You need ${eth(h.bond)} staked to cover the bond.` }, 'bad', `Heist on ${h.rival.name} failed: stake too low for the bond`, at);
      }
      return log({ ...s, stake: s.stake - h.bond, heist: { ...h, phase: 'grab', phaseEnds: at + GRAB_TIME } }, 'info', `Looting ${h.rival.name}: ${eth(h.amount)}, bond ${eth(h.bond)}`, at);
    case 'grab':
      return set({ phase: 'disguise', phaseEnds: at + DISGUISE_TIME });
    case 'disguise':
      return set({ phase: 'headstart', phaseEnds: at + HEAD_START, deadline: at + HEAD_START + HUNT_WINDOW });
    case 'headstart':
      return set({ phase: 'hunted', phaseEnds: h.deadline });
    case 'hunted':
      return set({ phase: 'won', phaseEnds: null });
    case 'alert':
      return set({ phase: 'hunting', phaseEnds: h.deadline });
    case 'handshake':
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
  return log({ ...s, immuneUntil: at + IMMUNITY, heist: { ...h, phase: 'lost', phaseEnds: null } }, 'bad', `${h.rival.name} got away with ${eth(h.amount)}`, at);
}

function advance(s: GameState, now: number): GameState {
  let next = s;
  if (next.scanEnds !== null && now >= next.scanEnds) {
    const players = next.nearby.length > 0 ? next.nearby : MOCK_PLAYERS;
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
      return { ...s, micOk: true };
    case 'soundOk':
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
      return step(s, h, Date.now());
    }
    case 'caughtHandshake': {
      if (!h || h.role !== 'victim') return s;
      const at = Date.now();
      const saved = { ...s, stake: s.stake + h.amount + h.bond, immuneUntil: at + IMMUNITY, heist: { ...h, phase: 'saved' as const, phaseEnds: null } };
      return log(addWin(saved, 'saves'), 'good', `Caught ${h.rival.name}: recovered ${eth(h.amount)} and won their ${eth(h.bond)} bond`, at);
    }
    case 'target':
      return { ...s, target: a.uid };
    case 'rob': {
      const rival = s.nearby.find((p) => p.uid === s.target);
      if (!rival || h) return s;
      if (a.now < s.readyAt) return { ...s, notice: 'Still on cooldown.' };
      const amount = rival.vault * a.lootRate;
      if (amount < MIN_LOOT) return { ...s, notice: 'That vault is too small to loot.' };
      return {
        ...s,
        view: 'table',
        heist: { role: 'thief', phase: 'ticket', rival, amount, bond: amount * BOND_RATE, phaseEnds: a.now + TICKET_TIME, deadline: null, pulses: 0, signal: 0, inRange: false },
      };
    }
    case 'incoming': {
      if (h) return { ...s, notice: 'Already in a heist.' };
      if (!s.patrol || s.shield) return { ...s, notice: 'Patrol must be on and shield off to be robbed.' };
      if (a.now < s.immuneUntil) return { ...s, notice: 'You are immune right now.' };
      const amount = s.stake * a.lootRate;
      if (amount < MIN_LOOT) return { ...s, notice: 'Your stake is too small to loot.' };
      return log(
        {
          ...s,
          stake: s.stake - amount,
          heist: { role: 'victim', phase: 'alert', rival: a.rival, amount, bond: amount * BOND_RATE, phaseEnds: a.now + 4_000, deadline: a.now + HUNT_WINDOW, pulses: 0, signal: 0, inRange: false },
        },
        'bad',
        `${a.rival.name} robbed you of ${eth(amount)}`,
        a.now,
      );
    }
    case 'hunt':
      return h?.phase === 'alert' ? { ...s, heist: { ...h, phase: 'hunting', phaseEnds: h.deadline } } : s;
    case 'pulse': {
      if (h?.phase !== 'hunting') return s;
      const pulses = h.pulses + 1;
      return { ...s, heist: { ...h, pulses, signal: 1.0, inRange: true } };
    }
    case 'cancel':
      if (h?.phase !== 'hunting' || !h.inRange) return s;
      return { ...s, heist: { ...h, phase: 'handshake', phaseEnds: a.now + HANDSHAKE_TIME } };
    case 'victimFoundMe':
      if (!h || (h.phase !== 'headstart' && h.phase !== 'hunted')) return s;
      return log({ ...s, readyAt: a.now + COOLDOWN, heist: { ...h, phase: 'caught', phaseEnds: null } }, 'bad', `${h.rival.name} caught you. Bond of ${eth(h.bond)} lost`, a.now);
    case 'claim': {
      if (h?.phase !== 'won') return s;
      const claimed = { ...s, stake: s.stake + h.amount + h.bond, readyAt: (h.deadline ?? 0) + COOLDOWN, heist: null };
      return log(addWin(claimed, 'thefts'), 'good', `Stole ${eth(h.amount)} from ${h.rival.name}`, h.deadline ?? 0);
    }
    case 'dismiss':
      return h && (h.phase === 'caught' || h.phase === 'saved' || h.phase === 'lost') ? { ...s, heist: null } : s;
    case 'clearNotice':
      return { ...s, notice: null };
    case 'clearLevelUp':
      return { ...s, levelUpTo: null };
    case 'addWin':
      return addWin(s, 'thefts');
    case 'tick':
      return advance(s, a.now);
    case 'skip':
      // Demo control: jump to the end of the current timer.
      if (s.scanEnds !== null) return advance(s, s.scanEnds);
      if (h?.phaseEnds == null) return s;
      {
        // The deadline counts on from these phases, so it must move forward with the skip.
        const shiftsDeadline = h.deadline !== null && (h.phase === 'headstart' || h.phase === 'hunted' || h.phase === 'hunting');
        const skipped = h.phaseEnds - a.now;
        return advance({ ...s, heist: { ...h, phaseEnds: a.now, deadline: shiftsDeadline ? (h.deadline as number) - skipped : h.deadline } }, a.now);
      }
    case 'reset':
      return initialState(a.name);
  }
}
