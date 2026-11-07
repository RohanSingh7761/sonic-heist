// Run with `npm run check:flow`. Plays whole heists between two copies of src/game/engine.ts in one process.
// Signatures and account encryption are real. The microphone, speaker, screen, contract and database are fakes,
// so real sound, gas and the database's own checks aren't covered here.
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const appDir = process.cwd();
const require = createRequire(path.join(appDir, '../apps/web/'));
const { build } = require('esbuild');
const outDir = path.join(appDir, 'node_modules/.cache/check-flow');
mkdirSync(outDir, { recursive: true });

const FAKE_HEAD_START_MS = 4_000; // Longer than the thief's 1.6 s disguise, so the head start is still running when it ends
const FAKE_HUNT_MS = 6_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- The shared world ---
const contract = { loots: new Map(), nextId: 1, calls: [], vault: new Map() };
const phones = new Map();
globalThis.__world = { contract, phones, FAKE_HEAD_START_MS, FAKE_HUNT_MS };
globalThis.__pbkdf2 = (password, salt, iterations, bytes) => pbkdf2Sync(password, salt, iterations, bytes, 'sha256').toString('hex');

// --- A fake of the sonic_heist functions in db/schema.sql, reached the same way the app reaches Neon ---
process.env.EXPO_PUBLIC_DATABASE_URL = 'postgresql://app:pw@ep-test-pooler.c-2.aws.neon.tech/neondb';
const db = { players: new Map(), sessions: new Map(), robs: new Map(), sent: [] };
const answer = (result) => new Response(JSON.stringify({ rows: [{ result: JSON.stringify(result) }] }), { status: 200 });
globalThis.fetch = async (url, init) => {
  assert.equal(url, 'https://api.c-2.aws.neon.tech/sql');
  db.sent.push(init.body);
  const { query, params } = JSON.parse(init.body);
  const fn = query.match(/sonic_heist\.(\w+)\(/)[1];
  if (fn === 'signup') {
    const [username, auth, address, key] = params;
    if (db.players.has(username.toLowerCase())) return answer({ error: 'USERNAME_TAKEN' });
    db.players.set(username.toLowerCase(), { username, auth, address, key });
    const token = `token-${username}-${db.sessions.size}`;
    db.sessions.set(token, username.toLowerCase());
    return answer({ token, username });
  }
  if (fn === 'login') {
    const [username, auth] = params;
    const p = db.players.get(username.toLowerCase());
    if (!p || p.auth !== auth) return answer({ error: 'BAD_LOGIN' });
    const token = `token-${username}-${db.sessions.size}`;
    db.sessions.set(token, username.toLowerCase());
    return answer({ token, username: p.username, address: p.address, key: p.key, robs: [...db.robs.values()].filter((o) => o === username.toLowerCase()).length });
  }
  if (fn === 'record_rob') {
    const [token, lootId] = params;
    if (!db.sessions.has(token)) return answer({ error: 'BAD_SESSION' });
    db.robs.set(lootId, db.sessions.get(token));
    return answer({ ok: true });
  }
  if (fn === 'leaderboard') {
    const rows = [...db.players.values()].map((p) => ({ username: p.username, robs: [...db.robs.values()].filter((o) => o === p.username.toLowerCase()).length }));
    return answer(rows.sort((a, b) => b.robs - a.robs));
  }
  throw new Error(`unexpected call ${fn}`);
};

const stubs = {
  'react-native': `
    const me = () => globalThis.__world.phones.get(__PHONE__);
    export const AppState = { get currentState() { return me().appState; }, addEventListener() {} };
    export const Platform = { OS: 'android', Version: 34 };
    export const PermissionsAndroid = { PERMISSIONS: { RECORD_AUDIO: 'mic', POST_NOTIFICATIONS: 'n' }, RESULTS: { GRANTED: 'granted' }, request: async () => 'granted', check: async () => true };
    export const Share = { share() {} };
    export const Vibration = { vibrate: (pattern) => me().buzzes.push(pattern) };`,
  'expo-secure-store': `
    const me = () => globalThis.__world.phones.get(__PHONE__);
    export const getItemAsync = async (name) => me().secure[name] ?? null;
    export const setItemAsync = async (name, value) => { me().secure[name] = value; };
    export const deleteItemAsync = async (name) => { delete me().secure[name]; };`,
  kit: `export const sfx = () => {}; export const setSoundOn = () => {};`,
  polyfills: `export const runDueTimers = () => {};`,
  native: `
    const me = () => globalThis.__world.phones.get(__PHONE__);
    export default {
      addListener(name, fn) { me().listeners[name] = fn; },
      isPatrolling: () => me().mic,
      startPatrol: () => { me().mic = true; },
      stopPatrol: () => { me().mic = false; },
      async transmit(bytes, _p, _v, delayMs) {
        await new Promise((r) => setTimeout(r, delayMs));
        for (const [name, other] of globalThis.__world.phones) {
          if (name !== __PHONE__ && other.mic && other.inRangeOf !== false && me().inRangeOf !== false) other.listeners.onMessage?.({ bytes, heardAt: Date.now() });
        }
        return bytes.length * 10;
      },
      alert: (title) => me().alerts.push(title),
      selfTest: () => 'passed',
      pbkdf2: async (password, salt, iterations, bytes) => globalThis.__pbkdf2(password, salt, iterations, bytes),
      appendLog: (text) => me().log.push(text),
      getPref: (key) => me().prefs[key] ?? null,
      setPref: (key, value) => { me().prefs[key] = value; },
      isBatteryUnrestricted: () => true,
      openBatterySettings: () => {},
    };`,
  // Real signing from src/chain/web3.ts. Only what would touch the network is replaced.
  chain: `
    import { privateKeyToAccount } from 'viem/accounts';
    export { signLootTicket, signCatch, signCaught, recoverCatchSigner } from 'REAL_WEB3';
    const w = () => globalThis.__world;
    const addr = (key) => privateKeyToAccount(key).address;
    export const LOOT_CANCELLED = 2;
    export const LOOT_CLAIMED = 3;
    export const setChainLogger = () => {};
    const public_ = (l) => ({ lootId: l.lootId, thief: l.thief, victim: l.victim, amount: l.amount, bond: l.bond, revealAt: l.revealAt, deadline: l.deadline });
    export async function startLootOnChain(key, nonce, validBefore, signature) {
      const { contract, FAKE_HEAD_START_MS, FAKE_HUNT_MS } = w();
      const victim = contract.nextVictim;
      const now = Date.now();
      const loot = { lootId: contract.nextId++, thief: addr(key), victim, amount: 0.002, bond: 0.0004, revealAt: now + FAKE_HEAD_START_MS, deadline: now + FAKE_HEAD_START_MS + FAKE_HUNT_MS, status: 1 };
      contract.loots.set(loot.lootId, loot);
      contract.calls.push({ fn: 'startLoot', nonce, validBefore, signature });
      return public_(loot);
    }
    export async function cancelLootOnChain(key, lootId, challenge, thiefSignature) {
      const loot = w().contract.loots.get(lootId);
      if (Date.now() > loot.deadline) throw Object.assign(new Error('late'), { cause: { data: { errorName: 'DeadlinePassed' } } });
      loot.status = 2;
      w().contract.calls.push({ fn: 'cancel', lootId, challenge, thiefSignature, sender: addr(key) });
    }
    export async function claimLootOnChain(key, lootId) {
      const loot = w().contract.loots.get(lootId);
      if (Date.now() <= loot.deadline) throw Object.assign(new Error('early'), { cause: { data: { errorName: 'DeadlineNotReached' } } });
      loot.status = 3;
      w().contract.calls.push({ fn: 'claim', lootId, sender: addr(key) });
    }
    export async function fetchLootStatus(lootId) { return w().contract.loots.get(lootId).status; }
    export async function fetchActiveLoots(address) {
      const active = [...w().contract.loots.values()].filter((l) => l.status === 1);
      const asThief = active.find((l) => l.thief === address);
      const asVictim = active.find((l) => l.victim === address);
      return { asThief: asThief ? public_(asThief) : null, asVictim: asVictim ? public_(asVictim) : null };
    }
    export async function fetchOnChainBalances() { return { walletEth: 1, stakeEth: 1, immuneUntilMs: 0, readyAtMs: 0 }; }
    export async function depositToVault() { return {}; }
    export async function withdrawFromVault() { return {}; }`,
};

const realWeb3 = path.join(appDir, 'src/chain/web3.ts');
const plugin = {
  name: 'fake-phone',
  setup(b) {
    const route = (filter, key) => b.onResolve({ filter }, (args) => (args.importer === realWeb3 ? undefined : { path: key, namespace: 'stub' }));
    route(/^react-native$/, 'react-native');
    route(/^expo-secure-store$/, 'expo-secure-store');
    route(/modules\/sonic-audio$/, 'native');
    route(/ui\/kit$/, 'kit');
    route(/\/polyfills$/, 'polyfills');
    b.onResolve({ filter: /^REAL_WEB3$/ }, () => ({ path: realWeb3 }));
    route(/chain\/web3$/, 'chain');
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: stubs[args.path], loader: 'js', resolveDir: appDir }));
  },
};

async function bootPhone(name, keepStorage) {
  const old = phones.get(name);
  phones.set(name, { appState: 'active', mic: false, listeners: {}, alerts: [], buzzes: [], log: [], prefs: JSON.parse(JSON.stringify(old?.prefs ?? { progress: JSON.stringify({ micOk: true, soundOk: true }) })), secure: keepStorage ? old.secure : {}, inRangeOf: true });
  const outfile = path.join(outDir, `${name}-${Date.now()}.mjs`);
  await build({
    entryPoints: [path.join(appDir, 'src/game/engine.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'error',
    plugins: [plugin],
    define: { __PHONE__: JSON.stringify(name) },
    external: ['viem', 'viem/*', 'ox', 'ox/*', '@noble/*'],
    nodePaths: [path.join(appDir, 'node_modules')],
  });
  const engine = await import(pathToFileURL(outfile).href);
  await engine.boot();
  return engine;
}

const until = async (what, check, phone, ms = 15_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for: ${what}\n${phone ? phones.get(phone).log.slice(-12).join('\n') : ''}`);
};

// Tests the engine, including its scan -> rob opening.
async function robbedHeist(thief, victim) {
  contract.nextVictim = victim.getState().walletAddress;
  thief.scan();
  await until('thief finds the victim', () => thief.getState().nearby.length === 1, 'thief', 10_000);
  thief.send({ type: 'target', uid: thief.getState().nearby[0].uid });
  thief.robTarget(thief.getState().nearby[0]);
  await until('thief reaches the head start', () => thief.getState().heist?.phase === 'headstart' || thief.getState().heist?.phase === 'hunted', 'thief');
}

const run = async () => {
  let thief = await bootPhone('thief');
  let victim = await bootPhone('victim');
  await until('phones ask for an account', () => thief.getState().auth === 'out' && victim.getState().auth === 'out');
  assert.equal(phones.get('thief').mic, false, 'no mic before logging in');
  await thief.signUpAccount('Thief_One', 'correct horse');
  await victim.signUpAccount('Victim_One', 'battery staple');
  await until('wallets ready', () => thief.getState().walletAddress && victim.getState().walletAddress);
  assert.equal(thief.getState().auth, 'in');
  assert.equal(thief.getState().name, 'Thief_One');
  await assert.rejects(victim.signUpAccount('thief_one', 'another password'), /taken/, 'usernames are unique regardless of case');
  const thiefKey = phones.get('thief').secure.sonic_heist_private_key;
  const sentToServer = db.sent.join();
  assert.ok(!sentToServer.includes('correct horse'), 'the password never reaches the server');
  assert.ok(!sentToServer.includes(thiefKey.slice(2)), 'the plain wallet key never reaches the server');
  console.log('ok  signing up keeps the password and plain wallet key off the server');
  for (const phone of phones.values()) assert.ok(phone.log.includes('Signing self-test: passed'), 'signing self-test');
  for (const phone of phones.values()) assert.equal(phone.mic, true, 'patrol starts the mic');
  assert.ok(!JSON.stringify(thief.getState()).includes(thiefKey.slice(2)), 'the private key stays out of game state');
  assert.ok(!phones.get('thief').log.join().includes(thiefKey.slice(2)), 'the private key stays out of the log');
  console.log('ok  phones start with their own wallet, and the key stays out of state and logs');

  // Shield and patrol-off phones stay silent.
  victim.send({ type: 'toggle', key: 'shield' });
  thief.scan();
  await sleep(7_500);
  assert.equal(thief.getState().nearby.length, 0, 'a shielded phone does not answer');
  victim.send({ type: 'toggle', key: 'shield' });
  victim.send({ type: 'toggle', key: 'patrol' });
  assert.equal(phones.get('victim').mic, false, 'patrol off turns the mic off');
  victim.send({ type: 'toggle', key: 'patrol' });
  assert.equal(phones.get('victim').mic, true);
  console.log('ok  shield stops replies, and patrol off turns the mic off');

  // Catch.
  phones.get('victim').appState = 'background';
  await robbedHeist(thief, victim);
  assert.equal(contract.calls.at(-1).fn, 'startLoot');
  assert.ok(phones.get('thief').buzzes.length >= 2, 'the thief feels detections and heist steps');
  assert.equal(contract.calls.at(-1).signature.length, 64);
  assert.equal(victim.getState().heist, null, 'the victim stays unaware during the head start');
  await until('victim is alerted after the head start', () => victim.getState().heist?.phase === 'alert', 'victim');
  assert.deepEqual(phones.get('victim').alerts, ['You were robbed!']);
  victim.send({ type: 'hunt' });
  await until('hunt', () => victim.getState().heist?.phase === 'hunting');
  await victim.pulseRadar();
  await until('victim hears the thief', () => victim.getState().heist?.inRange === true, 'victim');
  assert.ok(phones.get('victim').buzzes.length >= 1, 'the victim feels the thief in range');
  await victim.catchThief();
  await until('victim saved', () => victim.getState().heist?.phase === 'saved', 'victim');
  assert.equal(contract.calls.at(-1).fn, 'cancel');
  assert.equal(contract.calls.at(-1).thiefSignature.length, 64);
  assert.equal(victim.getState().saves, 1);
  phones.get('thief').appState = 'background';
  await until('thief sees Busted from the chain', () => thief.getState().heist?.phase === 'caught', 'thief');
  assert.ok(phones.get('thief').alerts.includes('Busted!'));
  thief.send({ type: 'dismiss' });
  victim.send({ type: 'dismiss' });
  phones.get('thief').appState = 'active';
  console.log('ok  a full catch: ticket, alert after the head start, radar, cancel, both phones agree');

  // Escape, with a restart mid-heist. Restarting clears this round's local cooldown and immunity, which this fake contract doesn't keep.
  thief = await bootPhone('thief', true);
  victim = await bootPhone('victim', true);
  await until('wallets back after a restart', () => thief.getState().walletAddress && victim.getState().walletAddress);
  await robbedHeist(thief, victim);
  await until('victim alerted again', () => victim.getState().heist?.phase === 'alert', 'victim');
  victim.send({ type: 'hunt' });
  phones.get('thief').inRangeOf = false;
  thief = await bootPhone('thief', true);
  await until('thief restored from the chain after a restart', () => ['hunted', 'won'].includes(thief.getState().heist?.phase), 'thief');
  assert.equal(thief.getState().thefts, 0);
  phones.get('thief').appState = 'background';
  await until('thief wins at the deadline', () => thief.getState().heist?.phase === 'won', 'thief');
  assert.ok(phones.get('thief').alerts.includes('You got away!'));
  phones.get('thief').appState = 'active';
  await until('victim loses at the deadline', () => victim.getState().heist?.phase === 'lost', 'victim');
  await sleep(50);
  await thief.claimLoot();
  if (thief.getState().heist) {
    await sleep(500);
    await thief.claimLoot();
  }
  assert.equal(contract.calls.at(-1).fn, 'claim');
  assert.equal(thief.getState().heist, null);
  assert.equal(thief.getState().thefts, 1);
  assert.equal(JSON.parse(phones.get('thief').prefs.progress).thefts, 1, 'wins survive a restart');
  console.log('ok  a full escape: restart keeps the heist, claim pays out, the win is saved');

  // Leaderboard, and getting the same wallet back on a new phone.
  await until('the win reaches the leaderboard', () => db.robs.size === 1, 'thief', 40_000);
  const address = thief.getState().walletAddress;
  await thief.logOut();
  assert.equal(thief.getState().auth, 'out');
  assert.equal(thief.getState().walletAddress, undefined);
  assert.equal(phones.get('thief').secure.sonic_heist_private_key, undefined, 'logging out removes the key from the phone');
  assert.equal(phones.get('thief').mic, false, 'logging out turns the mic off');
  thief = await bootPhone('thief');
  await until('new phone asks for an account', () => thief.getState().auth === 'out');
  await assert.rejects(thief.logInAccount('Thief_One', 'wrong password'), /Wrong username or password/);
  await thief.logInAccount('thief_one', 'correct horse');
  assert.equal(thief.getState().walletAddress, address, 'logging in restores the same wallet');
  assert.equal(thief.getState().thefts, 1, 'logging in restores the rob count');
  assert.equal(phones.get('thief').secure.sonic_heist_private_key, thiefKey);
  const restarted = await bootPhone('thief', true);
  await until('stays logged in after a restart', () => restarted.getState().auth === 'in', 'thief');
  assert.equal(restarted.getState().walletAddress, address);
  thief = restarted;
  console.log('ok  log out, wrong password, log in on a new phone, and staying logged in all keep the same wallet');

  // A rob nobody answers moves no money.
  const before = contract.calls.length;
  phones.get('thief').inRangeOf = true;
  phones.get('victim').inRangeOf = false;
  thief = await bootPhone('thief', true);
  await until('wallet back', () => thief.getState().walletAddress);
  thief.send({ type: 'discoveredPlayer', player: { uid: 7, name: 'Nobody', avatar: 'nib', level: 1, signal: 1, vault: 0 } });
  thief.send({ type: 'target', uid: 7 });
  thief.robTarget(thief.getState().nearby[0]);
  assert.equal(thief.getState().heist?.phase, 'ticket');
  await until('an unanswered rob gives up', () => thief.getState().heist === null, 'thief', 20_000);
  assert.equal(contract.calls.length, before);
  console.log('ok  a rob nobody answers gives up and sends no transaction');
  console.log('PASS');
  process.exit(0);
};

run().catch((err) => {
  console.error('FAIL:', err.message ?? err);
  process.exit(1);
});
