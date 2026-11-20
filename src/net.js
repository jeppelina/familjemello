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
