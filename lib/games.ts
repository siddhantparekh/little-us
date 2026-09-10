export type Game = 'lines' | 'brain' | 'memory';
export type Player = 0 | 1;
export type Pack = { names: [string, string]; joke: string; reward: string; memories: string[] };
export const defaultPack: Pack = { names: ['Player one', 'Player two'], joke: 'Certified silly goose behaviour.', reward: 'Winner picks the next date-night movie.', memories: ['First date', 'Our song', 'Midnight snack', 'That trip', 'Your smile', 'Home'] };
export const NAME_LIMIT = 24, LINE_LIMIT = 140;
// Shared by the setup questionnaire and by packs arriving from a peer, so a
// blank or hostile field always lands on something the games can print.
export function cleanPack(value: unknown): Pack | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Pack;
  if (!Array.isArray(p.names) || p.names.length !== 2 || !p.names.every(n => typeof n === 'string') || typeof p.joke !== 'string' || typeof p.reward !== 'string' || !Array.isArray(p.memories) || p.memories.length !== 6 || !p.memories.every(n => typeof n === 'string')) return null;
  const trim = (text: string, limit: number, fallback: string) => text.trim().slice(0, limit) || fallback;
  return {
    names: p.names.map((n, i) => trim(n, NAME_LIMIT, defaultPack.names[i])) as [string, string],
    joke: trim(p.joke, LINE_LIMIT, defaultPack.joke),
    reward: trim(p.reward, LINE_LIMIT, defaultPack.reward),
    memories: p.memories.map((n, i) => trim(n, NAME_LIMIT, defaultPack.memories[i])),
  };
}
export const jokeIdeas = ['Certified silly goose behaviour.', 'We argue about the thermostat more than anything else.', 'One of us is always “five minutes away”.', 'We have a song and neither of us admits it.', 'Somebody still owes somebody a pancake.'];
export const rewardIdeas = ['Winner picks the next date-night movie.', 'Loser makes the tea, winner picks the mug.', 'Winner gets one guilt-free hour of choosing everything.', 'A very long hug, no negotiating.', 'Winner picks dinner. Loser has to be enthusiastic.'];
export const memoryIdeas = [['First date', 'Our song', 'Midnight snack', 'That trip', 'Your smile', 'Home'], ['The bad movie', 'Rainy walk', 'Burnt dinner', 'That playlist', 'Your laugh', 'Sunday mornings'], ['Airport hug', 'Shared dessert', 'The long drive', 'Our bench', 'Bad haircut', 'First “hey”']];
// A questionnaire that ends where it started is no fun, so never re-offer the current line.
export function surprise(list: string[], current: string): string {
  const rest = list.filter(item => item !== current);
  return rest.length ? rest[Math.floor(Math.random() * rest.length)] : list[0];
}
export function surpriseMemories(current: string[]): string[] {
  const key = current.join('|');
  const rest = memoryIdeas.filter(set => set.join('|') !== key);
  return [...(rest.length ? rest[Math.floor(Math.random() * rest.length)] : memoryIdeas[0])];
}
export const questions = [
  { q: 'An unexpected free evening. We’re definitely…', a: ['Ordering in', 'Going on a walk', 'Having a movie marathon', 'Going on an adventure'] },
  { q: 'Our relationship as a snack?', a: ['Sweet & salty popcorn', 'Extra cheesy pizza', 'Spicy noodles', 'A comfort cookie'] },
  { q: 'The best tiny act of love?', a: ['A thoughtful message', 'A surprise snack', 'An uninterrupted hour', 'A very long hug'] },
  { q: 'Our unofficial superpower?', a: ['Making each other laugh', 'Finding good food', 'Doing nothing together', 'Turning chaos into a story'] },
  { q: 'If we could teleport right now…', a: ['Beach sunset', 'Cosy mountain cabin', 'A buzzing new city', 'Back to bed'] },
  { q: 'Which one is our love language today?', a: ['Tell me something sweet', 'Make me a cup of tea', 'Plan time just for us', 'Send me something silly'] },
];
export type State = { game: Game; id: string; rev: number; turn: Player; board: number[]; deck: number[]; open: number[]; matched: number[]; scores: [number, number]; answers: [number | null, number | null]; question: number; result: string; done: boolean; message: string };
export type Action = { type: 'pick'; index: number } | { type: 'continue' };
export function newGame(game: Game, question = 0): State {
  const deck = [...Array(6).keys(), ...Array(6).keys()];
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return { game, id: crypto.randomUUID(), rev: 0, turn: 0, board: Array(9).fill(-1), deck, open: [], matched: [], scores: [0, 0], answers: [null, null], question: question % questions.length, result: '', done: false, message: '' };
}
const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export function move(s: State, action: Action, actor: Player, pack: Pack): State {
  if (s.done || (s.game !== 'brain' && s.turn !== actor)) return s;
  const n = structuredClone(s);
  if (action.type === 'continue') {
    if (s.game !== 'memory' || s.open.length !== 2) return s;
    n.open = []; n.turn = actor === 0 ? 1 : 0; n.message = '';
  } else {
    const i = action.index;
    if (!Number.isInteger(i) || i < 0) return s;
    if (s.game === 'lines') {
      if (i > 8 || s.board[i] !== -1) return s;
      n.board[i] = actor;
      if (wins.some(line => line.every(j => n.board[j] === actor))) {
        n.done = true; n.result = `${pack.names[actor]} wins!`; n.message = `Three in a row. You had me at tic. ${pack.reward}`;
      } else if (n.board.every(v => v !== -1)) {
        n.done = true; n.result = 'A perfect tie.'; n.message = 'Nobody lost. You both found your match.';
      } else { n.turn = actor === 0 ? 1 : 0; n.message = n.board.filter(v => v !== -1).length === 4 ? pack.joke : ''; }
    } else if (s.game === 'brain') {
      if (i > 3 || s.answers[actor] !== null) return s;
      n.answers[actor] = i;
      if (n.answers.every(a => a !== null)) {
        n.done = true;
        const same = n.answers[0] === n.answers[1];
        n.result = same ? 'Same brain. Confirmed.' : 'Different answers. Same team.';
        n.message = same ? `Your connection is getting a little tele-pathetic. ${pack.reward}` : `Two flavours of wonderful. ${pack.joke}`;
      }
    } else {
      if (i > 11 || s.matched.includes(i) || s.open.includes(i) || s.open.length >= 2) return s;
      n.open.push(i); n.message = '';
      if (n.open.length === 2) {
        if (n.deck[n.open[0]] === n.deck[n.open[1]]) {
          n.matched.push(...n.open); n.open = []; n.scores[actor]++; n.message = 'A perfect pair. Just like you two. Go again!';
          if (n.matched.length === 12) {
            n.done = true;
            n.result = n.scores[0] === n.scores[1] ? 'A match made in memory.' : `${pack.names[n.scores[0] > n.scores[1] ? 0 : 1]} wins!`;
            n.message = `You remembered the little things. That’s the big thing. ${pack.reward}`;
          }
        } else n.message = `You’re a great pair. Those cards weren’t. ${pack.joke}`;
      }
    }
  }
  n.rev++;
  return n;
}
