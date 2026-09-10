import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, move, defaultPack, cleanPack, surprise, surpriseMemories, jokeIdeas, rewardIdeas, memoryIdeas, NAME_LIMIT, LINE_LIMIT } from './games.ts';
import { readCode, joinLink, encodeInvite, decodeInvite, MAX_CODE } from './invite.ts';

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

await test('cleanPack fills blank questionnaire answers with the defaults', () => {
  const blank = cleanPack({ names: ['', '  '], joke: '', reward: '   ', memories: ['', '', '', '', '', ''] });
  assert.deepEqual(blank, defaultPack);
  const partial = cleanPack({ names: ['Sid', ''], joke: 'ours', reward: '', memories: ['a', '', '', '', '', ''] });
  assert.deepEqual(partial?.names, ['Sid', defaultPack.names[1]]);
  assert.equal(partial?.reward, defaultPack.reward);
  assert.equal(partial?.memories[1], defaultPack.memories[1]);
});

await test('cleanPack trims oversized fields and rejects the wrong shape', () => {
  const long = cleanPack({ names: ['n'.repeat(90), 'b'], joke: 'j'.repeat(400), reward: 'r'.repeat(400), memories: Array(6).fill('m'.repeat(90)) });
  assert.equal(long?.names[0].length, NAME_LIMIT);
  assert.equal(long?.joke.length, LINE_LIMIT);
  assert.equal(long?.memories[0].length, NAME_LIMIT);
  for (const bad of [null, 'nope', {}, { names: ['a'], joke: '', reward: '', memories: [] }, { names: ['a','b'], joke: '', reward: '', memories: ['x'] }, { names: [1,2], joke: '', reward: '', memories: Array(6).fill('m') }]) assert.equal(cleanPack(bad), null);
});

await test('Surprise me never hands back the line already on screen', () => {
  for (const [list, current] of [[jokeIdeas, jokeIdeas[0]], [rewardIdeas, rewardIdeas[2]]] as const) {
    for (let i = 0; i < 40; i++) assert.notEqual(surprise(list, current), current);
  }
  for (let i = 0; i < 40; i++) {
    const next = surpriseMemories(memoryIdeas[0]);
    assert.equal(next.length, 6);
    assert.notDeepEqual(next, memoryIdeas[0]);
  }
});

await test('Every built-in suggestion survives cleanPack unchanged', () => {
  for (const joke of jokeIdeas) assert.equal(cleanPack({ ...defaultPack, joke })?.joke, joke);
  for (const reward of rewardIdeas) assert.equal(cleanPack({ ...defaultPack, reward })?.reward, reward);
  for (const memories of memoryIdeas) assert.deepEqual(cleanPack({ ...defaultPack, memories })?.memories, memories);
});

await test('readCode accepts a full invite link, a bare code, or a wrapped paste', () => {
  assert.equal(readCode('https://siddhantparekh.github.io/little-us/#j=LU2.abc-_123'), 'LU2.abc-_123');
  assert.equal(readCode('  LU2.abc-_123\n'), 'LU2.abc-_123');
  assert.equal(readCode('LU2.abc\n123'), 'LU2.abc123');
  assert.equal(readCode('Come play! https://x.dev/#j=LU2.zz then tap it'), 'LU2.zz');
  assert.equal(readCode('https://x.dev/?j=LU1.qq'), 'LU1.qq');
});

await test('joinLink hides the code in the fragment and drops any query string', () => {
  const url = new URL(joinLink('LU2.abc', 'https://siddhantparekh.github.io/little-us/?utm=x'));
  assert.equal(url.hash, '#j=LU2.abc');
  assert.equal(url.search, '');
  assert.equal(url.pathname, '/little-us/');
  assert.equal(readCode(url.href), 'LU2.abc');
});

// A real offer is the payload that has to survive the trip through a messenger.
const sampleSdp = ['v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', 'a=ice-ufrag:Fd0M', 'a=ice-pwd:2Cd8vJ0Xz7Yq1Rw9Lm3Bn5Kp', 'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':'), 'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', ...Array(8).fill(0).map((_, i) => `a=candidate:${i} 1 udp 2113937151 192.168.1.${i} 5000${i} typ host generation 0 network-cost 999`)].join('\r\n');

await test('An offer survives the link round trip and stays link-sized', async () => {
  const code = await encodeInvite({ type: 'offer', sdp: sampleSdp });
  assert.match(code, /^LU[12]\./);
  assert.ok(joinLink(code, 'https://siddhantparekh.github.io/little-us/').length < 2000, 'invite link should stay under 2000 characters');
  assert.ok(code.length < MAX_CODE);
  const back = await decodeInvite(joinLink(code, 'https://siddhantparekh.github.io/little-us/'), 'offer');
  assert.deepEqual(back, { type: 'offer', sdp: sampleSdp });
});

await test('Deflate actually shrinks an invite below the plain encoding', async () => {
  const code = await encodeInvite({ type: 'offer', sdp: sampleSdp });
  assert.ok(code.startsWith('LU2.'), 'this runtime should compress');
  assert.ok(code.length < Math.ceil(JSON.stringify({ type: 'offer', sdp: sampleSdp }).length * 4 / 3), 'compressed code should beat base64 of the raw SDP');
});

await test('Invites refuse the wrong half of the handshake and any garbage', async () => {
  const answer = await encodeInvite({ type: 'answer', sdp: sampleSdp });
  await assert.rejects(decodeInvite(answer, 'offer'), /reply code, not an invite/);
  const offer = await encodeInvite({ type: 'offer', sdp: sampleSdp });
  await assert.rejects(decodeInvite(offer, 'answer'), /Expected your partner/);
  for (const bad of ['', 'hello', 'LU3.abc', 'LU2.!!!!', 'LU2.' + 'a'.repeat(MAX_CODE)]) await assert.rejects(decodeInvite(bad, 'offer'));
});
