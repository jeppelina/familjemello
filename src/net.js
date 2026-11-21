// Network and storage: Supabase (live sync + saved games), YouTube lookups, localStorage.
import { GAME_CODE_RE, genId, makeGameCode } from './logic.js';

// Shared Supabase project ("familjemello", also used by other family apps).
// The anon key is browser-safe by design: the database only exposes
// mello_load_game / mello_save_game (see supabase/schema.sql).
//   • Live sync (joining, votes, tiebreaks, reveal presses) is Realtime broadcast.
//   • Saved games: the host writes a snapshot so a reload or crash can resume.
const SUPABASE_URL = 'https://bhurxoknmyfqymtiaycx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodXJ4b2tubXlmcXltdGlheWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NzI5NTAsImV4cCI6MjA5NzU0ODk1MH0.YbblDF0jfZNzdIMy8rMF3t19b7b6onD91VVLi9N8kYg';

let sb = null;
export function getSupabase() {
  if (sb) return sb;
  try {
    if (window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    }
  } catch (e) {
    console.warn('Supabase init failed', e);
  }
  return sb;
}

export function openGameChannel(code) {
  const client = getSupabase();
  if (!client) return null;
  return client.channel('mello-game-' + code, { config: { broadcast: { ack: false } } });
}

export function closeChannel(ch) {
  const client = getSupabase();
  try { if (client && ch) client.removeChannel(ch); } catch (e) { /* already gone */ }
}

export async function loadGame(code) {
  const client = getSupabase();
  if (!client || !code) return null;
  try {
    const { data, error } = await client.rpc('mello_load_game', { p_id: code });
    if (error) { console.warn('loadGame:', error.message); return null; }
    return data || null;
  } catch (e) {
    console.warn('loadGame failed', e);
    return null;
  }
}

export async function saveGame(code, snapshot) {
  const client = getSupabase();
  if (!client || !code) return false;
  try {
    const { error } = await client.rpc('mello_save_game', { p_id: code, p_snapshot: snapshot });
    if (error) { console.warn('saveGame:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('saveGame failed', e);
    return false;
  }
}

// ==================== LOCAL STORAGE ====================

function getRaw(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function setRaw(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* private mode */ } }
export function getJSON(key, fallback) {
  const v = getRaw(key);
  if (v == null) return fallback;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}
export function setJSON(key, value) { setRaw(key, JSON.stringify(value)); }

export function getHostCode() {
  let c = getRaw('mello_host_game');
  if (!c || !GAME_CODE_RE.test(c)) {
    c = makeGameCode();
    setRaw('mello_host_game', c);
  }
  return c;
}
export function setHostCode(code) { setRaw('mello_host_game', code); }

export function loadLocalSnapshot(code) {
  const s = getJSON('mello_snap', null);
  return s && s.code === code ? s : null;
}
export function saveLocalSnapshot(snapshot) { setJSON('mello_snap', snapshot); }

export function getGameParam() {
  try {
    const p = new URLSearchParams(window.location.search);
    const r = (p.get('game') || p.get('room') || '').toUpperCase();
    return GAME_CODE_RE.test(r) ? r : null;
  } catch (e) {
    return null;
  }
}

export function getDeviceId() {
  let d = getRaw('mello_device');
  if (!d) { d = genId('d_'); setRaw('mello_device', d); }
  return d;
}

// Past winners, kept on the host device.
export function getHallOfFame() { return getJSON('mello_hof', []); }
export function addToHallOfFame(entry) {
  const list = getHallOfFame();
  if (list.some((e) => e.gameId === entry.gameId)) return list;
  const next = [entry, ...list].slice(0, 50);
  setJSON('mello_hof', next);
  return next;
}

// ==================== YOUTUBE LOOKUP ====================

// oEmbed answers with the video title and channel, and tells us up front when
// a video refuses to be embedded (401/403), so it never surprises us mid-show.
export async function lookupVideo(videoId) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId));
    if (r.ok) {
      const d = await r.json();
      return { ok: true, title: d.title || '', author: d.author_name || '' };
    }
    if (r.status === 401 || r.status === 403) return { ok: false, reason: 'blocked' };
    if (r.status === 400 || r.status === 404) return { ok: false, reason: 'missing' };
    return { ok: false, reason: 'unknown' };
  } catch (e) {
    return { ok: false, reason: 'offline' };
  }
}

// ==================== SONG YEAR AND ARTIST AGE (Wikidata) ====================

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const HUMAN = 'Q5';
const GROUP_TYPES = new Set(['Q215380', 'Q5741069', 'Q2088357', 'Q9212979', 'Q281643', 'Q641066', 'Q16887380', 'Q56816954', 'Q1802465']);
const MUSIC_WORDS = /singer|rapper|musician|band|group|duo|\bdj\b|songwriter|producer|music|artist/i;

async function wikidata(params) {
  const q = new URLSearchParams({ ...params, format: 'json', origin: '*' });
  const r = await fetch(WIKIDATA + '?' + q.toString());
  if (!r.ok) throw new Error('wikidata ' + r.status);
  return r.json();
}
const wdSearch = async (text, limit) => ((await wikidata({ action: 'wbsearchentities', search: text, language: 'en', type: 'item', limit: String(limit) })).search || []).map((h) => h.id);
const wdEntities = async (ids) => (ids.length ? (await wikidata({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels|descriptions', languages: 'en' })).entities || {} : {});
function claims(e, p) {
  return ((e && e.claims && e.claims[p]) || []).map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value).filter(Boolean);
}
const claimIds = (e, p) => claims(e, p).map((v) => v.id).filter(Boolean);
// Wikidata time -> 'YYYY-MM-DD', 'YYYY-MM' or 'YYYY', as precise as it is stated.
function claimDate(e, p) {
  const v = claims(e, p).find((x) => x.time);
  if (!v) return null;
  const m = v.time.match(/^\+?(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  if (v.precision >= 11) return m[1] + '-' + m[2] + '-' + m[3];
  if (v.precision === 10) return m[1] + '-' + m[2];
  return m[1];
}
const enText = (e, k) => (e && e[k] && e[k].en && e[k].en.value) || '';

// Look up when a song came out and who the artist is: a person (birth date) or a
// band (year it was formed). Returns null when nothing trustworthy turns up.
async function findArtist(name) {
  const ids = await wdSearch(name, 7);
  const ents = await wdEntities(ids);
  for (const id of ids) {
    const e = ents[id];
    const kinds = new Set(claimIds(e, 'P31'));
    const musical = MUSIC_WORDS.test(enText(e, 'descriptions'));
    if (kinds.has(HUMAN) && musical) return { id, person: true, e };
    if ([...kinds].some((k) => GROUP_TYPES.has(k)) || (musical && claims(e, 'P571').length)) return { id, person: false, e };
  }
  return null;
}

export async function lookupSongInfo(title, artist) {
  const full = String(artist || '').trim();
  // "Mark Ronson ft. Bruno Mars": try the whole name first, then the first artist.
  const first = full.split(/\s+(?:ft\.?|feat\.?|featuring|x|med)\s+|\s+&\s+|,/i)[0].trim();
  if (!title || !full) return null;
  try {
    let who = await findArtist(full);
    if (!who && first && first !== full) who = await findArtist(first);
    if (!who) return null;
    const mainArtist = first || full;
    const out = { year: '', released: '', people: [], formed: '' };
    if (who.person) {
      const born = claimDate(who.e, 'P569');
      if (born) out.people = [{ name: enText(who.e, 'labels') || mainArtist, born, died: claimDate(who.e, 'P570') || undefined }];
    } else {
      out.formed = (claimDate(who.e, 'P571') || '').slice(0, 4);
    }
    // The song: an item with this artist as performer. A music video beats a
    // single, which beats the song itself (a cover's song item has the original year).
    const sIds = await wdSearch(title, 15);
    const sEnts = await wdEntities(sIds);
    const rank = (e) => {
      const d = enText(e, 'descriptions').toLowerCase();
      const kinds = claimIds(e, 'P31');
      if (d.includes('music video') || kinds.includes('Q193977')) return 3;
      if (d.includes('single') || kinds.includes('Q134556')) return 2;
      return 1;
    };
    const matches = sIds.map((id) => sEnts[id]).filter((e) => e && claimIds(e, 'P175').includes(who.id) && claimDate(e, 'P577'));
    matches.sort((a, b) => rank(b) - rank(a) || (claimDate(a, 'P577') < claimDate(b, 'P577') ? -1 : 1));
    if (matches.length) {
      out.released = claimDate(matches[0], 'P577');
      out.year = out.released.slice(0, 4);
    }
    return out.year || out.people.length || out.formed ? out : null;
  } catch (e) {
    return null;
  }
}

export const thumbUrl = (videoId, quality = 'mqdefault') => 'https://i.ytimg.com/vi/' + videoId + '/' + quality + '.jpg';

// Keep the screen awake during the show (phones and the TV laptop).
let wakeLock = null;
export async function keepAwake() {
  try {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* not allowed or not supported */ }
}
