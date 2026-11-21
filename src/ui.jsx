// Small shared components used by both the host (TV) and the phone views.
import { agoText, SIMPLE_CHOICES, simpleChoiceFor, songTimeInfo, STAR_MAX } from './logic.js';
import { thumbUrl } from './net.js';

const { useEffect, useRef, useState } = React;

// Ten stars. The hover preview only follows a real mouse: on a phone a tap leaves a
// "hover" behind, which used to show the last song's stars on the next song.
export function StarRating({ value, onChange, big }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  const enter = (n) => (e) => { if (e.pointerType === 'mouse') setHover(n); };
  return (
    <div className={'stars-wrap' + (big ? ' big' : '')}>
      <div className={'stars' + (big ? ' stars-big' : '')} role="radiogroup" aria-label="Betyg" onPointerLeave={() => setHover(0)}>
        {Array.from({ length: STAR_MAX }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={'star' + (n <= shown ? ' active' : '')}
            onClick={() => { setHover(0); onChange(n); }}
            onPointerEnter={enter(n)}
            aria-label={n + ' av ' + STAR_MAX}
            aria-checked={n === value}
            role="radio"
          >★</button>
        ))}
      </div>
      <span className={'stars-num' + (value ? '' : ' empty')}>{shown ? shown + '/' + STAR_MAX : '–/' + STAR_MAX}</span>
    </div>
  );
}

// Three big faces for the youngest voters.
export function EmojiRating({ value, onChange, big }) {
  const cur = simpleChoiceFor(value);
  return (
    <div className={'emoji-rating' + (big ? ' emoji-big' : '')}>
      {SIMPLE_CHOICES.map((c) => (
        <button key={c.stars} type="button" className={'emoji-btn' + (cur && cur.stars === c.stars ? ' active' : '')} onClick={() => onChange(c.stars)} aria-label={c.label}>
          <span className="emoji-face">{c.emoji}</span>
          {big && <span className="emoji-label">{c.label}</span>}
        </button>
      ))}
    </div>
  );
}

export function VoteInput({ simple, value, onChange, big }) {
  return simple ? <EmojiRating value={value} onChange={onChange} big={big} /> : <StarRating value={value} onChange={onChange} big={big} />;
}

// Year, how long ago, and how old the artist was: the kids' favourite questions.
export function SongMeta({ song, compact, center }) {
  const info = songTimeInfo(song);
  if (!info) return null;
  const pills = [];
  pills.push(
    <span key="y" className={'meta-pill' + (info.year ? ' year' : ' missing')}>
      📅 {info.year ? info.year + ' · ' + agoText(info.ago) : 'År okänt'}
    </span>,
  );
  if (!compact) {
    for (const p of info.people.slice(0, 3)) {
      if (!p.then) continue;
      const then = (p.then.exact ? '' : 'ca ') + p.then.years + ' år';
      pills.push(
        <span key={'p' + p.name} className="meta-pill age">
          🎂 {p.name} var {then}{p.now ? ' (idag ' + p.now.years + ')' : ''}
        </span>,
      );
    }
    if (!info.people.length && info.formed) pills.push(<span key="f" className="meta-pill age">🎸 Bandet bildades {info.formed}</span>);
  }
  return <div className={'song-meta-line' + (center ? ' center' : '') + (compact ? ' compact' : '')}>{pills}</div>;
}

export function Thumb({ videoId, className, alt }) {
  const [broken, setBroken] = useState(false);
  if (!videoId || broken) return <div className={'thumb thumb-empty ' + (className || '')}>🎵</div>;
  return <img className={'thumb ' + (className || '')} src={thumbUrl(videoId)} alt={alt || ''} loading="lazy" onError={() => setBroken(true)} />;
}

export function FloatingParticles({ accent, count = 10 }) {
  const particles = useRef(Array.from({ length: count }, () => ({
    left: Math.random() * 100 + '%',
    size: 3 + Math.random() * 5,
    dur: 7 + Math.random() * 8 + 's',
    delay: Math.random() * 6 + 's',
  }))).current;
  const color = accent || 'var(--pink)';
  return (
    <div className="particles" aria-hidden="true">
      {particles.map((p, i) => (
        <div key={i} className="particle" style={{ left: p.left, width: p.size, height: p.size, background: color, '--dur': p.dur, '--delay': p.delay }} />
      ))}
    </div>
  );
}

export function StageLights({ accent }) {
  const lights = [
    { left: '10%', rotate: '8deg', delay: '0s' },
    { left: '32%', rotate: '-5deg', delay: '1.2s' },
    { left: '58%', rotate: '3deg', delay: '0.6s' },
    { left: '82%', rotate: '-7deg', delay: '1.8s' },
  ];
  return (
    <div className="stage-lights" aria-hidden="true">
      {lights.map((l, i) => (
        <div key={i} className="stage-light" style={{ left: l.left, transform: 'rotate(' + l.rotate + ')', '--light-color': accent || 'rgba(236,72,153,0.15)', animationDelay: l.delay }} />
      ))}
    </div>
  );
}

export function fireConfetti(ms = 4000) {
  if (!window.confetti) return;
  const end = Date.now() + ms;
  const colors = ['#f59e0b', '#ec4899', '#7c3aed', '#3b82f6', '#10b981'];
  const timer = setInterval(() => {
    window.confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors });
    window.confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() > end) clearInterval(timer);
  }, 60);
}

export function fireMiniConfetti() {
  if (window.confetti) window.confetti({ particleCount: 70, spread: 75, origin: { y: 0.6 }, colors: ['#f59e0b', '#ec4899', '#7c3aed'] });
}

// Run handler on keydown, except while typing in a field.
export function useKeys(handler, deps) {
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, deps);
}
