// Rules check for the UI's mock game. Run: node scripts/ui-game.test.mjs
import assert from 'node:assert/strict';
import { reduce, initialState, levelFor, MOCK_PLAYERS, HEAD_START, HUNT_WINDOW, TICKET_TIME, GRAB_TIME, DISGUISE_TIME, IMMUNITY, COOLDOWN, HANDSHAKE_TIME } from '../apps/web/src/ui/game.ts';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const staked = (amount = 0.25) => reduce(initialState('Me'), { type: 'deposit', amount });
const run = (s, ...actions) => actions.reduce(reduce, s);
const scanned = (s) => run(s, { type: 'scan', now: 0 }, { type: 'tick', now: 10_000 });
const rob = (s, now = 10_000, uid = MOCK_PLAYERS[1].uid) => run(s, { type: 'target', uid }, { type: 'rob', now, lootRate: 0.1 });
const ENTER_RUN = 10_000 + TICKET_TIME + GRAB_TIME + DISGUISE_TIME;

// Levels
assert.deepEqual([0, 2, 3, 7, 8, 50].map(levelFor), [1, 1, 2, 2, 3, 3]);

// Wallet and stake
assert.equal(reduce(initialState('Me'), { type: 'deposit', amount: 9 }).stake, 0);
assert.ok(reduce(staked(), { type: 'withdraw', amount: 0.1 }).notice, 'stake locked during a round');
assert.equal(reduce(staked(), { type: 'withdraw', amount: 0.1 }).stake, 0.25);

// Thief wins: gains the loot, keeps the bond, gets a cooldown
{
  let s = rob(scanned(staked()));
  const { amount, bond } = s.heist;
  near(amount, 0.06);
  near(bond, 0.012);
  s = reduce(s, { type: 'tick', now: ENTER_RUN });
  assert.equal(s.heist.phase, 'headstart');
  near(s.stake, 0.25 - bond);
  s = reduce(s, { type: 'tick', now: ENTER_RUN + HEAD_START });
  assert.equal(s.heist.phase, 'hunted');
  s = reduce(s, { type: 'tick', now: ENTER_RUN + HEAD_START + HUNT_WINDOW });
  assert.equal(s.heist.phase, 'won');
  near(s.stake, 0.25 - bond); // nothing paid until claimed
  s = reduce(s, { type: 'claim' });
  near(s.stake, 0.25 + amount);
  assert.equal(s.thefts, 1);
  assert.equal(s.heist, null);
  assert.equal(s.readyAt, ENTER_RUN + HEAD_START + HUNT_WINDOW + COOLDOWN);
  // Cooldown blocks the next heist
  const blocked = rob(scanned(s), s.readyAt - 1);
  assert.equal(blocked.heist, null);
  assert.ok(blocked.notice);
}

// Thief caught: bond gone, no theft counted, nothing to claim
{
  let s = reduce(rob(scanned(staked())), { type: 'tick', now: ENTER_RUN });
  const { bond } = s.heist;
  s = reduce(s, { type: 'victimFoundMe', now: ENTER_RUN + 1 });
  assert.equal(s.heist.phase, 'caught');
  near(s.stake, 0.25 - bond);
  assert.equal(reduce(s, { type: 'claim' }).stake, s.stake);
  assert.equal(s.thefts, 0);
}

// Can't afford the bond: aborted before any money moves
{
  const s = reduce(rob(scanned(staked(0.001))), { type: 'tick', now: ENTER_RUN });
  assert.equal(s.heist, null);
  assert.equal(s.stake, 0.001);
  assert.ok(s.notice);
}

const rival = MOCK_PLAYERS[0];
const robbed = (s = staked(), now = 0) => reduce(s, { type: 'incoming', now, rival, lootRate: 0.2 });

// Victim saved: gets loot and bond back, immunity starts, cancel needs range
{
  let s = robbed();
  near(s.stake, 0.2);
  assert.equal(s.heist.phase, 'alert');
  s = reduce(s, { type: 'hunt' });
  assert.equal(reduce(s, { type: 'cancel', now: 1000 }).heist.phase, 'hunting', 'cancel needs the thief in range');
  s = run(s, { type: 'pulse' }, { type: 'pulse' }, { type: 'pulse' });
  assert.equal(s.heist.inRange, true);
  s = reduce(s, { type: 'cancel', now: 1000 });
  s = reduce(s, { type: 'tick', now: 1000 + HANDSHAKE_TIME });
  assert.equal(s.heist.phase, 'saved');
  near(s.stake, 0.25 + 0.05 * 0.2);
  assert.equal(s.saves, 1);
  assert.equal(s.immuneUntil, 1000 + HANDSHAKE_TIME + IMMUNITY);
  s = reduce(s, { type: 'dismiss' });
  // Immunity blocks another robbery
  const again = robbed(s, 2000);
  assert.equal(again.heist, null);
  assert.ok(again.notice);
}

// Victim out of time: stake stays gone
{
  let s = reduce(robbed(), { type: 'tick', now: HUNT_WINDOW });
  assert.equal(s.heist.phase, 'lost');
  near(s.stake, 0.2);
  assert.equal(s.saves, 0);
  assert.equal(s.immuneUntil, HUNT_WINDOW + IMMUNITY);
}

// A handshake that outlasts the deadline must lose, not save (the contract enforces the deadline)
{
  let s = run(robbed(), { type: 'hunt' }, { type: 'pulse' }, { type: 'pulse' }, { type: 'pulse' }, { type: 'cancel', now: HUNT_WINDOW - 1000 });
  s = reduce(s, { type: 'tick', now: HUNT_WINDOW + HANDSHAKE_TIME });
  assert.equal(s.heist.phase, 'lost');
  near(s.stake, 0.2);
}

// Shield and patrol block robbery
assert.equal(robbed(reduce(staked(), { type: 'toggle', key: 'shield' })).heist, null);
assert.equal(robbed(reduce(staked(), { type: 'toggle', key: 'patrol' })).heist, null);

// Level-up fires exactly when a threshold is crossed
{
  let s = staked();
  s = run(s, { type: 'addWin' }, { type: 'addWin' });
  assert.equal(s.levelUpTo, null);
  s = reduce(s, { type: 'addWin' });
  assert.equal(s.levelUpTo, 2);
}

// Skipping the head start leaves exactly a full hunt window, skipping again ends it
{
  let s = reduce(rob(scanned(staked())), { type: 'tick', now: ENTER_RUN });
  s = reduce(s, { type: 'skip', now: ENTER_RUN + 2000 });
  assert.equal(s.heist.phase, 'hunted');
  assert.equal(s.heist.deadline, ENTER_RUN + 2000 + HUNT_WINDOW);
  s = reduce(s, { type: 'skip', now: ENTER_RUN + 3000 });
  assert.equal(s.heist.phase, 'won');
}

console.log('ui-game: all rules passed');
