// Writes docs/ASSETS.md and docs/SCREENS.md, and fails if either disagrees with the code or the files.
// Run after changing art, sounds or screens: node scripts/gen-docs.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'apps/web/public');
const UI = join(ROOT, 'apps/web/src/ui');
const read = (p) => readFileSync(p, 'utf8');
const kb = (p) => `${(statSync(p).size / 1024).toFixed(1)} KB`;
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const code = (s) => `\`${s}\``;

const AVATARS = [
  ['juno', 'Juno', 'Human', ['Coral hoodie, hair clip', 'Teal jacket, headphones', 'Purple and gold outfit, gold headphones, cape, sparkles']],
  ['rocco', 'Rocco', 'Raccoon', ['Red bandana', 'Striped tee, flat cap', 'Tuxedo, top hat, cape, sparkles']],
  ['nib', 'Nib', 'Baby dragon', ['Plain', 'Scarf, small wings', 'Gold armour, crown, big wings, sparkles']],
];
const LEVELS = [[1, 'Rookie'], [2, 'Prowler'], [3, 'Phantom']];
const STATES = {
  idle: 'Breathing, blinking, glancing around',
  seated: 'Sitting on a chair at the table',
  sneak: 'Tiptoeing and looking side to side',
  thief: 'Standing with black glasses, stick and black bundle',
  run: 'Plain run, facing right',
  'thief-run': 'Running with glasses and bundle, facing right',
  swag: 'Shades drop, gold chain, coins raining',
  cry: 'Tears, flying drops, growing puddle',
  caught: 'Busted: stars circling, loot dropped',
  saved: 'Jumping and cheering with coins',
  alert: 'Shaking with a red "!"',
  hunt: 'Walking with a sonar device',
  locked: 'Faded still, for locked level rungs',
};

// ---------- the screen map: the single source for SCREENS.md and the "Used on" columns in ASSETS.md ----------
// avatar: [whose sprite, state]. me = the player's avatar at their level; rival = the other player in the heist;
// others = the seated players; cast = fixed title-screen runners; pick = every avatar at the level shown.
const S = (o) => o;
const SEATED = [['me', 'seated'], ['others', 'seated']];
const TABLE_ART = ['scene.room', 'scene.table', 'prop.stack-1', 'prop.stack-2', 'prop.stack-3', 'prop.stack-4'];
const RUN_ART = ['scene.wall-tile', 'scene.floor-tile'];
const SCREENS = [
  S({ id: 'screen.title', key: 'title', group: 'Getting started', name: 'Title', component: 'screens/Intro.tsx: Title', mood: 'Night', when: 'App opens, or Restart in demo controls', to: 'screen.pick', actions: 'Start', avatar: [['cast', 'run'], ['cast', 'thief-run']], art: ['logo', ...RUN_ART], sfx: [], real: 'None' }),
  S({ id: 'screen.pick', key: 'pick', group: 'Getting started', name: 'Pick avatar', component: 'screens/Intro.tsx: Pick', mood: 'Cream', when: 'Start pressed', to: 'screen.setup', actions: 'Choose an avatar, confirm', avatar: [['pick', 'idle'], ['pick', 'thief'], ['pick', 'swag'], ['pick', 'cry'], ['pick', 'saved']], art: [], sfx: [], real: 'Save the chosen avatar with the wallet' }),
  S({ id: 'screen.setup', key: 'setup', group: 'Getting started', name: 'Setup', component: 'screens/Intro.tsx: Setup', mood: 'Cream', when: 'Avatar confirmed', to: 'screen.round', actions: 'Allow microphone, run sound check, add stake', avatar: [], art: [], sfx: ['radar-ping', 'coin', 'deposit'], real: 'Mic permission, ultrasound self-test, wallet creation, `deposit()`' }),
  S({ id: 'screen.round', key: 'round', group: 'Getting started', name: 'Everyone runs', component: 'screens/Intro.tsx: RoundStart', mood: 'Night', when: 'Setup finished', to: 'screen.table', actions: 'Take your seat', avatar: [['me', 'run'], ['others', 'run']], art: RUN_ART, sfx: ['run-loop', 'footsteps-loop'], real: '`gameActive` from the contract, real player list' }),
  S({ id: 'screen.table', key: 'table', group: 'Main tabs', name: 'Table (home)', component: 'screens/Home.tsx: TableHome', mood: 'Cream', when: 'Default view, and after every heist', to: 'screen.scan, screen.levels, screen.log, screen.settings, heist.ticket (via scan), heist.alert (when robbed)', actions: 'Scan, patrol, shield, add or take stake', avatar: [['me', 'idle'], ...SEATED], art: TABLE_ART, sfx: ['radar-ping', 'shield-on', 'deposit', 'ui-deny'], real: 'Vault and wallet balances, `immuneUntil`, `thiefReadyAt`, patrol service, `withdraw()`' }),
  S({ id: 'screen.scan', key: 'scan', group: 'Main tabs', name: 'Scan', component: 'screens/Home.tsx: Scan', mood: 'Cream', when: 'Scan pressed', to: 'heist.ticket, screen.table', actions: 'Pick a player, rob, scan again, back', avatar: [['others', 'idle']], art: ['scene.radar'], sfx: ['sneak-loop', 'radar-ping', 'heist-start', 'ui-deny'], real: 'PING and PONG over sound, real signal levels' }),
  S({ id: 'screen.levels', key: 'levels', group: 'Main tabs', name: 'Levels', component: 'screens/Home.tsx: Levels', mood: 'Cream', when: 'Levels tab', to: 'Other tabs', actions: 'Change avatar', avatar: [['me', 'idle'], ['me', 'locked'], ['pick', 'idle']], art: [], sfx: [], real: 'Thefts and saves from `LootClaimed` and `LootCancelled` events; final level thresholds' }),
  S({ id: 'screen.log', key: 'log', group: 'Main tabs', name: 'Activity', component: 'screens/Home.tsx: Log', mood: 'Cream', when: 'Activity tab', to: 'Other tabs', actions: 'None', avatar: [], art: [], sfx: [], real: 'Player events from the contract' }),
  S({ id: 'screen.settings', key: 'settings', group: 'Main tabs', name: 'Settings', component: 'screens/Home.tsx: Settings', mood: 'Cream', when: 'Settings tab', to: 'Other tabs', actions: 'Sound, patrol, shield, open contract', avatar: [], art: [], sfx: [], real: 'Patrol service, auto-sign policy for shield' }),
  S({ id: 'heist.ticket', key: 'ticket', group: 'Thief', name: 'Sneaking in', component: 'screens/Heist.tsx: Sneak', mood: 'Cream', when: 'Rob pressed', to: 'heist.grab (3.5 s), or screen.table if the stake cannot cover the bond', actions: 'None', avatar: [['me', 'idle'], ['me', 'sneak'], ['others', 'seated']], art: [...TABLE_ART, 'prop.chair'], sfx: ['sneak-loop', 'ui-deny'], real: 'LOOT_REQ sent, TICKET received, `startLoot()` submitted' }),
  S({ id: 'heist.grab', key: 'grab', group: 'Thief', name: 'Grabbing the stake', component: 'screens/Heist.tsx: Sneak', mood: 'Cream', when: 'Ticket accepted', to: 'heist.disguise (1.8 s)', actions: 'None', avatar: [['me', 'idle'], ['me', 'sneak'], ['others', 'seated']], art: [...TABLE_ART, 'prop.chair'], sfx: ['loot-grab'], real: '`LootStarted` event: real loot and bond' }),
  S({ id: 'heist.disguise', key: 'disguise', group: 'Thief', name: 'Glasses on', component: 'screens/Heist.tsx: Sneak', mood: 'Cream', when: 'Grab finished', to: 'heist.headstart (1.6 s)', actions: 'None', avatar: [['me', 'idle'], ['me', 'thief'], ['others', 'seated']], art: [...TABLE_ART, 'prop.chair'], sfx: ['bling'], real: 'None: animation only' }),
  S({ id: 'heist.headstart', key: 'headstart', group: 'Thief', name: 'Head start', component: 'screens/Heist.tsx: Running', mood: 'Night', when: 'Disguise finished', to: 'heist.hunted (10 s), heist.caught', actions: 'None', avatar: [['me', 'thief-run']], art: RUN_ART, sfx: ['dash', 'run-loop', 'footsteps-loop'], real: '`revealAt` from `LootStarted`; answer CATCH with CAUGHT' }),
  S({ id: 'heist.hunted', key: 'hunted', group: 'Thief', name: 'Hunted', component: 'screens/Heist.tsx: Running', mood: 'Red', when: 'Head start over', to: 'heist.won (60 s), heist.caught', actions: 'None', avatar: [['me', 'thief-run'], ['rival', 'hunt']], art: RUN_ART, sfx: ['bang', 'run-loop', 'footsteps-loop', 'tick-urgent'], real: '`deadline` from `LootStarted`; answer CATCH with CAUGHT; `LootCancelled` event' }),
  S({ id: 'heist.won', key: 'won', group: 'Thief', name: 'You got away', component: 'screens/Heist.tsx: Won', mood: 'Gold', when: 'Deadline passed without a catch', to: 'screen.table', actions: 'Claim', avatar: [['me', 'swag']], art: [], sfx: ['swag', 'jackpot'], real: '`claim()`, `LootClaimed` event' }),
  S({ id: 'heist.caught', key: 'caught', group: 'Thief', name: 'Busted', component: 'screens/Heist.tsx: Caught', mood: 'Dark', when: 'Victim catches the thief in time', to: 'screen.table', actions: 'Back to the table', avatar: [['me', 'caught']], art: [], sfx: ['bang', 'caught', 'coin-drop'], real: '`LootCancelled` event' }),
  S({ id: 'heist.alert', key: 'alert', group: 'Victim', name: 'You were robbed', component: 'screens/Heist.tsx: Alert', mood: 'Flashing red', when: 'Head start ended on a loot against this player', to: 'heist.hunting (tap, or 4 s)', actions: 'Start the hunt', avatar: [['me', 'alert']], art: [], sfx: ['robbed', 'alert'], real: '`LootStarted` watcher, local notification at `revealAt`, vibration' }),
  S({ id: 'heist.hunting', key: 'hunting', group: 'Victim', name: 'Hunt', component: 'screens/Heist.tsx: Hunt', mood: 'Night', when: 'Alert dismissed', to: 'heist.handshake, heist.lost (at the deadline)', actions: 'Pulse radar, catch them', avatar: [['me', 'hunt'], ['rival', 'idle']], art: ['scene.radar'], sfx: ['radar-ping', 'thief-near', 'bang', 'tick-urgent'], real: 'Targeted PING and PONG, real signal level. Radar is tinted red with a CSS filter' }),
  S({ id: 'heist.handshake', key: 'handshake', group: 'Victim', name: 'Catching them', component: 'screens/Heist.tsx: Hunt', mood: 'Night', when: 'Catch pressed with the thief in range', to: 'heist.saved (4 s), heist.lost if it finishes after the deadline', actions: 'None', avatar: [['me', 'hunt'], ['rival', 'idle']], art: ['scene.radar'], sfx: ['tick-urgent'], real: 'CATCH and CAUGHT over sound, `cancel()`' }),
  S({ id: 'heist.saved', key: 'saved', group: 'Victim', name: 'Caught them', component: 'screens/Heist.tsx: Saved', mood: 'Mint', when: 'Handshake finished in time', to: 'screen.table', actions: 'Back to the table', avatar: [['me', 'saved']], art: [], sfx: ['saved', 'coin'], real: '`LootCancelled` event' }),
  S({ id: 'heist.lost', key: 'lost', group: 'Victim', name: 'They got away', component: 'screens/Heist.tsx: Lost', mood: 'Blue', when: 'Deadline passed', to: 'screen.table', actions: 'Back to the table', avatar: [['me', 'cry']], art: [], sfx: ['stake-lost', 'cry'], real: '`LootClaimed` event, or deadline from the chain clock' }),
  S({ id: 'overlay.level-up', group: 'Overlays', name: 'Level up', component: 'UiApp.tsx: LevelUp', mood: 'Dimmed', when: 'A win crosses a level threshold', to: 'Stays on the current screen', actions: 'Nice', avatar: [['me', 'saved']], art: [], sfx: ['level-up'], real: 'Same as levels' }),
  S({ id: 'overlay.notice', group: 'Overlays', name: 'Notice', component: 'UiApp.tsx: UiApp', mood: 'Ink', when: 'An action is refused', to: 'Clears after 3.2 s', actions: 'None', avatar: [], art: [], sfx: ['ui-deny'], real: 'Contract revert messages' }),
  S({ id: 'overlay.demo', group: 'Overlays', name: 'Demo controls', component: 'UiApp.tsx: DemoControls', mood: 'Cream', when: 'DEMO tab pressed', to: 'Any heist state', actions: 'Someone robs me, victim finds me, skip timer, +1 win, restart', avatar: [], art: [], sfx: [], real: 'Delete once integrated' }),
];
const screensUsing = (test) => SCREENS.filter(test).map((s) => code(s.id)).join(', ') || 'Not used by the app UI';
const stateScreens = (st) => screensUsing((s) => s.avatar.some(([, v]) => v === st));
const artScreens = (id) => screensUsing((s) => s.art.includes(id));

// ---------- checks ----------
const problems = [];
const gameTs = read(join(UI, 'game.ts'));
const union = (name) => [...new RegExp(`export type ${name} = ([^;]+);`).exec(gameTs)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const key of [...union('View'), ...union('ThiefPhase'), ...union('VictimPhase')]) {
  if (!SCREENS.some((s) => s.key === key)) problems.push(`game.ts "${key}" has no entry in the screen map`);
}
for (const s of SCREENS) {
  const [file, comp] = s.component.split(': ');
  const src = read(join(UI, file));
  if (!new RegExp(`function ${comp}\\b`).test(src)) problems.push(`${s.id}: no component ${comp} in ${file}`);
  for (const [, st] of s.avatar) if (!STATES[st]) problems.push(`${s.id}: unknown state ${st}`);
  for (const t of s.to.matchAll(/(screen|heist)\.[a-z-]+/g)) if (!SCREENS.some((x) => x.id === t[0])) problems.push(`${s.id}: links to unknown ${t[0]}`);
}
const artPath = (id) => (id === 'logo' ? 'sprites/logo.svg' : id.startsWith('scene.') ? `sprites/scenes/${id.slice(6)}.svg` : `sprites/props/${id.slice(5)}.svg`);
for (const s of SCREENS) for (const a of s.art) {
  try { statSync(join(PUBLIC, artPath(a))); } catch { problems.push(`${s.id}: missing art ${a}`); }
}
const sounds = JSON.parse(read(join(PUBLIC, 'sfx/manifest.json')));
const soundNames = new Set(sounds.map((x) => x.name));
const uiSrc = ['UiApp.tsx', 'kit.tsx', 'stages.tsx', 'screens/Intro.tsx', 'screens/Home.tsx', 'screens/Heist.tsx'].map((f) => read(join(UI, f))).join('\n');
const inCode = new Set([...uiSrc.matchAll(/(?:sfx\(|click="|useLoop\([^?]*\? )'?"?([a-z]+(?:-[a-z]+)*)['"]/g)].map((m) => m[1]));
for (const s of SCREENS) for (const n of s.sfx) if (!soundNames.has(n)) problems.push(`${s.id}: unknown sound ${n}`);
for (const n of inCode) {
  if (!soundNames.has(n)) problems.push(`Code plays unknown sound ${n}`);
  else if (n !== 'ui-click' && !SCREENS.some((s) => s.sfx.includes(n))) problems.push(`Code plays ${n} but no screen lists it`);
}
for (const s of SCREENS) for (const n of s.sfx) if (!inCode.has(n)) problems.push(`${s.id} lists ${n} but the UI code never plays it`);

// ---------- ASSETS.md ----------
const svgInfo = (rel) => {
  const p = join(PUBLIC, rel);
  const svg = read(p);
  const frames = (svg.match(/<use [^>]*class="[^"]*-p[ "]/g) ?? []).length;
  const cycle = /animation-duration:(\d+)ms/.exec(svg)?.[1];
  const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  return { size: `${box[1]}x${box[2]}`, frames: frames || 1, cycle: cycle && frames > 1 ? `${(cycle / 1000).toFixed(2)} s` : 'Still', kb: kb(p) };
};
let assetCount = 0;
const row = (id, rel, extra) => {
  const i = svgInfo(rel);
  assetCount++;
  return [code(id), ...extra, code(`/${rel}`), i.size, i.frames, i.cycle, i.kb];
};
const out = [
  '# Sonic Heist asset map',
  '',
  '> Generated by `scripts/gen-docs.mjs`. Do not edit by hand. Screen details are in [SCREENS.md](SCREENS.md).',
  '',
  '## Conventions',
  '',
  table(['Item', 'Format'], [
    ['Asset ID', '`avatar.<avatar>.lv<level>.<state>`, `scene.<name>`, `prop.<name>`, `logo`, `sfx.<name>`'],
    ['Avatar path', '`/sprites/<avatar>/lv<level>/<state>.svg`'],
    ['Sound path', '`/sfx/<name>.wav`'],
    ['Size', 'Art pixels (width x height). Scale up in CSS; the SVGs stay crisp'],
    ['Frames and cycle', 'Number of animation frames and the time for one full loop. All animations loop forever'],
    ['Direction', '`run` and `thief-run` face right. Everything else faces the viewer'],
    ['Sound format', '8-bit mono WAV, 22,050 Hz'],
    ['Regenerate', '`node scripts/gen-sprites.mjs`, `node scripts/gen-sfx.mjs`, then `node scripts/gen-docs.mjs`'],
  ]),
  '',
  '## Avatars and levels',
  '',
  table(['Avatar', 'ID', 'Type', ...LEVELS.map(([l, t]) => `LV ${l} ${t}`)], AVATARS.map(([id, name, type, looks]) => [name, code(id), type, ...looks])),
  '',
  '## Avatar states',
  '',
  'Every avatar has all of these at every level.',
  '',
  table(['State', 'Shows', 'Used on'], Object.entries(STATES).map(([st, what]) => [code(st), what, stateScreens(st)])),
];
for (const [id, name] of AVATARS) {
  for (const [lvl, title] of LEVELS) {
    out.push('', `## ${name}, LV ${lvl} ${title}`, '');
    out.push(table(['Asset ID', 'State', 'Path', 'Size', 'Frames', 'Cycle', 'File size'], Object.keys(STATES).map((st) => row(`avatar.${id}.lv${lvl}.${st}`, `sprites/${id}/lv${lvl}/${st}.svg`, [code(st)]))));
  }
}
const SCENES = [
  ['room', 'Static layer: wood floor and red rug'],
  ['table', 'Static layer: round table, drawn over the back seats'],
  ['wall-tile', 'Static tile: brick wall with lamp, scrolled sideways'],
  ['floor-tile', 'Static tile: wood floor, scrolled sideways'],
  ['radar', 'Animated radar sweep'],
  ['table-idle', 'Complete scene with a fixed cast, for previews'],
  ['heist-thief-view', 'Complete scene with a fixed cast: Rocco robs Juno, for previews'],
  ['run-all', 'Complete scene with a fixed cast: everyone runs, for previews'],
];
out.push('', '## Scenes', '', table(['Asset ID', 'What it is', 'Path', 'Size', 'Frames', 'Cycle', 'File size', 'Used on'], SCENES.map(([n, what]) => [...row(`scene.${n}`, `sprites/scenes/${n}.svg`, [what]), artScreens(`scene.${n}`)])));
const PROPS = [['chair', 'Empty chair with shadow'], ...[0, 1, 2, 3, 4].map((n) => [`stack-${n}`, n ? `Coin stack, ${n} high` : 'Empty coin stack'])];
out.push('', '## Props and logo', '', table(['Asset ID', 'What it is', 'Path', 'Size', 'Frames', 'Cycle', 'File size', 'Used on'], [
  [...row('logo', 'sprites/logo.svg', ['Animated Sonic Heist wordmark']), artScreens('logo')],
  ...PROPS.map(([n, what]) => [...row(`prop.${n}`, `sprites/props/${n}.svg`, [what]), artScreens(`prop.${n}`)]),
]));
const groups = [...new Set(sounds.map((x) => x.group))];
out.push('', '## Sounds', '', 'Every button also plays `sfx.ui-click` unless a sound is listed for it on the screen.');
for (const g of groups) {
  out.push('', `### ${g}`, '', table(['Asset ID', 'What it is', 'Path', 'Length', 'Loops', 'File size', 'Used on'], sounds.filter((x) => x.group === g).map((x) => {
    assetCount++;
    const used = x.name === 'ui-click' ? 'Every button' : screensUsing((s) => s.sfx.includes(x.name));
    return [code(`sfx.${x.name}`), x.description.replace(/\|/g, '/'), code(`/sfx/${x.name}.wav`), `${x.seconds} s`, x.loops ? 'Yes' : 'No', kb(join(PUBLIC, `sfx/${x.name}.wav`)), used];
  })));
}
out.push('', '## Preview pages', '', table(['Page', 'Path', 'Shows'], [
  ['Sprite gallery', '`/sprites/index.html`', 'Every avatar, level and state'],
  ['Soundboard', '`/sfx/index.html`', 'Every sound'],
  ['Scenario tester', '`/scenarios/index.html`', 'Game moments with animation and sound together'],
]), '');
// Every file on disk must be in the map.
const onDisk = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : onDisk.push(p); });
walk(join(PUBLIC, 'sprites'));
walk(join(PUBLIC, 'sfx'));
const assetDoc = out.join('\n');
for (const f of onDisk.filter((p) => /\.(svg|wav)$/.test(p))) {
  const rel = f.slice(PUBLIC.length);
  if (!assetDoc.includes(`\`${rel}\``)) problems.push(`File not in the asset map: ${rel}`);
}

// ---------- SCREENS.md ----------
const list = (ids) => (ids.length ? ids.map(code).join(', ') : 'None');
const WHO = {
  me: (st) => `avatar.{me}.lv{level}.${st}`,
  others: (st) => `avatar.{player}.lv{player level}.${st}`,
  rival: (st) => `avatar.{rival}.lv{rival level}.${st}`,
  cast: (st) => (st === 'thief-run' ? 'avatar.rocco.lv2.thief-run' : 'avatar.juno.lv1.run, avatar.nib.lv2.run'),
  pick: (st) => `avatar.{each avatar}.lv{level shown}.${st}`,
};
const doc = [
  '# Sonic Heist screen map',
  '',
  '> Generated by `scripts/gen-docs.mjs`. Do not edit by hand. Asset details are in [ASSETS.md](ASSETS.md).',
  '',
  'Open the UI at `/ui.html`. The current screen is on the `data-view` attribute of `.phone`. All data is mock until integrated.',
  '',
  '## Conventions',
  '',
  table(['Field', 'Meaning'], [
    ['Screen ID', '`screen.<view>` for normal views, `heist.<phase>` for heist states, `overlay.<name>` for layers on top'],
    ['Component', 'File under `apps/web/src/ui/` and the component in it'],
    ['Shown when', 'What brings the player here'],
    ['Leads to', 'Where it goes next, with automatic timers in brackets'],
    ['Avatar sprites', 'Asset IDs. `{me}` is the chosen avatar and `{level}` their level, which depends on wins'],
    ['Sounds', 'Sound IDs besides the standard button click'],
    ['Needs for real', 'What replaces the mock data at integration'],
  ]),
  '',
  '## Levels',
  '',
  table(['Level', 'Title', 'Wins needed (thefts + saves)'], LEVELS.map(([l, t]) => [`LV ${l}`, t, new RegExp(`LEVEL_AT[^=]*= \\{ 1: (\\d+), 2: (\\d+), 3: (\\d+)`).exec(gameTs)[l]])),
  '',
  'These thresholds are placeholders in `game.ts`.',
  '',
  '## Timers',
  '',
  table(['Timer', 'Length'], [['Scan', '6 s (mock)'], ['Ticket', '3.5 s (mock)'], ['Grab', '1.8 s (animation)'], ['Disguise', '1.6 s (animation)'], ['Head start', '10 s (contract)'], ['Hunt window', '60 s (contract)'], ['Alert auto-continue', '4 s (mock)'], ['Handshake', '4 s (mock)'], ['Victim immunity', '5 min (contract)'], ['Thief cooldown', '2 min (contract)']]),
  '',
  '## All screens',
  '',
  table(['Screen ID', 'Name', 'Group', 'Component', 'Mood'], SCREENS.map((s) => [code(s.id), s.name, s.group, code(s.component), s.mood])),
];
for (const g of [...new Set(SCREENS.map((s) => s.group))]) {
  doc.push('', `## ${g}`);
  for (const s of SCREENS.filter((x) => x.group === g)) {
    doc.push('', `### ${s.id}: ${s.name}`, '', table(['Field', 'Value'], [
      ['Screen ID', code(s.id)],
      ['Component', code(s.component)],
      ['Mood', s.mood],
      ['Shown when', s.when],
      ['Leads to', s.to],
      ['Player actions', s.actions],
      ['Avatar sprites', s.avatar.length ? s.avatar.map(([w, st]) => WHO[w](st).split(', ').map(code).join(', ')).join(', ') : 'None'],
      ['Other art', list(s.art)],
      ['Sounds', list(s.sfx.map((n) => `sfx.${n}`))],
      ['Needs for real', s.real],
    ]));
  }
}
doc.push('');

if (problems.length) {
  console.error(`Docs out of sync:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync(join(ROOT, 'docs/ASSETS.md'), assetDoc);
writeFileSync(join(ROOT, 'docs/SCREENS.md'), doc.join('\n'));
console.log(`Mapped ${assetCount} assets and ${SCREENS.length} screens`);
