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

// Big emoji buttons for the youngest voters, mapped onto the star scale.
export const SIMPLE_CHOICES = [
  { stars: 5, emoji: '😍', label: 'Älskar den!' },
  { stars: 3, emoji: '🙂', label: 'Bra' },
  { stars: 1, emoji: '😴', label: 'Inte min grej' },
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

// ==================== RANKING A VOTER'S STARS ====================

// stars: { songId: 1..5 }. picks: songIds this voter picked in tiebreak questions, in order.
// Returns the voter's full order (best first) and the first open tie, if any:
// question = { stars, options: [songIds that still share the same stars] }.
export function rankForVoter(songIds, stars, picks = []) {
  const pickIdx = new Map(picks.map((id, i) => [id, i]));
  const levels = new Map();
  for (const id of songIds) {
    const s = stars[id] || 0;
    if (!levels.has(s)) levels.set(s, []);
    levels.get(s).push(id);
  }
  const order = [];
  let question = null;
  for (const lv of [...levels.keys()].sort((a, b) => b - a)) {
    const ids = levels.get(lv);
    const picked = ids.filter((id) => pickIdx.has(id)).sort((a, b) => pickIdx.get(a) - pickIdx.get(b));
    const open = ids.filter((id) => !pickIdx.has(id));
    order.push(...picked, ...open);
    if (open.length >= 2 && !question) question = { stars: lv, options: open, picked: picked.length };
  }
  return { order, question };
}

export function starsOf(votesForRound, songIds, voterId) {
  const out = {};
  for (const id of songIds) out[id] = ((votesForRound || {})[id] || {})[voterId] || 0;
  return out;
}

export function hasVotedAll(votesForRound, songIds, voterId) {
  return songIds.every((id) => ((votesForRound || {})[id] || {})[voterId] != null);
}

// { voterId: question } for every voter who still has a tie to break.
export function pendingTiebreaks(songIds, voterIds, votesForRound, picksForRound) {
  const out = {};
  for (const vid of voterIds) {
    const { question } = rankForVoter(songIds, starsOf(votesForRound, songIds, vid), (picksForRound || {})[vid] || []);
    if (question) out[vid] = question;
  }
  return out;
}

// Settle every remaining tie for one voter at random (the "🎲 Slumpa" button).
export function randomFillPicks(songIds, stars, picks = [], rng = Math.random) {
  const out = [...picks];
  for (let guard = 0; guard < songIds.length + 1; guard++) {
    const { question } = rankForVoter(songIds, stars, out);
    if (!question) break;
    out.push(question.options[Math.floor(rng() * question.options.length)]);
  }
  return out;
}

// ==================== SCORING A ROUND ====================

// Ties between songs are broken by: more points, then more 12s, more 10s, ... ,
// then more stars in total, and only then by drawing lots (flagged as tiedAbove).
export function scoreRound(songIds, voterIds, votesForRound, picksForRound, rng = Math.random) {
  const awards = {};
  const tot = {};
  for (const id of songIds) tot[id] = { songId: id, points: 0, stars: 0, counts: {} };
  for (const vid of voterIds) {
    const stars = starsOf(votesForRound, songIds, vid);
    let picks = (picksForRound || {})[vid] || [];
    if (rankForVoter(songIds, stars, picks).question) picks = randomFillPicks(songIds, stars, picks, rng);
    const { order } = rankForVoter(songIds, stars, picks);
    awards[vid] = order.map((id, i) => ({ songId: id, points: pointsForRank(i) }));
    for (const a of awards[vid]) {
      tot[a.songId].points += a.points;
      tot[a.songId].counts[a.points] = (tot[a.songId].counts[a.points] || 0) + 1;
    }
    for (const id of songIds) tot[id].stars += stars[id];
  }
  const keyOf = (t) => [t.points, ...MELLO_POINTS.map((p) => t.counts[p] || 0), t.stars];
  const lot = {};
  for (const id of songIds) lot[id] = rng();
  const cmpKeys = (a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  };
  const sorted = Object.values(tot).sort((a, b) => cmpKeys(a, b) || lot[b.songId] - lot[a.songId]);
  const standings = sorted.map((t, i) => ({
    songId: t.songId,
    points: t.points,
    stars: t.stars,
    twelves: t.counts[12] || 0,
    tiedAbove: i > 0 && cmpKeys(sorted[i - 1], t) === 0,
  }));
  return { standings, awards, voterIds: [...voterIds] };
}

export function qualifiersOf(result) {
  return result ? result.standings.slice(0, QUALIFIERS_PER_GROUP).map((s) => s.songId) : [];
}

// ==================== THE REVEAL ====================

// One voter at a time, like the real thing: small points together, then 10,
// then a drumroll ("och våra 12 poäng går till...") and the 12.
export function buildRevealBeats(result) {
  const beats = [];
  if (!result) return [{ kind: 'done', awards: [] }];
  for (const vid of result.voterIds) {
    const aw = (result.awards[vid] || []).filter((a) => a.points > 0);
    const low = aw.filter((a) => a.points < 10).sort((a, b) => a.points - b.points);
    const ten = aw.find((a) => a.points === 10);
    const twelve = aw.find((a) => a.points === 12);
    beats.push({ kind: 'voter', voterId: vid, awards: low });
    if (ten) beats.push({ kind: 'ten', voterId: vid, awards: [ten] });
    if (twelve) {
      beats.push({ kind: 'twelvePending', voterId: vid, awards: [] });
      beats.push({ kind: 'twelve', voterId: vid, awards: [twelve] });
    }
  }
  beats.push({ kind: 'done', awards: [] });
  return beats;
}

export function totalsAfter(beats, step, songIds) {
  const t = {};
  for (const id of songIds) t[id] = 0;
  for (let i = 0; i <= step && i < beats.length; i++) for (const a of beats[i].awards) t[a.songId] = (t[a.songId] || 0) + a.points;
  return t;
}

// Scoreboard order: points so far, ties in `tieOrder`. During the reveal pass the
// running order (so equal scores never leak the final result); at the end pass
// the final standings, which already include every tiebreak.
export function runningOrder(tieOrder, totals) {
  const idx = new Map(tieOrder.map((id, i) => [id, i]));
  return [...tieOrder].sort((a, b) => (totals[b] || 0) - (totals[a] || 0) || idx.get(a) - idx.get(b));
}

// Why did the song above win a tie on points? Returns null when it had more points.
export function tieReason(above, below) {
  if (!above || !below || above.points !== below.points) return null;
  if (below.tiedAbove) return 'lot';
  if (above.twelves !== below.twelves) return 'twelves';
  return 'higher';
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
