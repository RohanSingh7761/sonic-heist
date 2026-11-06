// Run with `npm run check:heist`. Checks signing and the heist calls against the deployed HeistVault.
// Everything is an eth_call with temporary state overrides: no transaction is sent and nothing costs gas.
import assert from 'node:assert/strict';
import { encodeAbiParameters, keccak256, numberToHex, pad, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CONFIG, HEIST_VAULT_ABI } from '../src/config';
import { fetchOnChainBalances, publicClient, signCatch, signCaught, signLootTicket, recoverCatchSigner } from '../src/chain/web3';
import { bytesToHex } from '../src/protocol/signatures';
import { decodeHeistMessage, encodeCatch, encodeCaught, encodeTicket } from '../src/protocol/codecs';
import { MessageType } from '../src/protocol/types';
import { initialState, reduce, DISGUISE_TIME, HANDSHAKE_TIME, type Action, type GameState } from '../src/ui/game';

// Throwaway keys that never hold funds.
const thiefKey = keccak256('0x01');
const victimKey = keccak256('0x02');
const thief = privateKeyToAccount(thiefKey).address;
const victim = privateKeyToAccount(victimKey).address;
const challenge = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
const address = CONFIG.heistVaultAddress;

// Storage layout of HeistVault.sol: vault is slot 0, gameActive slot 6, loots slot 8.
const mapSlot = (key: Hex, slot: number): Hex =>
  keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [pad(key), BigInt(slot)]));
const word = (n: bigint): Hex => numberToHex(n, { size: 32 });

const call = (functionName: string, account: Hex, args: readonly unknown[], stateDiff: { slot: Hex; value: Hex }[]) =>
  publicClient.simulateContract({ address, abi: HEIST_VAULT_ABI, functionName, args, account, stateOverride: [{ address, stateDiff }] } as any);

const errorName = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'no error';
  } catch (err: any) {
    return err?.cause?.data?.errorName ?? `unexpected: ${err?.shortMessage ?? err}`;
  }
};

// An active loot, written straight into the vault's storage.
const lootState = (lootId: bigint, deadline: bigint) => {
  const base = BigInt(mapSlot(numberToHex(lootId), 8));
  const at = (i: bigint) => word(base + i);
  const amount = parseEther('0.01');
  const bond = parseEther('0.002');
  const timings = (1n << 120n) | (deadline << 80n) | ((deadline - 60n) << 40n) | (deadline - 70n); // status, deadline, revealAt, startedAt
  return [
    { slot: at(0n), value: pad(thief.toLowerCase() as Hex) },
    { slot: at(1n), value: pad(victim.toLowerCase() as Hex) },
    { slot: at(2n), value: word((bond << 128n) | amount) },
    { slot: at(3n), value: word(timings) },
  ];
};

async function checkContract() {
  // A player with no history has no immunity or cooldown, whatever this machine's clock says.
  const fresh = await fetchOnChainBalances(thief);
  assert.ok(fresh && fresh.immuneUntilMs < Date.now() && fresh.readyAtMs < Date.now(), 'balances should load with timers in the past');
  console.log('ok  immunity and cooldown load from the contract');

  const now = (await publicClient.getBlock()).timestamp;
  const lootId = 7n;

  // startLoot: the ticket must recover to the victim, whose vault it then escrows.
  const nonce = 123456789n;
  const validBefore = Number(now) + 90;
  const ticket = await signLootTicket(victimKey, thief, nonce, validBefore);
  assert.equal(ticket.length, 64);
  const funded = [
    { slot: mapSlot(victim, 0), value: word(parseEther('1')) },
    { slot: mapSlot(thief, 0), value: word(parseEther('1')) },
    { slot: word(6n), value: word(1n) },
  ];
  const started = await call('startLoot', thief, [nonce, validBefore, bytesToHex(ticket)], funded);
  assert.ok((started as any).result > 0n, 'startLoot should return a loot id');
  console.log('ok  startLoot accepts a real ticket');

  // A small vault loses the minimum instead of the loot failing. 25% of 0.002 is under it, so every roll must land there.
  const smallVault = (stake: string) => [{ slot: mapSlot(victim, 0), value: word(parseEther(stake)) }, ...funded.slice(1)];
  await call('startLoot', thief, [nonce, validBefore, bytesToHex(ticket)], smallVault('0.002'));
  assert.equal(await errorName(call('startLoot', thief, [nonce, validBefore, bytesToHex(ticket)], smallVault('0.0009'))), 'LootAmountTooLow');
  console.log('ok  startLoot takes the minimum from a small vault');

  // A ticket naming another thief recovers to a stranger with an empty vault, so it can't take the victim's money.
  const stolen = await signLootTicket(victimKey, victim, nonce, validBefore);
  assert.equal(await errorName(call('startLoot', thief, [nonce, validBefore, bytesToHex(stolen)], funded)), 'LootAmountTooLow');
  console.log('ok  startLoot rejects a ticket signed for someone else');

  // cancel: the victim, with a Caught signed by the thief.
  const caught = await signCaught(thiefKey, Number(lootId), victim, challenge);
  const active = lootState(lootId, now + 60n);
  await call('cancel', victim, [lootId, bytesToHex(challenge), bytesToHex(caught)], active);
  console.log('ok  cancel accepts a real Caught');

  const forged = await signCaught(victimKey, Number(lootId), victim, challenge);
  assert.equal(await errorName(call('cancel', victim, [lootId, bytesToHex(challenge), bytesToHex(forged)], active)), 'InvalidSignature');
  assert.equal(await errorName(call('cancel', thief, [lootId, bytesToHex(challenge), bytesToHex(caught)], active)), 'Unauthorized');
  const expired = lootState(lootId, now - 5n);
  assert.equal(await errorName(call('cancel', victim, [lootId, bytesToHex(challenge), bytesToHex(caught)], expired)), 'DeadlinePassed');
  console.log('ok  cancel rejects a forged signature, the wrong sender, and a late catch');

  // claim: only after the deadline.
  await call('claim', thief, [lootId], expired);
  assert.equal(await errorName(call('claim', thief, [lootId], active)), 'DeadlineNotReached');
  console.log('ok  claim works after the deadline and not before');
}

async function checkMessages() {
  const signature = await signCatch(victimKey, 7, challenge);
  assert.equal((await recoverCatchSigner(7, challenge, signature)).toLowerCase(), victim.toLowerCase());
  assert.notEqual((await recoverCatchSigner(8, challenge, signature)).toLowerCase(), victim.toLowerCase());

  for (const [encode, type] of [[encodeCatch, MessageType.CATCH], [encodeCaught, MessageType.CAUGHT]] as const) {
    const bytes = encode({ lootId: 7, challenge, signature });
    assert.equal(bytes.length, 77);
    const m = decodeHeistMessage(bytes) as any;
    assert.equal(m.type, type);
    assert.equal(m.lootId, 7);
    assert.equal(bytesToHex(m.challenge), bytesToHex(challenge));
    assert.equal(bytesToHex(m.signature), bytesToHex(signature));
  }
  const ticket = decodeHeistMessage(encodeTicket({ thiefUid: 9, nonce: 2n ** 64n - 1n, validBefore: 123, signature })) as any;
  assert.equal(ticket.nonce, 2n ** 64n - 1n);
  assert.equal(bytesToHex(ticket.signature), bytesToHex(signature));
  console.log('ok  CATCH, CAUGHT and TICKET keep their signatures through encoding');
}

function checkGameRules() {
  const t0 = 1_000_000;
  const rival = { uid: 5, name: 'Rival', avatar: 'nib', level: 1, signal: 1, vault: 0 } as const;
  const loot = { lootId: 7, amount: 0.01, bond: 0.002, revealAt: t0 + 10_000, deadline: t0 + 70_000 };
  const run = (s: GameState, ...actions: Action[]) => actions.reduce(reduce, s);
  const onChain = (role: 'thief' | 'victim', now = t0): Action => ({ type: 'lootOnChain', now, role, rival, rivalAddress: thief, loot });
  const base = { ...initialState('me'), stake: 1, nearby: [rival], target: rival.uid };

  // Thief: no ticket means no heist and no money moved.
  const asked = run(base, { type: 'rob', now: t0 });
  assert.equal(asked.heist?.phase, 'ticket');
  const unanswered = run(asked, { type: 'tick', now: t0 + 60_000 });
  assert.equal(unanswered.heist, null);
  assert.equal(unanswered.stake, 1);

  // Thief: a rejected loot leaves the phase that waits on the chain.
  const waiting = run(asked, { type: 'ticketReceived' });
  assert.equal(waiting.heist?.phase, 'grab');
  assert.equal(run(waiting, { type: 'tick', now: t0 + 600_000 }).heist?.phase, 'grab');
  assert.equal(run(waiting, { type: 'lootFailed', message: 'x' }).heist, null);

  // Thief: chain timings drive the run.
  const started = run(waiting, onChain('thief'));
  assert.equal(started.heist?.amount, 0.01);
  assert.equal(started.stake, 1, 'stake comes from the chain, not local maths');
  assert.equal(run(started, { type: 'tick', now: t0 + DISGUISE_TIME }).heist?.phase, 'headstart');
  assert.equal(run(started, { type: 'tick', now: t0 + 20_000 }).heist?.phase, 'hunted');
  assert.equal(run(started, { type: 'tick', now: t0 + 70_000 }).heist?.phase, 'won');

  // Refresh: a thief with no local heist resumes from the chain.
  assert.equal(run(base, onChain('thief', t0 + 5_000)).heist?.phase, 'headstart');
  assert.equal(run(base, onChain('thief', t0 + 30_000)).heist?.phase, 'hunted');
  assert.equal(run(base, onChain('thief', t0 + 80_000)).heist?.phase, 'won');

  // Outcomes are only final once the chain says so.
  const running = run(started, { type: 'tick', now: t0 + 20_000 });
  assert.equal(run(running, { type: 'lootResolved', status: 'cancelled', now: t0 + 21_000 }).heist?.phase, 'caught');
  const claimed = run(running, { type: 'lootResolved', status: 'claimed', now: t0 + 80_000 });
  assert.equal(claimed.heist, null);
  assert.equal(claimed.thefts, 1);

  // Victim: a timed-out handshake allows another try instead of counting as a save.
  const robbed = run(base, onChain('victim'), { type: 'hunt' }, { type: 'thiefInRange', signal: 1 });
  assert.equal(robbed.heist?.phase, 'hunting');
  assert.equal(robbed.stake, 1, 'stake comes from the chain, not local maths');
  const catching = run(robbed, { type: 'cancel', now: t0 + 1_000 });
  assert.equal(catching.heist?.phase, 'handshake');
  const retry = run(catching, { type: 'tick', now: t0 + 1_000 + HANDSHAKE_TIME });
  assert.equal(retry.heist?.phase, 'hunting');
  assert.equal(retry.saves, 0);
  assert.equal(run(catching, { type: 'lootFailed', message: 'x' }).heist?.phase, 'hunting');

  // Victim: a save counts once, even though the sync may report it again.
  const saved = run(catching, { type: 'caughtHandshake' }, { type: 'lootResolved', status: 'cancelled', now: t0 + 2_000 });
  assert.equal(saved.heist?.phase, 'saved');
  assert.equal(saved.saves, 1);
  assert.equal(run(saved, { type: 'lootResolved', status: 'claimed', now: t0 + 2_000 }).heist?.phase, 'saved');
  assert.equal(run(robbed, { type: 'lootResolved', status: 'claimed', now: t0 + 80_000 }).heist?.phase, 'lost');

  // Refresh: immunity and cooldown come back from the chain, and a later poll can't shorten them.
  const balances = { type: 'setBalances', wallet: 1, stake: 1, immuneUntil: t0 + 300_000, readyAt: t0 + 120_000 } as const;
  const restored = run(initialState('me'), balances);
  assert.equal(restored.immuneUntil, t0 + 300_000);
  assert.equal(restored.readyAt, t0 + 120_000);
  assert.equal(run(restored, { ...balances, immuneUntil: 0, readyAt: 0 }).immuneUntil, t0 + 300_000);

  // The log counts repeats instead of filling up, and stays capped.
  const line = (text: string) => ({ type: 'logEvent', kind: 'bad', text, at: t0 }) as const;
  const repeated = run(initialState('me'), line('a'), line('a'), line('a'), line('b'));
  assert.deepEqual(repeated.log.map((e) => [e.text, e.count]), [['b', undefined], ['a', 3]]);
  const full = run(initialState('me'), ...Array.from({ length: 400 }, (_, i) => line(String(i))));
  assert.equal(full.log.length, 300);
  assert.equal(full.log[0].text, '399');
  assert.equal(run(full, { type: 'clearLog' }).log.length, 0);
  console.log('ok  game rules follow the chain');
}

(async () => {
  checkGameRules();
  await checkMessages();
  await checkContract();
  console.log('PASS');
})().catch((err) => {
  console.error('FAIL:', err?.shortMessage ?? err);
  process.exit(1);
});
