'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, Sparkles, ArrowUpRight, Grid2X2, Radio, Link2, SlidersHorizontal, Check, Copy, Share2, Wand2, ArrowLeft, ClipboardPaste } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cleanPack, defaultPack, jokeIdeas, rewardIdeas, surprise, surpriseMemories, newGame, move, questions, NAME_LIMIT, LINE_LIMIT, type Action, type Game, type Pack, type Player, type State } from '@/lib/games';
import { PeerSession } from '@/lib/peer';
import { readCode, joinLink } from '@/lib/invite';

const games = [
  { id: 'lines' as Game, title: 'Love Lines', sub: 'Tic-tac-toe, with feelings', icon: Heart, eyebrow: '01 / A FRIENDLY LITTLE RIVALRY', instruction: 'Three in a row. Infinite bragging rights.' },
  { id: 'brain' as Game, title: 'Same Brain', sub: 'Two minds. One answer?', icon: Radio, eyebrow: '02 / TUNE INTO EACH OTHER', instruction: 'Pick secretly. Your answers appear when you’ve both chosen.' },
  { id: 'memory' as Game, title: 'Memory Lane', sub: 'Made for a perfect pair', icon: Grid2X2, eyebrow: '03 / REMEMBER THE LITTLE THINGS', instruction: 'Flip two cards. Find a pair to score and go again.' },
];
const stages = [
  { eyebrow: 'FIRST THINGS FIRST', title: 'What do we call you two?', blurb: 'Nicknames only. The sillier the better.' },
  { eyebrow: 'THE IMPORTANT PART', title: 'What’s your inside joke?', blurb: 'It’ll turn up mid-game, exactly when you least expect it.' },
  { eyebrow: 'RAISE THE STAKES', title: 'What does the winner get?', blurb: 'Keep it small. Keep it sweet. Keep it honest.' },
  { eyebrow: 'ALMOST THERE', title: 'Six little things you’d never forget.', blurb: 'These become your matching cards in Memory Lane.' },
];
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
  const [stage, setStage] = useState(0);
  const [firstRun, setFirstRun] = useState(false);
  const [link, setLink] = useState('');
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

  function openSetup(onboarding: boolean) {
    setDraft(onboarding ? { names: ['', ''], joke: '', reward: '', memories: ['', '', '', '', '', ''] } : structuredClone(packRef.current));
    setStage(0); setFirstRun(onboarding); setSettings(true);
  }
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
    session.current?.close(); session.current = null; modeRef.current = 'local'; setStatus('local'); setRole(0); setStep('choose'); setInput(''); setOutput(''); setError(''); setLink('');
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
    setBusy(true); setError(''); setOutput(''); setInput(''); setLink('');
    try { const peer = makeSession(true); update(newGame(state?.game ?? 'lines')); const code = await peer.offer(); setOutput(code); setLink(joinLink(code)); setStep('offer'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create a connection.'); session.current?.close(); setStatus('local'); }
    finally { setBusy(false); }
  }
  async function acceptOffer(code = input) {
    setBusy(true); setError(''); setOutput('');
    try { const peer = makeSession(false); setOutput(await peer.answer(code)); setStep('answer'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read that invite.'); session.current?.close(); setStatus('local'); setStep('choose'); }
    finally { setBusy(false); }
  }
  async function finish() {
    setBusy(true); setError('');
    try { await session.current?.finish(input); setStep('waiting'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not complete the connection.'); }
    finally { setBusy(false); }
  }
  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setError(''); }
    catch { setError('Select the text below and copy it manually.'); }
  }
  async function shareInvite() {
    if (!navigator.share) return copyText(link);
    try { await navigator.share({ title: 'Little Us', text: 'Come play Little Us with me ♥', url: link }); }
    catch { /* A dismissed share sheet is not a failure. */ }
  }
  async function pasteReply() {
    try { setInput(readCode(await navigator.clipboard.readText())); setError(''); }
    catch { setError('Paste their reply code into the box below.'); }
  }
  function savePack() {
    const next = cleanPack(draft); if (!next) return;
    setPack(next); packRef.current = next;
    try { localStorage.setItem('little-us-pack', JSON.stringify(next)); setNotice(firstRun ? 'You’re all set. Go win something. ♥' : 'Your little details are saved on this device.'); }
    catch { setNotice('Your details work for this visit. This browser couldn’t save them.'); }
    if (live && stateRef.current) broadcast(stateRef.current, next);
    setSettings(false);
  }

  // An invite arrives in the fragment, which browsers never send to a server. Tapping
  // one while the app is already open only changes the fragment and never reloads the
  // page, so the same handler has to run again on hashchange.
  function consumeInvite() {
    if (!/[#?&]j=/.test(location.hash)) return false;
    const invite = readCode(location.hash);
    history.replaceState(null, '', location.pathname + location.search);
    setConnect(true); void acceptOffer(invite);
    return true;
  }

  // Browser-only random state, device preferences and any invite in the URL must
  // wait for hydration. Declared last so nothing here is called before it exists.
  /* oxlint-disable react/react-compiler */
  useEffect(() => {
    const initial = newGame('lines'); stateRef.current = initial; setState(initial);
    let saved: Pack | null = null;
    try { saved = cleanPack(JSON.parse(localStorage.getItem('little-us-pack') || 'null')); if (saved) { setPack(saved); packRef.current = saved; } } catch { /* Device storage is optional. */ }
    if (!consumeInvite() && !saved) openSetup(true);
    const onHash = () => { consumeInvite(); };
    addEventListener('hashchange', onHash);
    return () => { removeEventListener('hashchange', onHash); session.current?.close(); };
  }, []);
  /* oxlint-enable react/react-compiler */

  return <main className="arcade">
    <header className="masthead"><div className="brand">little us<span>♥</span></div><span className="edition">A TINY ARCADE FOR TWO</span><button className="pill" onClick={() => setConnect(true)}><Link2 size={16}/>{live ? 'You’re connected' : 'Play together'}</button></header>
    <div className="intro"><div><p className="eyebrow">A little competition. A lot of affection.</p><h1>Your favourite<br/>player is here<span>.</span></h1></div><p>Pick a game. Steal a win.<br/>Fall a little harder.</p></div>
    <div className="workspace"><aside className="game-menu"><p className="eyebrow">PICK YOUR LITTLE MOMENT</p>
      {games.map(g => <button key={g.id} disabled={guest || remote && !live} aria-pressed={selected.id === g.id} className={'game-option ' + (selected.id === g.id ? 'active' : '')} onClick={() => start(g.id)}><g.icon/><span><strong>{g.title}</strong><small>{g.sub}</small></span><ArrowUpRight/></button>)}
      <div className="little-note"><Sparkles size={22}/><p>Winning is cute.<br/>Being your teammate? Cuter.</p><span>FROM THE PEANUT GALLERY</span></div>
      <button className="personalise" disabled={guest} onClick={() => openSetup(false)}><SlidersHorizontal size={16}/> Make it a little more us <ArrowUpRight size={16}/></button>
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

    <Dialog open={settings} onOpenChange={open => open ? setSettings(true) : savePack()}><DialogContent className="app-dialog">
      <p className="eyebrow">{stages[stage].eyebrow} · {stage+1} OF {stages.length}</p>
      <DialogTitle className="dialog-title">{stages[stage].title}</DialogTitle>
      <DialogDescription>{stages[stage].blurb}</DialogDescription>
      <form onSubmit={e => { e.preventDefault(); if (stage < stages.length-1) setStage(stage+1); else savePack(); }}>
        {stage === 0 && <div className="field-pair">{draft.names.map((name,i) => <label key={i}>{i === 0 ? 'You' : 'Your favourite person'}<input maxLength={NAME_LIMIT} placeholder={defaultPack.names[i]} value={name} onChange={e => setDraft(d => ({ ...d, names: d.names.map((n,j) => j === i ? e.target.value : n) as [string,string] }))}/></label>)}</div>}
        {stage === 1 && <><label>The joke you’d have to explain to anyone else<textarea maxLength={LINE_LIMIT} placeholder={defaultPack.joke} value={draft.joke} onChange={e => setDraft(d => ({ ...d, joke: e.target.value }))}/></label><button type="button" className="text-button" onClick={() => setDraft(d => ({ ...d, joke: surprise(jokeIdeas, d.joke || defaultPack.joke) }))}><Wand2 size={15}/> Can’t think of one? Surprise me</button></>}
        {stage === 2 && <><label>The prize<textarea maxLength={LINE_LIMIT} placeholder={defaultPack.reward} value={draft.reward} onChange={e => setDraft(d => ({ ...d, reward: e.target.value }))}/></label><button type="button" className="text-button" onClick={() => setDraft(d => ({ ...d, reward: surprise(rewardIdeas, d.reward || defaultPack.reward) }))}><Wand2 size={15}/> Surprise me</button></>}
        {stage === 3 && <><fieldset><legend className="sr-only">Six little memories</legend><div className="field-pair">{draft.memories.map((memory,i) => <label key={i} className="memory-input"><span className="sr-only">Memory {i+1}</span><input maxLength={NAME_LIMIT} placeholder={defaultPack.memories[i]} value={memory} onChange={e => setDraft(d => ({ ...d, memories: d.memories.map((m,j) => j === i ? e.target.value : m) }))}/></label>)}</div></fieldset><button type="button" className="text-button" onClick={() => setDraft(d => ({ ...d, memories: surpriseMemories(d.memories.some(Boolean) ? d.memories : defaultPack.memories) }))}><Wand2 size={15}/> Surprise me</button></>}
        <div className="stage-dots">{stages.map((s,i) => <button key={i} type="button" aria-label={'Step ' + (i+1) + ': ' + s.title} aria-current={i === stage} className={i === stage ? 'active' : ''} onClick={() => setStage(i)}/>)}</div>
        <div className="stage-actions">
          {stage > 0 && <button type="button" className="text-button" onClick={() => setStage(stage-1)}><ArrowLeft size={15}/> Back</button>}
          <button type="submit" className="primary-button">{stage < stages.length-1 ? 'Next' : firstRun ? 'Let’s play' : 'Save our little details'} <Heart size={16}/></button>
        </div>
        {firstRun && <button type="button" className="text-button skip" onClick={savePack}>Skip · we’ll sort it out later</button>}
      </form>
    </DialogContent></Dialog>

    <Dialog open={connect} onOpenChange={setConnect}><DialogContent className="app-dialog"><DialogTitle className="dialog-title">Two phones. One little us.</DialogTitle><DialogDescription>Send a link, get one short code back, and you’re playing. Keep this page open on both phones.</DialogDescription>
      {live ? <div className="connection-success"><Check size={32}/><h3>You’re connected.</h3><p>You play as {pack.names[role]}. Your game moves go directly between the browsers.</p><button className="primary-button" onClick={() => setConnect(false)}>Back to our game</button><button className="text-button" onClick={disconnect}>Disconnect & play on one phone</button></div> : <>
        {step === 'choose' && (busy ? <output>Opening your invite…</output> : <Tabs defaultValue="host" onValueChange={() => { setError(''); setInput(''); }}><TabsList className="connect-tabs"><TabsTrigger value="host">Invite my partner</TabsTrigger><TabsTrigger value="join">I have an invite</TabsTrigger></TabsList><TabsContent value="host"><p>We’ll make you a link. Send it, they tap it, they’re in.</p><button disabled={busy} className="primary-button full-width" onClick={createOffer}>{busy ? 'Finding a way to connect…' : 'Create our invite link'}</button></TabsContent><TabsContent value="join"><label>Paste the invite link they sent you<textarea className="code-area" value={input} onChange={e => setInput(e.target.value)} placeholder="https://…#j=LU2.… or LU2.…" spellCheck={false}/></label><button disabled={busy || !input.trim()} className="primary-button full-width" onClick={() => acceptOffer()}>{busy ? 'Preparing your reply…' : 'Join the game'}</button></TabsContent></Tabs>)}
        {step === 'offer' && <><div className="code-output"><p><strong>1. Send this link to {pack.names[1]}.</strong></p><input aria-label="Your invite link" className="link-area" readOnly value={link} onFocus={e => e.target.select()}/><div className="share-row"><button className="primary-button" onClick={() => copyText(link)}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : 'Copy link'}</button>{typeof navigator !== 'undefined' && 'share' in navigator && <button className="primary-button" onClick={shareInvite}><Share2 size={16}/> Share</button>}</div></div>
          <label>2. They’ll send back a short reply code. Paste it here.<textarea className="code-area" value={input} onChange={e => setInput(e.target.value)} placeholder="LU2.…" spellCheck={false}/></label>
          <div className="share-row"><button type="button" className="primary-button" onClick={pasteReply}><ClipboardPaste size={16}/> Paste</button><button disabled={busy || !input.trim()} className="primary-button" onClick={finish}>{busy ? 'Connecting…' : 'Connect our phones'}</button></div></>}
        {step === 'answer' && <div className="code-output"><p><strong>Almost there. Send this reply code back to your partner.</strong></p><textarea aria-label="Your reply code" className="code-area" readOnly value={output} onFocus={e => e.target.select()}/><button className="primary-button full-width" onClick={() => copyText(output)}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied · send it over' : 'Copy reply code'}</button><output>Then keep this page open. You’ll connect automatically.</output></div>}
        {step === 'waiting' && <output>Waiting for your browsers to connect. Keep both pages open.</output>}
        <p role="alert" className="error">{error}</p>
        <button className="text-button" disabled={busy} onClick={() => { disconnect(); setCopied(false); }}>Reset connection / play on one phone</button>
        <details className="connection-details"><summary>About the connection</summary><p>No accounts or game server are needed by the app. Your invite lives in the part of the link browsers never send to a server, and it carries the connection details for your device. A public Google STUN service helps the browsers find each other; some mobile or restricted networks need a relay, which this version doesn’t include. Closing or refreshing a page ends the session. Send invite links only to your partner.</p></details>
      </>}
    </DialogContent></Dialog>
  </main>;
}
