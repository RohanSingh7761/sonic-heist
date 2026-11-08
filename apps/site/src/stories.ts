// What each phone on the page plays: the game's real rules, driven by scripted actions. Tested by stories.test.mjs.
import { BOND_RATE, DISGUISE_TIME, HEAD_START, HUNT_WINDOW, MOCK_PLAYERS, SCAN_TIME, initialState, reduce, type Action, type AvatarId, type GameState } from '../../web/src/ui/game.ts';

export type Step = [number, (now: number) => Action];
export interface Story { setup: (s: GameState, now: number) => GameState; steps: Step[]; end: number }

const apply = (s: GameState, ...actions: Action[]) => actions.reduce(reduce, s);
const QUIET_OWL = MOCK_PLAYERS[1];
const STAKE = 0.25;
const pick = (i: number): Action => ({ type: 'target', uid: MOCK_PLAYERS[i].uid });
const discover = (i: number): Action => ({ type: 'discoveredPlayer', player: MOCK_PLAYERS[i] });

// The real game waits on sound and the chain here. On the page these stand in for how long that takes.
const TICKET_WAIT = 1500; // The victim's signed ticket arrives over sound
const GRAB_WAIT = 1800; // startLoot lands on-chain
const SNEAK = TICKET_WAIT + GRAB_WAIT + DISGUISE_TIME;

const rob = (now: number): Action => ({ type: 'rob', now });
const ticket = (): Action => ({ type: 'ticketReceived' });
// What the contract reports once the loot starts: the head start and hunt window are counted from here.
const landed = (now: number): Action => {
  const amount = STAKE * 0.15;
  const revealAt = now + DISGUISE_TIME + HEAD_START;
  return { type: 'lootOnChain', now, role: 'thief', rival: QUIET_OWL, rivalAddress: '0x52c1000000000000000000000000000000000000', loot: { lootId: 1, amount, bond: amount * BOND_RATE, revealAt, deadline: revealAt + HUNT_WINDOW } };
};
const robFrom = (at: number): Step[] => [[at, rob], [at + TICKET_WAIT, ticket], [at + TICKET_WAIT + GRAB_WAIT, landed]];

const scanned = (s: GameState, now: number) => apply(s, { type: 'scan', now: now - SCAN_TIME - 1 }, ...MOCK_PLAYERS.map((_, i) => discover(i)), { type: 'tick', now }, { type: 'target', uid: QUIET_OWL.uid });
// A heist already running: starts it far enough back that the game's own timers land on the wanted phase.
const robbedAgo = (s: GameState, now: number, ago: number) => {
  const start = now - ago;
  return apply(scanned(s, start - 1), rob(start), ticket(), landed(start + TICKET_WAIT + GRAB_WAIT), { type: 'tick', now });
};

const incoming = (now: number): Action => ({ type: 'incoming', now, rival: QUIET_OWL, lootRate: 0.15 });
const inRange = (): Action => ({ type: 'thiefInRange', signal: 0.8 });
// Replies arrive one by one while the scan listens.
const replies = (from: number): Step[] => MOCK_PLAYERS.map((_, i) => [from + 1500 * (i + 1), () => discover(i)]);

export const STORIES: Record<string, Story> = {
  // Hero: replies arrive one by one, the thief weighs up each target, then goes for it.
  hero: {
    setup: (s, now) => apply(s, { type: 'scan', now }),
    steps: [
      ...replies(0),
      [SCAN_TIME + 1400, () => pick(2)],
      [SCAN_TIME + 2600, () => pick(0)],
      [SCAN_TIME + 3800, () => pick(1)],
      ...robFrom(SCAN_TIME + 5400),
    ],
    end: SCAN_TIME + 5400 + SNEAK + 2400,
  },
  scan: {
    setup: (s) => s,
    steps: [[1200, (now) => ({ type: 'scan', now })], ...replies(1200), [1200 + SCAN_TIME + 1000, () => pick(1)]],
    end: 1200 + SCAN_TIME + 3400,
  },
  rob: { setup: scanned, steps: robFrom(600), end: 600 + SNEAK + 600 },
  run: { setup: (s, now) => robbedAgo(s, now, SNEAK), steps: [], end: HEAD_START + 1500 },
  hunted: {
    setup: (s, now) => robbedAgo(s, now, SNEAK + HEAD_START),
    steps: [[6000, (now) => ({ type: 'victimFoundMe', now })]],
    end: 10000,
  },
  robbed: {
    // Robbed a head start ago, so the phone skips the quiet alarm and shows the alert at 500 ms.
    setup: (s, now) => apply(s, incoming(now - HEAD_START + 500)),
    steps: [[5500, () => ({ type: 'pulse' })], [6700, () => ({ type: 'pulse' })], [7900, () => ({ type: 'pulse' })], [8300, inRange]],
    end: 10000,
  },
  // The catch: the victim's cancel lands on-chain, which the real game reports as a finished handshake.
  saved: {
    setup: (s, now) => apply(s, incoming(now - HEAD_START - 4500), { type: 'tick', now }, { type: 'pulse' }, { type: 'pulse' }, { type: 'pulse' }, inRange()),
    steps: [[1600, (now) => ({ type: 'cancel', now })], [3600, () => ({ type: 'caughtHandshake' })]],
    end: 11000,
  },
  won: { setup: (s, now) => robbedAgo(s, now, SNEAK + HEAD_START + HUNT_WINDOW), steps: [], end: 0 },
};

export const base = (avatar: AvatarId): GameState => apply(initialState('Sly Fox 3F2A'), { type: 'go', view: 'table' }, { type: 'deposit', amount: STAKE }, { type: 'toggle', key: 'soundOn' }, { type: 'pickAvatar', avatar });
