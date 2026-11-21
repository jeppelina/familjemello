import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSteps, currentTie, getActiveBallot, initialState, reducer, songIdsForRound } from '../src/state.js';
import { seeded } from './helpers.mjs';

const VOTERS = ['Mamma', 'Pappa', 'Saga'];

function setup(nSongs = 16, opts = {}) {
  let s = reducer(initialState, { type: 'LOAD_PLAYLIST', id: 'klassiker' });
  s = { ...s, songs: s.songs.slice(0, nSongs) };
  VOTERS.forEach((name, i) => { s = reducer(s, { type: 'ADD_VOTER', id: 'v' + i, name }); });
  if (opts.finalMode) s = reducer(s, { type: 'SET_SETTING', key: 'finalMode', value: opts.finalMode });
  s = reducer(s, { type: 'START_TOURNAMENT', rng: seeded(opts.seed || 7) });
  return opts.lineup ? s : reducer(s, { type: 'LINEUP_DONE' });
}

function voteAll(s, rng, skipVoter, starsFn) {
  for (const songId of songIdsForRound(s)) {
    for (const v of s.voters) {
      if (v.id === skipVoter) continue;
      const stars = starsFn ? starsFn(songId, v.id) : 1 + Math.floor(rng() * 10);
      s = reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: v.id, stars });
    }
  }
  return s;
}

// Show every reveal step, then settle a favourite vote if the round needs one.
function playReveal(s) {
  const n = currentSteps(s).length;
  for (let i = 0; i <= n; i++) s = reducer(s, { type: 'REVEAL_STEP', step: i });
  s = reducer(s, { type: 'REVEAL_DONE', rng: seeded(3) });
  if (s.phase === 'favorite') {
    const tie = currentTie(s);
    for (const vid of s.roundVoters[s.round]) s = reducer(s, { type: 'FAVORITE_PICK', round: s.round, voterId: vid, songId: tie.songIds[0] });
    s = reducer(s, { type: 'FAVORITE_DECIDE', rng: seeded(4) });
    s = reducer(s, { type: 'FAVORITE_DONE', rng: seeded(5) });
  }
  return s;
}

test('a whole 16-song game runs from setup to winner', () => {
  const rng = seeded(11);
  let s = setup(16, { lineup: true });
  assert.equal(s.phase, 'lineup');
  assert.equal(s.groupCount, 4);
  s = reducer(s, { type: 'LINEUP_DONE' });
  assert.equal(s.phase, 'groupIntro');
  for (let g = 0; g < 4; g++) {
    assert.equal(s.round, 'group_' + g);
    s = reducer(s, { type: 'START_ROUND' });
    assert.equal(s.phase, 'group');
    s = voteAll(s, rng);
    s = reducer(s, { type: 'FINISH_VOTING' });
    assert.equal(s.phase, 'groupRecap');
    s = reducer(s, { type: 'RECAP_DONE' });
    assert.equal(s.phase, 'reveal');
    assert.equal(s.results['group_' + g].standings.length, 4);
    s = playReveal(s);
  }
  assert.equal(s.phase, 'finalIntro');
  assert.equal(s.finalists.length, 8);
  s = reducer(s, { type: 'START_ROUND' });
  assert.equal(s.phase, 'final', 'highlights mode skips the separate recap');
  s = voteAll(s, rng);
  s = reducer(s, { type: 'FINISH_VOTING' });
  assert.equal(s.phase, 'reveal');
  s = playReveal(s);
  assert.equal(s.phase, 'winner');
  assert.equal(s.results.final.standings.length, 8);
});

test('the lineup can be swapped, drawn again, or left for the song list', () => {
  let s = setup(16, { lineup: true });
  const g0 = songIdsForRound({ ...s, round: 'group_0' });
  const g1 = songIdsForRound({ ...s, round: 'group_1' });
  s = reducer(s, { type: 'LINEUP_SWAP', a: g0[0], b: g1[2] });
  assert.deepEqual(songIdsForRound({ ...s, round: 'group_0' }), [g1[2], ...g0.slice(1)]);
  assert.deepEqual(songIdsForRound({ ...s, round: 'group_1' }), [g1[0], g1[1], g0[0], g1[3]]);
  s = reducer(s, { type: 'LINEUP_SWAP', a: g0[1], b: g0[3] });
  assert.equal(songIdsForRound({ ...s, round: 'group_0' })[1], g0[3], 'swapping inside a group changes the running order');
  const again = reducer(s, { type: 'LINEUP_SHUFFLE', rng: seeded(99) });
  assert.equal(again.songs.length, 16);
  assert.ok([0, 1, 2, 3].every((g) => again.songs.filter((x) => x.group === g).length === 4));
  const back = reducer(s, { type: 'LINEUP_BACK' });
  assert.equal(back.phase, 'setup');
  assert.equal(back.songs.length, 16);
  assert.equal(getActiveBallot(s).kind, 'wait');
});

test('full-song final goes through the finalist recap; small games skip the groups', () => {
  let s = setup(6, { finalMode: 'full' });
  assert.equal(s.groupCount, 2);
  const rng = seeded(5);
  for (let g = 0; g < 2; g++) {
    s = reducer(s, { type: 'START_ROUND' });
    s = voteAll(s, rng);
    s = reducer(s, { type: 'FINISH_VOTING' });
    s = playReveal(reducer(s, { type: 'RECAP_DONE' }));
  }
  s = reducer(s, { type: 'START_ROUND' });
  assert.equal(s.phase, 'recap');
  s = reducer(s, { type: 'RECAP_DONE' });
  assert.equal(s.phase, 'final');

  const small = setup(5);
  assert.equal(small.groupCount, 0);
  assert.equal(small.phase, 'finalIntro');
  assert.equal(small.finalists.length, 5);
  assert.equal(reducer(small, { type: 'START_ROUND' }).phase, 'final', 'never-seen songs play in full');
});

test('votes are 1 to 10 stars, only for the round being played', () => {
  let s = reducer(setup(16), { type: 'START_ROUND' });
  const songId = songIdsForRound(s)[0];
  const other = songIdsForRound(s, 'group_1')[0];
  assert.equal(reducer(s, { type: 'SET_VOTE', round: 'group_1', songId: other, voterId: 'v0', stars: 5 }), s);
  assert.equal(reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: 'nobody', stars: 5 }), s);
  assert.equal(reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: 'v0', stars: 11 }), s);
  assert.equal(reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: 'v0', stars: 0 }), s);
  s = reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: 'v0', stars: 10 });
  assert.equal(s.votes.group_0[songId].v0, 10);
});

test('phones are told their vote arrived, but not anyone\'s stars', () => {
  let s = reducer(setup(16), { type: 'START_ROUND' });
  const songId = songIdsForRound(s)[0];
  s = reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: 'v0', stars: 7 });
  const b = getActiveBallot(s);
  assert.equal(b.kind, 'vote');
  assert.equal(b.votes, undefined);
  assert.ok(b.acks[songId].v0);
  assert.notEqual(b.acks[songId].v0, 7);
  assert.equal(b.song.year.length, 4);
});

test('a voter who did not finish voting does not count, and cannot block the round', () => {
  let s = reducer(setup(16), { type: 'START_ROUND' });
  s = voteAll(s, seeded(3), 'v2');
  s = reducer(s, { type: 'FINISH_VOTING' });
  s = reducer(s, { type: 'RECAP_DONE' });
  assert.deepEqual(s.roundVoters.group_0, ['v0', 'v1']);
  assert.equal(s.results.group_0.voterCount, 2);
});

test('a tie for the last final spot goes to a favourite vote; other ties just share', () => {
  let s = reducer(setup(16), { type: 'START_ROUND' });
  const ids = songIdsForRound(s);
  // Everyone: first song 10 stars, the other three 5 each. The three share second place: 36, 30, 30, 30.
  s = voteAll(s, null, null, (songId) => (songId === ids[0] ? 10 : 5));
  s = reducer(reducer(s, { type: 'FINISH_VOTING' }), { type: 'RECAP_DONE' });
  assert.deepEqual(s.results.group_0.standings.map((x) => [x.points, x.place]), [[36, 1], [30, 2], [30, 2], [30, 2]]);
  const steps = currentSteps(s);
  assert.deepEqual(steps.map((x) => x.values), [[12], [10]], 'only 12s and shared 10s');
  s = reducer(s, { type: 'REVEAL_STEP', step: steps.length });
  s = reducer(s, { type: 'REVEAL_DONE' });
  assert.equal(s.phase, 'favorite');
  const b = getActiveBallot(s);
  assert.equal(b.kind, 'favorite');
  assert.equal(b.options.length, 3);
  assert.equal(b.spots, 1);
  assert.equal(reducer(s, { type: 'FAVORITE_PICK', round: s.round, voterId: 'v0', songId: ids[0] }), s, 'only a tied song can be picked');
  assert.equal(reducer(s, { type: 'FAVORITE_PICK', round: s.round, voterId: 'ghost', songId: ids[1] }), s);
  s = reducer(s, { type: 'FAVORITE_PICK', round: s.round, voterId: 'v0', songId: ids[2] });
  s = reducer(s, { type: 'FAVORITE_PICK', round: s.round, voterId: 'v1', songId: ids[2] });
  s = reducer(s, { type: 'FAVORITE_PICK', round: s.round, voterId: 'v2', songId: ids[3] });
  assert.deepEqual(getActiveBallot(s).answered, ['v0', 'v1', 'v2']);
  assert.equal(JSON.stringify(getActiveBallot(s)).includes('"' + ids[2] + '","' + ids[2]), false);
  assert.equal(reducer(s, { type: 'FAVORITE_DONE' }), s, 'cannot go on before the votes are counted');
  s = reducer(s, { type: 'FAVORITE_DECIDE', rng: seeded(1) });
  assert.equal(s.results.group_0.decider.order[0], ids[2]);
  s = reducer(s, { type: 'FAVORITE_DONE' });
  assert.equal(s.phase, 'groupIntro');
  assert.equal(s.round, 'group_1');

  // A tie that does not touch the final spots needs no extra vote.
  let t = reducer(setup(16), { type: 'START_ROUND' });
  const tids = songIdsForRound(t);
  t = voteAll(t, null, null, (songId) => ({ [tids[0]]: 10, [tids[1]]: 8, [tids[2]]: 3, [tids[3]]: 3 })[songId]);
  t = reducer(reducer(t, { type: 'FINISH_VOTING' }), { type: 'RECAP_DONE' });
  assert.equal(currentTie(t), null);
  t = reducer(reducer(t, { type: 'REVEAL_STEP', step: 9 }), { type: 'REVEAL_DONE' });
  assert.equal(t.phase, 'groupIntro');
});

test('ending and restarting keep the people; an older saved game keeps its songs', () => {
  let s = reducer(setup(16), { type: 'START_ROUND' });
  const ended = reducer(s, { type: 'END_GAME' });
  assert.equal(ended.phase, 'setup');
  assert.equal(ended.songs.length, 16);
  assert.ok(ended.songs.every((x) => x.group === -1));
  assert.equal(ended.voters.length, 3);
  const fresh = reducer(s, { type: 'NEW_GAME' });
  assert.equal(fresh.songs.length, 0);
  assert.equal(fresh.voters.length, 3);
  assert.equal(reducer(initialState, { type: 'RESTORE', snapshot: { phase: 'group', songs: [] } }), initialState);
  const back = reducer(initialState, { type: 'RESTORE', snapshot: { ...s, savedAt: 123 } });
  assert.equal(back.phase, 'group');
  assert.equal(back.savedAt, undefined);
});

test('a game saved by the old version carries on where it was', () => {
  let s = reducer(setup(16), { type: 'START_ROUND' });
  const g0 = songIdsForRound(s);
  const g1 = songIdsForRound(s, 'group_1');
  const [a, b, c, d] = g1;
  // Shaped like an old save: 5-star votes, tiebreak picks, per-voter awards, in the middle of the reveal of group 2.
  const oldAwards = (order) => Object.fromEntries(['v0', 'v1', 'v2'].map((vid) => [vid, order.map((songId, i) => ({ songId, points: [12, 10, 8, 6][i] }))]));
  const snap = {
    ...s, v: 2, phase: 'reveal', round: 'group_1', currentGroup: 1, reveal: { step: 9 }, savedAt: 1,
    picks: { group_1: { v0: [a] } },
    votes: { group_1: Object.fromEntries(g1.map((id, i) => [id, { v0: 5 - i, v1: 5 - i, v2: 5 - i }])) },
    results: {
      group_0: { standings: g0.map((id, i) => ({ songId: id, points: [36, 30, 30, 18][i], twelves: 0, stars: 0, tiedAbove: false })), awards: oldAwards(g0), voterIds: ['v0', 'v1', 'v2'], voterNames: { v0: 'X' } },
      group_1: { standings: [a, b, c, d].map((id, i) => ({ songId: id, points: [36, 30, 24, 18][i], twelves: 0, stars: 0, tiedAbove: false })), awards: oldAwards([a, b, c, d]), voterIds: ['v0', 'v1', 'v2'] },
    },
  };
  let m = reducer(initialState, { type: 'RESTORE', snapshot: snap });
  assert.equal(m.v, 3);
  assert.equal(m.phase, 'reveal');
  assert.equal(m.round, 'group_1');
  assert.equal(m.votes.group_1[a].v0, 10, 'stars doubled onto the 10 scale');
  assert.equal(m.picks, undefined);
  assert.equal(JSON.stringify(m.results).includes('v0'), false, 'old results lose who gave what');
  assert.deepEqual(m.results.group_1.standings[0].counts, { 12: 3 });
  assert.equal(m.reveal.step, currentSteps(m).length, 'opens on the finished scoreboard');
  assert.deepEqual(m.results.group_0.decider.order, [g0[1], g0[2]], 'a tie the old rules settled stays settled');
  m = reducer(m, { type: 'REVEAL_DONE' });
  assert.equal(m.phase, 'groupIntro');
  assert.equal(m.round, 'group_2');
  const back = reducer(m, { type: 'END_GAME' });
  assert.equal(back.songs.length, 16);
});

test('re-registering a phone voter updates instead of duplicating', () => {
  let s = reducer(initialState, { type: 'ADD_VOTER', id: 'p_1', name: 'Saga', phone: true });
  s = reducer(s, { type: 'ADD_VOTER', id: 'p_1', name: 'Saga S', simple: true });
  assert.equal(s.voters.length, 1);
  assert.deepEqual(s.voters[0], { id: 'p_1', name: 'Saga S', simple: true, phone: true });
});
