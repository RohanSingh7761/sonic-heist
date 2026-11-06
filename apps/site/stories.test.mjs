// Plays every phone's story through the real game rules. A change to game.ts that breaks a story fails here.
// Run: npm test
import assert from 'node:assert/strict';
import { STORIES, base } from './src/stories.ts';
import { reduce } from '../web/src/ui/game.ts';

function play(story, ms = story.end) {
  const t0 = 1_000_000;
  let s = story.setup(base('rocco'), t0);
  const steps = [...story.steps];
  for (let at = 0; at <= ms; at += 100) {
    const now = t0 + at;
    while (steps.length && steps[0][0] <= at) s = reduce(s, steps.shift()[1](now));
    s = reduce(s, { type: 'tick', now });
  }
  assert.equal(steps.length, 0, 'every step must fall inside the story');
  return s;
}

const END = { hero: 'headstart', rob: 'headstart', run: 'hunted', hunted: 'caught', robbed: 'hunting', saved: 'saved', won: 'won' };
for (const [name, phase] of Object.entries(END)) assert.equal(play(STORIES[name], STORIES[name].end || 100).heist?.phase, phase, name);

// The hunt only reads as a hunt if the thief ends up on the radar.
assert.equal(play(STORIES.robbed).heist.inRange, true);

// The scan phone finishes on a chosen target, with nobody robbed yet.
const scanned = play(STORIES.scan);
assert.equal(scanned.view, 'scan');
assert.equal(scanned.heist, null);
assert.ok(scanned.target && scanned.nearby.length === 4);

console.log('stories: all passed');
