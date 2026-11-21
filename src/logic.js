// Pure game logic for Familje-Mello: no DOM, no React, no network.
// Imported by the app (bundled by build.mjs) and by the tests in test/.

// ==================== CONSTANTS ====================

// Each voter turns their stars into a personal ranking and hands out
// Mello points by rank: favourite 12, then 10, 8, 6, 4, 2, 1, then 0.
export const MELLO_POINTS = [12, 10, 8, 6, 4, 2, 1];
export const pointsForRank = (i) => (i < MELLO_POINTS.length ? MELLO_POINTS[i] : 0);

export const GAME_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const GAME_CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;

// Used when a song has no highlight time: about 60% into a 3:30 pop song.
export const DEFAULT_HIGHLIGHT_SEC = 126;
export const GROUP_CLIP_SEC = 20;
export const FINAL_RECAP_CLIP_SEC = 25;
export const FINAL_SHORT_CLIP_SEC = 35;

export const GROUP_THEMES = [
  { name: 'Eldprovet', emoji: '🔥', tagline: 'Bara de tåligaste överlever!', accent: '#ef4444', accentRgb: '239,68,68' },
  { name: 'Neonnatten', emoji: '🌃', tagline: 'Musiken som lyser i mörkret', accent: '#3b82f6', accentRgb: '59,130,246' },
  { name: 'Guldrushen', emoji: '⭐', tagline: 'Vem tar hem skatten?', accent: '#f59e0b', accentRgb: '245,158,11' },
  { name: 'Rymdresan', emoji: '🚀', tagline: 'Till finalen och bortom!', accent: '#a855f7', accentRgb: '168,85,247' },
];
export const FINAL_THEME = { name: 'Finalen', emoji: '🏆', tagline: 'Bara de bästa är kvar!', accent: '#f59e0b', accentRgb: '245,158,11' };
export const getGroupTheme = (g) => GROUP_THEMES[((g % GROUP_THEMES.length) + GROUP_THEMES.length) % GROUP_THEMES.length];

// Votes are 1 to 10 stars.
export const STAR_MAX = 10;

// Big emoji buttons for the youngest voters, mapped onto the star scale.
export const SIMPLE_CHOICES = [
  { stars: 10, emoji: '😍', label: 'Älskar den!' },
  { stars: 6, emoji: '🙂', label: 'Bra' },
  { stars: 2, emoji: '😴', label: 'Inte min grej' },
];
export function simpleChoiceFor(stars) {
  if (!stars) return null;
  return SIMPLE_CHOICES.reduce((best, c) => (Math.abs(c.stars - stars) < Math.abs(best.stars - stars) ? c : best));
}

// ==================== SMALL HELPERS ====================

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function genId(prefix = '', rng = Math.random) {
  return prefix + Math.floor(rng() * 36 ** 8).toString(36).padStart(8, '0') + Date.now().toString(36).slice(-4);
}

export function makeGameCode(rng = Math.random) {
  let c = '';
  for (let i = 0; i < 5; i++) c += GAME_CODE_CHARS[Math.floor(rng() * GAME_CODE_CHARS.length)];
  return c;
}

export const pickerKey = (name) => (name || '').trim().toLowerCase();

// ==================== YOUTUBE LINKS ====================

export function extractYouTubeId(url) {
  if (!url) return null;
  const t = String(url).trim();
  const m = t.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    || t.match(/^([a-zA-Z0-9_-]{11})$/);
  return m ? m[1] : null;
}

// "t=95", "t=95s", "t=1m35s", "start=95" in a shared link become the highlight time.
export function extractStartTime(url) {
  if (!url) return null;
  const m = String(url).match(/[?&#](?:t|start)=([0-9hms]+)/);
  if (!m) return null;
  const v = m[1];
  if (/^\d+s?$/.test(v)) return parseInt(v, 10) || null;
  const hms = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!hms) return null;
  const sec = (parseInt(hms[1] || '0', 10) * 3600) + (parseInt(hms[2] || '0', 10) * 60) + parseInt(hms[3] || '0', 10);
  return sec || null;
}

export function parseTimestamp(str) {
  if (str == null) return null;
  const s = String(str).trim();
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = s.match(/^(\d+)$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function formatTimestamp(sec) {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

export function getHighlightStart(song) {
  return song && song.highlightStart > 0 ? song.highlightStart : DEFAULT_HIGHLIGHT_SEC;
}

// Turn a YouTube video title like "Queen – Bohemian Rhapsody (Official Video Remastered)"
// into { artist: 'Queen', title: 'Bohemian Rhapsody' }. Falls back on the channel name.
export function cleanVideoTitle(rawTitle, author) {
  const NOISE = /\s*[([{][^)\]}]*\b(official|video|audio|lyrics?|visuali[sz]er|remaster(?:ed)?|hd|hq|4k|m\/v|mv|music|clip|live|version)\b[^)\]}]*[)\]}]/gi;
  let t = String(rawTitle || '')
    .replace(NOISE, ' ')
    .replace(/\s+(official\s+(music\s+)?video|m\/v|mv)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const m = t.match(/^(.+?)\s+[-–—|]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  const artist = String(author || '')
    .replace(/vevo$/i, '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\bofficial\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { title: t, artist };
}

// ==================== TOURNAMENT SHAPE ====================

// Groups of at least 3 songs (so somebody always goes out), at most 4 groups.
// Fewer than 6 songs: no groups, every song goes straight to the final.
export function planGroups(n) {
  if (n < 6) return { groupCount: 0, sizes: [] };
  const groupCount = Math.min(4, Math.floor(n / 3));
  const base = Math.floor(n / groupCount);
  const extra = n % groupCount;
  return { groupCount, sizes: Array.from({ length: groupCount }, (_, i) => base + (i < extra ? 1 : 0)) };
}

export const QUALIFIERS_PER_GROUP = 2;

// Deal songs into groups, spreading each person's picks over different groups.
// Returns { groupCount, songs } with song.group set and a random running order.
export function assignGroups(songs, rng = Math.random) {
  const { groupCount, sizes } = planGroups(songs.length);
  if (groupCount === 0) return { groupCount, songs: shuffle(songs, rng).map((s) => ({ ...s, group: -1 })) };

  const buckets = new Map();
  for (const s of shuffle(songs, rng)) {
    const k = pickerKey(s.pickedBy);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  // Biggest pickers first, so their songs get spread before groups fill up.
  const ordered = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
  const cap = shuffle(sizes, rng);
  const count = Array(groupCount).fill(0);
  const perPicker = Array.from({ length: groupCount }, () => new Map());
  const placed = [];
  for (const [k, list] of ordered) {
    for (const s of list) {
      let best = -1;
      let bestKey = null;
      for (const g of shuffle([...Array(groupCount).keys()], rng)) {
        if (count[g] >= cap[g]) continue;
        const key = [perPicker[g].get(k) || 0, count[g]];
        if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
          best = g;
          bestKey = key;
        }
      }
      count[best] += 1;
      perPicker[best].set(k, (perPicker[best].get(k) || 0) + 1);
      placed.push({ ...s, group: best });
    }
  }
  return { groupCount, songs: shuffle(placed, rng) };
}

// ==================== FROM STARS TO POINTS ====================

export function starsOf(votesForRound, songIds, voterId) {
  const out = {};
  for (const id of songIds) out[id] = ((votesForRound || {})[id] || {})[voterId] || 0;
  return out;
}

export function hasVotedAll(votesForRound, songIds, voterId) {
  return songIds.every((id) => ((votesForRound || {})[id] || {})[voterId] != null);
}

// One voter's stars become Mello points by rank. Songs with equal stars share the
// place and both get its points: two favourites both get 12, the next song gets 8.
export function pointsForVoter(songIds, stars) {
  const out = {};
  for (const id of songIds) {
    const mine = stars[id] || 0;
    out[id] = pointsForRank(songIds.filter((o) => (stars[o] || 0) > mine).length);
  }
  return out;
}

// Only totals are kept: how many of each score every song got, never who gave it.
// Songs with equal points share their place; ties keep the running order.
export function scoreRound(songIds, voterIds, votesForRound) {
  const tot = {};
  for (const id of songIds) tot[id] = { songId: id, points: 0, counts: {} };
  for (const vid of voterIds) {
    const pts = pointsForVoter(songIds, starsOf(votesForRound, songIds, vid));
    for (const id of songIds) {
      tot[id].points += pts[id];
      tot[id].counts[pts[id]] = (tot[id].counts[pts[id]] || 0) + 1;
    }
  }
  const idx = new Map(songIds.map((id, i) => [id, i]));
  const sorted = Object.values(tot).sort((a, b) => b.points - a.points || idx.get(a.songId) - idx.get(b.songId));
  const standings = sorted.map((t) => ({
    songId: t.songId,
    points: t.points,
    place: 1 + sorted.filter((o) => o.points > t.points).length,
    counts: t.counts,
  }));
  return { standings, voterCount: voterIds.length };
}

// ==================== TIES THAT MATTER ====================

// A tie only matters on the line between going to the final and going out (in a
// group), or for first place (in the final). Returns the tied songs and how many
// of them get through, or null.
export function cutTie(result, spots) {
  const st = (result && result.standings) || [];
  if (st.length <= spots) return null;
  const edge = st[spots - 1].points;
  if (st[spots].points !== edge) return null;
  const songIds = st.filter((s) => s.points === edge).map((s) => s.songId);
  return { songIds, spots: spots - st.filter((s) => s.points > edge).length };
}

// The favourite vote: everyone picks one of the tied songs. Most votes takes the
// open spots. If the favourite vote is level as well, the lot decides (byLot).
export function decideTie(tie, favourites, rng = Math.random) {
  const counts = {};
  for (const id of tie.songIds) counts[id] = 0;
  for (const sid of Object.values(favourites || {})) if (sid in counts) counts[sid] += 1;
  const lot = {};
  for (const id of tie.songIds) lot[id] = rng();
  const order = [...tie.songIds].sort((a, b) => counts[b] - counts[a] || lot[b] - lot[a]);
  const byLot = counts[order[tie.spots - 1]] === counts[order[tie.spots]];
  return { songIds: [...tie.songIds], spots: tie.spots, counts, order, byLot };
}

// Final order of a round, with places. A decided tie splits its songs into the ones
// that got through (own places) and the rest (who still share a place).
export function placesOf(result) {
  if (!result) return [];
  const st = result.standings;
  const d = result.decider;
  if (!d) return st.map((s) => ({ ...s }));
  const tied = new Set(d.songIds);
  const first = st.findIndex((s) => tied.has(s.songId));
  const bySong = Object.fromEntries(st.map((s) => [s.songId, s]));
  const block = d.order.map((id, i) => ({ ...bySong[id], place: st[first].place + Math.min(i, d.spots) }));
  return [...st.slice(0, first), ...block, ...st.slice(first + block.length)];
}

export function qualifiersOf(result) {
  return placesOf(result).slice(0, QUALIFIERS_PER_GROUP).map((s) => s.songId);
}

// ==================== THE REVEAL ====================

// Points are handed out one score at a time, all voters together, so nobody's votes
// are shown: first the small ones, then every 6, every 8, every 12. Each voter gives
// each song exactly one score, so the last score to come out can be worked out from
// what is left. That is why the 12s come second to last, while they are still a
// surprise, and the 10s fill up the rest.
export function revealSteps(result) {
  const values = new Set();
  for (const s of (result && result.standings) || []) {
    for (const [p, n] of Object.entries(s.counts)) if (n > 0) values.add(Number(p));
  }
  const groups = [];
  const low = [...values].filter((p) => p < 6).sort((a, b) => a - b);
  if (low.length) groups.push(low);
  for (const p of [6, 8, 12, 10]) if (values.has(p)) groups.push([p]);
  const other = [...values].filter((p) => p > 12).sort((a, b) => a - b);
  if (other.length) groups.push(other);
  return groups.map((vals, i) => {
    const chips = [];
    for (const s of result.standings) for (const v of vals) for (let k = 0; k < (s.counts[v] || 0); k++) chips.push({ songId: s.songId, points: v });
    return { values: vals, chips, last: i === groups.length - 1 };
  });
}

// Points per song after the first `n` reveal steps.
export function totalsAfterSteps(steps, n, songIds) {
  const t = {};
  for (const id of songIds) t[id] = 0;
  for (let i = 0; i < n && i < steps.length; i++) for (const c of steps[i].chips) t[c.songId] = (t[c.songId] || 0) + c.points;
  return t;
}

// Scoreboard order: points so far, ties in `tieOrder` (the running order), so the
// order on screen never gives away anything that has not been shown yet.
export function runningOrder(tieOrder, totals) {
  const idx = new Map(tieOrder.map((id, i) => [id, i]));
  return [...tieOrder].sort((a, b) => (totals[b] || 0) - (totals[a] || 0) || idx.get(a) - idx.get(b));
}

// Phones are told that their vote arrived without being told anyone's stars:
// the ballot carries this short code instead, and a phone checks its own value.
export function ackCode(voterId, songId, stars) {
  let h = 2166136261;
  const str = voterId + '|' + songId + '|' + stars;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
export function starsFromAck(ack, voterId, songId) {
  if (!ack) return 0;
  for (let s = 1; s <= STAR_MAX; s++) if (ackCode(voterId, songId, s) === ack) return s;
  return 0;
}

// ==================== YEARS AND AGES ====================

function parseDate(str) {
  const m = String(str || '').match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
  return m ? { y: +m[1], m: m[2] ? +m[2] : null, d: m[3] ? +m[3] : null } : null;
}

export const isoDay = (date) => {
  const d = date || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

// Whole years from `born` to `when` (dates as 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD').
// A missing month or day is taken as mid-year; `exact` says whether that mattered.
export function ageAt(born, when) {
  const b = parseDate(born);
  const w = parseDate(when);
  if (!b || !w) return null;
  const bm = b.m || 7;
  const bd = b.d || 1;
  const wm = w.m || 7;
  const wd = w.d || 15;
  let years = w.y - b.y;
  if (wm < bm || (wm === bm && wd < bd)) years -= 1;
  const exact = !!(b.m && b.d && w.m && (w.d || w.m !== b.m));
  return { years, exact };
}

// What the song card says about time: the year, how long ago, how old the artist was.
export function songTimeInfo(song, today = isoDay()) {
  if (!song) return null;
  const year = parseInt(song.year, 10) || (parseDate(song.released) || {}).y || null;
  const nowY = parseDate(today).y;
  const ago = year ? nowY - year : null;
  const when = song.released || (year ? String(year) : null);
  const people = (song.people || []).filter((p) => p && p.name && p.born).map((p) => ({
    name: p.name,
    then: when ? ageAt(p.born, when) : null,
    now: p.died ? null : ageAt(p.born, today),
  }));
  return { year, ago, people, formed: song.formed || null };
}

export function agoText(ago) {
  if (ago == null) return '';
  if (ago <= 0) return 'i år';
  return ago === 1 ? 'förra året' : ago + ' år sedan';
}

// ==================== AWARDS AND ESTIMATES ====================

// Points each person's picks collected over every round.
export function pickerTable(songs, results) {
  const bySong = {};
  for (const r of Object.values(results || {})) for (const s of r.standings) bySong[s.songId] = (bySong[s.songId] || 0) + s.points;
  const rows = new Map();
  for (const song of songs) {
    const k = pickerKey(song.pickedBy);
    if (!k) continue;
    const r = rows.get(k) || { name: song.pickedBy.trim(), points: 0, songs: 0 };
    r.points += bySong[song.id] || 0;
    r.songs += 1;
    rows.set(k, r);
  }
  return [...rows.values()].sort((a, b) => b.points - a.points);
}

export function estimateMinutes(n, finalMode) {
  if (n <= 0) return 0;
  const { groupCount } = planGroups(n);
  if (groupCount === 0) return Math.round(n * 4.5 + 3);
  const finalists = groupCount * QUALIFIERS_PER_GROUP;
  const groups = n * 4.2 + n * (GROUP_CLIP_SEC / 60) + groupCount * 2.5;
  const fin = finalMode === 'full'
    ? finalists * (FINAL_RECAP_CLIP_SEC / 60) + finalists * 4.2 + 3
    : finalists * 1.3 + 3;
  return Math.round(groups + fin);
}

export function formatDuration(min) {
  const r = Math.max(5, Math.round(min / 5) * 5);
  if (r < 60) return 'ca ' + r + ' min';
  const h = Math.floor(r / 60);
  const m = r % 60;
  return 'ca ' + h + ' h' + (m ? ' ' + m + ' min' : '');
}
