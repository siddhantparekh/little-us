import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, move, defaultPack } from './games.ts';

await test('Love Lines rejects wrong turns and occupied cells, ends on a win', () => {
  let s = newGame('lines');
  assert.equal(move(s, { type: 'pick', index: 0 }, 1, defaultPack), s);
  for (const i of [0,3,1,4,2]) s = move(s, { type: 'pick', index: i }, s.turn, defaultPack);
  assert.equal(s.done, true); assert.equal(s.result, 'Player one wins!');
  assert.match(s.message, /date-night movie/);
  assert.equal(move(s, { type: 'pick', index: 5 }, 1, defaultPack), s);
});

await test('Love Lines detects a full-board draw', () => {
  let s = newGame('lines');
  for (const i of [0,1,2,4,3,5,7,6,8]) s = move(s, { type: 'pick', index: i }, s.turn, defaultPack);
  assert.equal(s.result, 'A perfect tie.'); assert.equal(s.done, true);
});

await test('Same Brain allows either order and locks each answer until both choose', () => {
  let s = newGame('brain');
  s = move(s, { type: 'pick', index: 2 }, 1, defaultPack);
  assert.equal(s.done, false); assert.equal(s.answers[0], null);
  assert.equal(move(s, { type: 'pick', index: 1 }, 1, defaultPack), s);
  s = move(s, { type: 'pick', index: 2 }, 0, defaultPack);
  assert.equal(s.result, 'Same brain. Confirmed.'); assert.equal(s.done, true);
});

await test('A different answer triggers a personal callback', () => {
  let s = newGame('brain');
  const pack = { ...defaultPack, joke: 'Remember the pancake incident?' };
  s = move(s, { type: 'pick', index: 0 }, 0, pack);
  s = move(s, { type: 'pick', index: 3 }, 1, pack);
  assert.match(s.message, /pancake incident/);
});

await test('Memory Lane retains missed cards until passing, blocks extra flips', () => {
  let s = newGame('memory'); s.deck = [0,1,2,3,4,5,0,1,2,3,4,5];
  s = move(s, { type: 'pick', index: 0 }, 0, defaultPack);
  assert.equal(move(s, { type: 'pick', index: 0 }, 0, defaultPack), s);
  s = move(s, { type: 'pick', index: 1 }, 0, defaultPack);
  assert.deepEqual(s.open, [0,1]);
  assert.equal(move(s, { type: 'pick', index: 2 }, 0, defaultPack), s);
  assert.equal(move(s, { type: 'continue' }, 1, defaultPack), s);
  s = move(s, { type: 'continue' }, 0, defaultPack);
  assert.equal(s.turn, 1); assert.deepEqual(s.open, []);
});

await test('Memory Lane scores six pairs and ends the game', () => {
  let s = newGame('memory'); s.deck = [0,1,2,3,4,5,0,1,2,3,4,5];
  for (let i = 0; i < 6; i++) { s = move(s, { type: 'pick', index: i }, 0, defaultPack); s = move(s, { type: 'pick', index: i+6 }, 0, defaultPack); }
  assert.equal(s.done, true); assert.deepEqual(s.scores, [6,0]); assert.equal(s.matched.length, 12);
});

await test('All games reject malformed indices without mutating state', () => {
  for (const game of ['lines','brain','memory'] as const) {
    const s = newGame(game);
    for (const index of [-1, 0.5, NaN, Infinity, 99]) assert.equal(move(s, { type: 'pick', index }, 0, defaultPack), s);
  }
});
