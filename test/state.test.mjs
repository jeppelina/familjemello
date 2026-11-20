import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getActiveBallot, initialState, reducer, revealBeats, songIdsForRound } from '../src/state.js';
import { seeded } from './helpers.mjs';

const VOTERS = ['Mamma', 'Pappa', 'Saga'];

function setup(nSongs = 16, opts = {}) {
  let s = reducer(initialState, { type: 'LOAD_DEMO' });
  s = { ...s, songs: s.songs.slice(0, nSongs) };
  VOTERS.forEach((name, i) => { s = reducer(s, { type: 'ADD_VOTER', id: 'v' + i, name }); });
  if (opts.finalMode) s = reducer(s, { type: 'SET_SETTING', key: 'finalMode', value: opts.finalMode });
  return reducer(s, { type: 'START_TOURNAMENT', rng: seeded(opts.seed || 7) });
}

function voteAll(s, rng, skipVoter) {
  const ids = songIdsForRound(s);
  for (const songId of ids) {
    for (const v of s.voters) {
      if (v.id === skipVoter) continue;
      s = reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: v.id, stars: 1 + Math.floor(rng() * 5) });
    }
  }
  return s;
}

function settleTiebreaks(s) {
  let guard = 0;
  while (s.phase === 'tiebreak' && guard++ < 100) {
    const b = getActiveBallot(s);
    const [vid, q] = Object.entries(b.questions)[0];
    s = reducer(s, { type: 'TIEBREAK_PICK', round: s.round, voterId: vid, songId: q.options[0].id });
  }
  return s;
}

function playReveal(s) {
  const n = revealBeats(s).length;
  for (let i = 0; i < n; i++) s = reducer(s, { type: 'REVEAL_STEP', step: i });
  return reducer(s, { type: 'REVEAL_DONE' });
}

test('a whole 16-song game runs from setup to winner', () => {
  const rng = seeded(11);
  let s = setup(16);
  assert.equal(s.phase, 'groupIntro');
  assert.equal(s.groupCount, 4);
  for (let g = 0; g < 4; g++) {
    assert.equal(s.round, 'group_' + g);
    s = reducer(s, { type: 'START_ROUND' });
    assert.equal(s.phase, 'group');
    s = voteAll(s, rng);
    s = reducer(s, { type: 'FINISH_VOTING' });
    assert.equal(s.phase, 'groupRecap');
    s = reducer(s, { type: 'RECAP_DONE', rng });
    s = settleTiebreaks(s);
    assert.equal(s.phase, 'reveal');
    assert.equal(s.results['group_' + g].standings.length, 4);
    s = playReveal(s);
  }
  assert.equal(s.phase, 'finalIntro');
  assert.equal(s.finalists.length, 8);
  s = reducer(s, { type: 'START_ROUND' });
  assert.equal(s.phase, 'final', 'highlights mode skips the separate recap');
  s = voteAll(s, rng);
  s = reducer(s, { type: 'FINISH_VOTING', rng });
  s = settleTiebreaks(s);
  assert.equal(s.phase, 'reveal');
  s = playReveal(s);
  assert.equal(s.phase, 'winner');
  assert.equal(s.results.final.standings.length, 8);
});

test('full-song final goes through the finalist recap; small games skip the groups', () => {
  let s = setup(6, { finalMode: 'full' });
  assert.equal(s.groupCount, 2);
  const rng = seeded(5);
  for (let g = 0; g < 2; g++) {
    s = reducer(s, { type: 'START_ROUND' });
    s = voteAll(s, rng);
    s = reducer(s, { type: 'FINISH_VOTING' });
    s = settleTiebreaks(reducer(s, { type: 'RECAP_DONE', rng }));
    s = playReveal(s);
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

test('votes are only accepted for the round being played', () => {
  let s = reducer(setup(16), { type: 'START_ROUND' });
  const songId = songIdsForRound(s)[0];
  const other = songIdsForRound(s, 'group_1')[0];
  assert.equal(reducer(s, { type: 'SET_VOTE', round: 'group_1', songId: other, voterId: 'v0', stars: 5 }), s);
  assert.equal(reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: 'nobody', stars: 5 }), s);
  assert.equal(reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: 'v0', stars: 9 }), s);
  s = reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: 'v0', stars: 4 });
  assert.equal(s.votes.group_0[songId].v0, 4);
});

test('a voter who did not finish voting does not count, and cannot block the round', () => {
  let s = reducer(setup(16), { type: 'START_ROUND' });
  s = voteAll(s, seeded(3), 'v2');
  s = reducer(s, { type: 'FINISH_VOTING' });
  s = reducer(s, { type: 'RECAP_DONE' });
  assert.deepEqual(s.roundVoters.group_0, ['v0', 'v1']);
  s = settleTiebreaks(s);
  assert.deepEqual(s.results.group_0.voterIds, ['v0', 'v1']);
});

test('ties are asked about, then scored; phones can press for their 12', () => {
  let s = reducer(setup(16), { type: 'START_ROUND' });
  for (const songId of songIdsForRound(s)) for (const v of s.voters) s = reducer(s, { type: 'SET_VOTE', round: s.round, songId, voterId: v.id, stars: 5 });
  s = reducer(reducer(s, { type: 'FINISH_VOTING' }), { type: 'RECAP_DONE' });
  assert.equal(s.phase, 'tiebreak');
  const b = getActiveBallot(s);
  assert.equal(b.kind, 'tiebreak');
  assert.equal(Object.keys(b.questions).length, 3);
  assert.equal(b.questions.v0.options.length, 4);
  // A pick that is not one of the options is ignored.
  assert.equal(reducer(s, { type: 'TIEBREAK_PICK', round: s.round, voterId: 'v0', songId: 'nope' }), s);
  s = reducer(s, { type: 'TIEBREAK_PICK', round: s.round, voterId: 'v0', songId: b.questions.v0.options[2].id });
  assert.equal(getActiveBallot(s).questions.v0.again, true);
  s = reducer(s, { type: 'TIEBREAK_RANDOM', round: s.round, rng: seeded(1) });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.results.group_0.awards.v0[0].songId, b.questions.v0.options[2].id, 'the pick got the 12');

  const beats = revealBeats(s);
  const pendingIdx = beats.findIndex((x) => x.kind === 'twelvePending');
  s = reducer(s, { type: 'REVEAL_STEP', step: pendingIdx });
  assert.equal(getActiveBallot(s).beat.kind, 'twelvePending');
  assert.equal(reducer(s, { type: 'REVEAL_PRESS', voterId: 'v1' }), s, 'only the voter whose turn it is');
  s = reducer(s, { type: 'REVEAL_PRESS', voterId: beats[pendingIdx].voterId });
  assert.equal(s.reveal.step, pendingIdx + 1);
});

test('ending and restarting keep the people; restore ignores old snapshots', () => {
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

test('re-registering a phone voter updates instead of duplicating', () => {
  let s = reducer(initialState, { type: 'ADD_VOTER', id: 'p_1', name: 'Saga', phone: true });
  s = reducer(s, { type: 'ADD_VOTER', id: 'p_1', name: 'Saga S', simple: true });
  assert.equal(s.voters.length, 1);
  assert.deepEqual(s.voters[0], { id: 'p_1', name: 'Saga S', simple: true, phone: true });
});
