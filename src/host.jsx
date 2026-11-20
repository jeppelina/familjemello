// The host view: the big screen (TV or laptop) that runs the show.
import {
  buildRevealBeats, cleanVideoTitle, estimateMinutes, extractStartTime, extractYouTubeId, FINAL_RECAP_CLIP_SEC,
  FINAL_SHORT_CLIP_SEC, FINAL_THEME, formatDuration, formatTimestamp, GAME_CODE_RE, getGroupTheme, getHighlightStart,
  GROUP_CLIP_SEC, parseTimestamp, pickerTable, planGroups, QUALIFIERS_PER_GROUP, runningOrder, tieReason, totalsAfter,
} from './logic.js';
import {
  completeVoterIds, currentTiebreaks, getActiveBallot, initialState, isFinal, reducer, roundLabel, roundTheme,
  SNAPSHOT_VERSION, songIdsForRound, songMap,
} from './state.js';
import {
  addToHallOfFame, closeChannel, getHallOfFame, getHostCode, loadGame, loadLocalSnapshot, lookupVideo,
  openGameChannel, saveGame, saveLocalSnapshot, setHostCode,
} from './net.js';
import * as sfx from './sfx.js';
import { PLAYLISTS } from './playlists.js';
import { YouTubePlayer } from './youtube.jsx';
import {
  fireConfetti, fireMiniConfetti, FloatingParticles, StageLights, StarsText, Thumb, useKeys, VoteInput,
} from './ui.jsx';

const { useState, useReducer, useEffect, useRef, useMemo } = React;

const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1));

// Gradient headings: the gradient sits on the text only, so emojis keep their colours.
function Heading({ emoji, after, children }) {
  return (
    <div className="group-label">
      {emoji && <span className="gl-emoji">{emoji}</span>}
      <span className="gl-text">{children}</span>
      {after && <span className="gl-emoji after">{after}</span>}
    </div>
  );
}

function FactsCard({ facts }) {
  if (!facts || !facts.length) return null;
  return (
    <div className="card facts-card">
      <div className="facts-title">💡 Visste du?</div>
      <ul className="facts-list">{facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
    </div>
  );
}

// ==================== SAVING + LIVE SYNC ====================

function useHostGame(state, dispatch, boot) {
  const [code, setCode] = useState(boot.code);
  const [connected, setConnected] = useState(false);
  const [serverChecked, setServerChecked] = useState(false);
  const [toast, setToast] = useState(boot.snap && boot.snap.phase !== 'setup' ? 'Välkommen tillbaka! Ni fortsätter där ni slutade.' : null);
  const chRef = useRef(null);
  const ballot = getActiveBallot(state);
  const ballotRef = useRef(ballot);
  ballotRef.current = ballot;
  const ballotJson = JSON.stringify(ballot);

  const send = (event, payload) => {
    if (chRef.current) chRef.current.send({ type: 'broadcast', event, payload });
  };

  // Once at start: is the copy on the server newer (the game went on on another computer)?
  useEffect(() => {
    let alive = true;
    loadGame(boot.code).then((snap) => {
      if (!alive) return;
      const localAt = boot.snap ? boot.snap.savedAt || 0 : 0;
      if (snap && snap.v === SNAPSHOT_VERSION && (snap.savedAt || 0) > localAt) {
        dispatch({ type: 'RESTORE', snapshot: snap });
        if (snap.phase !== 'setup') setToast('Spelet hämtades från molnet. Ni fortsätter där ni slutade.');
      }
      setServerChecked(true);
    });
    return () => { alive = false; };
  }, []);

  // Save every change on this device at once, and to the server shortly after.
  const stateJson = JSON.stringify(state);
  useEffect(() => {
    const snap = { ...state, code, savedAt: Date.now() };
    saveLocalSnapshot(snap);
    if (!serverChecked) return undefined;
    const t = setTimeout(() => saveGame(code, snap), 1200);
    return () => clearTimeout(t);
  }, [stateJson, code, serverChecked]);

  // Live channel: phones send votes, names, tiebreak picks and "my 12 points" presses.
  useEffect(() => {
    const ch = openGameChannel(code);
    if (!ch) return undefined;
    const on = (event, fn) => ch.on('broadcast', { event }, ({ payload }) => { if (payload) fn(payload); });
    on('vote', (p) => dispatch({ type: 'SET_VOTE', round: p.round, songId: p.songId, voterId: p.voterId, stars: p.stars }));
    on('register', (p) => {
      if (p.id && p.name) dispatch({ type: 'ADD_VOTER', id: String(p.id).slice(0, 40), name: String(p.name), simple: !!p.simple, phone: true });
    });
    on('unregister', (p) => { if (p.id) dispatch({ type: 'REMOVE_VOTER', id: p.id }); });
    on('tiebreak_pick', (p) => dispatch({ type: 'TIEBREAK_PICK', round: p.round, voterId: p.voterId, songId: p.songId }));
    on('tiebreak_random', (p) => { if (p.voterId) dispatch({ type: 'TIEBREAK_RANDOM', round: p.round, voterId: p.voterId }); });
    on('reveal_press', (p) => dispatch({ type: 'REVEAL_PRESS', voterId: p.voterId }));
    ch.on('broadcast', { event: 'hello' }, () => send('ballot', ballotRef.current));
    ch.subscribe((status) => {
      const ok = status === 'SUBSCRIBED';
      setConnected(ok);
      if (ok) {
        send('ballot', ballotRef.current);
        send('rollcall', {}); // phones answer by registering their voters again
      }
    });
    chRef.current = ch;
    return () => {
      closeChannel(ch);
      chRef.current = null;
      setConnected(false);
    };
  }, [code]);

  useEffect(() => {
    if (connected) send('ballot', ballotRef.current);
  }, [ballotJson, connected]);

  const kick = (id) => send('kick', { id });

  const switchGame = async (newCode) => {
    const c = String(newCode || '').trim().toUpperCase();
    if (!GAME_CODE_RE.test(c)) return 'Koden ska vara fem tecken.';
    const snap = await loadGame(c);
    if (!snap || snap.v !== SNAPSHOT_VERSION) return 'Hittade inget spel med den koden.';
    setHostCode(c);
    dispatch({ type: 'RESTORE', snapshot: snap });
    setCode(c);
    setToast('Spel ' + c + ' hämtat. Ni fortsätter där ni slutade.');
    return null;
  };

  return { code, connected, toast, clearToast: () => setToast(null), kick, switchGame };
}

// ==================== APP SHELL ====================

export function HostApp() {
  const [boot] = useState(() => {
    const code = getHostCode();
    return { code, snap: loadLocalSnapshot(code) };
  });
  const [state, dispatch] = useReducer(reducer, boot.snap, (snap) => (snap ? reducer(initialState, { type: 'RESTORE', snapshot: snap }) : initialState));
  const room = useHostGame(state, dispatch, boot);
  const [muted, setMuted] = useState(sfx.isMuted());

  const toggleMute = () => { sfx.setMuted(!muted); setMuted(!muted); };
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { /* not supported */ }
  };
  const endGame = () => {
    if (window.confirm('Avsluta spelet? Låtarna och röstarna finns kvar, men alla röster nollställs.')) dispatch({ type: 'END_GAME' });
  };

  const props = { state, dispatch, room };
  let screen = null;
  switch (state.phase) {
    case 'setup': screen = <SetupScreen {...props} />; break;
    case 'groupIntro': screen = <IntroScreen {...props} />; break;
    case 'finalIntro': screen = <IntroScreen {...props} />; break;
    case 'group': case 'final': screen = <SongStage key={state.round} {...props} />; break;
    case 'groupRecap': case 'recap': screen = <RecapScreen key={state.phase + state.round} {...props} />; break;
    case 'tiebreak': screen = <TiebreakScreen {...props} />; break;
    case 'reveal': screen = <RevealScreen key={state.round} {...props} />; break;
    case 'winner': screen = <WinnerScreen {...props} />; break;
    default: screen = null;
  }

  return (
    <div className="container">
      <header className="header">
        <div className="logo">Familje-Mello</div>
        <div className="logo-sub">Familjens egen musiktävling</div>
        <div className="header-tools">
          <button className="icon-btn" onClick={toggleMute} title={muted ? 'Slå på ljudeffekter' : 'Stäng av ljudeffekter'}>{muted ? '🔇' : '🔊'}</button>
          <button className="icon-btn" onClick={toggleFullscreen} title="Helskärm">⛶</button>
          {state.phase !== 'setup' && <button className="icon-btn" onClick={endGame} title="Avsluta spelet">⏹</button>}
        </div>
      </header>
      {room.toast && <Toast text={room.toast} onClose={room.clearToast} />}
      {state.phase !== 'setup' && <PhaseIndicator state={state} />}
      <main className="main">{screen}</main>
    </div>
  );
}

function Toast({ text, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [text]);
  return <div className="toast" onClick={onClose}>{text}</div>;
}

function PhaseIndicator({ state }) {
  const items = [];
  for (let i = 0; i < state.groupCount; i++) items.push({ key: 'group_' + i, label: getGroupTheme(i).emoji + ' Delt. ' + (i + 1) });
  items.push({ key: 'final', label: '🏆 Final' });
  const cur = state.phase === 'winner' ? items.length : items.findIndex((x) => x.key === state.round);
  return (
    <div className="phase-indicator">
      {items.map((p, i) => (
        <span key={p.key} className={'phase-dot' + (i === cur ? ' active' : '') + (i < cur ? ' completed' : '')}>{i < cur ? '✓ ' : ''}{p.label}</span>
      ))}
    </div>
  );
}

function VotePanel({ code, connected, phoneCount, compact }) {
  const [open, setOpen] = useState(!compact);
  const url = window.location.origin + window.location.pathname + '?game=' + code;
  const qr = useMemo(() => {
    try {
      if (!window.qrcode) return null;
      const q = window.qrcode(0, 'M');
      q.addData(url);
      q.make();
      return q.createDataURL(6, 12);
    } catch (e) {
      return null; // the code still works without the picture
    }
  }, [url]);
  if (!code) return null;
  if (compact && !open) {
    return (
      <button className="vote-bar" onClick={() => setOpen(true)}>
        <span>📱 Rösta i mobilen · kod <b>{code}</b> · {phoneCount} {phoneCount === 1 ? 'mobil' : 'mobiler'}</span>
        <span className={'live-dot' + (connected ? ' on' : '')} />
        <span className="vote-bar-more">visa QR ▾</span>
      </button>
    );
  }
  return (
    <div className="card vote-panel">
      <div className="flex-between">
        <div className="card-title" style={{ marginBottom: 0 }}>
          📱 Rösta i mobilen
          <span className={'live-dot' + (connected ? ' on' : '')} title={connected ? 'Ansluten' : 'Ansluter…'} />
        </div>
        {compact && <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Dölj ▴</button>}
      </div>
      <div className="vote-panel-body">
        {qr && <img className="vote-panel-qr" src={qr} alt="QR-kod till spelet" />}
        <div className="vote-panel-info">
          <div className="muted small">Skanna koden eller gå till</div>
          <div className="vote-panel-url">{url.replace(/^https?:\/\//, '')}</div>
          <div className="muted small" style={{ marginTop: 12 }}>Spelkod</div>
          <div className="room-code">{code}</div>
        </div>
      </div>
    </div>
  );
}

// ==================== SETUP ====================

function SetupScreen({ state, dispatch, room }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [picker, setPicker] = useState('');
  const [highlight, setHighlight] = useState('');
  const [fact, setFact] = useState('');
  const [lookup, setLookup] = useState(null); // { status: loading|ok|blocked|missing|offline|unknown, raw }
  const [error, setError] = useState('');
  const [voterName, setVoterName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinMsg, setJoinMsg] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [hof] = useState(() => getHallOfFame());
  const touched = useRef({ title: false, artist: false, highlight: false });
  const videoId = extractYouTubeId(url);

  // Paste a link: look the video up, fill in title and artist, warn if it will not play here.
  useEffect(() => {
    if (!videoId) { setLookup(null); return undefined; }
    let alive = true;
    setLookup({ status: 'loading' });
    const st = extractStartTime(url);
    if (st && !touched.current.highlight) setHighlight(formatTimestamp(st));
    const t = setTimeout(async () => {
      const r = await lookupVideo(videoId);
      if (!alive) return;
      if (r.ok) {
        const parsed = cleanVideoTitle(r.title, r.author);
        setLookup({ status: 'ok', raw: r.title });
        if (!touched.current.title) setTitle(parsed.title);
        if (!touched.current.artist) setArtist(parsed.artist);
      } else {
        setLookup({ status: r.reason });
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [videoId]);

  const resetSongForm = () => {
    setUrl(''); setTitle(''); setArtist(''); setHighlight(''); setFact(''); setError(''); setLookup(null);
    touched.current = { title: false, artist: false, highlight: false };
  };
  const addSong = () => {
    if (!videoId) return setError('Klistra in en YouTube-länk.');
    if (lookup && lookup.status === 'blocked') return setError('Den här videon får bara spelas på YouTube. Sök upp en annan uppladdning av låten, till exempel en "lyric video".');
    if (lookup && lookup.status === 'missing') return setError('Hittar ingen video med den länken.');
    if (state.songs.some((s) => s.youtubeId === videoId)) return setError('Den låten är redan med.');
    if (!title.trim()) return setError('Skriv låtens titel.');
    dispatch({ type: 'ADD_SONG', song: { title: title.trim(), artist: artist.trim(), youtubeId: videoId, highlightStart: parseTimestamp(highlight), pickedBy: picker.trim(), facts: fact.trim() ? [fact.trim()] : [] } });
    resetSongForm(); // keep "vald av", people usually add several songs in a row
  };
  const addVoter = () => {
    if (!voterName.trim()) return;
    dispatch({ type: 'ADD_VOTER', name: voterName.trim() });
    setVoterName('');
  };
  const removeVoter = (v) => {
    dispatch({ type: 'REMOVE_VOTER', id: v.id });
    if (v.phone) room.kick(v.id);
  };
  const join = async () => {
    setJoinMsg('Letar…');
    const err = await room.switchGame(joinCode);
    setJoinMsg(err || '');
    if (!err) { setShowJoin(false); setJoinCode(''); }
  };
  const onEnter = (fn) => (e) => { if (e.key === 'Enter') fn(); };

  const n = state.songs.length;
  const plan = planGroups(n);
  const canStart = n >= 4 && state.voters.length >= 1;
  const pickerNames = [...new Set([...state.voters.map((v) => v.name), ...state.songs.map((s) => s.pickedBy).filter(Boolean)])];
  const phoneCount = state.voters.filter((v) => v.phone).length;
  const lookupLine = {
    loading: <span className="muted">Letar efter videon…</span>,
    ok: <span className="ok">✓ {lookup && lookup.raw}</span>,
    blocked: <span className="err">✕ Den här videon får bara spelas på YouTube. Välj en annan uppladdning.</span>,
    missing: <span className="err">✕ Hittar ingen video med den länken.</span>,
  }[lookup && lookup.status];

  return (
    <div className="animate-in">
      <VotePanel code={room.code} connected={room.connected} phoneCount={phoneCount} />

      {n === 0 && (
        <div className="playlist-banner">
          <div className="muted small" style={{ marginBottom: 10 }}>Färdiga listor att börja med (eller lägg till egna låtar nedan)</div>
          <div className="playlist-options">
            {PLAYLISTS.map((p, i) => (
              <button key={p.id} className={'playlist-option' + (i === 0 ? ' primary' : '')} onClick={() => dispatch({ type: 'LOAD_PLAYLIST', id: p.id })}>
                <span className="pl-emoji">{p.emoji}</span>
                <span className="pl-name">{p.name}</span>
                <span className="pl-blurb">{p.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">🎵 Lägg till låtar</div>
        <div className="input-row">
          <input className="input" placeholder="Klistra in en YouTube-länk" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={onEnter(addSong)} />
        </div>
        {lookupLine && <div className="lookup-line">{lookupLine}</div>}
        <div className="input-row">
          <input className="input" placeholder="Titel" value={title} onChange={(e) => { touched.current.title = true; setTitle(e.target.value); }} onKeyDown={onEnter(addSong)} />
          <input className="input" placeholder="Artist (valfritt)" value={artist} onChange={(e) => { touched.current.artist = true; setArtist(e.target.value); }} onKeyDown={onEnter(addSong)} />
        </div>
        <div className="input-row">
          <input className="input" list="mello-pickers" placeholder="Vem valde låten? (valfritt)" value={picker} onChange={(e) => setPicker(e.target.value)} onKeyDown={onEnter(addSong)} />
          <input className="input" placeholder="Bästa stället, t.ex. 1:05 (valfritt)" value={highlight} onChange={(e) => { touched.current.highlight = true; setHighlight(e.target.value); }} onKeyDown={onEnter(addSong)} />
          <button className="btn btn-primary btn-sm" onClick={addSong}>+ Lägg till</button>
        </div>
        <div className="input-row">
          <input className="input" placeholder="Kul fakta om låten, visas som &quot;Visste du?&quot; (valfritt)" value={fact} maxLength={200} onChange={(e) => setFact(e.target.value)} onKeyDown={onEnter(addSong)} />
        </div>
        <datalist id="mello-pickers">{pickerNames.map((p) => <option key={p} value={p} />)}</datalist>
        <div className="muted small">Tips: dela länken från YouTube med "Starta vid" så blir det bästa stället highlight i recapen.</div>
        {error && <div className="err" style={{ marginTop: 8 }}>{error}</div>}

        {n > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="flex-between" style={{ marginBottom: 8 }}>
              <span className="muted small">{n} låtar</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Ta bort alla låtar?')) dispatch({ type: 'CLEAR_SONGS' }); }}>Rensa</button>
            </div>
            {state.songs.map((song, i) => (
              <div key={song.id} className="song-item">
                <div className="song-number">{i + 1}</div>
                <Thumb videoId={song.youtubeId} className="song-thumb" />
                <div className="song-info">
                  <div className="song-title">{song.title}</div>
                  <div className="song-artist">{song.artist}{song.year ? ' (' + song.year + ')' : ''}</div>
                  <div className="song-meta">
                    {song.pickedBy ? 'Vald av ' + song.pickedBy : ''}
                    {song.pickedBy && song.highlightStart != null ? ' · ' : ''}
                    {song.highlightStart != null ? 'Highlight ' + formatTimestamp(song.highlightStart) : ''}
                    {song.facts && song.facts.length ? ' · 💡 ' + song.facts.length + ' fakta' : ''}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'REMOVE_SONG', id: song.id })} aria-label={'Ta bort ' + song.title}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">👨‍👩‍👧‍👦 Röstare</div>
        <div className="input-row">
          <input className="input" placeholder="Namn" value={voterName} maxLength={24} onChange={(e) => setVoterName(e.target.value)} onKeyDown={onEnter(addVoter)} />
          <button className="btn btn-primary btn-sm" onClick={addVoter}>+ Lägg till</button>
        </div>
        {state.voters.length > 0 && (
          <div className="voter-tags">
            {state.voters.map((v) => (
              <span key={v.id} className="tag">
                {v.phone && <span title="Röstar i mobilen">📱</span>}
                {v.name}
                <button className="tag-btn" title={v.simple ? 'Barnläge: tre stora knappar. Tryck för stjärnor.' : 'Stjärnor. Tryck för barnläge (tre stora knappar).'} onClick={() => dispatch({ type: 'SET_VOTER', id: v.id, patch: { simple: !v.simple } })}>{v.simple ? '👶' : '⭐'}</button>
                <button className="tag-btn" title="Ta bort" onClick={() => removeVoter(v)}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="muted small" style={{ marginTop: 10 }}>Tryck ⭐ eller 👶 för att växla mellan stjärnor och barnläge med tre stora knappar: 😍 🙂 😴.</div>
      </div>

      <div className="card">
        <div className="card-title">🏁 Finalen</div>
        <div className="segmented">
          <button className={state.settings.finalMode !== 'full' ? 'active' : ''} onClick={() => dispatch({ type: 'SET_SETTING', key: 'finalMode', value: 'highlights' })}>⚡ Snabbfinal</button>
          <button className={state.settings.finalMode === 'full' ? 'active' : ''} onClick={() => dispatch({ type: 'SET_SETTING', key: 'finalMode', value: 'full' })}>🎬 Hela låtarna</button>
        </div>
        <div className="muted small" style={{ marginTop: 10 }}>
          {state.settings.finalMode === 'full'
            ? 'Finalisterna visas först i ett klipp-recap och sedan varje låt i sin helhet innan ni röstar.'
            : 'Finalisterna visas med ett klipp på ' + FINAL_SHORT_CLIP_SEC + ' sekunder var, sedan röstar ni. Ni har ju redan sett låtarna.'}
        </div>
        {n >= 4 && (
          <div className="plan-line">
            {plan.groupCount === 0
              ? n + ' låtar: alla går direkt till finalen.'
              : n + ' låtar: ' + plan.groupCount + ' deltävlingar med ' + plan.sizes.join('/') + ' låtar, ' + plan.groupCount * QUALIFIERS_PER_GROUP + ' till finalen.'}
            {' Speltid ' + formatDuration(estimateMinutes(n, state.settings.finalMode)) + '. Spelet sparas, så ni kan pausa och fortsätta en annan dag.'}
          </div>
        )}
      </div>

      <div className="text-center mt-24">
        <button className="btn btn-gold btn-lg" disabled={!canStart} onClick={() => dispatch({ type: 'START_TOURNAMENT' })}>✨ Starta Familje-Mello! ✨</button>
        {!canStart && <div className="muted small" style={{ marginTop: 12 }}>Lägg till minst 4 låtar och 1 röstare</div>}
      </div>

      {hof.length > 0 && (
        <div className="card mt-24">
          <div className="card-title">🏆 Tidigare vinnare</div>
          {hof.slice(0, 10).map((h) => (
            <div key={h.gameId} className="hof-row">
              <span className="hof-date">{h.date}</span>
              <span className="hof-song"><b>{h.title}</b>{h.artist ? ' · ' + h.artist : ''}</span>
              {h.pickedBy && <span className="muted small">vald av {h.pickedBy}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="text-center mt-16">
        {!showJoin
          ? <button className="link-btn" onClick={() => setShowJoin(true)}>Fortsätta ett spel från en annan dator?</button>
          : (
            <div className="card join-card">
              <div className="muted small" style={{ marginBottom: 8 }}>Skriv spelkoden från den andra datorn.</div>
              <div className="input-row" style={{ justifyContent: 'center' }}>
                <input className="input code-input" maxLength={5} placeholder="ABCDE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} onKeyDown={onEnter(join)} />
                <button className="btn btn-blue btn-sm" onClick={join}>Hämta spelet</button>
              </div>
              {joinMsg && <div className="muted small">{joinMsg}</div>}
            </div>
          )}
      </div>
    </div>
  );
}

// ==================== INTRO ====================

function IntroScreen({ state, dispatch }) {
  const final = state.phase === 'finalIntro';
  const theme = final ? FINAL_THEME : getGroupTheme(state.currentGroup);
  const songs = songMap(state);
  const ids = songIdsForRound(state);
  useEffect(() => {
    sfx.whoosh();
    const t = setTimeout(sfx.sting, 350);
    return () => clearTimeout(t);
  }, [state.round]);
  useKeys((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch({ type: 'START_ROUND' }); } }, [state.round]);
  const badge = final
    ? (state.groupCount === 0 ? 'Direkt till final' : ids.length + ' finalister')
    : 'Deltävling ' + (state.currentGroup + 1) + ' av ' + state.groupCount;
  const shortFinal = final && state.groupCount > 0 && state.settings.finalMode !== 'full';
  return (
    <div className="intro-screen">
      <FloatingParticles accent={theme.accent} />
      <StageLights accent={theme.accent} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="intro-badge" style={{ background: 'rgba(' + theme.accentRgb + ',0.15)', color: theme.accent, border: '1px solid rgba(' + theme.accentRgb + ',0.3)' }}>{badge}</div>
        <div className="intro-emoji">{theme.emoji}</div>
        <div className="intro-title">{theme.name}</div>
        <div className="intro-theme">{shortFinal ? 'Snabbfinal: ett klipp per låt, sedan röstar ni!' : theme.tagline}</div>
        <div className="intro-songs">
          {ids.map((id, i) => {
            const s = songs[id];
            return (
              <div key={id} className="intro-song-pill" style={{ animationDelay: 0.8 + i * 0.15 + 's' }}>
                <div className="intro-song-num" style={{ background: 'rgba(' + theme.accentRgb + ',0.2)', color: theme.accent }}>{i + 1}</div>
                <div className="intro-song-info">
                  <div className="intro-song-title">{s.title}</div>
                  <div className="intro-song-artist">{s.artist}{s.year ? ' (' + s.year + ')' : ''}{s.pickedBy ? ' · vald av ' + s.pickedBy : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="intro-start-btn">
          <button className="btn btn-lg" style={{ background: 'linear-gradient(135deg, ' + theme.accent + ', var(--purple))', color: 'white' }} onClick={() => dispatch({ type: 'START_ROUND' })}>Kör igång!</button>
        </div>
      </div>
    </div>
  );
}

// ==================== WATCH AND VOTE ====================

function SongStage({ state, dispatch, room }) {
  const final = isFinal(state.round);
  const theme = roundTheme(state);
  const ids = songIdsForRound(state);
  const songs = songMap(state);
  const ci = Math.min(state.currentSongIndex, ids.length - 1);
  const cur = songs[ids[ci]];
  const rv = state.votes[state.round] || {};
  const voted = (sid, vid) => (rv[sid] || {})[vid] != null;
  const songDone = (sid) => state.voters.every((v) => voted(sid, v.id));
  const allDone = ids.every(songDone);
  const complete = completeVoterIds(state);
  const missing = state.voters.filter((v) => !complete.includes(v.id));
  const [editing, setEditing] = useState(null);
  useEffect(() => setEditing(null), [ci]);
  const go = (i) => dispatch({ type: 'SET_CURRENT_SONG', index: i });
  useKeys((e) => {
    if (e.key === 'ArrowRight') go(ci + 1);
    if (e.key === 'ArrowLeft') go(ci - 1);
  }, [ci]);

  const clipMode = final && state.groupCount > 0 && state.settings.finalMode !== 'full';
  const hs = getHighlightStart(cur);
  const phoneCount = state.voters.filter((v) => v.phone).length;
  const finish = () => {
    if (!allDone) {
      if (!complete.length) return;
      const names = missing.map((v) => v.name).join(', ');
      if (!window.confirm(names + ' har inte röstat på alla låtar och räknas inte i ' + roundLabel(state) + '. Fortsätta ändå?')) return;
    }
    dispatch({ type: 'FINISH_VOTING' });
  };

  return (
    <div className="animate-in">
      {final
        ? <Heading emoji="⭐" after="⭐">FINALEN</Heading>
        : <Heading emoji={theme.emoji}>{theme.name + ' · Deltävling ' + (state.currentGroup + 1)}</Heading>}
      <div className="group-sublabel">{final ? (clipMode ? 'Snabbfinal: se klippet och rösta' : ids.length + ' finalister, rösta en sista gång!') : 'Titta och rösta på en låt i taget'}</div>
      <VotePanel code={room.code} connected={room.connected} phoneCount={phoneCount} compact />
      <div className="song-tabs">
        {ids.map((id, i) => (
          <button key={id} className={'song-tab' + (i === ci ? ' active' : '') + (songDone(id) ? ' voted' : '')} onClick={() => go(i)}>
            {i + 1}. {songs[id].title}
            {songDone(id) && <span className="tab-check">✓</span>}
          </button>
        ))}
      </div>
      <div className="now-playing">
        <div className="now-playing-count">Låt {ci + 1} av {ids.length}</div>
        <div className="now-playing-song">{cur.title}</div>
        <div className="now-playing-artist">{cur.artist}{cur.year ? ' · ' + cur.year : ''}{cur.pickedBy ? ' · vald av ' + cur.pickedBy : ''}</div>
      </div>
      <YouTubePlayer key={cur.id} videoId={cur.youtubeId} start={clipMode ? hs : 0} end={clipMode ? hs + FINAL_SHORT_CLIP_SEC : 0} autoplay={!songDone(cur.id)} />
      <FactsCard facts={cur.facts} />
      <div className="card">
        <div className="card-title">Rösta på den här låten</div>
        {state.voters.map((v) => {
          const has = voted(cur.id, v.id);
          return (
            <div key={v.id} className="voter-row">
              <div className="voter-name">{v.phone ? '📱 ' : ''}{v.name}</div>
              {editing === v.id
                ? <VoteInput simple={v.simple} value={(rv[cur.id] || {})[v.id] || 0} onChange={(s) => { dispatch({ type: 'SET_VOTE', round: state.round, songId: cur.id, voterId: v.id, stars: s }); setEditing(null); }} />
                : (
                  <div className="voter-status">
                    <span className={has ? 'ok' : 'muted'}>{has ? '✓ Har röstat' : v.phone ? 'Röstar i mobilen…' : 'Väntar…'}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(v.id)}>{has ? 'Ändra' : 'Rösta här'}</button>
                  </div>
                )}
            </div>
          );
        })}
        {songDone(cur.id) && <div className="all-voted-banner">✓ Alla har röstat på den här!</div>}
        <div className="muted small text-center" style={{ marginTop: 12 }}>Betygen är hemliga tills poängen avslöjas 🤫</div>
      </div>
      <div className="nav-arrows">
        <button className="btn btn-ghost" onClick={() => go(ci - 1)} disabled={ci === 0}>← Förra</button>
        <div className="nav-center muted small">{ids.filter(songDone).length} av {ids.length} klara</div>
        {ci < ids.length - 1
          ? <button className={'btn ' + (songDone(cur.id) ? 'btn-primary' : 'btn-blue')} onClick={() => go(ci + 1)}>Nästa →</button>
          : <div style={{ width: 120 }} />}
      </div>
      {allDone
        ? <div className="text-center mt-24 animate-scale"><button className="btn btn-gold btn-lg" onClick={finish}>{final ? '🏆 Räkna poängen!' : '📊 Till recapen!'}</button></div>
        : (
          <div className="text-center mt-16">
            <div className="muted small">Ge betyg till alla låtar för att gå vidare</div>
            {complete.length > 0 && <button className="link-btn" style={{ marginTop: 6 }} onClick={finish}>Fortsätt ändå (de som inte röstat klart räknas inte)</button>}
          </div>
        )}
    </div>
  );
}

// ==================== RECAP (highlight clips) ====================

function RecapScreen({ state, dispatch }) {
  const final = state.phase === 'recap';
  const theme = final ? FINAL_THEME : getGroupTheme(state.currentGroup);
  const ids = final ? state.finalists : songIdsForRound(state);
  const songs = songMap(state);
  const { playing } = state.recap;
  const index = Math.min(state.recap.index, ids.length - 1);
  const song = songs[ids[index]];
  const clip = final ? FINAL_RECAP_CLIP_SEC : GROUP_CLIP_SEC;
  const start = getHighlightStart(song);
  const isLast = index >= ids.length - 1;
  const [progress, setProgress] = useState(0);
  const advanced = useRef(false);
  useEffect(() => { setProgress(0); advanced.current = false; }, [index, playing]);

  const setIndex = (i) => dispatch({ type: 'RECAP_SET', patch: { index: Math.max(0, Math.min(ids.length - 1, i)) } });
  const next = () => {
    if (advanced.current) return;
    advanced.current = true;
    if (!isLast) setIndex(index + 1);
    else dispatch({ type: 'RECAP_SET', patch: { playing: false } });
  };
  const onTick = (t) => {
    const p = Math.max(0, Math.min(1, (t - start) / clip));
    setProgress(p);
    if (playing && p >= 0.999) next();
  };
  const done = () => dispatch({ type: 'RECAP_DONE' });
  useKeys((e) => {
    if (e.key === 'ArrowRight') setIndex(index + 1);
    if (e.key === 'ArrowLeft') setIndex(index - 1);
  }, [index]);

  return (
    <div className="animate-in" style={{ position: 'relative' }}>
      <FloatingParticles accent={theme.accent} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Heading emoji={theme.emoji}>{final ? 'Finalisterna' : 'Recap: ' + theme.name}</Heading>
        <div className="group-sublabel">{final ? 'Möt alla som gått vidare till finalen' : 'Låt oss minnas låtarna innan poängen avslöjas'}</div>
        <div className="recap-card">
          {playing
            ? <YouTubePlayer key={song.id + ':' + index} videoId={song.youtubeId} start={start} end={start + clip} autoplay onTick={onTick} onEnded={next} onError={() => setTimeout(next, 2500)} />
            : <Thumb videoId={song.youtubeId} className="recap-thumb" alt={song.title} />}
          <div className="recap-info">
            <div className="recap-number">{final ? 'Finalist' : 'Låt'} {index + 1} av {ids.length}</div>
            <div className="recap-song-title">{song.title}</div>
            <div className="recap-song-artist">{song.artist}{song.year ? ' (' + song.year + ')' : ''}{song.pickedBy ? ' · vald av ' + song.pickedBy : ''}</div>
            {song.facts && song.facts.length > 0 && <div className="recap-fact">💡 {song.facts[index % song.facts.length]}</div>}
            {playing && <div className="recap-progress"><div className="recap-progress-bar" style={{ width: progress * 100 + '%' }} /></div>}
          </div>
        </div>
        <div className="recap-controls">
          <button className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Förra</button>
          {playing
            ? <button className="btn btn-ghost" onClick={() => dispatch({ type: 'RECAP_SET', patch: { playing: false } })}>⏸ Paus</button>
            : <button className="btn btn-primary" onClick={() => dispatch({ type: 'RECAP_SET', patch: { playing: true } })}>▶ Spela highlights</button>}
          {!isLast ? <button className="btn btn-blue btn-sm" onClick={() => setIndex(index + 1)}>Nästa →</button> : <div style={{ width: 100 }} />}
        </div>
        <div className="recap-dots">
          {ids.map((id, i) => <span key={id} className={'dot' + (i === index ? ' current' : i < index ? ' seen' : '')} />)}
        </div>
        <div className="text-center mt-24">
          <button className="btn btn-gold btn-lg" onClick={done}>{final ? '🏆 Till finalomröstningen!' : '📊 Visa poängen!'}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== TIEBREAK ====================

function TiebreakScreen({ state, dispatch }) {
  const pending = currentTiebreaks(state);
  const songs = songMap(state);
  const voters = state.voters.filter((v) => pending[v.id]);
  const pick = (vid, sid) => dispatch({ type: 'TIEBREAK_PICK', round: state.round, voterId: vid, songId: sid });
  return (
    <div className="animate-in">
      <Heading emoji="🤔">Oavgjort!</Heading>
      <div className="group-sublabel">Några gav samma betyg till flera låtar. Vilken är bäst? Den får de största poängen.</div>
      {voters.map((v) => {
        const q = pending[v.id];
        return (
          <div key={v.id} className="card tiebreak-card">
            <div className="tiebreak-head">
              <b>{v.phone ? '📱 ' : ''}{v.name}</b> gav <StarsText stars={q.stars} simple={v.simple} /> till de här.
            </div>
            <div className="tiebreak-q">
              {q.picked > 0 ? 'Och vilken av de här är bäst?' : 'Vilken gillar du mest?'}
              {v.phone && <span className="muted small"> Välj här eller i mobilen.</span>}
            </div>
            <div className="tb-options">
              {q.options.map((id) => (
                <button key={id} className="tb-option" onClick={() => pick(v.id, id)}>
                  <Thumb videoId={songs[id].youtubeId} />
                  <span className="tb-title">{songs[id].title}</span>
                  <span className="tb-artist">{songs[id].artist}</span>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'TIEBREAK_RANDOM', round: state.round, voterId: v.id })}>🎲 Slumpa för {v.name}</button>
          </div>
        );
      })}
      <div className="text-center mt-16">
        <button className="link-btn" onClick={() => { if (window.confirm('Slumpa ordningen för alla som inte har valt än?')) dispatch({ type: 'TIEBREAK_RANDOM', round: state.round }); }}>🎲 Slumpa för alla som är kvar</button>
      </div>
    </div>
  );
}

// ==================== THE REVEAL ====================

function RevealScreen({ state, dispatch }) {
  const final = isFinal(state.round);
  const theme = roundTheme(state);
  const result = state.results[state.round];
  const beats = useMemo(() => buildRevealBeats(result), [result]);
  const step = state.reveal.step;
  const last = beats.length - 1;
  const beat = step >= 0 ? beats[step] : null;
  const done = !!beat && beat.kind === 'done';
  const songs = songMap(state);
  const roundIds = songIdsForRound(state);
  const standingIds = result.standings.map((s) => s.songId);
  const totals = totalsAfter(beats, step, roundIds);
  const prev = totalsAfter(beats, step - 1, roundIds);
  const order = runningOrder(done ? standingIds : roundIds, totals);
  const voterById = {};
  for (const v of state.voters) voterById[v.id] = v;
  const nameOf = (vid) => (voterById[vid] && voterById[vid].name) || (result.voterNames || {})[vid] || 'Någon';
  const isPhone = (vid) => !!(voterById[vid] && voterById[vid].phone);
  const [auto, setAuto] = useState(true);
  const stopRoll = useRef(null);
  const go = (s) => dispatch({ type: 'REVEAL_STEP', step: s });
  const next = () => { if (step < last) go(step + 1); };
  const lastRound = !final && state.currentGroup + 1 >= state.groupCount;

  // Sound and confetti for each beat.
  useEffect(() => {
    if (!beat) return;
    if (beat.kind !== 'twelvePending' && stopRoll.current) { stopRoll.current(); stopRoll.current = null; }
    if (beat.kind === 'voter') { sfx.whoosh(); beat.awards.forEach((a, i) => sfx.ding(0, 0.35 + i * 0.28)); }
    if (beat.kind === 'ten') sfx.ding(1);
    if (beat.kind === 'twelvePending') stopRoll.current = sfx.drumroll(14);
    if (beat.kind === 'twelve') { sfx.crash(); sfx.ding(2, 0.05); fireMiniConfetti(); }
    if (beat.kind === 'done' && !final) { sfx.fanfare(); fireConfetti(2500); }
  }, [step]);
  useEffect(() => () => { if (stopRoll.current) stopRoll.current(); }, []);

  // Auto-play: each beat holds for a moment. A phone voter gets time to press for their 12.
  useEffect(() => {
    if (!auto || step < 0 || step >= last) return undefined;
    const b = beats[step];
    let ms = 2600;
    if (b.kind === 'voter') ms = 2400 + 450 * b.awards.length;
    else if (b.kind === 'twelvePending') ms = isPhone(b.voterId) ? 12000 : 2800;
    else if (b.kind === 'twelve') ms = 3600;
    const t = setTimeout(() => go(step + 1), ms);
    return () => clearTimeout(t);
  }, [auto, step]);

  useKeys((e) => {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (step < 0) go(0); else if (!done) next();
    }
  }, [step, done]);

  const cut = final ? 1 : QUALIFIERS_PER_GROUP;
  const reason = done ? tieReason(result.standings[cut - 1], result.standings[cut]) : null;
  const winnerTitle = (songs[result.standings[cut - 1] && result.standings[cut - 1].songId] || {}).title;

  return (
    <div className="animate-in" style={{ position: 'relative' }}>
      <StageLights accent={theme.accent} />
      {done && <FloatingParticles accent={theme.accent} />}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Heading emoji={theme.emoji}>{final ? 'Finalens poäng' : 'Poängen: ' + theme.name}</Heading>
        <div className="group-sublabel">{final ? 'Vem vinner Familje-Mello?' : 'Topp ' + QUALIFIERS_PER_GROUP + ' går vidare till finalen!'}</div>

        {step < 0 && (
          <div className="text-center reveal-start">
            <div className="muted" style={{ marginBottom: 16 }}>
              {result.voterIds.length} {result.voterIds.length === 1 ? 'röstare delar' : 'röstare delar var för sig'} ut 12, 10, 8 … poäng. En i taget!
            </div>
            <button className="btn btn-gold btn-lg" onClick={() => go(0)}>🎤 Starta poängavslöjningen</button>
            <label className="auto-toggle"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Gå vidare automatiskt</label>
          </div>
        )}

        {beat && !done && <Announcer beat={beat} songs={songs} name={nameOf(beat.voterId)} phone={isPhone(beat.voterId)} />}
        {done && (
          <div className="announce done">
            <div className="announce-who">{final ? 'Alla poäng är utdelade!' : 'Klart! De här går till finalen:'}</div>
            {!final && <div className="announce-final-list">{result.standings.slice(0, QUALIFIERS_PER_GROUP).map((s) => songs[s.songId].title).join(' och ')}</div>}
            {reason === 'lot' && <div className="tie-note">🎲 Exakt lika i allt, så lotten avgjorde.</div>}
            {reason === 'twelves' && <div className="tie-note">Lika många poäng! {winnerTitle} går före på fler 12:or.</div>}
            {reason === 'higher' && <div className="tie-note">Lika många poäng! {winnerTitle} går före på fler höga poäng.</div>}
          </div>
        )}

        <Scoreboard ids={roundIds} order={order} totals={totals} prev={prev} songs={songs} done={done} final={final} />

        {step >= 0 && !done && (
          <div className="reveal-controls">
            <button className="btn btn-blue" onClick={next}>Nästa ▶</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAuto((a) => !a)}>{auto ? '⏸ Pausa' : '▶ Automatiskt'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => go(last)}>⏭ Hoppa till slutet</button>
          </div>
        )}
        {done && (
          <div className="text-center mt-24">
            <button className="btn btn-gold btn-lg" onClick={() => dispatch({ type: 'REVEAL_DONE' })}>
              {final ? '🏆 Visa vinnaren!' : lastRound ? '⭐ Vidare till finalen!' : '➡️ Nästa deltävling'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Announcer({ beat, songs, name, phone }) {
  const song = (a) => songs[a.songId] || {};
  if (beat.kind === 'voter') {
    return (
      <div key={'v' + beat.voterId} className="announce">
        <div className="announce-who">Röster från <b>{name}</b></div>
        <div className="low-chips">
          {beat.awards.map((a, i) => (
            <div key={a.songId} className="low-chip" style={{ animationDelay: 0.35 + i * 0.28 + 's' }}>
              <span className="low-pts">{a.points}</span>
              <span>{song(a).title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (beat.kind === 'ten') {
    const s = song(beat.awards[0]);
    return (
      <div key={'t' + beat.voterId} className="announce">
        <div className="announce-who">{name}</div>
        <div className="reveal-points">10</div>
        <div className="reveal-goesto">poäng går till</div>
        <div className="reveal-song">{s.title}</div>
      </div>
    );
  }
  if (beat.kind === 'twelvePending') {
    return (
      <div key={'p' + beat.voterId} className="announce pending">
        <div className="announce-who">{name}</div>
        <div className="announce-drum">Och mina 12 poäng går till…</div>
        {phone && <div className="announce-phone">📱 {name}, tryck på knappen i din mobil!</div>}
        <div className="drum-dots"><span /><span /><span /></div>
      </div>
    );
  }
  if (beat.kind === 'twelve') {
    const s = song(beat.awards[0]);
    return (
      <div key={'w' + beat.voterId} className="announce twelve">
        <div className="announce-who">{name}</div>
        <div className="reveal-points big">12</div>
        <div className="reveal-goesto">poäng går till</div>
        <div className="announce-twelve-song">
          <Thumb videoId={s.youtubeId} className="announce-thumb" />
          <div>
            <div className="reveal-song">{s.title}</div>
            <div className="muted">{s.artist}</div>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function Scoreboard({ ids, order, totals, prev, songs, done, final }) {
  const rank = {};
  order.forEach((id, i) => { rank[id] = i; });
  return (
    <div className="scoreboard" style={{ height: 'calc(var(--row) * ' + ids.length + ')' }}>
      {ids.map((id) => {
        const r = rank[id];
        const song = songs[id] || {};
        const delta = (totals[id] || 0) - (prev[id] || 0);
        const qualified = done && !final && r < QUALIFIERS_PER_GROUP;
        const out = done && !final && r >= QUALIFIERS_PER_GROUP;
        const cls = 'sb-row' + (qualified ? ' qualified' : '') + (out ? ' out' : '') + (done && final && r === 0 ? ' winner' : '') + (delta > 0 ? ' bumped' : '');
        return (
          <div key={id} className={cls} style={{ transform: 'translateY(calc(var(--row) * ' + r + '))' }}>
            <div className="sb-pos">{done ? medal(r) : r + 1}</div>
            <Thumb videoId={song.youtubeId} className="sb-thumb" />
            <div className="sb-info">
              <div className="sb-title">{song.title}</div>
              <div className="sb-artist">{song.artist}{song.pickedBy ? ' · vald av ' + song.pickedBy : ''}</div>
            </div>
            {delta > 0 && <div key={'d' + totals[id]} className="sb-delta">+{delta}</div>}
            <div className="sb-points">{totals[id] || 0}</div>
            {done && !final && <span className={'badge ' + (qualified ? 'badge-gold' : 'badge-red')}>{qualified ? 'FINAL' : 'Ute'}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ==================== WINNER ====================

function WinnerScreen({ state, dispatch }) {
  const result = state.results.final;
  const songs = songMap(state);
  const top = result.standings[0];
  const w = songs[top.songId];
  const pickers = pickerTable(state.songs, state.results);
  const maxPts = Math.max(1, ...result.standings.map((s) => s.points));

  useEffect(() => {
    const t = setTimeout(() => { sfx.fanfare(); fireConfetti(); }, 300);
    addToHallOfFame({ gameId: state.gameId, date: new Date().toLocaleDateString('sv-SE'), title: w.title, artist: w.artist || '', pickedBy: w.pickedBy || '', points: top.points, songs: state.songs.length });
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="animate-in" style={{ position: 'relative' }}>
      <FloatingParticles accent="#f59e0b" />
      <StageLights accent="rgba(245,158,11,0.2)" />
      <div className="winner-container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="winner-trophy">🏆</div>
        <div className="winner-label">Vinnare av Familje-Mello</div>
        <Thumb videoId={w.youtubeId} className="winner-thumb" />
        <div className="winner-song">{w.title}</div>
        {w.artist && <div className="winner-artist">{w.artist}</div>}
        {w.pickedBy && <div className="winner-picker">Vald av {w.pickedBy} 👏</div>}
        <div className="winner-score">{top.points} poäng</div>
        <div className="muted">{top.twelves} {top.twelves === 1 ? 'tolva' : 'tolvor'} i finalen</div>
      </div>

      <div className="section-title">Slutställning</div>
      {result.standings.map((s, i) => {
        const song = songs[s.songId];
        return (
          <div key={s.songId} className={'result-row' + (i === 0 ? ' winner' : '')} style={{ animationDelay: i * 0.1 + 's' }}>
            <div className="result-position">{medal(i)}</div>
            <div className="result-info">
              <div className="result-title">{song.title}</div>
              <div className="result-artist">{song.artist}{song.pickedBy ? ' · vald av ' + song.pickedBy : ''}</div>
              <div className="result-bar-container"><div className="result-bar" style={{ '--bar-width': Math.round((s.points / maxPts) * 100) + '%', animationDelay: i * 0.1 + 0.3 + 's', background: i === 0 ? 'var(--gradient-gold)' : i < 3 ? 'var(--gradient-pink)' : 'rgba(255,255,255,0.15)' }} /></div>
            </div>
            <div className="result-score">{s.points}</div>
          </div>
        );
      })}

      {pickers.length >= 2 && (
        <div className="card mt-24 picker-card">
          <div className="card-title">👑 Bästa låtväljare</div>
          <div className="muted small" style={{ marginBottom: 10 }}>Alla poäng som ens låtar fick, i deltävlingarna och finalen.</div>
          {pickers.map((p, i) => (
            <div key={p.name} className={'picker-row' + (i === 0 ? ' top' : '')}>
              <span>{i === 0 ? '👑' : medal(i)}</span>
              <span className="picker-name">{p.name}</span>
              <span className="muted small">{p.songs} {p.songs === 1 ? 'låt' : 'låtar'}</span>
              <span className="picker-points">{p.points} p</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-center mt-24" style={{ marginBottom: 40 }}>
        <button className="btn btn-primary btn-lg" onClick={() => { fireConfetti(); sfx.crash(); }}>🎉 Mer konfetti!</button>
        <div className="winner-actions">
          <button className="btn btn-ghost" onClick={() => dispatch({ type: 'NEW_GAME' })}>Nytt Mello (nya låtar)</button>
          <button className="btn btn-ghost" onClick={() => dispatch({ type: 'END_GAME' })}>Samma låtar igen</button>
        </div>
      </div>
    </div>
  );
}
