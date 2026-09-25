import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { nameFor, soldPhotos, toBoard, listsPhoto, UPSERT, TOP, RANK, ROUND, BEST } from './src/leaderboard.js';

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
  db.exec(readFileSync(new URL('./migrations/0001_scores.sql', import.meta.url), 'utf8'));
  const post = (round, player, total, created, photos = [{ id: 'shot-1', headline: 'UFO', earned: total }]) =>
    db.prepare(UPSERT).run(round, player, nameFor(player), total, JSON.stringify(photos), created);
  const top = () => db.prepare(TOP).all();
  const round = (id) => db.prepare(ROUND).get(id);
  const best = (player) => db.prepare(BEST).get(player);
  const rank = (mine) => db.prepare(RANK).get(mine.player, mine.total).rank;
  return { post, top, round, rank, best };
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
  assert.deepEqual(out.you, { rank: 2, total: 4000 });
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
  assert.deepEqual(out.you, { rank: 2, total: 4000 });
  assert.equal(b.best('nobody'), undefined);
});

test('only a round’s sold photos are served', () => {
  const row = { photos: JSON.stringify([{ id: 'shot-2' }]) };
  assert.equal(listsPhoto(row, 'shot-2'), true);
  assert.equal(listsPhoto(row, 'shot-1'), false);
  assert.equal(listsPhoto(null, 'shot-2'), false);
});
