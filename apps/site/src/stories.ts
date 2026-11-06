// What each phone on the page plays: the game's real rules, driven by scripted actions. Tested by stories.test.mjs.
import { DISGUISE_TIME, GRAB_TIME, HEAD_START, MOCK_PLAYERS, SCAN_TIME, TICKET_TIME, initialState, reduce, type Action, type AvatarId, type GameState } from '../../web/src/ui/game.ts';

export type Step = [number, (now: number) => Action];
export interface Story { setup: (s: GameState, now: number) => GameState; steps: Step[]; end: number }

const apply = (s: GameState, ...actions: Action[]) => actions.reduce(reduce, s);
const QUIET_OWL = MOCK_PLAYERS[1];
const pick = (i: number): Action => ({ type: 'target', uid: MOCK_PLAYERS[i].uid });
const SNEAK = TICKET_TIME + GRAB_TIME + DISGUISE_TIME;

const scanned = (s: GameState, now: number) => apply(s, { type: 'scan', now: now - SCAN_TIME - 1 }, { type: 'tick', now }, { type: 'target', uid: QUIET_OWL.uid });
// A heist already running: starts it far enough back that the game's own timers land on the wanted phase.
const robbedAgo = (s: GameState, now: number, ago: number) => {
  const ready = scanned(s, now - ago - 1);
  return apply(ready, { type: 'rob', now: now - ago, lootRate: 0.15 }, { type: 'tick', now });
};

const rob = (now: number): Action => ({ type: 'rob', now, lootRate: 0.15 });
const incoming = (now: number): Action => ({ type: 'incoming', now, rival: QUIET_OWL, lootRate: 0.15 });

export const STORIES: Record<string, Story> = {
  // Hero: replies arrive one by one, the thief weighs up each target, then goes for it.
  hero: {
    setup: (s, now) => apply(s, { type: 'scan', now }),
    steps: [
      [SCAN_TIME + 1400, () => pick(2)],
      [SCAN_TIME + 2600, () => pick(0)],
      [SCAN_TIME + 3800, () => pick(1)],
      [SCAN_TIME + 5400, rob],
    ],
    end: SCAN_TIME + 5400 + SNEAK + 2400,
  },
  scan: {
    setup: (s) => s,
    steps: [[1200, (now) => ({ type: 'scan', now })], [1200 + SCAN_TIME + 1000, () => pick(1)]],
    end: 1200 + SCAN_TIME + 3400,
  },
  rob: { setup: scanned, steps: [[600, rob]], end: 600 + SNEAK + 600 },
  run: { setup: (s, now) => robbedAgo(s, now, SNEAK), steps: [], end: HEAD_START + 1500 },
  hunted: {
    setup: (s, now) => robbedAgo(s, now, SNEAK + HEAD_START),
    steps: [[6000, (now) => ({ type: 'victimFoundMe', now })]],
    end: 10000,
  },
  robbed: {
    setup: (s) => s,
    steps: [[500, incoming], [5500, () => ({ type: 'pulse' })], [6700, () => ({ type: 'pulse' })], [7900, () => ({ type: 'pulse' })]],
    end: 10000,
  },
  saved: {
    setup: (s, now) => apply(s, incoming(now - 4500), { type: 'tick', now }, { type: 'pulse' }, { type: 'pulse' }, { type: 'pulse' }),
    steps: [[1600, (now) => ({ type: 'cancel', now })]],
    end: 11000,
  },
  won: { setup: (s, now) => robbedAgo(s, now, SNEAK + HEAD_START + 60_000), steps: [], end: 0 },
};

export const base = (avatar: AvatarId): GameState => apply(initialState('Sly Fox 3F2A'), { type: 'go', view: 'table' }, { type: 'deposit', amount: 0.25 }, { type: 'toggle', key: 'soundOn' }, { type: 'pickAvatar', avatar });
