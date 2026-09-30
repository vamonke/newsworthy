import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { nameFor, soldPhotos, toBoard, toSold, listsPhoto, countryCode, weekStart, UPSERT, TOP, RANK, ROUND, BEST, SOLD, ROUND_PHOTOS } from './src/leaderboard.js';

test('a player id always gives the same two-word name and number', () => {
  assert.equal(nameFor('bdf0edb99a002e95'), nameFor('bdf0edb99a002e95'));
  assert.match(nameFor('bdf0edb99a002e95'), /^[A-Z][a-z]+ [A-Z][a-z]+ [1-9][0-9]$/);
  assert.notEqual(nameFor('bdf0edb99a002e95'), nameFor('0123456789abcdef'));
});

test('1,000 players rarely share a name', () => {
  const names = new Set();
  for (let i = 0; i < 1000; i++) names.add(nameFor([...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('')));
  assert.ok(names.size >= 990, `${1000 - names.size} shared names`);
});

test('only sold photos go on the board, best first', () => {
  const snapshot = { photos: [['shot-1', 'a', { earned: 0, headline: 'Nothing' }], ['shot-2', 'b', { earned: 375, headline: 'Fire' }], ['shot-3', 'c', { earned: 1000, headline: 'UFO' }]] };
  assert.deepEqual(soldPhotos(snapshot), [{ id: 'shot-3', headline: 'UFO', earned: 1000 }, { id: 'shot-2', headline: 'Fire', earned: 375 }]);
});

// The queries run against the real schema in SQLite, which is what D1 is.
function board() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_scores.sql', '0002_country.sql', '0003_updated.sql']) db.exec(readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
  // `created` is also the time of the write, so a later write for a round moves its `updated` on.
  const post = (round, player, total, created, photos = [{ id: 'shot-1', headline: 'UFO', earned: total }], country = '') =>
    db.prepare(UPSERT).run(round, player, nameFor(player), total, JSON.stringify(photos), created, country);
  const top = (since = 0) => db.prepare(TOP).all(since);
  const round = (id) => db.prepare(ROUND).get(id);
  const best = (player, since = 0) => db.prepare(BEST).get(player, since);
  const rank = (mine, since = 0) => db.prepare(RANK).get(mine.player, mine.total, since).rank;
  const sold = () => db.prepare(SOLD).all();
  const photos = (id) => db.prepare(ROUND_PHOTOS).get(id);
  return { post, top, round, rank, best, sold, photos };
}

test('the board shows each player’s best round, top 10', () => {
  const b = board();
  b.post('r1', 'alice', 3000, 1);
  b.post('r2', 'alice', 5000, 2);
  b.post('r3', 'bob', 4000, 3);
  for (let i = 0; i < 12; i++) b.post('x' + i, 'p' + i, 100 + i, 10 + i);
  const top = b.top();
  assert.equal(top.length, 10);
  assert.deepEqual(top.slice(0, 2).map((r) => [r.round, r.total]), [['r2', 5000], ['r3', 4000]]);
  assert.equal(top.filter((r) => r.player === 'alice').length, 1);
});

test('a later write for the same round replaces its total, never lowers it', () => {
  const b = board();
  b.post('r1', 'alice', 1000, 1);
  b.post('r1', 'alice', 2500, 1);
  assert.equal(b.round('r1').total, 2500);
  b.post('r1', 'alice', 1000, 1); // an older write landing late
  assert.equal(b.round('r1').total, 2500);
});

test('a round’s place counts other players whose best beats it', () => {
  const b = board();
  b.post('r1', 'alice', 6000, 1);
  b.post('r2', 'bob', 4000, 2);
  b.post('r3', 'bob', 7000, 3);
  b.post('r4', 'carol', 5000, 4);
  b.post('r5', 'carol', 1000, 5);
  assert.equal(b.rank(b.round('r4')), 3); // bob 7000, alice 6000
  assert.equal(b.rank(b.round('r5')), 3); // carol's own 5000 doesn't count against her
  assert.equal(b.rank(b.round('r3')), 1);
});

test('the board marks the viewer’s row and never sends player ids', () => {
  const b = board();
  b.post('a'.repeat(64), 'alice', 6000, 1);
  b.post('b'.repeat(64), 'bob', 4000, 2);
  const mine = b.round('b'.repeat(64));
  const out = toBoard(b.top(), mine, b.rank(mine));
  assert.deepEqual(out.top.map((r) => r.you), [false, true]);
  assert.deepEqual([out.you.rank, out.you.total, out.you.name], [2, 4000, nameFor('bob')]);
  assert.equal(out.top[0].photos[0].src, `/api/photo/${'a'.repeat(64)}/shot-1.jpg`);
  assert.ok(!JSON.stringify(out).includes('alice'));
});

test('a returning viewer is found by their player id, at their best round', () => {
  const b = board();
  b.post('a'.repeat(64), 'alice', 6000, 1);
  b.post('b'.repeat(64), 'bob', 2000, 2);
  b.post('c'.repeat(64), 'bob', 4000, 3);
  const mine = b.best('bob');
  assert.equal(mine.total, 4000);
  const out = toBoard(b.top(), mine, b.rank(mine));
  assert.deepEqual(out.top.map((r) => r.you), [false, true]);
  assert.deepEqual([out.you.rank, out.you.total], [2, 4000]);
  assert.equal(b.best('nobody'), undefined);
});

test('each row carries its round’s country for the flag', () => {
  const b = board();
  b.post('a'.repeat(64), 'alice', 6000, 1, undefined, 'SG');
  b.post('b'.repeat(64), 'bob', 4000, 2);
  b.post('c'.repeat(64), 'alice', 1000, 3, undefined, 'GB'); // a lower round elsewhere doesn't change her row
  const out = toBoard(b.top(), null, null);
  assert.equal(out.you, null);
  assert.deepEqual(out.top.map((r) => [r.name, r.country]), [[nameFor('alice'), 'SG'], [nameFor('bob'), '']]);
  assert.equal(b.best('alice').country, 'SG');
});

test('only real two-letter countries are kept', () => {
  assert.equal(countryCode('SG'), 'SG');
  for (const code of ['XX', 'T1', 'sg', 'SGP', '', undefined, null]) assert.equal(countryCode(code), '', String(code));
});

test('the week starts Monday 00:00 UTC', () => {
  const monday = Date.UTC(2026, 8, 28);
  assert.equal(weekStart(monday), monday);
  assert.equal(weekStart(Date.UTC(2026, 8, 30, 9, 20)), monday);
  assert.equal(weekStart(Date.UTC(2026, 9, 4, 23, 59, 59, 999)), monday); // Sunday night
  assert.equal(weekStart(Date.UTC(2026, 9, 5)), Date.UTC(2026, 9, 5));
  assert.equal(weekStart(Date.UTC(2026, 8, 28) - 1), Date.UTC(2026, 8, 21));
});

test('the weekly board only counts rounds since Monday, and a newcomer can top it', () => {
  const b = board(), monday = Date.UTC(2026, 8, 28);
  b.post('old', 'veteran', 9001, monday - 1000);
  b.post('new1', 'veteran', 500, monday + 1000);
  b.post('new2', 'newcomer', 3000, monday + 2000);
  assert.deepEqual(b.top(monday).map((r) => [r.player, r.total]), [['newcomer', 3000], ['veteran', 500]]);
  assert.deepEqual(b.top(0).map((r) => [r.player, r.total]), [['veteran', 9001], ['newcomer', 3000]]);
  assert.equal(b.rank(b.round('new2'), monday), 1);
  assert.equal(b.rank(b.round('new2'), 0), 2);
  assert.equal(b.best('veteran', monday).round, 'new1');
  assert.equal(b.best('newcomer', monday + 5000), undefined);
});

test('every row carries lifetime earnings across all the player’s rounds, even ones off this board', () => {
  const b = board(), monday = Date.UTC(2026, 8, 28);
  b.post('a1', 'alice', 4000, monday - 1000);
  b.post('a2', 'alice', 2500, monday + 1000);
  b.post('b1', 'bob', 3000, monday + 2000);
  assert.deepEqual(b.top(monday).map((r) => [r.player, r.total, r.lifetime]), [['bob', 3000, 3000], ['alice', 2500, 6500]]);
  assert.equal(b.round('a2').lifetime, 6500);
  assert.equal(b.best('alice', monday).lifetime, 6500);
  const out = toBoard(b.top(monday), b.round('a2'), 2);
  assert.deepEqual(out.top.map((r) => r.lifetime), [3000, 6500]);
  assert.equal(out.you.lifetime, 6500);
});

test('a viewer outside the top 10 still gets their whole row, to show under the board', () => {
  const b = board();
  for (let i = 0; i < 10; i++) b.post('x' + i, 'p' + i, 5000 + i, i);
  b.post('c'.repeat(64), 'carol', 1200, 20, undefined, 'SG');
  const mine = b.best('carol');
  const out = toBoard(b.top(), mine, b.rank(mine));
  assert.equal(out.top.some((r) => r.you), false);
  assert.deepEqual({ ...out.you, photos: out.you.photos.length }, { name: nameFor('carol'), country: 'SG', total: 1200, lifetime: 1200, rank: 11, photos: 1 });
});

test('the sold feed lists the latest rounds’ sold photos, newest round first, best photo first', () => {
  const b = board();
  const r = (c) => c.repeat(64);
  b.post(r('a'), 'alice', 1000, 1, [{ id: 'shot-1', headline: 'Fire', earned: 1000 }], 'SG');
  b.post(r('b'), 'bob', 750, 2, [{ id: 'shot-2', headline: 'Duck', earned: 750 }]);
  b.post(r('a'), 'alice', 1750, 3, [{ id: 'shot-1', headline: 'Fire', earned: 1000 }, { id: 'shot-4', headline: 'UFO', earned: 750 }], 'SG');
  const out = toSold(b.sold());
  assert.deepEqual(out.sold.map((s) => [s.key, s.at]), [[`${r('a')}/shot-1`, 3], [`${r('a')}/shot-4`, 3], [`${r('b')}/shot-2`, 2]]);
  assert.deepEqual(out.sold[1], { key: `${r('a')}/shot-4`, src: `/api/photo/${r('a')}/shot-4.jpg`, name: nameFor('alice'), country: 'SG', headline: 'UFO', earned: 750, at: 3 });
  assert.ok(!JSON.stringify(out).includes('alice'));
});

test('the sold feed only reaches back 6 rounds', () => {
  const b = board();
  for (let i = 0; i < 9; i++) b.post(String(i).repeat(64), 'p' + i, 100, i);
  const rounds = new Set(toSold(b.sold()).sold.map((s) => s.key.split('/')[0][0]));
  assert.deepEqual([...rounds], ['8', '7', '6', '5', '4', '3']);
});

test('only a round’s sold photos are served', () => {
  const b = board();
  b.post('a'.repeat(64), 'alice', 750, 1, [{ id: 'shot-2', headline: 'Duck', earned: 750 }]);
  assert.equal(listsPhoto(b.photos('a'.repeat(64)), 'shot-2'), true);
  assert.equal(listsPhoto(b.photos('b'.repeat(64)), 'shot-2'), false);
  const row = { photos: JSON.stringify([{ id: 'shot-2' }]) };
  assert.equal(listsPhoto(row, 'shot-2'), true);
  assert.equal(listsPhoto(row, 'shot-1'), false);
  assert.equal(listsPhoto(null, 'shot-2'), false);
});
