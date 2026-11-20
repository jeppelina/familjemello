import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignGroups, buildRevealBeats, cleanVideoTitle, estimateMinutes, extractStartTime, extractYouTubeId,
  formatDuration, pickerTable, tieReason, planGroups, randomFillPicks, rankForVoter, runningOrder, scoreRound, totalsAfter,
} from '../src/logic.js';
import { seeded } from './helpers.mjs';


test('planGroups: never a group of two, at most four groups, small games go straight to the final', () => {
  for (let n = 4; n <= 30; n++) {
    const { groupCount, sizes } = planGroups(n);
    if (n < 6) {
      assert.equal(groupCount, 0);
      continue;
    }
    assert.ok(groupCount >= 2 && groupCount <= 4, `n=${n}`);
    assert.equal(sizes.reduce((a, b) => a + b, 0), n);
    assert.ok(Math.min(...sizes) >= 3, `n=${n} sizes=${sizes}`);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
  assert.deepEqual(planGroups(16).sizes, [4, 4, 4, 4]);
  assert.deepEqual(planGroups(8).sizes, [4, 4]);
});

test('assignGroups spreads each person\'s picks across groups', () => {
  const pickers = ['Mamma', 'Pappa', 'Saga', 'Elsa'];
  const songs = [];
  pickers.forEach((p) => { for (let i = 0; i < 4; i++) songs.push({ id: p + i, pickedBy: p }); });
  for (let seed = 1; seed <= 25; seed++) {
    const { groupCount, songs: out } = assignGroups(songs, seeded(seed));
    assert.equal(groupCount, 4);
    for (let g = 0; g < 4; g++) {
      const inGroup = out.filter((s) => s.group === g);
      assert.equal(inGroup.length, 4);
      assert.equal(new Set(inGroup.map((s) => s.pickedBy)).size, 4, `seed ${seed} group ${g}`);
    }
  }
  const { songs: ten } = assignGroups(Array.from({ length: 10 }, (_, i) => ({ id: 's' + i })), seeded(3));
  const sizes = [0, 1, 2].map((g) => ten.filter((s) => s.group === g).length).sort();
  assert.deepEqual(sizes, [3, 3, 4]);
});

test('rankForVoter asks about ties until the order is complete', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const stars = { a: 5, b: 5, c: 5, d: 2 };
  let r = rankForVoter(ids, stars, []);
  assert.deepEqual(r.question.options, ['a', 'b', 'c']);
  r = rankForVoter(ids, stars, ['b']);
  assert.deepEqual(r.question.options, ['a', 'c']);
  assert.equal(r.question.picked, 1);
  r = rankForVoter(ids, stars, ['b', 'c']);
  assert.equal(r.question, null);
  assert.deepEqual(r.order, ['b', 'c', 'a', 'd']);
  assert.equal(rankForVoter(ids, { a: 1, b: 2, c: 3, d: 4 }, []).question, null);
});

test('randomFillPicks settles every tie', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const stars = { a: 5, b: 5, c: 3, d: 3, e: 3 };
  const picks = randomFillPicks(ids, stars, [], seeded(9));
  assert.equal(rankForVoter(ids, stars, picks).question, null);
});

test('scoreRound gives Mello points per voter and breaks ties by twelves, then stars, then lots', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const votes = {
    a: { v1: 5, v2: 4 },
    b: { v1: 4, v2: 5 },
    c: { v1: 3, v2: 3 },
    d: { v1: 1, v2: 1 },
  };
  const r = scoreRound(ids, ['v1', 'v2'], votes, {}, seeded(1));
  assert.deepEqual(r.awards.v1.map((x) => x.points), [12, 10, 8, 6]);
  const pts = Object.fromEntries(r.standings.map((s) => [s.songId, s.points]));
  assert.deepEqual(pts, { a: 22, b: 22, c: 16, d: 12 });
  // a and b: same points, one 12 each, same stars: only the lot separates them.
  assert.equal(r.standings[1].tiedAbove, true);
  assert.equal(r.standings[2].tiedAbove, false);
  assert.equal(tieReason(r.standings[0], r.standings[1]), 'lot');
  assert.equal(tieReason(r.standings[1], r.standings[2]), null);

  const votes2 = { a: { v1: 5, v2: 5, v3: 1 }, b: { v1: 4, v2: 4, v3: 5 }, c: { v1: 1, v2: 1, v3: 4 } };
  const r2 = scoreRound(['a', 'b', 'c'], ['v1', 'v2', 'v3'], votes2, {}, seeded(2));
  // a: 12+12+8 = 32, b: 10+10+12 = 32, c: 8+8+10 = 26 -> a has two 12s and wins without a lot.
  assert.deepEqual(r2.standings.map((s) => s.songId), ['a', 'b', 'c']);
  assert.equal(r2.standings[1].tiedAbove, false);
  assert.equal(tieReason(r2.standings[0], r2.standings[1]), 'twelves');
});

test('reveal beats add up to the final standings', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const rng = seeded(4);
  const votes = {};
  for (const id of ids) votes[id] = { v1: 1 + Math.floor(rng() * 5), v2: 1 + Math.floor(rng() * 5), v3: 1 + Math.floor(rng() * 5) };
  const r = scoreRound(ids, ['v1', 'v2', 'v3'], votes, {}, rng);
  const beats = buildRevealBeats(r);
  assert.deepEqual(beats.slice(0, 4).map((b) => b.kind), ['voter', 'ten', 'twelvePending', 'twelve']);
  assert.equal(beats[beats.length - 1].kind, 'done');
  const totals = totalsAfter(beats, beats.length - 1, ids);
  for (const s of r.standings) assert.equal(totals[s.songId], s.points);
  const finalIds = r.standings.map((s) => s.songId);
  assert.deepEqual(runningOrder(finalIds, totals), finalIds);
  // Before anything is revealed, the board keeps the running order (no leaks).
  assert.deepEqual(runningOrder(ids, totalsAfter(beats, -1, ids)), ids);
  assert.ok(beats[0].awards.every((a) => a.points < 10 && a.points > 0));
});

test('YouTube links: ids, start times and title cleanup', () => {
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=9bZkp7q19f0&t=60'), '9bZkp7q19f0');
  assert.equal(extractYouTubeId('https://youtu.be/9bZkp7q19f0?si=abc'), '9bZkp7q19f0');
  assert.equal(extractYouTubeId('https://m.youtube.com/watch?feature=share&v=9bZkp7q19f0'), '9bZkp7q19f0');
  assert.equal(extractYouTubeId('https://www.youtube.com/shorts/9bZkp7q19f0'), '9bZkp7q19f0');
  assert.equal(extractYouTubeId('https://music.youtube.com/watch?v=9bZkp7q19f0&list=x'), '9bZkp7q19f0');
  assert.equal(extractYouTubeId('not a link'), null);
  assert.equal(extractStartTime('https://youtu.be/9bZkp7q19f0?t=95'), 95);
  assert.equal(extractStartTime('https://www.youtube.com/watch?v=9bZkp7q19f0&t=1m35s'), 95);
  assert.equal(extractStartTime('https://www.youtube.com/watch?v=9bZkp7q19f0'), null);

  const c = (t, a) => cleanVideoTitle(t, a);
  assert.deepEqual(c('Queen – Bohemian Rhapsody (Official Video Remastered)', 'Queen Official'), { artist: 'Queen', title: 'Bohemian Rhapsody' });
  assert.deepEqual(c('Michael Jackson - Thriller (Official 4K Video)', 'michaeljacksonVEVO'), { artist: 'Michael Jackson', title: 'Thriller' });
  assert.deepEqual(c('Fatboy Slim ft. Bootsy Collins - Weapon Of Choice [Official 4k Video]', 'Fatboy Slim'), { artist: 'Fatboy Slim ft. Bootsy Collins', title: 'Weapon Of Choice' });
  assert.deepEqual(c('PSY - GANGNAM STYLE(강남스타일) M/V', 'officialpsy'), { artist: 'PSY', title: 'GANGNAM STYLE(강남스타일)' });
  assert.deepEqual(c('Peter Gabriel - Sledgehammer (HD version)', 'Peter Gabriel'), { artist: 'Peter Gabriel', title: 'Sledgehammer' });
  assert.deepEqual(c('Bamse (Official Video)', 'BamseVEVO'), { artist: 'Bamse', title: 'Bamse' });
});

test('picker table and time estimate', () => {
  const songs = [{ id: 'a', pickedBy: 'Saga' }, { id: 'b', pickedBy: 'saga ' }, { id: 'c', pickedBy: 'Pappa' }, { id: 'd' }];
  const results = { group_0: { standings: [{ songId: 'a', points: 22 }, { songId: 'c', points: 10 }] }, final: { standings: [{ songId: 'a', points: 30 }, { songId: 'b', points: 5 }] } };
  const t = pickerTable(songs, results);
  assert.deepEqual(t.map((r) => [r.name, r.points, r.songs]), [['Saga', 57, 2], ['Pappa', 10, 1]]);
  assert.ok(estimateMinutes(16, 'full') > estimateMinutes(16, 'highlights'));
  assert.equal(formatDuration(92), 'ca 1 h 30 min');
  assert.equal(formatDuration(41), 'ca 40 min');
});
