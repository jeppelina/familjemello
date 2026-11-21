// The host view: the big screen (TV or laptop) that runs the show.
import {
  cleanVideoTitle, cutTie, estimateMinutes, extractStartTime, extractYouTubeId, FINAL_RECAP_CLIP_SEC,
  FINAL_SHORT_CLIP_SEC, FINAL_THEME, formatDuration, formatTimestamp, GAME_CODE_RE, getGroupTheme, getHighlightStart,
  GROUP_CLIP_SEC, parseTimestamp, pickerTable, placesOf, planGroups, QUALIFIERS_PER_GROUP, qualifiersOf, revealSteps,
  runningOrder, shuffle, totalsAfterSteps,
} from './logic.js';
import {
  canRestore, completeVoterIds, currentTie, getActiveBallot, initialState, isFinal, reducer, roundLabel, roundTheme,
  songIdsForRound, songMap, spotsFor,
} from './state.js';
import {
  addToHallOfFame, closeChannel, getHallOfFame, getHostCode, loadGame, loadLocalSnapshot, lookupSongInfo, lookupVideo,
  openGameChannel, saveGame, saveLocalSnapshot, setHostCode,
} from './net.js';
import * as sfx from './sfx.js';
import { PLAYLISTS } from './playlists.js';
import { YouTubePlayer } from './youtube.jsx';
import {
  fireConfetti, fireMiniConfetti, FloatingParticles, SongMeta, StageLights, Thumb, useKeys, VoteInput,
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
      if (canRestore(snap) && (snap.savedAt || 0) > localAt) {
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

  // Live channel: phones send votes, names, and favourites in a tie.
  useEffect(() => {
    const ch = openGameChannel(code);
    if (!ch) return undefined;
    const on = (event, fn) => ch.on('broadcast', { event }, ({ payload }) => { if (payload) fn(payload); });
    on('vote', (p) => dispatch({ type: 'SET_VOTE', round: p.round, songId: p.songId, voterId: p.voterId, stars: p.stars }));
    on('register', (p) => {
      if (p.id && p.name) dispatch({ type: 'ADD_VOTER', id: String(p.id).slice(0, 40), name: String(p.name), simple: !!p.simple, phone: true });
    });
    on('unregister', (p) => { if (p.id) dispatch({ type: 'REMOVE_VOTER', id: p.id }); });
    on('favorite', (p) => dispatch({ type: 'FAVORITE_PICK', round: p.round, voterId: p.voterId, songId: p.songId }));
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
    if (!canRestore(snap)) return 'Hittade inget spel med den koden.';
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
    case 'lineup': screen = <LineupScreen {...props} />; break;
    case 'groupIntro': screen = <IntroScreen {...props} />; break;
    case 'finalIntro': screen = <IntroScreen {...props} />; break;
    case 'group': case 'final': screen = <SongStage key={state.round} {...props} />; break;
    case 'groupRecap': case 'recap': screen = <RecapScreen key={state.phase + state.round} {...props} />; break;
    case 'reveal': screen = <RevealScreen key={state.round} {...props} />; break;
    case 'favorite': screen = <FavoriteScreen key={state.round} {...props} />; break;
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
  const [year, setYear] = useState('');
  const [info, setInfo] = useState(null); // { status: loading|ok|none, data: { year, released, people, formed } }
  const [lookup, setLookup] = useState(null); // { status: loading|ok|blocked|missing|offline|unknown, raw }
  const [error, setError] = useState('');
  const [voterName, setVoterName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinMsg, setJoinMsg] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [hof] = useState(() => getHallOfFame());
  const touched = useRef({ title: false, artist: false, highlight: false, year: false });
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

  // With a title and an artist: look up the year and the artist's age (Wikidata).
  useEffect(() => {
    if (!videoId || !title.trim() || !artist.trim()) { setInfo(null); return undefined; }
    let alive = true;
    setInfo({ status: 'loading' });
    const t = setTimeout(async () => {
      const data = await lookupSongInfo(title.trim(), artist.trim());
      if (!alive) return;
      setInfo(data ? { status: 'ok', data } : { status: 'none' });
      if (data && data.year && !touched.current.year) setYear(data.year);
    }, 700);
    return () => { alive = false; clearTimeout(t); };
  }, [videoId, title, artist]);

  const resetSongForm = () => {
    setUrl(''); setTitle(''); setArtist(''); setHighlight(''); setFact(''); setYear(''); setInfo(null); setError(''); setLookup(null);
    touched.current = { title: false, artist: false, highlight: false, year: false };
  };
  const addSong = () => {
    if (!videoId) return setError('Klistra in en YouTube-länk.');
    if (lookup && lookup.status === 'blocked') return setError('Den här videon får bara spelas på YouTube. Sök upp en annan uppladdning av låten, till exempel en "lyric video".');
    if (lookup && lookup.status === 'missing') return setError('Hittar ingen video med den länken.');
    if (state.songs.some((s) => s.youtubeId === videoId)) return setError('Den låten är redan med.');
    if (!title.trim()) return setError('Skriv låtens titel.');
    const y = year.trim();
    if (y && !/^(19|20)\d\d$/.test(y)) return setError('Året ska vara fyra siffror, till exempel 1988.');
    const found = info && info.status === 'ok' ? info.data : null;
    dispatch({
      type: 'ADD_SONG',
      song: {
        title: title.trim(), artist: artist.trim(), youtubeId: videoId, highlightStart: parseTimestamp(highlight), pickedBy: picker.trim(),
        facts: fact.trim() ? [fact.trim()] : [],
        year: y,
        released: found && found.released && found.released.slice(0, 4) === y ? found.released : '',
        people: found ? found.people : [],
        formed: found ? found.formed : '',
      },
    });
    resetSongForm(); // keep "vald av", people usually add several songs in a row
  };
  const editYear = (song) => {
    const v = window.prompt('Vilket år kom "' + song.title + '"?', song.year || '');
    if (v == null) return;
    const y = v.trim();
    if (y && !/^(19|20)\d\d$/.test(y)) { window.alert('Skriv året med fyra siffror, till exempel 1988.'); return; }
    dispatch({ type: 'UPDATE_SONG', id: song.id, patch: { year: y, released: song.released && song.released.slice(0, 4) === y ? song.released : '' } });
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
        {info && info.status === 'loading' && <div className="lookup-line muted">Letar efter år och artist…</div>}
        {info && info.status === 'ok' && (
          <div className="lookup-line ok">
            ✓ {[
              info.data.year && 'kom ' + info.data.year,
              ...info.data.people.map((p) => p.name + ' född ' + p.born.slice(0, 4)),
              info.data.formed && 'bandet bildades ' + info.data.formed,
            ].filter(Boolean).join(' · ')}
          </div>
        )}
        {info && info.status === 'none' && <div className="lookup-line muted">Hittade inget år. Skriv in det själv, så visas det för barnen.</div>}
        <div className="input-row">
          <input className="input" placeholder="Titel" value={title} onChange={(e) => { touched.current.title = true; setTitle(e.target.value); }} onKeyDown={onEnter(addSong)} />
          <input className="input" placeholder="Artist (valfritt)" value={artist} onChange={(e) => { touched.current.artist = true; setArtist(e.target.value); }} onKeyDown={onEnter(addSong)} />
        </div>
        <div className="input-row">
          <input className="input" list="mello-pickers" placeholder="Vem valde låten? (valfritt)" value={picker} onChange={(e) => setPicker(e.target.value)} onKeyDown={onEnter(addSong)} />
          <input className="input input-year" placeholder="År" inputMode="numeric" maxLength={4} value={year} onChange={(e) => { touched.current.year = true; setYear(e.target.value.replace(/\D/g, '')); }} onKeyDown={onEnter(addSong)} />
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
                  <div className="song-artist">
                    {song.artist}{' '}
                    <button className={'year-btn' + (song.year ? '' : ' missing')} title="Ändra året" onClick={() => editYear(song)}>{song.year ? '(' + song.year + ')' : '⚠ Lägg till år'}</button>
                  </div>
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
                <button className="tag-btn" title={v.simple ? 'Barnläge: tre stora knappar. Tryck för 10 stjärnor.' : '10 stjärnor. Tryck för barnläge (tre stora knappar).'} onClick={() => dispatch({ type: 'SET_VOTER', id: v.id, patch: { simple: !v.simple } })}>{v.simple ? '👶' : '⭐'}</button>
                <button className="tag-btn" title="Ta bort" onClick={() => removeVoter(v)}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="muted small" style={{ marginTop: 10 }}>Alla ger 1 till 10 stjärnor per låt. Tryck ⭐ eller 👶 för att växla till barnläge med tre stora knappar: 😍 🙂 😴.</div>
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

// ==================== LINEUP (before the first song) ====================

// The draw is shown before the game starts: tap two songs to swap them (between
// groups, or to change the running order), or draw again.
function LineupScreen({ state, dispatch }) {
  const [sel, setSel] = useState(null);
  const direct = state.groupCount === 0;
  const groups = direct
    ? [{ key: 'final', theme: FINAL_THEME, label: 'Direkt till finalen', songs: state.songs }]
    : Array.from({ length: state.groupCount }, (_, g) => ({
      key: g, theme: getGroupTheme(g), label: 'Deltävling ' + (g + 1), songs: state.songs.filter((s) => s.group === g),
    }));
  const tap = (id) => {
    if (!sel) { setSel(id); return; }
    if (sel !== id) { dispatch({ type: 'LINEUP_SWAP', a: sel, b: id }); sfx.whoosh(); }
    setSel(null);
  };
  const doubles = (list) => {
    const n = {};
    for (const s of list) {
      const k = (s.pickedBy || '').trim();
      if (k) n[k] = (n[k] || 0) + 1;
    }
    return Object.entries(n).filter(([, c]) => c > 1);
  };
  return (
    <div className="animate-in">
      <Heading emoji="🎲">Lottningen</Heading>
      <div className="group-sublabel">
        {sel ? 'Tryck på låten den ska byta plats med.' : 'Så här blev det. Tryck på två låtar för att byta plats på dem.'}
      </div>
      <div className={'lineup-grid' + (direct ? ' single' : '')}>
        {groups.map((g) => (
          <div key={g.key} className="card lineup-card" style={{ borderColor: 'rgba(' + g.theme.accentRgb + ',0.45)' }}>
            <div className="lineup-head" style={{ color: g.theme.accent }}>
              <span>{g.theme.emoji} {g.theme.name}</span>
              <span className="muted small">{g.label}</span>
            </div>
            {g.songs.map((s, i) => (
              <button key={s.id} className={'lineup-song' + (sel === s.id ? ' selected' : '') + (sel && sel !== s.id ? ' target' : '')} onClick={() => tap(s.id)}>
                <span className="lineup-num">{i + 1}</span>
                <Thumb videoId={s.youtubeId} className="lineup-thumb" />
                <span className="lineup-info">
                  <span className="lineup-title">{s.title}</span>
                  <span className="lineup-artist">{s.artist}{s.year ? ' · ' + s.year : ''}{s.pickedBy ? ' · vald av ' + s.pickedBy : ''}</span>
                </span>
              </button>
            ))}
            {doubles(g.songs).map(([who, c]) => <div key={who} className="lineup-warn">{c} låtar valda av {who} i samma deltävling</div>)}
          </div>
        ))}
      </div>
      <div className="lineup-actions">
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'LINEUP_BACK' })}>← Tillbaka till låtarna</button>
        <button className="btn btn-ghost" onClick={() => { setSel(null); dispatch({ type: 'LINEUP_SHUFFLE' }); sfx.whoosh(); }}>🔀 Lotta om</button>
        <button className="btn btn-gold btn-lg" onClick={() => dispatch({ type: 'LINEUP_DONE' })}>Kör igång! ▶</button>
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
                  <div className="intro-song-artist">{s.artist}{s.pickedBy ? ' · vald av ' + s.pickedBy : ''}</div>
                  <SongMeta song={s} compact />
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
        <div className="now-playing-artist">{cur.artist}{cur.pickedBy ? ' · vald av ' + cur.pickedBy : ''}</div>
        <SongMeta song={cur} center />
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
                ? <VoteInput key={cur.id} simple={v.simple} value={(rv[cur.id] || {})[v.id] || 0} onChange={(s) => { dispatch({ type: 'SET_VOTE', round: state.round, songId: cur.id, voterId: v.id, stars: s }); setEditing(null); }} />
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
            <div className="recap-song-artist">{song.artist}{song.pickedBy ? ' · vald av ' + song.pickedBy : ''}</div>
            <SongMeta song={song} />
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

// ==================== THE REVEAL ====================

// "0, 1, 2 och 4"
const listSv = (xs) => (xs.length < 2 ? String(xs[0]) : xs.slice(0, -1).join(', ') + ' och ' + xs[xs.length - 1]);

function stepTitle(st) {
  if (st.values.length > 1) return 'Småpoängen: ' + listSv(st.values);
  if (st.last && st.values[0] !== 12) return 'Och resten: ' + st.values[0] + ' poäng';
  return st.values[0] + ' poäng';
}

// "Först flyger småpoängen in, sedan 6:orna, 8:orna, 12:orna och sist 10:orna."
function stepOrderText(steps) {
  const names = steps.map((st) => (st.values.length > 1 ? 'småpoängen' : st.values[0] + ':orna'));
  if (names.length === 1) return 'Alla poäng flyger in på en gång.';
  if (names.length === 2) return 'Först flyger ' + names[0] + ' in, sedan ' + names[1] + '.';
  return 'Först flyger ' + names[0] + ' in, sedan ' + names.slice(1, -1).join(', ') + ' och sist ' + names[names.length - 1] + '.';
}

const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// Points come out one score at a time for everybody at once: all the 6s fly in,
// then the 8s, the 12s, and last the 10s. Only counts are shown, never who gave what.
function RevealScreen({ state, dispatch }) {
  const final = isFinal(state.round);
  const theme = roundTheme(state);
  const result = state.results[state.round];
  const steps = useMemo(() => revealSteps(result), [result]);
  const n = steps.length;
  const step = state.reveal.step;
  const done = step >= n;
  const cur = step >= 0 && step < n ? steps[step] : null;
  const songs = songMap(state);
  const roundIds = songIdsForRound(state);
  const voterCount = result.voterCount;
  const go = (s) => dispatch({ type: 'REVEAL_STEP', step: s });

  // This step's chips in a random flight order, and which slot each one lands in.
  const flight = useMemo(() => (cur ? shuffle(cur.chips) : []), [step, result]);
  const completed = Math.max(0, Math.min(step, n));
  const filledBefore = useMemo(() => {
    const f = {};
    for (const id of roundIds) f[id] = [];
    for (let i = 0; i < completed; i++) for (const c of steps[i].chips) f[c.songId].push(c.points);
    return f;
  }, [completed, steps]);
  const targetSlot = useMemo(() => {
    const seen = {};
    return flight.map((c) => {
      seen[c.songId] = (seen[c.songId] || 0) + 1;
      return filledBefore[c.songId].length + seen[c.songId] - 1;
    });
  }, [flight, filledBefore]);

  // Progress inside the current step (not saved: a reload replays the step).
  const [prog, setProg] = useState({ step, landed: 0, settled: false, skipped: false });
  const mine = prog.step === step ? prog : { step, landed: 0, settled: false, skipped: false };
  const landed = mine.skipped ? flight.length : mine.landed;
  const settled = mine.settled || mine.skipped;
  const [auto, setAuto] = useState(true);

  const base = totalsAfterSteps(steps, completed, roundIds);
  const totals = { ...base };
  flight.slice(0, landed).forEach((c) => { totals[c.songId] += c.points; });
  const filled = {};
  for (const id of roundIds) filled[id] = [...filledBefore[id]];
  flight.slice(0, landed).forEach((c) => filled[c.songId].push(c.points));
  const places = done ? placesOf(result) : null;
  const order = done ? places.map((s) => s.songId) : runningOrder(roundIds, settled ? totals : base);

  const stageRef = useRef(null);
  const poolRef = useRef(null);
  const chipEls = useRef([]);

  // Fly the chips: they circle above the list for a moment, then go one by one.
  useEffect(() => {
    if (!cur) return undefined;
    const twelve = cur.values.includes(12);
    let stopDrum = null;
    if (mine.skipped) return undefined;
    if (twelve) stopDrum = sfx.drumroll(6); else sfx.whoosh();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gather = twelve ? 2800 : 1300;
    const stagger = Math.max(110, Math.min(380, 2600 / Math.max(1, flight.length)));
    const flyMs = 750;
    const stage = stageRef.current;
    if (reduce || !stage || !flight.length) {
      const t = setTimeout(() => {
        if (stopDrum) stopDrum();
        setProg({ step, landed: flight.length, settled: false, skipped: false });
      }, reduce ? 900 : 300);
      return () => { clearTimeout(t); if (stopDrum) stopDrum(); };
    }
    const rel = (el) => {
      const r = el.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
    };
    const put = (el, x, y, scale, opacity) => {
      el.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%) scale(' + scale + ')';
      el.style.opacity = String(opacity);
    };
    const level = (p) => (p === 12 ? 2 : p === 10 ? 1 : 0);
    const from = [];
    const to = [];
    const fin = [];
    let count = 0;
    let raf = 0;
    let crashed = false;
    const t0 = performance.now();
    const frame = (now) => {
      const t = now - t0;
      const pool = poolRef.current ? rel(poolRef.current) : { x: stage.clientWidth / 2, y: 90 };
      // An oval around the title, wide enough not to cover the text.
      const rx = Math.min(stage.clientWidth * 0.44, 170 + flight.length * 6);
      const ry = 62;
      if (twelve && !crashed && t >= gather) { crashed = true; if (stopDrum) { stopDrum(); stopDrum = null; } sfx.crash(); }
      flight.forEach((c, i) => {
        const el = chipEls.current[i];
        if (!el || fin[i]) return;
        const ang = (i / flight.length) * Math.PI * 2 + t * 0.0022;
        const ox = pool.x + Math.cos(ang) * rx;
        const oy = pool.y + Math.sin(ang) * ry;
        const launch = gather + i * stagger;
        if (t < launch) { put(el, ox, oy, 1, Math.min(1, t / 250)); return; }
        if (!from[i]) {
          from[i] = { x: ox, y: oy };
          const slot = stage.querySelector('[data-slot="' + c.songId + ':' + targetSlot[i] + '"]');
          to[i] = slot ? rel(slot) : pool;
        }
        const p = Math.min(1, (t - launch) / flyMs);
        const e = easeInOut(p);
        put(el, from[i].x + (to[i].x - from[i].x) * e, from[i].y + (to[i].y - from[i].y) * e - Math.sin(p * Math.PI) * 70, 1 - 0.35 * e, 1);
        if (p >= 1) {
          fin[i] = true;
          el.style.opacity = '0';
          count += 1;
          sfx.ding(level(c.points));
          setProg({ step, landed: count, settled: false, skipped: false });
        }
      });
      if (count < flight.length) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); if (stopDrum) stopDrum(); };
  }, [step, flight, mine.skipped]);

  // When the last chip has landed, let the list re-sort.
  useEffect(() => {
    if (!cur || mine.settled || mine.skipped || landed < flight.length) return undefined;
    const t = setTimeout(() => setProg({ step, landed: flight.length, settled: true, skipped: false }), 650);
    return () => clearTimeout(t);
  }, [landed, step]);

  // Then hold, and go on by itself.
  useEffect(() => {
    if (!auto || !cur || !settled) return undefined;
    const t = setTimeout(() => go(step + 1), cur.last ? 2200 : 2000);
    return () => clearTimeout(t);
  }, [auto, settled, step]);

  // All points out.
  const tie = done ? cutTie(result, spotsFor(state.round)) : null;
  useEffect(() => {
    if (!done) return;
    if (tie) { sfx.sting(); return; }
    if (final) { sfx.crash(); fireMiniConfetti(); } else { sfx.fanfare(); fireConfetti(2500); }
  }, [done]);

  const next = () => {
    if (step < 0) go(0);
    else if (cur && !settled) setProg({ step, landed: flight.length, settled: true, skipped: true });
    else if (!done) go(step + 1);
  };
  useKeys((e) => {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); if (!done) next(); }
  }, [step, settled, done]);

  const lastRound = !final && state.currentGroup + 1 >= state.groupCount;
  const spots = spotsFor(state.round);
  const tiedSet = new Set(tie ? tie.songIds : []);
  const title = (id) => (songs[id] || {}).title;
  const mark = (id, r) => {
    if (!done) return null;
    if (tiedSet.has(id)) return 'tied';
    if (final) return r === 0 ? 'winner' : null;
    return r < spots ? 'qualified' : 'out';
  };
  const placeOf = {};
  if (places) for (const p of places) placeOf[p.songId] = p.place;

  let pool;
  if (step < 0) {
    pool = (
      <div className="pool-intro">
        <div className="pool-text">
          {voterCount} röstare har gett poäng: 12 till sin favorit, sedan 10, 8, 6 …
          Lika många stjärnor ger lika många poäng.
        </div>
        <div className="pool-text muted">{stepOrderText(steps)} Ingen får veta vem som gav vad 🤫</div>
        <button className="btn btn-gold btn-lg" onClick={() => go(0)}>🎤 Starta poängavslöjningen</button>
        <label className="auto-toggle"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Gå vidare automatiskt</label>
      </div>
    );
  } else if (cur) {
    pool = (
      <div key={'s' + step} className={'pool-step' + (cur.values.includes(12) ? ' twelve' : '')}>
        <div className="pool-title">{stepTitle(cur)}</div>
        <div className="pool-count">{flight.length} {flight.length === 1 ? 'poängbricka' : 'poängbrickor'}</div>
      </div>
    );
  } else if (tie) {
    pool = (
      <div className="pool-done tie">
        <div className="pool-title-row"><span className="pool-title">Lika poäng!</span> <span className="pool-emoji">😱</span></div>
        <div className="pool-text">
          {listSv(tie.songIds.map(title))} har {result.standings.find((s) => s.songId === tie.songIds[0]).points} poäng var.{' '}
          {final ? 'Vem vinner?' : tie.spots === 1 ? 'Bara en av dem går till finalen.' : tie.spots + ' av dem går till finalen.'}
        </div>
      </div>
    );
  } else {
    pool = (
      <div className="pool-done">
        <div className="pool-title">{final ? 'Alla poäng är utdelade!' : 'Klart! Till finalen går:'}</div>
        {!final && <div className="pool-text big">{listSv(qualifiersOf(result).map(title))}</div>}
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ position: 'relative' }}>
      <StageLights accent={theme.accent} />
      {done && !tie && <FloatingParticles accent={theme.accent} />}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Heading emoji={theme.emoji}>{final ? 'Finalens poäng' : 'Poängen: ' + theme.name}</Heading>
        <div className="group-sublabel">{final ? 'Vem vinner Familje-Mello?' : 'Topp ' + QUALIFIERS_PER_GROUP + ' går vidare till finalen!'}</div>
        <div className="reveal-stage" ref={stageRef}>
          <div className="reveal-pool" ref={poolRef}>{pool}</div>
          <div className="reveal-steps">
            {steps.map((st, i) => (
              <span key={i} className={'rs-dot' + (i < completed || (i === step && settled) ? ' done' : i === step ? ' now' : '')}>{st.values.length > 1 ? 'små' : st.values[0]}</span>
            ))}
          </div>
          <Scoreboard
            ids={roundIds} order={order} totals={totals} base={base} songs={songs} filled={filled}
            slots={voterCount} done={done} mark={mark} placeOf={placeOf}
          />
          <div className="chip-layer" aria-hidden="true">
            {cur && !settled && flight.map((c, i) => (
              <div key={step + ':' + i} ref={(el) => { chipEls.current[i] = el; }} className={'fly-chip v' + c.points}>{c.points}</div>
            ))}
          </div>
        </div>

        {step >= 0 && !done && (
          <div className="reveal-controls">
            <button className="btn btn-blue" onClick={next}>{settled ? 'Nästa ▶' : 'Snabbare ⏩'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAuto((a) => !a)}>{auto ? '⏸ Pausa' : '▶ Automatiskt'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => go(n)}>⏭ Hoppa till slutet</button>
          </div>
        )}
        {done && (
          <div className="text-center mt-24">
            <button className="btn btn-gold btn-lg" onClick={() => dispatch({ type: 'REVEAL_DONE' })}>
              {tie ? '❤️ Till utslagsröstningen!' : final ? '🏆 Visa vinnaren!' : lastRound ? '⭐ Vidare till finalen!' : '➡️ Nästa deltävling'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Scoreboard({ ids, order, totals, base, songs, filled, slots, done, mark, placeOf }) {
  const rank = {};
  order.forEach((id, i) => { rank[id] = i; });
  const dense = slots > 7;
  return (
    <div className="scoreboard" style={{ height: 'calc(var(--row) * ' + ids.length + ')' }}>
      {ids.map((id) => {
        const r = rank[id];
        const song = songs[id] || {};
        const delta = (totals[id] || 0) - (base[id] || 0);
        const m = mark(id, r);
        const place = done ? placeOf[id] : r + 1;
        const cls = 'sb-row' + (m ? ' ' + m : '') + (delta > 0 ? ' bumped' : '');
        return (
          <div key={id} className={cls} style={{ transform: 'translateY(calc(var(--row) * ' + r + '))' }}>
            <div className="sb-pos">{done ? (place <= 3 ? medal(place - 1) : place) : place}</div>
            <Thumb videoId={song.youtubeId} className="sb-thumb" />
            <div className="sb-info">
              <div className="sb-title">{song.title}</div>
              <div className="sb-artist">{song.artist}{song.pickedBy ? ' · vald av ' + song.pickedBy : ''}</div>
            </div>
            <div className={'sb-slots' + (dense ? ' dense' : '')}>
              {Array.from({ length: slots }, (_, k) => {
                const v = filled[id][k];
                return <span key={k} data-slot={id + ':' + k} className={'slot' + (v != null ? ' filled v' + v : '')}>{v != null ? v : ''}</span>;
              })}
            </div>
            {delta > 0 && <div key={'d' + totals[id]} className="sb-delta">+{delta}</div>}
            <div className="sb-points">{totals[id] || 0}</div>
            {m === 'qualified' && <span className="badge badge-gold">FINAL</span>}
            {m === 'out' && <span className="badge badge-red">Ute</span>}
            {m === 'tied' && <span className="badge badge-pink">LIKA</span>}
          </div>
        );
      })}
    </div>
  );
}

// ==================== FAVOURITE VOTE (only for a tie that decides) ====================

function FavoriteScreen({ state, dispatch }) {
  const final = isFinal(state.round);
  const theme = roundTheme(state);
  const tie = currentTie(state);
  const result = state.results[state.round];
  const d = result.decider;
  const songs = songMap(state);
  const voterIds = state.roundVoters[state.round] || [];
  const favs = state.favorites[state.round] || {};
  const voters = voterIds.map((id) => state.voters.find((v) => v.id === id) || { id, name: (result.voterNames || {})[id] || 'Någon', gone: true });
  const answered = voterIds.filter((id) => favs[id]).length;
  const [choosing, setChoosing] = useState(null);
  // After counting: hearts tick up, then (if still level) the lot spins, then the answer.
  const [stage, setStage] = useState(d ? 'result' : 'vote');
  const [spin, setSpin] = useState(0);
  useEffect(() => {
    if (!d || stage !== 'count') return undefined;
    const most = Math.max(0, ...Object.values(d.counts));
    const t = setTimeout(() => setStage(d.byLot ? 'lot' : 'result'), 900 + most * 450);
    return () => clearTimeout(t);
  }, [d, stage]);
  useEffect(() => {
    if (stage !== 'lot') return undefined;
    const top = d.counts[d.order[d.spots - 1]];
    const level = d.order.filter((id) => d.counts[id] === top);
    let i = 0;
    const iv = setInterval(() => { i += 1; setSpin(i % level.length); sfx.ding(0); }, 160);
    const stop = setTimeout(() => { clearInterval(iv); setStage('result'); }, 2600);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [stage]);
  useEffect(() => {
    if (stage === 'result' && d) { sfx.crash(); fireMiniConfetti(); }
  }, [stage]);

  if (!tie) return null;
  const decide = () => {
    if (answered < voterIds.length && !window.confirm('Alla har inte röstat än. Räkna ändå?')) return;
    dispatch({ type: 'FAVORITE_DECIDE' });
    setStage('count');
  };
  const winners = d ? new Set(d.order.slice(0, d.spots)) : new Set();
  const lotLevel = d && stage === 'lot' ? d.order.filter((id) => d.counts[id] === d.counts[d.order[d.spots - 1]]) : [];

  return (
    <div className="animate-in" style={{ position: 'relative' }}>
      <StageLights accent={theme.accent} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Heading emoji="❤️">Utslagsröstning</Heading>
        <div className="group-sublabel">
          {final
            ? 'Lika poäng i toppen! Vilken är er favorit? Den vinner.'
            : 'Lika poäng om finalplatsen! ' + (tie.spots === 1 ? 'Vilken av dem ska gå vidare?' : tie.spots + ' av dem går vidare. Vilken är er favorit?')}
        </div>
        <div className="fav-options">
          {tie.songIds.map((id) => {
            const s = songs[id] || {};
            const hearts = d && stage !== 'vote' ? d.counts[id] : null;
            const isWin = stage === 'result' && winners.has(id);
            const spinning = stage === 'lot' && lotLevel[spin] === id;
            return (
              <div key={id} className={'fav-card' + (isWin ? ' win' : '') + (stage === 'result' && !isWin ? ' lose' : '') + (spinning ? ' spin' : '')}>
                <Thumb videoId={s.youtubeId} className="fav-thumb" />
                <div className="fav-title">{s.title}</div>
                <div className="fav-artist">{s.artist}</div>
                {hearts != null && (
                  <div className="fav-hearts">
                    {Array.from({ length: hearts }, (_, k) => <span key={k} style={{ animationDelay: 0.3 + k * 0.45 + 's' }}>❤️</span>)}
                    {hearts === 0 && <span className="muted small">inga röster</span>}
                  </div>
                )}
                {isWin && <div className="badge badge-gold">{final ? 'VINNER!' : 'FINAL'}</div>}
              </div>
            );
          })}
        </div>

        {stage === 'vote' && (
          <div className="card">
            <div className="card-title">Rösta: en favorit var ({answered} av {voterIds.length} klara)</div>
            {voters.map((v) => (
              <div key={v.id} className="voter-row">
                <div className="voter-name">{v.phone ? '📱 ' : ''}{v.name}</div>
                {choosing === v.id
                  ? (
                    <div className="fav-choose">
                      {tie.songIds.map((id) => (
                        <button key={id} className="btn btn-ghost btn-sm" onClick={() => { dispatch({ type: 'FAVORITE_PICK', round: state.round, voterId: v.id, songId: id }); setChoosing(null); }}>{(songs[id] || {}).title}</button>
                      ))}
                    </div>
                  )
                  : (
                    <div className="voter-status">
                      <span className={favs[v.id] ? 'ok' : 'muted'}>{favs[v.id] ? '✓ Har röstat' : v.phone ? 'Röstar i mobilen…' : 'Väntar…'}</span>
                      {!v.gone && <button className="btn btn-ghost btn-sm" onClick={() => setChoosing(v.id)}>{favs[v.id] ? 'Ändra' : 'Rösta här'}</button>}
                    </div>
                  )}
              </div>
            ))}
            <div className="muted small text-center" style={{ marginTop: 12 }}>Hemligt även här: bara antalet röster visas 🤫</div>
          </div>
        )}
        {stage === 'vote' && (
          <div className="text-center mt-16">
            <button className="btn btn-gold btn-lg" disabled={answered === 0} onClick={decide}>❤️ Räkna rösterna</button>
            {answered === 0 && <div className="muted small" style={{ marginTop: 8 }}>Minst en röst behövs.</div>}
          </div>
        )}
        {stage === 'lot' && <div className="text-center fav-lot">🎲 Lika röster här också! Lotten avgör…</div>}
        {stage === 'result' && d && (
          <div className="text-center mt-24">
            {d.byLot && <div className="tie-note" style={{ marginBottom: 12 }}>🎲 Lika röster även i utslagsröstningen, så lotten avgjorde.</div>}
            <button className="btn btn-gold btn-lg" onClick={() => dispatch({ type: 'FAVORITE_DONE' })}>
              {final ? '🏆 Visa vinnaren!' : state.currentGroup + 1 >= state.groupCount ? '⭐ Vidare till finalen!' : '➡️ Nästa deltävling'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== WINNER ====================

function WinnerScreen({ state, dispatch }) {
  const result = state.results.final;
  const songs = songMap(state);
  const places = placesOf(result);
  const top = places[0];
  const w = songs[top.songId];
  const pickers = pickerTable(state.songs, state.results);
  const maxPts = Math.max(1, ...places.map((s) => s.points));

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
        <div className="muted">
          {(top.counts[12] || 0)} {(top.counts[12] || 0) === 1 ? 'tolva' : 'tolvor'} i finalen{result.decider ? ' · vann utslagsröstningen ❤️' : ''}
        </div>
      </div>

      <div className="section-title">Slutställning</div>
      {places.map((s, i) => {
        const song = songs[s.songId];
        return (
          <div key={s.songId} className={'result-row' + (i === 0 ? ' winner' : '')} style={{ animationDelay: i * 0.1 + 's' }}>
            <div className="result-position">{medal(s.place - 1)}</div>
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
