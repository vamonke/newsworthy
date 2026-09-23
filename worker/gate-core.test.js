import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, emptyState, sweep, reserve, attach, register, release, releaseIp, nextWake } from './src/gate-core.js';

const open = (state, ip, now = 0) => { const r = reserve(state, ip, now); if (r.ticket) attach(state, r.ticket, `jwt-${r.ticket}`); return r; };
const jwtOf = (r) => `jwt-${r.ticket}`;

test('four slots, then the fifth player is told when one frees up', () => {
  const s = emptyState();
  for (const ip of ['a', 'b', 'c', 'd']) assert.ok(open(s, ip).ticket);
  const full = reserve(s, 'e', 10_000);
  assert.equal(full.error, 'busy');
  assert.equal(full.retryAfter, 80);
});

test('one address can hold two slots at most', () => {
  const s = emptyState();
  open(s, 'a'); open(s, 'a');
  assert.equal(reserve(s, 'a', 0).error, 'ip');
  assert.ok(reserve(s, 'b', 0).ticket);
});

test('a registered session keeps its slot for the full 4 minutes, then is swept', () => {
  const s = emptyState();
  const r = open(s, 'a');
  assert.equal(register(s, jwtOf(r), 'sess-1', 5_000), true);
  assert.equal(nextWake(s), 5_000 + LIMITS.sessionMs + LIMITS.graceMs);
  assert.deepEqual(sweep(s, 200_000), []);
  const [gone] = sweep(s, 5_000 + LIMITS.sessionMs + LIMITS.graceMs);
  assert.equal(gone.sessionId, 'sess-1');
  assert.equal(nextWake(s), null);
});

test('a token that never starts a session loses its slot', () => {
  const s = emptyState();
  open(s, 'a');
  assert.equal(sweep(s, LIMITS.holdMs).length, 1);
});

test('unknown tokens and a second session id are refused', () => {
  const s = emptyState();
  const r = open(s, 'a');
  assert.equal(register(s, 'forged', 'sess-1', 0), false);
  assert.equal(register(s, jwtOf(r), 'sess-1', 0), true);
  assert.equal(register(s, jwtOf(r), 'sess-2', 0), false);
});

test('release frees the slot; stopping by address leaves other players alone', () => {
  const s = emptyState();
  const mine = open(s, 'a'); open(s, 'b');
  assert.equal(release(s, jwtOf(mine)).ip, 'a');
  assert.equal(release(s, jwtOf(mine)), null);
  open(s, 'a');
  assert.equal(releaseIp(s, 'a').length, 1);
  assert.equal(Object.values(s.slots)[0].ip, 'b');
});

test('the daily cap resets the next day', () => {
  const s = emptyState();
  const day = Date.UTC(2026, 8, 24);
  for (let i = 0; i < LIMITS.dailyCap; i++) { const r = reserve(s, `ip${i}`, day); delete s.slots[r.ticket]; }
  assert.equal(reserve(s, 'x', day).error, 'daily');
  assert.ok(reserve(s, 'x', day + 86_400_000).ticket);
});
