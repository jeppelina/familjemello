// Game state: the reducer, snapshots, and the ballot that phones see.
// Pure apart from Math.random (shuffles, lots), which actions can override with `rng`.
import {
  assignGroups, buildRevealBeats, FINAL_THEME, genId, getGroupTheme, hasVotedAll,
  pendingTiebreaks, qualifiersOf, randomFillPicks, scoreRound, shuffle, starsOf,
} from './logic.js';
import { getPlaylist } from './playlists.js';

export const SNAPSHOT_VERSION = 2;

export const initialState = {
  v: SNAPSHOT_VERSION,
  gameId: null,
  phase: 'setup', // setup | groupIntro | group | groupRecap | finalIntro | recap | final | tiebreak | reveal | winner
  songs: [], // { id, title, artist, youtubeId, highlightStart, year, pickedBy, group }
  voters: [], // { id, name, simple, phone }
  settings: { finalMode: 'highlights' }, // 'highlights' | 'full'
  groupCount: 0,
  currentGroup: 0,
  round: null, // 'group_0'.. | 'final'
  currentSongIndex: 0,
  finalists: [], // song ids
  votes: {}, // round -> songId -> voterId -> stars
  picks: {}, // round -> voterId -> [songIds picked in tiebreaks]
  roundVoters: {}, // round -> voterIds who count in that round
  results: {}, // round -> scoreRound(...) result
  reveal: { step: -1 },
  recap: { index: 0, playing: false },
};

// ==================== SELECTORS ====================

export const isFinal = (round) => round === 'final';

export function songIdsForRound(state, round = state.round) {
  if (!round) return [];
  if (isFinal(round)) return state.finalists;
  const g = parseInt(round.split('_')[1], 10);
  return state.songs.filter((s) => s.group === g).map((s) => s.id);
}

export function songMap(state) {
  const m = {};
  for (const s of state.songs) m[s.id] = s;
  return m;
}

export function roundTheme(state, round = state.round) {
  return isFinal(round) ? FINAL_THEME : getGroupTheme(state.currentGroup);
}

export function roundLabel(state, round = state.round) {
  if (!round) return '';
  return isFinal(round) ? 'Finalen' : getGroupTheme(parseInt(round.split('_')[1], 10)).name;
}

export function revealBeats(state) {
  return buildRevealBeats(state.results[state.round]);
}

// Voters that still owe a tiebreak answer in the current round.
export function currentTiebreaks(state) {
  const round = state.round;
  const ids = songIdsForRound(state, round);
  const voterIds = (state.roundVoters[round] || []).filter((id) => state.voters.some((v) => v.id === id));
  return pendingTiebreaks(ids, voterIds, state.votes[round], state.picks[round]);
}

export function completeVoterIds(state, round = state.round) {
  const ids = songIdsForRound(state, round);
  return state.voters.filter((v) => hasVotedAll(state.votes[round], ids, v.id)).map((v) => v.id);
}

// ==================== TRANSITIONS ====================

function scoreAndReveal(state, rng) {
  const round = state.round;
  const result = scoreRound(songIdsForRound(state, round), state.roundVoters[round] || [], state.votes[round], state.picks[round], rng);
  // Keep names with the result so the reveal still works if someone leaves afterwards.
  result.voterNames = {};
  for (const v of state.voters) if (result.voterIds.includes(v.id)) result.voterNames[v.id] = v.name;
  return { ...state, phase: 'reveal', results: { ...state.results, [round]: result }, reveal: { step: -1 } };
}

// Voting is over: freeze who counts, then ask tiebreak questions if anyone needs them.
function toScoring(state, rng) {
  const round = state.round;
  const s = { ...state, roundVoters: { ...state.roundVoters, [round]: completeVoterIds(state, round) } };
  return Object.keys(currentTiebreaks(s)).length ? { ...s, phase: 'tiebreak' } : scoreAndReveal(s, rng);
}

function afterTiebreakChange(state, rng) {
  return Object.keys(currentTiebreaks(state)).length ? state : scoreAndReveal(state, rng);
}

function resetProgress(state, songs) {
  return {
    ...initialState,
    songs: songs.map((s) => ({ ...s, group: -1 })),
    voters: state.voters,
    settings: state.settings,
  };
}

// ==================== REDUCER ====================

export function reducer(state, action) {
  const rng = action.rng || Math.random;
  switch (action.type) {
    case 'ADD_SONG': {
      const song = action.song;
      if (!song || !song.youtubeId || !song.title) return state;
      if (state.songs.some((s) => s.youtubeId === song.youtubeId)) return state;
      return { ...state, songs: [...state.songs, { ...song, id: action.id || genId('s', rng), group: -1 }] };
    }
    case 'UPDATE_SONG':
      return { ...state, songs: state.songs.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) };
    case 'REMOVE_SONG':
      return { ...state, songs: state.songs.filter((s) => s.id !== action.id) };
    case 'LOAD_PLAYLIST': {
      const list = getPlaylist(action.id);
      if (!list) return state;
      return { ...state, songs: list.songs.map((s, i) => ({ ...s, facts: s.facts ? [...s.facts] : [], id: list.id + i, group: -1 })) };
    }
    case 'CLEAR_SONGS':
      return { ...state, songs: [] };

    case 'ADD_VOTER': {
      const name = String(action.name || '').trim().slice(0, 24);
      if (!name) return state;
      const id = action.id || genId('v', rng);
      const existing = state.voters.find((v) => v.id === id);
      if (existing) {
        // Idempotent: phones re-register on every reconnect. Keep the voter, refresh name/flags.
        const patch = { name };
        if (action.simple != null) patch.simple = !!action.simple;
        return { ...state, voters: state.voters.map((v) => (v.id === id ? { ...v, ...patch } : v)) };
      }
      return { ...state, voters: [...state.voters, { id, name, simple: !!action.simple, phone: !!action.phone }] };
    }
    case 'REMOVE_VOTER':
      return { ...state, voters: state.voters.filter((v) => v.id !== action.id) };
    case 'SET_VOTER':
      return { ...state, voters: state.voters.map((v) => (v.id === action.id ? { ...v, ...action.patch } : v)) };
    case 'SET_SETTING':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };

    case 'START_TOURNAMENT': {
      if (state.songs.length < 4 || state.voters.length < 1) return state;
      const { groupCount, songs } = assignGroups(state.songs, rng);
      const base = {
        ...state, gameId: genId('g', rng), songs, groupCount, currentGroup: 0, currentSongIndex: 0,
        votes: {}, picks: {}, roundVoters: {}, results: {}, reveal: { step: -1 }, recap: { index: 0, playing: false },
      };
      if (groupCount === 0) return { ...base, phase: 'finalIntro', round: 'final', finalists: songs.map((s) => s.id) };
      return { ...base, phase: 'groupIntro', round: 'group_0', finalists: [] };
    }
    case 'START_ROUND': {
      if (state.phase === 'groupIntro') return { ...state, phase: 'group', currentSongIndex: 0 };
      if (state.phase === 'finalIntro') {
        const fullFinal = state.groupCount > 0 && state.settings.finalMode === 'full';
        if (fullFinal) return { ...state, phase: 'recap', recap: { index: 0, playing: true } };
        return { ...state, phase: 'final', currentSongIndex: 0 };
      }
      return state;
    }
    case 'SET_CURRENT_SONG': {
      const n = songIdsForRound(state).length;
      return { ...state, currentSongIndex: Math.max(0, Math.min(n - 1, action.index)) };
    }
    case 'SET_VOTE': {
      const { round, songId, voterId } = action;
      const stars = Math.round(Number(action.stars));
      if (round !== state.round || (state.phase !== 'group' && state.phase !== 'final')) return state;
      if (!(stars >= 1 && stars <= 5)) return state;
      if (!songIdsForRound(state, round).includes(songId)) return state;
      if (!state.voters.some((v) => v.id === voterId)) return state;
      const rv = { ...(state.votes[round] || {}) };
      rv[songId] = { ...(rv[songId] || {}), [voterId]: stars };
      return { ...state, votes: { ...state.votes, [round]: rv } };
    }
    case 'FINISH_VOTING': {
      if (completeVoterIds(state).length === 0) return state;
      if (state.phase === 'group') return { ...state, phase: 'groupRecap', recap: { index: 0, playing: true } };
      if (state.phase === 'final') return toScoring(state, rng);
      return state;
    }
    case 'RECAP_SET':
      return { ...state, recap: { ...state.recap, ...action.patch } };
    case 'RECAP_DONE':
      if (state.phase === 'groupRecap') return toScoring(state, rng);
      if (state.phase === 'recap') return { ...state, phase: 'final', currentSongIndex: 0, recap: { index: 0, playing: false } };
      return state;

    case 'TIEBREAK_PICK': {
      if (state.phase !== 'tiebreak' || action.round !== state.round) return state;
      const q = currentTiebreaks(state)[action.voterId];
      if (!q || !q.options.includes(action.songId)) return state;
      const rp = { ...(state.picks[state.round] || {}) };
      rp[action.voterId] = [...(rp[action.voterId] || []), action.songId];
      return afterTiebreakChange({ ...state, picks: { ...state.picks, [state.round]: rp } }, rng);
    }
    case 'TIEBREAK_RANDOM': {
      if (state.phase !== 'tiebreak' || action.round !== state.round) return state;
      const pending = currentTiebreaks(state);
      const who = action.voterId ? [action.voterId].filter((id) => pending[id]) : Object.keys(pending);
      if (!who.length) return state;
      const ids = songIdsForRound(state);
      const rp = { ...(state.picks[state.round] || {}) };
      for (const vid of who) rp[vid] = randomFillPicks(ids, starsOf(state.votes[state.round], ids, vid), rp[vid] || [], rng);
      return afterTiebreakChange({ ...state, picks: { ...state.picks, [state.round]: rp } }, rng);
    }

    case 'REVEAL_STEP': {
      if (state.phase !== 'reveal') return state;
      const n = revealBeats(state).length;
      return { ...state, reveal: { step: Math.max(-1, Math.min(n - 1, action.step)) } };
    }
    case 'REVEAL_PRESS': {
      // A phone voter pressed "give my 12 points".
      if (state.phase !== 'reveal') return state;
      const beats = revealBeats(state);
      const beat = beats[state.reveal.step];
      if (!beat || beat.kind !== 'twelvePending' || beat.voterId !== action.voterId) return state;
      return { ...state, reveal: { step: state.reveal.step + 1 } };
    }
    case 'REVEAL_DONE': {
      if (state.phase !== 'reveal') return state;
      if (isFinal(state.round)) return { ...state, phase: 'winner' };
      const next = state.currentGroup + 1;
      if (next < state.groupCount) {
        return { ...state, phase: 'groupIntro', currentGroup: next, round: 'group_' + next, currentSongIndex: 0, reveal: { step: -1 } };
      }
      const finalists = [];
      for (let g = 0; g < state.groupCount; g++) finalists.push(...qualifiersOf(state.results['group_' + g]));
      return { ...state, phase: 'finalIntro', round: 'final', finalists: shuffle(finalists, rng), currentSongIndex: 0, reveal: { step: -1 } };
    }

    case 'END_GAME': // stop mid-game: keep songs and voters, forget the votes
      return resetProgress(state, state.songs);
    case 'NEW_GAME': // after a finished game: keep the voters, start with no songs
      return resetProgress(state, []);
    case 'RESTORE':
      return action.snapshot && action.snapshot.v === SNAPSHOT_VERSION ? { ...initialState, ...stripSnapshot(action.snapshot) } : state;
    default:
      return state;
  }
}

function stripSnapshot(s) {
  const { savedAt, ...rest } = s;
  return rest;
}

// ==================== BALLOT (what phones are told) ====================

export function getActiveBallot(state) {
  const voters = state.voters.map((v) => ({ id: v.id, name: v.name, simple: !!v.simple }));
  const base = { phase: state.phase, round: state.round, label: roundLabel(state), voters };
  const songs = songMap(state);
  const info = (id) => {
    const s = songs[id] || {};
    return { id, title: s.title || '', artist: s.artist || '', year: s.year || '', youtubeId: s.youtubeId || '', pickedBy: s.pickedBy || '' };
  };

  if (state.phase === 'group' || state.phase === 'final') {
    const ids = songIdsForRound(state);
    if (ids.length) {
      const idx = Math.min(state.currentSongIndex, ids.length - 1);
      const votes = {};
      for (const id of ids) votes[id] = { ...((state.votes[state.round] || {})[id] || {}) };
      const song = { ...info(ids[idx]), facts: (songs[ids[idx]] || {}).facts || [] };
      return { ...base, kind: 'vote', song, songIndex: idx, songCount: ids.length, songIds: ids, votes };
    }
  }
  if (state.phase === 'tiebreak') {
    const questions = {};
    for (const [vid, q] of Object.entries(currentTiebreaks(state))) {
      questions[vid] = { stars: q.stars, again: q.picked > 0, options: q.options.map(info) };
    }
    return { ...base, kind: 'tiebreak', questions };
  }
  if (state.phase === 'reveal') {
    const beats = revealBeats(state);
    const beat = state.reveal.step >= 0 ? beats[state.reveal.step] : null;
    return { ...base, kind: 'reveal', started: state.reveal.step >= 0, beat: beat ? { kind: beat.kind, voterId: beat.voterId || null } : null };
  }
  return { ...base, kind: 'wait' };
}
