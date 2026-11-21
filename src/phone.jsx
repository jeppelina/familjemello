// The phone view (?game=CODE): vote on each song, and pick a favourite when a tie
// decides who goes on. A phone only ever learns its own votes.
import { closeChannel, getJSON, keepAwake, openGameChannel, setJSON } from './net.js';
import { genId, starsFromAck } from './logic.js';
import { SNAPSHOT_VERSION } from './state.js';
import { SongMeta, Thumb, VoteInput } from './ui.jsx';

const { useState, useEffect, useRef } = React;

const voteKey = (round, songId, partId) => round + '|' + songId + '|' + partId;

export function PhoneGame({ code }) {
  const [ballot, setBallot] = useState(null);
  const [status, setStatus] = useState('connecting'); // connecting | live | error
  const [parts, setParts] = useState(() => getJSON('mello_parts_' + code, []));
  const [name, setName] = useState('');
  const [pending, setPending] = useState({}); // voteKey -> stars, until the host confirms
  const [favSent, setFavSent] = useState({}); // round|partId -> songId we picked
  const chRef = useRef(null);
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const ballotRef = useRef(ballot);
  ballotRef.current = ballot;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const lastRegister = useRef(0);

  const send = (event, payload) => { if (chRef.current) chRef.current.send({ type: 'broadcast', event, payload }); };
  const registerAll = () => {
    lastRegister.current = Date.now();
    partsRef.current.forEach((p) => send('register', { id: p.id, name: p.name, simple: !!p.simple }));
  };
  const persistParts = (next) => {
    partsRef.current = next;
    setParts(next);
    setJSON('mello_parts_' + code, next);
  };

  useEffect(() => {
    const ch = openGameChannel(code);
    if (!ch) { setStatus('error'); return undefined; }
    ch.on('broadcast', { event: 'ballot' }, ({ payload }) => {
      if (!payload) return;
      // The TV runs a newer version than this page: reload once to get it.
      if (payload.v && payload.v !== SNAPSHOT_VERSION) {
        let tried = false;
        try { tried = sessionStorage.getItem('mello_reloaded') === String(payload.v); sessionStorage.setItem('mello_reloaded', String(payload.v)); } catch (e) { /* ignore */ }
        if (!tried) { window.location.reload(); return; }
      }
      setBallot(payload);
    });
    ch.on('broadcast', { event: 'rollcall' }, () => registerAll());
    ch.on('broadcast', { event: 'kick' }, ({ payload }) => {
      if (payload && payload.id) persistParts(partsRef.current.filter((p) => p.id !== payload.id));
    });
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        setStatus('live');
        send('hello', {});
        registerAll();
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        setStatus('error');
      }
    });
    chRef.current = ch;
    // Back from a locked screen: ask for the current ballot straight away.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      send('hello', {});
      keepAwake();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      closeChannel(ch);
      chRef.current = null;
    };
  }, [code]);

  // The host is the source of truth: a vote counts as sent only when the host's
  // ballot shows it. Drop confirmed votes, and votes for a round that is over.
  useEffect(() => {
    if (!ballot) return;
    setPending((p) => {
      let changed = false;
      const next = { ...p };
      for (const [k, stars] of Object.entries(p)) {
        const [round, songId, partId] = k.split('|');
        const live = ballot.kind === 'vote' && ballot.round === round;
        const confirmed = live && starsFromAck(((ballot.acks || {})[songId] || {})[partId], partId, songId) === stars;
        if (!live || confirmed) { delete next[k]; changed = true; }
      }
      return changed ? next : p;
    });
    // If the host has forgotten one of our voters (new game, reload), introduce them again.
    const missing = partsRef.current.some((p) => !(ballot.voters || []).some((v) => v.id === p.id));
    if (missing && Date.now() - lastRegister.current > 3000) registerAll();
  }, [ballot]);

  // Resend anything the host has not confirmed yet.
  const favRef = useRef(favSent);
  favRef.current = favSent;
  useEffect(() => {
    let ticks = 0;
    const t = setInterval(() => {
      const b = ballotRef.current;
      if (b && b.kind === 'favorite' && !b.decided) {
        for (const [k, songId] of Object.entries(favRef.current)) {
          const [round, partId] = k.split('|');
          if (round === b.round && !(b.answered || []).includes(partId)) send('favorite', { round, voterId: partId, songId });
        }
      }
      const entries = Object.entries(pendingRef.current);
      if (!b || b.kind !== 'vote' || !entries.length) return;
      ticks += 1;
      if (ticks % 4 === 0) registerAll();
      for (const [k, stars] of entries) {
        const [round, songId, partId] = k.split('|');
        if (round === b.round) send('vote', { round, songId, voterId: partId, stars });
      }
    }, 1500);
    return () => clearInterval(t);
  }, []);

  const addPart = () => {
    const n = name.trim();
    if (!n) return;
    const p = { id: genId('p_'), name: n.slice(0, 24), simple: false };
    persistParts([...partsRef.current, p]);
    setName('');
    send('register', { id: p.id, name: p.name, simple: false });
    keepAwake();
  };
  const removePart = (id) => {
    persistParts(partsRef.current.filter((p) => p.id !== id));
    send('unregister', { id });
  };
  const toggleSimple = (id) => {
    const next = partsRef.current.map((p) => (p.id === id ? { ...p, simple: !p.simple } : p));
    persistParts(next);
    const p = next.find((x) => x.id === id);
    send('register', { id: p.id, name: p.name, simple: !!p.simple });
  };
  const vote = (partId, stars) => {
    const b = ballotRef.current;
    if (!b || b.kind !== 'vote') return;
    setPending((p) => ({ ...p, [voteKey(b.round, b.song.id, partId)]: stars }));
    send('vote', { round: b.round, songId: b.song.id, voterId: partId, stars });
  };

  const manager = <PhoneVoterManager parts={parts} name={name} setName={setName} addPart={addPart} removePart={removePart} toggleSimple={toggleSimple} compact={!!ballot && ballot.kind !== 'wait'} />;

  let content;
  if (status === 'error') {
    content = <div className="phone-card"><div className="phone-msg">Kunde inte ansluta. Kontrollera nätet och ladda om sidan.</div></div>;
  } else if (!ballot) {
    content = <div className="phone-card"><div className="phone-msg">Ansluter till spelet…</div></div>;
  } else if (ballot.kind === 'vote') {
    const s = ballot.song;
    const confirmedFor = (pid) => starsFromAck(((ballot.acks || {})[s.id] || {})[pid], pid, s.id);
    content = (
      <div className="phone-card">
        <div className="phone-eyebrow">{ballot.label} · Låt {ballot.songIndex + 1} av {ballot.songCount}</div>
        <Thumb videoId={s.youtubeId} className="phone-thumb" alt={s.title} />
        <div className="phone-song-title">{s.title}</div>
        {s.artist && <div className="phone-song-artist">{s.artist}</div>}
        <SongMeta song={s} center />
        {s.pickedBy && <div className="phone-picker">Vald av {s.pickedBy}</div>}
        {parts.length === 0
          ? <div className="phone-msg" style={{ marginTop: 16 }}>Skriv ditt namn nedan för att rösta.</div>
          : parts.map((p) => {
            const k = voteKey(ballot.round, s.id, p.id);
            const confirmed = confirmedFor(p.id);
            const pend = pending[k];
            const value = pend != null ? pend : confirmed || 0;
            const sending = pend != null && pend !== confirmed;
            return (
              // Keyed by song as well, so nothing from the last song is left on the stars.
              <div key={s.id + ':' + p.id} className="phone-vote-row">
                <div className="phone-vote-name">
                  {p.name}
                  {sending ? <span className="phone-sending"> skickar…</span> : confirmed ? <span className="ok"> ✓</span> : null}
                </div>
                <VoteInput simple={p.simple} value={value} onChange={(v) => vote(p.id, v)} big />
              </div>
            );
          })}
        {parts.length > 0 && <div className="phone-secret">🤫 Bara du ser dina stjärnor</div>}
        {s.facts && s.facts.length > 0 && (
          <div className="phone-facts">
            <div className="facts-title">💡 Visste du?</div>
            {s.facts.map((f, i) => <p key={i}>{f}</p>)}
          </div>
        )}
      </div>
    );
  } else if (ballot.kind === 'favorite') {
    const mine = parts.filter((p) => (ballot.askIds || []).includes(p.id));
    const answered = new Set(ballot.answered || []);
    content = ballot.decided || mine.length === 0
      ? (
        <div className="phone-card">
          <div className="phone-msg">{ballot.decided ? 'Rösterna räknas på TV:n! 📺' : 'Utslagsröstning! De som röstade i den här omgången väljer nu. Titta på TV:n 📺'}</div>
        </div>
      )
      : (
        <div>
          {mine.map((p) => {
            const key = ballot.round + '|' + p.id;
            const picked = favSent[key];
            const pick = (songId) => {
              setFavSent((x) => ({ ...x, [key]: songId }));
              send('favorite', { round: ballot.round, voterId: p.id, songId });
            };
            return (
              <div key={p.id} className="phone-card" style={{ marginBottom: 14 }}>
                <div className="phone-eyebrow">Utslagsröstning · {p.name}</div>
                <div className="phone-h">Vilken är din favorit?</div>
                <div className="muted small" style={{ marginBottom: 12 }}>
                  Låtarna fick lika många poäng. {ballot.spots === 1 ? 'Bara en' : ballot.spots} kan gå vidare.
                </div>
                <div className="tb-options phone">
                  {ballot.options.map((o) => (
                    <button key={o.id} className={'tb-option' + (picked === o.id ? ' picked' : picked ? ' dim' : '')} onClick={() => pick(o.id)}>
                      <Thumb videoId={o.youtubeId} />
                      <span className="tb-title">{o.title}</span>
                      <span className="tb-artist">{o.artist}</span>
                    </button>
                  ))}
                </div>
                {picked && !answered.has(p.id) && <div className="phone-sending" style={{ marginTop: 8 }}>skickar…</div>}
                {answered.has(p.id) && <div className="ok" style={{ marginTop: 8 }}>✓ Din röst är med. Du kan ändra dig tills rösterna räknas.</div>}
              </div>
            );
          })}
        </div>
      );
  } else if (ballot.kind === 'reveal') {
    content = (
      <div className="phone-card">
        <div className="phone-msg">{ballot.started ? 'Poängen avslöjas på TV:n! 📺' : 'Snart kommer poängen. Titta på TV:n! 📺'}</div>
        <div className="muted small" style={{ marginTop: 8 }}>Ingen får veta vem som gav vad 🤫</div>
      </div>
    );
  } else {
    const msgs = {
      setup: parts.length ? 'Du är med! Väntar på att spelet ska börja…' : 'Skriv ditt namn nedan så är du med!',
      lineup: 'Låtarna lottas in i deltävlingar. Titta på TV:n! 🎲',
      groupIntro: 'En ny deltävling börjar. Titta på TV:n! 🎬',
      finalIntro: 'Dags för FINALEN! Titta på TV:n! 🏆',
      groupRecap: 'Recap på TV:n. Minns du låtarna? 👀',
      recap: 'Recap av finalisterna på TV:n! 👀',
      winner: 'Vinnaren är korad! Titta på TV:n 🏆',
    };
    content = <div className="phone-card"><div className="phone-msg">{msgs[ballot.phase] || 'Vänta på nästa låt…'}</div></div>;
  }

  return (
    <div className="phone-wrap">
      <div className="phone-header">
        <div className="logo" style={{ fontSize: '1.7rem' }}>Familje-Mello</div>
        <div className="phone-sub">Spel {code} <span className={'live-dot' + (status === 'live' ? ' on' : '')} /></div>
      </div>
      {content}
      {manager}
    </div>
  );
}

function PhoneVoterManager({ parts, name, setName, addPart, removePart, toggleSimple, compact }) {
  const [open, setOpen] = useState(!compact || parts.length === 0);
  // Fold the list away when voting starts, so the stars are what you see.
  useEffect(() => { if (compact && parts.length > 0) setOpen(false); }, [compact]);
  if (compact && !open && parts.length > 0) {
    return (
      <div className="text-center" style={{ marginTop: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>👤 Röstare i den här mobilen ({parts.length})</button>
      </div>
    );
  }
  return (
    <div className="phone-card" style={{ marginTop: 14, textAlign: 'left' }}>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Röstare i den här mobilen</div>
        {compact && parts.length > 0 && <button className="link-btn" onClick={() => setOpen(false)}>Dölj ▴</button>}
      </div>
      {parts.length === 0 && <div className="phone-msg" style={{ marginBottom: 10 }}>Lägg till alla som röstar härifrån, en eller flera.</div>}
      {parts.map((p) => (
        <div key={p.id} className="voter-row">
          <div className="voter-name">{p.name}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => toggleSimple(p.id)} title="Växla mellan stjärnor och tre stora knappar">{p.simple ? '👶 Barnläge' : '⭐ Stjärnor'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => removePart(p.id)}>Ta bort</button>
          </div>
        </div>
      ))}
      <div className="input-row" style={{ marginTop: 12, marginBottom: 0 }}>
        <input className="input" placeholder="Namn" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addPart(); }} />
        <button className="btn btn-primary btn-sm" onClick={addPart}>+ Lägg till</button>
      </div>
    </div>
  );
}
