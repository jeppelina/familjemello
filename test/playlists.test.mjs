import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYLISTS } from '../src/playlists.js';
import { getActiveBallot, initialState, reducer } from '../src/state.js';
import { seeded } from './helpers.mjs';

test('playlists: 16 distinct videos each, highlights set, facts short and tidy', () => {
  for (const pl of PLAYLISTS) {
    assert.equal(pl.songs.length, 16, pl.id);
    const ids = pl.songs.map((s) => s.youtubeId);
    assert.equal(new Set(ids).size, 16, pl.id + ' has duplicate videos');
    for (const s of pl.songs) {
      assert.match(s.youtubeId, /^[A-Za-z0-9_-]{11}$/, s.title);
      assert.ok(s.highlightStart > 0, s.title + ' needs a highlight');
      assert.match(s.year, /^(19|20)\d\d$/, s.title);
      for (const f of s.facts || []) {
        assert.ok(f.length <= 200, s.title + ': fact too long for the screen');
        assert.ok(!/[—–]/.test(f), s.title + ': no long dashes in facts');
      }
    }
  }
  assert.ok(PLAYLISTS[0].songs.every((s) => s.facts.length >= 3), 'every game-night song has facts');
});

test('loading a playlist gives songs with facts, and phones get the facts', () => {
  let s = reducer(initialState, { type: 'LOAD_PLAYLIST', id: 'musikvideokvall' });
  assert.equal(s.songs.length, 16);
  assert.equal(reducer(initialState, { type: 'LOAD_PLAYLIST', id: 'nope' }), initialState);
  s = reducer(s, { type: 'ADD_VOTER', id: 'v0', name: 'Mamma' });
  s = reducer(s, { type: 'START_TOURNAMENT', rng: seeded(2) });
  s = reducer(s, { type: 'START_ROUND' });
  const b = getActiveBallot(s);
  assert.equal(b.kind, 'vote');
  assert.ok(b.song.facts.length >= 3);
  assert.match(b.song.year, /^\d{4}$/);
});
