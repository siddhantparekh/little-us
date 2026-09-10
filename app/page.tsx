'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, Sparkles, ArrowUpRight, Grid2X2, Radio, Link2, SlidersHorizontal, Check, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { defaultPack, newGame, move, questions, type Action, type Game, type Pack, type Player, type State } from '@/lib/games';
import { PeerSession } from '@/lib/peer';

const games = [
  { id: 'lines' as Game, title: 'Love Lines', sub: 'Tic-tac-toe, with feelings', icon: Heart, eyebrow: '01 / A FRIENDLY LITTLE RIVALRY', instruction: 'Three in a row. Infinite bragging rights.' },
  { id: 'brain' as Game, title: 'Same Brain', sub: 'Two minds. One answer?', icon: Radio, eyebrow: '02 / TUNE INTO EACH OTHER', instruction: 'Pick secretly. Your answers appear when you’ve both chosen.' },
  { id: 'memory' as Game, title: 'Memory Lane', sub: 'Made for a perfect pair', icon: Grid2X2, eyebrow: '03 / REMEMBER THE LITTLE THINGS', instruction: 'Flip two cards. Find a pair to score and go again.' },
];
function cleanPack(value: unknown): Pack | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Pack;
  if (!Array.isArray(p.names) || p.names.length !== 2 || !p.names.every(n => typeof n === 'string') || typeof p.joke !== 'string' || typeof p.reward !== 'string' || !Array.isArray(p.memories) || p.memories.length !== 6 || !p.memories.every(n => typeof n === 'string')) return null;
  return { names: p.names.map((n,i) => n.trim().slice(0,24) || defaultPack.names[i]) as [string,string], joke: p.joke.slice(0,140), reward: p.reward.slice(0,140), memories: p.memories.map((n,i) => n.trim().slice(0,24) || defaultPack.memories[i]) };
}
function validState(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const s = value as State;
  return ['lines','brain','memory'].includes(s.game) && typeof s.id === 'string' && Number.isInteger(s.rev) && (s.turn === 0 || s.turn === 1) && Array.isArray(s.board) && s.board.length === 9 && s.board.every(n => [-1,0,1].includes(n)) && Array.isArray(s.deck) && s.deck.length === 12 && s.deck.every(n => Number.isInteger(n) && n >= 0 && n < 6) && Array.isArray(s.open) && s.open.length <= 2 && s.open.every(n => Number.isInteger(n) && n >= 0 && n < 12) && Array.isArray(s.matched) && s.matched.length <= 12 && s.matched.every(n => Number.isInteger(n) && n >= 0 && n < 12) && Array.isArray(s.answers) && s.answers.length === 2 && s.answers.every(n => n === null || Number.isInteger(n) && n >= 0 && n < 4) && Array.isArray(s.scores) && s.scores.length === 2 && s.scores.every(n => Number.isInteger(n) && n >= 0 && n <= 6) && Number.isInteger(s.question) && s.question >= 0 && s.question < questions.length && typeof s.done === 'boolean' && typeof s.message === 'string' && typeof s.result === 'string';
}

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [pack, setPack] = useState<Pack>(defaultPack);
  const [draft, setDraft] = useState<Pack>(defaultPack);
  const [settings, setSettings] = useState(false);
  const [connect, setConnect] = useState(false);
  const [status, setStatus] = useState('local');
  const [role, setRole] = useState<Player>(0);
  const [output, setOutput] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [step, setStep] = useState('choose');
  const [copied, setCopied] = useState(false);
  const [handed, setHanded] = useState(false);
  const session = useRef<PeerSession | null>(null);
  const stateRef = useRef<State | null>(null);
  const packRef = useRef(pack);
  const modeRef = useRef(status);
  const live = status === 'connected';
  const remote = status !== 'local';
  const guest = remote && role === 1;
  const selected = games.find(g => g.id === state?.game) ?? games[0];
  const activePlayer: Player = live ? role : state?.game === 'brain' ? (state.answers[0] === null ? 0 : 1) : state?.turn ?? 0;
  const canPlay = !remote || live && (state?.game === 'brain' || state?.turn === role);

  // Browser-only random state and device preferences must initialize after hydration.
  /* oxlint-disable react/react-compiler */
  useEffect(() => {
    const initial = newGame('lines'); stateRef.current = initial; setState(initial);
    try { const saved = cleanPack(JSON.parse(localStorage.getItem('little-us-pack') || 'null')); if (saved) { setPack(saved); packRef.current = saved; } } catch { /* Device storage is optional. */ }
    return () => session.current?.close();
  }, []);
  /* oxlint-enable react/react-compiler */

  function update(next: State) { stateRef.current = next; setState(next); }
  function broadcast(next: State, nextPack = packRef.current) { session.current?.send({ type: 'state', state: next, pack: nextPack }); }
  function dispatch(action: Action) {
    if (!state || !canPlay) return;
    if (live && role === 1) { session.current?.send({ type: 'move', id: state.id, rev: state.rev, action }); return; }
    const next = move(state, action, activePlayer, pack);
    update(next); if (live) broadcast(next);
    if (!live && state.game === 'brain' && activePlayer === 0 && next !== state) setHanded(false);
  }
  function start(game: Game) {
    if (guest || (remote && !live)) return;
    const next = newGame(game, game === 'brain' && state?.game === 'brain' ? state.question + 1 : 0);
    update(next); setHanded(false); if (live) broadcast(next);
  }
  function disconnect() {
    session.current?.close(); session.current = null; modeRef.current = 'local'; setStatus('local'); setRole(0); setStep('choose'); setInput(''); setOutput(''); setError('');
    update(newGame(state?.game ?? 'lines')); setHanded(false);
  }
  function makeSession(host: boolean) {
    session.current?.close();
    setRole(host ? 0 : 1); modeRef.current = 'connecting'; setStatus('connecting'); setCopied(false);
    const nextSession = new PeerSession(host, data => {
      if (!data || typeof data !== 'object') return;
      const msg = data as Record<string, unknown>;
      if (host && msg.type === 'hello' && stateRef.current) broadcast(stateRef.current);
      if (host && msg.type === 'move' && stateRef.current && modeRef.current === 'connected') {
        const current = stateRef.current;
        const action = msg.action as Action | undefined;
        if (msg.id !== current.id || msg.rev !== current.rev || !action || !['pick','continue'].includes(action.type)) { broadcast(current); return; }
        const next = move(current, action, 1, packRef.current); update(next); broadcast(next);
      }
      if (!host && msg.type === 'state' && validState(msg.state)) {
        const nextPack = cleanPack(msg.pack); if (!nextPack) return;
        update(msg.state); setPack(nextPack); packRef.current = nextPack; setHanded(false);
      }
    }, nextStatus => {
      modeRef.current = nextStatus; setStatus(nextStatus);
      if (nextStatus === 'connected') { modeRef.current = 'connected'; setConnect(false); setError(''); if (host && stateRef.current) broadcast(stateRef.current); else nextSession.send({ type: 'hello' }); }
      if (nextStatus === 'timeout') setError('Your browsers couldn’t connect. Keep both pages open, try another Wi-Fi network, or play on one phone. Some networks need a relay that this prototype doesn’t use.');
    });
    session.current = nextSession; return nextSession;
  }
  async function createOffer() {
    setBusy(true); setError(''); setOutput(''); setInput('');
    try { const peer = makeSession(true); update(newGame(state?.game ?? 'lines')); setOutput(await peer.offer()); setStep('offer'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create a connection.'); session.current?.close(); setStatus('local'); }
    finally { setBusy(false); }
  }
  async function acceptOffer() {
    setBusy(true); setError(''); setOutput('');
    try { const peer = makeSession(false); setOutput(await peer.answer(input)); setStep('answer'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read that code.'); session.current?.close(); setStatus('local'); }
    finally { setBusy(false); }
  }
  async function finish() {
    setBusy(true); setError('');
    try { await session.current?.finish(input); setStep('waiting'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not complete the connection.'); }
    finally { setBusy(false); }
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(output); setCopied(true); }
    catch { setError('Select the connection code below and copy it manually.'); }
  }
  function savePack() {
    const next = cleanPack(draft); if (!next) return;
    setPack(next); packRef.current = next;
    try { localStorage.setItem('little-us-pack', JSON.stringify(next)); setNotice('Your little details are saved on this device.'); }
    catch { setNotice('Your details work for this visit. This browser couldn’t save them.'); }
    if (live && stateRef.current) broadcast(stateRef.current, next);
    setSettings(false);
  }

  return <main className="arcade">
    <header className="masthead"><div className="brand">little us<span>♥</span></div><span className="edition">A TINY ARCADE FOR TWO</span><button className="pill" onClick={() => setConnect(true)}><Link2 size={16}/>{live ? 'You’re connected' : 'Play together'}</button></header>
    <div className="intro"><div><p className="eyebrow">A little competition. A lot of affection.</p><h1>Your favourite<br/>player is here<span>.</span></h1></div><p>Pick a game. Steal a win.<br/>Fall a little harder.</p></div>
    <div className="workspace"><aside className="game-menu"><p className="eyebrow">PICK YOUR LITTLE MOMENT</p>
      {games.map(g => <button key={g.id} disabled={guest || remote && !live} aria-pressed={selected.id === g.id} className={'game-option ' + (selected.id === g.id ? 'active' : '')} onClick={() => start(g.id)}><g.icon/><span><strong>{g.title}</strong><small>{g.sub}</small></span><ArrowUpRight/></button>)}
      <div className="little-note"><Sparkles size={22}/><p>Winning is cute.<br/>Being your teammate? Cuter.</p><span>FROM THE PEANUT GALLERY</span></div>
      <button className="personalise" disabled={guest} onClick={() => { setDraft(structuredClone(pack)); setSettings(true); }}><SlidersHorizontal size={16}/> Make it a little more us <ArrowUpRight size={16}/></button>
    </aside>
    <section className="play-surface" aria-label={selected.title}>
      <div className="game-heading"><div><p className="eyebrow">{selected.eyebrow}</p><h2>{selected.title}</h2></div><span className="badge">2 PLAYERS · {selected.id === 'memory' ? '2' : '1'} MIN</span></div>
      <p className="instructions">{selected.instruction}</p>
      <div className="session-label">{live ? 'Connected · You are ' + pack.names[role] : remote ? 'Connection paused · Open Play together to reconnect' : 'One phone · Take turns, or connect a second phone'}</div>
      <div className="players">{pack.names.map((name,i) => <span key={i} className={(selected.id === 'brain' ? state?.answers[i] === null : state?.turn === i) && !state?.done ? 'current' : ''}>{i === 0 ? '♥' : '✦'} {name}{selected.id === 'memory' ? ' · ' + (state?.scores[i] ?? 0) : ''}{selected.id === 'brain' && state && state.answers[i] !== null ? ' ✓' : ''}</span>)}</div>
      {selected.id === 'lines' && <div className="board">{(state?.board ?? Array(9).fill(-1)).map((n,i) => <button key={i} aria-label={'Square ' + (i+1) + (n === -1 ? ', empty' : ', ' + pack.names[n])} disabled={!state || n !== -1 || state.done || !canPlay} onClick={() => dispatch({ type: 'pick', index: i })} className={n === 0 ? 'heart' : 'star'}>{n === 0 ? '♥' : n === 1 ? '✦' : ''}</button>)}</div>}
      {selected.id === 'memory' && <div className="memory-board">{state?.deck.map((card,i) => { const revealed = state.open.includes(i) || state.matched.includes(i); return <button key={i} aria-label={revealed ? pack.memories[card] : 'Hidden memory ' + (i+1)} className={state.matched.includes(i) ? 'matched' : revealed ? 'flipped' : ''} disabled={!canPlay || state.done || revealed || state.open.length === 2} onClick={() => dispatch({ type: 'pick', index: i })}>{revealed ? pack.memories[card] : <Heart aria-hidden="true" size={22}/>}</button>; })}</div>}
      {selected.id === 'brain' && state && <div className="brain-area">
        {!live && state.answers[0] !== null && !handed && !state.done ? <div className="handoff"><Heart size={34}/><h3>No peeking, {pack.names[0]}.</h3><p>Pass the phone to {pack.names[1]}. Your answer is tucked away.</p><button className="primary-button" onClick={() => setHanded(true)}>I’m {pack.names[1]} · Ready</button></div> : <><h3>{questions[state.question].q}</h3><div className="answers">{questions[state.question].a.map((answer,i) => <button key={i} disabled={state.done || !canPlay || state.answers[activePlayer] !== null} className={state.done && state.answers.includes(i) ? 'chosen' : ''} onClick={() => dispatch({ type: 'pick', index: i })}><span>{answer}</span>{state.done && <small>{state.answers.map((a,p) => a === i ? pack.names[p] : '').filter(Boolean).join(' & ')}</small>}</button>)}</div>{live && !state.done && state.answers[role] !== null && <p className="turn-label">Locked in. Waiting for your favourite person…</p>}</>}
      </div>}
      <div aria-live="polite" aria-atomic="true" className={'reaction ' + (state?.done ? 'celebration' : '')}>
        <p className="turn-label">{state?.result || (selected.id === 'brain' ? (live ? 'Pick what feels most like the two of you.' : pack.names[activePlayer] + ', your secret pick.') : pack.names[state?.turn ?? 0] + ', make your move.')}</p>
        {state?.message && <p className="banter">{state.message}</p>}
      </div>
      {selected.id === 'memory' && state?.open.length === 2 && <button disabled={!canPlay} className="primary-button" onClick={() => dispatch({ type: 'continue' })}>Hide cards & pass the turn</button>}
      {!guest ? <button disabled={remote && !live} className="text-button" onClick={() => start(selected.id)}>{state?.done && selected.id === 'brain' ? 'Try the next question' : 'Start a fresh round'} ↗</button> : <p className="guest-note">{pack.names[0]} picks the game and starts new rounds.</p>}
    </section></div>
    {notice && <output className="notice">{notice}</output>}
    <footer><span>LESS SCROLLING. MORE US.</span><span>Made for your kind of weird. ♥</span></footer>

    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="app-dialog"><DialogTitle className="dialog-title">A little more us.</DialogTitle><DialogDescription>These details stay on this device and are shared with your connected partner.</DialogDescription><form onSubmit={e => { e.preventDefault(); savePack(); }}>
      <div className="field-pair">{draft.names.map((name,i) => <label key={i}>{i === 0 ? 'Your nickname (host)' : 'Partner’s nickname'}<input maxLength={24} required value={name} onChange={e => setDraft(d => ({ ...d, names: d.names.map((n,j) => j === i ? e.target.value : n) as [string,string] }))}/></label>)}</div>
      <label>Your inside joke<textarea maxLength={140} value={draft.joke} onChange={e => setDraft(d => ({ ...d, joke: e.target.value }))}/></label>
      <label>A sweet reward or gesture<textarea maxLength={140} placeholder="A love note? A cup of tea? You two decide." value={draft.reward} onChange={e => setDraft(d => ({ ...d, reward: e.target.value }))}/></label>
      <fieldset><legend>Six little memories for your matching cards</legend><div className="field-pair">{draft.memories.map((memory,i) => <label key={i} className="memory-input"><span className="sr-only">Memory {i+1}</span><input required maxLength={24} value={memory} onChange={e => setDraft(d => ({ ...d, memories: d.memories.map((m,j) => j === i ? e.target.value : m) }))}/></label>)}</div></fieldset>
      <button type="submit" className="primary-button full-width">Save our little details <Heart size={16}/></button>
    </form></DialogContent></Dialog>

    <Dialog open={connect} onOpenChange={setConnect}><DialogContent className="app-dialog"><DialogTitle className="dialog-title">Two phones. One little us.</DialogTitle><DialogDescription>Keep this page open on both phones. Exchange connection codes through your usual messenger.</DialogDescription>
      {live ? <div className="connection-success"><Check size={32}/><h3>You’re connected.</h3><p>You play as {pack.names[role]}. Your game moves go directly between the browsers.</p><button className="primary-button" onClick={() => setConnect(false)}>Back to our game</button><button className="text-button" onClick={disconnect}>Disconnect & play on one phone</button></div> : <>
        {step === 'choose' && <Tabs defaultValue="host" onValueChange={() => { setError(''); setInput(''); }}><TabsList className="connect-tabs"><TabsTrigger value="host">Invite my partner</TabsTrigger><TabsTrigger value="join">I have an invite</TabsTrigger></TabsList><TabsContent value="host"><p>Start a fresh session, then send the invite code to your partner.</p><button disabled={busy} className="primary-button full-width" onClick={createOffer}>{busy ? 'Finding a way to connect…' : 'Create our invite'}</button></TabsContent><TabsContent value="join"><label>Paste your partner’s invite code<textarea className="code-area" value={input} onChange={e => setInput(e.target.value)} placeholder="LU1.…" spellCheck={false}/></label><button disabled={busy || !input.trim()} className="primary-button full-width" onClick={acceptOffer}>{busy ? 'Preparing your reply…' : 'Create my reply code'}</button></TabsContent></Tabs>}
        {output && <div className="code-output"><p><strong>{step === 'offer' ? '1. Send this invite code to your partner.' : 'Send this reply code back to your partner.'}</strong></p><textarea aria-label="Your connection code" className="code-area" readOnly value={output} onFocus={e => e.target.select()}/><button className="primary-button full-width" onClick={copyCode}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied · ready to paste' : 'Copy connection code'}</button></div>}
        {step === 'offer' && <><label>2. Paste the reply code they send back<textarea className="code-area" value={input} onChange={e => setInput(e.target.value)} placeholder="LU1.…" spellCheck={false}/></label><button disabled={busy || !input.trim()} className="primary-button full-width" onClick={finish}>{busy ? 'Connecting…' : 'Connect our phones'}</button></>}
        {(step === 'answer' || step === 'waiting') && <output>Waiting for your browsers to connect. Keep both pages open.</output>}
        <p role="alert" className="error">{error}</p>
        <button className="text-button" disabled={busy} onClick={() => { disconnect(); setCopied(false); }}>Reset connection / play on one phone</button>
        <details className="connection-details"><summary>About the connection</summary><p>No accounts or game server are needed by the app. A public Google STUN service helps the browsers find each other; some mobile or restricted networks need a relay, which this version doesn’t include. Closing or refreshing a page ends the session. Share connection codes only with your partner.</p></details>
      </>}
    </DialogContent></Dialog>
  </main>;
}
