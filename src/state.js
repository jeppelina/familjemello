// Game state: the reducer, snapshots, and the ballot that phones see.
// Pure apart from Math.random (shuffles, lots), which actions can override with `rng`.
import {
  ackCode, assignGroups, cutTie, decideTie, FINAL_THEME, genId, getGroupTheme, hasVotedAll,
  QUALIFIERS_PER_GROUP, qualifiersOf, revealSteps, scoreRound, shuffle, STAR_MAX,
} from './logic.js';
import { getPlaylist } from './playlists.js';

export const SNAPSHOT_VERSION = 3;

export const initialState = {
  v: SNAPSHOT_VERSION,
  gameId: null,
  phase: 'setup', // setup | lineup | groupIntro | group | groupRecap | finalIntro | recap | final | reveal | favorite | winner
  songs: [], // { id, title, artist, youtubeId, highlightStart, year, released, people, formed, facts, pickedBy, group }
  voters: [], // { id, name, simple, phone }
  settings: { finalMode: 'highlights' }, // 'highlights' | 'full'
  groupCount: 0,
  currentGroup: 0,
  round: null, // 'group_0'.. | 'final'
  currentSongIndex: 0,
  finalists: [], // song ids
  votes: {}, // round -> songId -> voterId -> stars (1..10)
  favorites: {}, // round -> voterId -> songId, only when a tie decides who goes on
  roundVoters: {}, // round -> voterIds who count in that round
  results: {}, // round -> scoreRound(...) result, plus .decider after a favourite vote
  reveal: { step: -1 }, // -1 not started, 0..n-1 showing that step, n = all points out
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

export const spotsFor = (round) => (isFinal(round) ? 1 : QUALIFIERS_PER_GROUP);

export function currentSteps(state) {
  return revealSteps(state.results[state.round]);
}

// The tie the favourite vote is about, if the round needs one.
export function currentTie(state) {
  const result = state.results[state.round];
  return result ? cutTie(result, spotsFor(state.round)) : null;
}

export function completeVoterIds(state, round = state.round) {
  const ids = songIdsForRound(state, round);
  return state.voters.filter((v) => hasVotedAll(state.votes[round], ids, v.id)).map((v) => v.id);
}

// ==================== TRANSITIONS ====================

// Voting is over: freeze who counts, add up the points, and start the reveal.
function toReveal(state) {
  const round = state.round;
  const voterIds = completeVoterIds(state, round);
  const result = scoreRound(songIdsForRound(state, round), voterIds, state.votes[round]);
  return {
    ...state,
    phase: 'reveal',
    roundVoters: { ...state.roundVoters, [round]: voterIds },
    results: { ...state.results, [round]: result },
    reveal: { step: -1 },
  };
}

// After a round is fully settled: next group, the final, or the winner.
function advance(state, rng) {
  if (isFinal(state.round)) return { ...state, phase: 'winner' };
  const next = state.currentGroup + 1;
  if (next < state.groupCount) {
    return { ...state, phase: 'groupIntro', currentGroup: next, round: 'group_' + next, currentSongIndex: 0, reveal: { step: -1 } };
  }
  const finalists = [];
  for (let g = 0; g < state.groupCount; g++) finalists.push(...qualifiersOf(state.results['group_' + g]));
  return { ...state, phase: 'finalIntro', round: 'final', finalists: shuffle(finalists, rng), currentSongIndex: 0, reveal: { step: -1 } };
}

function startFirstRound(state) {
  if (state.groupCount === 0) return { ...state, phase: 'finalIntro', round: 'final', finalists: state.songs.map((s) => s.id) };
  return { ...state, phase: 'groupIntro', round: 'group_0', currentGroup: 0, finalists: [] };
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
      // Deal the songs into groups and show the lineup, where it can be changed.
      if (state.songs.length < 4 || state.voters.length < 1) return state;
      const { groupCount, songs } = assignGroups(state.songs, rng);
      return {
        ...state, phase: 'lineup', gameId: genId('g', rng), songs, groupCount, currentGroup: 0, round: null, currentSongIndex: 0,
        finalists: [], votes: {}, favorites: {}, roundVoters: {}, results: {}, reveal: { step: -1 }, recap: { index: 0, playing: false },
      };
    }
    case 'LINEUP_SWAP': {
      // Swap two songs: each takes the other's group and place in the running order.
      if (state.phase !== 'lineup' || action.a === action.b) return state;
      const i = state.songs.findIndex((x) => x.id === action.a);
      const j = state.songs.findIndex((x) => x.id === action.b);
      if (i < 0 || j < 0) return state;
      const songs = [...state.songs];
      songs[i] = { ...state.songs[j], group: state.songs[i].group };
      songs[j] = { ...state.songs[i], group: state.songs[j].group };
      return { ...state, songs };
    }
    case 'LINEUP_SHUFFLE': {
      if (state.phase !== 'lineup') return state;
      const { groupCount, songs } = assignGroups(state.songs, rng);
      return { ...state, groupCount, songs };
    }
    case 'LINEUP_BACK':
      return state.phase === 'lineup' ? resetProgress(state, state.songs) : state;
    case 'LINEUP_DONE':
      return state.phase === 'lineup' ? startFirstRound(state) : state;
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
      if (!(stars >= 1 && stars <= STAR_MAX)) return state;
      if (!songIdsForRound(state, round).includes(songId)) return state;
      if (!state.voters.some((v) => v.id === voterId)) return state;
      const rv = { ...(state.votes[round] || {}) };
      rv[songId] = { ...(rv[songId] || {}), [voterId]: stars };
      return { ...state, votes: { ...state.votes, [round]: rv } };
    }
    case 'FINISH_VOTING': {
      if (completeVoterIds(state).length === 0) return state;
      if (state.phase === 'group') return { ...state, phase: 'groupRecap', recap: { index: 0, playing: true } };
      if (state.phase === 'final') return toReveal(state);
      return state;
    }
    case 'RECAP_SET':
      return { ...state, recap: { ...state.recap, ...action.patch } };
    case 'RECAP_DONE':
      if (state.phase === 'groupRecap') return toReveal(state);
      if (state.phase === 'recap') return { ...state, phase: 'final', currentSongIndex: 0, recap: { index: 0, playing: false } };
      return state;

    case 'REVEAL_STEP': {
      if (state.phase !== 'reveal') return state;
      const n = currentSteps(state).length;
      return { ...state, reveal: { step: Math.max(-1, Math.min(n, action.step)) } };
    }
    case 'REVEAL_DONE': {
      // All points are out. A tie on the line that matters goes to a favourite vote.
      if (state.phase !== 'reveal') return state;
      const result = state.results[state.round];
      if (currentTie(state) && !result.decider) return { ...state, phase: 'favorite' };
      return advance(state, rng);
    }

    case 'FAVORITE_PICK': {
      if (state.phase !== 'favorite' || action.round !== state.round) return state;
      const tie = currentTie(state);
      const result = state.results[state.round];
      if (!tie || result.decider || !tie.songIds.includes(action.songId)) return state;
      if (!(state.roundVoters[state.round] || []).includes(action.voterId)) return state;
      const rf = { ...(state.favorites[state.round] || {}), [action.voterId]: action.songId };
      return { ...state, favorites: { ...state.favorites, [state.round]: rf } };
    }
    case 'FAVORITE_DECIDE': {
      if (state.phase !== 'favorite') return state;
      const tie = currentTie(state);
      const result = state.results[state.round];
      if (!tie || result.decider) return state;
      const decider = decideTie(tie, state.favorites[state.round], rng);
      return { ...state, results: { ...state.results, [state.round]: { ...result, decider } } };
    }
    case 'FAVORITE_DONE': {
      if (state.phase !== 'favorite' || !state.results[state.round].decider) return state;
      return advance(state, rng);
    }

    case 'END_GAME': // stop mid-game: keep songs and voters, forget the votes
      return resetProgress(state, state.songs);
    case 'NEW_GAME': // after a finished game: keep the voters, start with no songs
      return resetProgress(state, []);
    case 'RESTORE': {
      const snap = action.snapshot;
      if (!canRestore(snap)) return state;
      if (snap.v === SNAPSHOT_VERSION) return { ...initialState, ...stripSnapshot(snap) };
      return migrateV2(snap);
    }
    default:
      return state;
  }
}

export const canRestore = (snap) => !!snap && (snap.v === SNAPSHOT_VERSION || snap.v === 2);

// A game saved by the old version (5 stars, tiebreak questions, voter-by-voter reveal)
// carries on under the new rules. Rounds already played keep the result everyone saw,
// including who went through; only the counts of each score are kept, not who gave
// what. A round in the middle of its reveal opens on its finished scoreboard.
export function migrateV2(snap) {
  const { savedAt, picks, ...rest } = snap;
  const votes = {};
  for (const [round, bySong] of Object.entries(snap.votes || {})) {
    votes[round] = {};
    for (const [sid, byVoter] of Object.entries(bySong || {})) {
      votes[round][sid] = {};
      for (const [vid, st] of Object.entries(byVoter || {})) votes[round][sid][vid] = Math.max(1, Math.min(STAR_MAX, Math.round(st * 2)));
    }
  }
  const results = {};
  for (const [round, r] of Object.entries(snap.results || {})) {
    const counts = {};
    for (const list of Object.values(r.awards || {})) {
      for (const a of list) {
        counts[a.songId] = counts[a.songId] || {};
        counts[a.songId][a.points] = (counts[a.songId][a.points] || 0) + 1;
      }
    }
    const standings = (r.standings || []).map((x) => ({ songId: x.songId, points: x.points, counts: counts[x.songId] || {} }));
    for (const x of standings) x.place = 1 + standings.filter((o) => o.points > x.points).length;
    const result = { standings, voterCount: (r.voterIds || []).length };
    // A tie the old rules already settled stays settled, in the order shown back then.
    const tie = cutTie(result, spotsFor(round));
    if (tie) result.decider = { songIds: tie.songIds, spots: tie.spots, counts: {}, order: tie.songIds, byLot: false };
    results[round] = result;
  }
  let s = { ...initialState, ...rest, v: SNAPSHOT_VERSION, votes, favorites: {}, results };
  if (snap.phase === 'tiebreak') s = toReveal(s);
  else if (snap.phase === 'reveal') s = { ...s, reveal: { step: revealSteps(results[snap.round]).length } };
  return s;
}

function stripSnapshot(s) {
  const { savedAt, ...rest } = s;
  return rest;
}

// ==================== BALLOT (what phones are told) ====================

export function getActiveBallot(state) {
  const voters = state.voters.map((v) => ({ id: v.id, name: v.name, simple: !!v.simple }));
  // `v` lets a phone notice that the TV runs a newer version, and reload itself.
  const base = { v: SNAPSHOT_VERSION, phase: state.phase, round: state.round, label: roundLabel(state), voters };
  const songs = songMap(state);
  const info = (id) => {
    const s = songs[id] || {};
    return {
      id, title: s.title || '', artist: s.artist || '', year: s.year || '', released: s.released || '',
      people: s.people || [], formed: s.formed || '', youtubeId: s.youtubeId || '', pickedBy: s.pickedBy || '',
    };
  };

  if (state.phase === 'group' || state.phase === 'final') {
    const ids = songIdsForRound(state);
    if (ids.length) {
      const idx = Math.min(state.currentSongIndex, ids.length - 1);
      // Codes, not stars: each phone can check its own votes but not read anyone else's.
      const acks = {};
      for (const id of ids) {
        acks[id] = {};
        for (const [vid, stars] of Object.entries((state.votes[state.round] || {})[id] || {})) acks[id][vid] = ackCode(vid, id, stars);
      }
      const song = { ...info(ids[idx]), facts: (songs[ids[idx]] || {}).facts || [] };
      return { ...base, kind: 'vote', song, songIndex: idx, songCount: ids.length, songIds: ids, acks };
    }
  }
  if (state.phase === 'favorite') {
    const tie = currentTie(state);
    const result = state.results[state.round];
    if (tie) {
      return {
        ...base,
        kind: 'favorite',
        options: tie.songIds.map(info),
        spots: tie.spots,
        askIds: state.roundVoters[state.round] || [],
        answered: Object.keys(state.favorites[state.round] || {}),
        decided: !!result.decider,
      };
    }
  }
  if (state.phase === 'reveal') return { ...base, kind: 'reveal', started: state.reveal.step >= 0 };
  return { ...base, kind: 'wait' };
}
