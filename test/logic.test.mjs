import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ackCode, ageAt, agoText, assignGroups, cleanVideoTitle, cutTie, decideTie, estimateMinutes, extractStartTime,
  extractYouTubeId, formatDuration, pickerTable, placesOf, planGroups, pointsForVoter, qualifiersOf, revealSteps,
  runningOrder, scoreRound, songTimeInfo, starsFromAck, totalsAfterSteps,
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

const votesFrom = (table) => {
  // table: { voterId: { songId: stars } } -> votes[songId][voterId]
  const v = {};
  for (const [vid, row] of Object.entries(table)) for (const [sid, st] of Object.entries(row)) (v[sid] = v[sid] || {})[vid] = st;
  return v;
};

test('equal stars share the place and both get its points', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(pointsForVoter(ids, { a: 9, b: 7, c: 5, d: 2 }), { a: 12, b: 10, c: 8, d: 6 });
  assert.deepEqual(pointsForVoter(ids, { a: 9, b: 9, c: 5, d: 2 }), { a: 12, b: 12, c: 8, d: 6 });
  assert.deepEqual(pointsForVoter(ids, { a: 9, b: 7, c: 5, d: 5 }), { a: 12, b: 10, c: 8, d: 8 });
  assert.deepEqual(pointsForVoter(ids, { a: 3, b: 3, c: 3, d: 3 }), { a: 12, b: 12, c: 12, d: 12 });
  const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const pts = pointsForVoter(eight, { a: 10, b: 9, c: 8, d: 7, e: 6, f: 5, g: 4, h: 3 });
  assert.deepEqual(eight.map((x) => pts[x]), [12, 10, 8, 6, 4, 2, 1, 0]);
});

test('scoreRound keeps only totals and counts, and equal points share a place', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const votes = votesFrom({
    v0: { a: 10, b: 8, c: 6, d: 4 }, // a12 b10 c8 d6
    v1: { a: 5, b: 9, c: 9, d: 1 }, // b12 c12 a8 d6
    v2: { a: 7, b: 3, c: 8, d: 2 }, // c12 a10 b8 d6
  });
  const r = scoreRound(ids, ['v0', 'v1', 'v2'], votes);
  assert.deepEqual(r.standings.map((x) => [x.songId, x.points, x.place]), [['c', 32, 1], ['a', 30, 2], ['b', 30, 2], ['d', 18, 4]]);
  assert.deepEqual(r.standings[0].counts, { 8: 1, 12: 2 });
  assert.equal(r.voterCount, 3);
  assert.equal(JSON.stringify(r).includes('v0'), false, 'nothing in the result says who gave what');
});

test('only a tie on the line that matters needs a favourite vote', () => {
  const mk = (pts) => ({ standings: pts.map((p, i) => ({ songId: 'abcdefgh'[i], points: p, place: 1 + pts.filter((q) => q > p).length, counts: {} })) });
  assert.equal(cutTie(mk([40, 30, 20, 20]), 2), null, 'a tie for third does not matter in a group');
  assert.deepEqual(cutTie(mk([40, 30, 30, 20]), 2), { songIds: ['b', 'c'], spots: 1 });
  assert.deepEqual(cutTie(mk([30, 30, 30, 20]), 2), { songIds: ['a', 'b', 'c'], spots: 2 });
  assert.equal(cutTie(mk([40, 30, 30]), 1), null, 'second place shared in the final is fine');
  assert.deepEqual(cutTie(mk([40, 40, 30]), 1), { songIds: ['a', 'b'], spots: 1 });

  const r = mk([40, 30, 30, 30]);
  const tie = cutTie(r, 2);
  const d = decideTie(tie, { v0: 'd', v1: 'd', v2: 'b', v3: 'nope' });
  assert.deepEqual(d.order, ['d', 'b', 'c']);
  assert.equal(d.byLot, false);
  r.decider = d;
  assert.deepEqual(placesOf(r).map((x) => [x.songId, x.place]), [['a', 1], ['d', 2], ['b', 3], ['c', 3]]);
  assert.deepEqual(qualifiersOf(r), ['a', 'd']);

  const level = decideTie({ songIds: ['x', 'y'], spots: 1 }, { v0: 'x', v1: 'y' }, () => 0.5);
  assert.equal(level.byLot, true);
});

test('the reveal goes 6, 8, 12 and then 10, and adds up to the result', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const votes = votesFrom({ v0: { a: 10, b: 8, c: 6, d: 4 }, v1: { a: 5, b: 9, c: 9, d: 1 }, v2: { a: 7, b: 3, c: 8, d: 2 } });
  const r = scoreRound(ids, ['v0', 'v1', 'v2'], votes);
  const steps = revealSteps(r);
  assert.deepEqual(steps.map((x) => x.values), [[6], [8], [12], [10]]);
  assert.ok(steps[3].last);
  const all = totalsAfterSteps(steps, steps.length, ids);
  for (const st of r.standings) assert.equal(all[st.songId], st.points);
  for (const id of ids) assert.equal(steps.flatMap((x) => x.chips).filter((c) => c.songId === id).length, 3, 'one chip per voter per song');
  assert.deepEqual(runningOrder(ids, totalsAfterSteps(steps, 0, ids)), ids, 'before anything is shown: running order');

  const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f = scoreRound(eight, ['v0'], votesFrom({ v0: { a: 10, b: 9, c: 8, d: 7, e: 6, f: 5, g: 4, h: 3 } }));
  assert.deepEqual(revealSteps(f).map((x) => x.values), [[0, 1, 2, 4], [6], [8], [12], [10]]);
});

test('phones get a code per vote that only checks out for the right stars', () => {
  const code = ackCode('p_1', 's9', 7);
  assert.equal(starsFromAck(code, 'p_1', 's9'), 7);
  assert.equal(starsFromAck(code, 'p_2', 's9'), 0);
  assert.equal(starsFromAck(undefined, 'p_1', 's9'), 0);
  assert.notEqual(code, '7');
});

test('years ago and the artist\'s age', () => {
  assert.deepEqual(ageAt('1958-08-29', '1988-10-24'), { years: 30, exact: true });
  assert.deepEqual(ageAt('1965-11-21', '1995-11-13'), { years: 29, exact: true });
  assert.deepEqual(ageAt('1965-11-21', '1995-11'), { years: 29, exact: false }, 'same month, day unknown');
  assert.deepEqual(ageAt('1958-08-29', '1988-10'), { years: 30, exact: true }, 'a different month is enough');
  assert.equal(ageAt('1958-08-29', '1988').exact, false);
  assert.equal(ageAt(null, '1988'), null);
  const mj = songTimeInfo({ year: '1988', released: '1988-10-24', people: [{ name: 'Michael Jackson', born: '1958-08-29', died: '2009-06-25' }] }, '2026-11-21');
  assert.equal(mj.ago, 38);
  assert.deepEqual(mj.people[0].then, { years: 30, exact: true });
  assert.equal(mj.people[0].now, null, 'no "today" age for someone who has died');
  const pg = songTimeInfo({ year: '1986', people: [{ name: 'Peter Gabriel', born: '1950-02-13' }] }, '2026-11-21');
  assert.equal(pg.people[0].now.years, 76);
  assert.equal(songTimeInfo({ title: 'x' }, '2026-11-21').year, null);
  assert.equal(agoText(38), '38 år sedan');
  assert.equal(agoText(1), 'förra året');
  assert.equal(agoText(0), 'i år');
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
