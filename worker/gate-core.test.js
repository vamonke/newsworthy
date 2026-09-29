import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, emptyState, sweep, sweepLine, reserve, admit, attach, register, claimRound, alive, holder, release, releaseIp, nextWake, timeRound, estimateWait, lineStatus } from './src/gate-core.js';

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

test('holder finds a slot by its token without freeing it', () => {
  const s = emptyState();
  const mine = open(s, 'a');
  assert.equal(holder(s, jwtOf(mine)).ip, 'a');
  assert.equal(Object.keys(s.slots).length, 1);
  assert.equal(holder(s, 'unknown'), null);
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

// Waiting line.
const full = (s) => { for (const ip of ['a', 'b', 'c', 'd']) assert.ok(admit(s, ip, null, 0).ticket); };
const join = (s, ip, now = 0) => { const r = admit(s, ip, null, now); assert.equal(r.error, 'busy'); return r.queue; };
const freeOne = (s, ip) => { const [ticket] = Object.entries(s.slots).find(([, v]) => v.ip === ip); delete s.slots[ticket]; };

test('when every slot is taken, players join the line in order and see their place', () => {
  const s = emptyState();
  full(s);
  const e = join(s, 'e'), f = join(s, 'f');
  assert.equal(e.position, 1); assert.equal(e.ahead, 0);
  assert.equal(f.position, 2); assert.equal(f.ahead, 1);
  assert.notEqual(e.ticket, f.ticket);
  assert.deepEqual(admit(s, 'f', f.ticket, 1_000).queue, { ticket: f.ticket, position: 2, ahead: 1, wait: 149 });
});

test('a freed slot goes to the front of the line, not to a newcomer or someone further back', () => {
  const s = emptyState();
  full(s);
  const e = join(s, 'e'), f = join(s, 'f');
  freeOne(s, 'a');
  assert.equal(admit(s, 'f', f.ticket, 1_000).error, 'busy');
  assert.equal(admit(s, 'g', null, 1_000).queue.position, 3);
  const turn = admit(s, 'e', e.ticket, 1_000);
  assert.ok(turn.ticket);
  assert.equal(s.slots[turn.ticket].ip, 'e');
  assert.deepEqual(admit(s, 'f', f.ticket, 2_000).queue, { ticket: f.ticket, position: 1, ahead: 0, wait: 148 });
});

test('two free slots let the first two in line through', () => {
  const s = emptyState();
  full(s);
  const e = join(s, 'e'), f = join(s, 'f'), g = join(s, 'g');
  freeOne(s, 'a'); freeOne(s, 'b');
  assert.ok(admit(s, 'f', f.ticket, 1_000).ticket);
  assert.equal(admit(s, 'g', g.ticket, 1_000).error, 'busy');
  assert.ok(admit(s, 'e', e.ticket, 1_000).ticket);
});

test('a player who stops checking in loses their place and the next one moves up', () => {
  const s = emptyState();
  full(s);
  const e = join(s, 'e'), f = join(s, 'f');
  admit(s, 'f', f.ticket, 10_000);
  assert.equal(nextWake(s), 0 + LIMITS.lineMs);
  assert.equal(admit(s, 'f', f.ticket, LIMITS.lineMs + 1).queue.position, 1);
  assert.equal(admit(s, 'e', e.ticket, LIMITS.lineMs + 1).error, 'expired');
  assert.equal(admit(s, 'nobody', 'made-up', 0).error, 'expired');
  sweepLine(s, 10_000 + LIMITS.lineMs * 3);
  assert.deepEqual(s.line, []);
});

test('one address can hold at most two places counting slots and line', () => {
  const s = emptyState();
  full(s);
  join(s, 'e'); join(s, 'e');
  assert.equal(admit(s, 'e', null, 0).error, 'line');
  assert.equal(admit(s, 'a', null, 0).queue.position, 3);
  assert.equal(admit(s, 'a', null, 0).error, 'line');
  const t = emptyState();
  full(t);
  assert.equal(join(t, 'a').position, 1);
  assert.equal(admit(t, 'a', null, 0).error, 'line');
});

test('the front of the line is refused if that address already has two live slots', () => {
  const s = emptyState();
  admit(s, 'a', null, 0); admit(s, 'a', null, 0); admit(s, 'b', null, 0); admit(s, 'c', null, 0);
  const d = join(s, 'd');
  s.line[0].ip = 'a'; // e.g. the same household joined from a second device
  freeOne(s, 'b');
  assert.equal(admit(s, 'd', d.ticket, 1_000).error, 'ip');
  assert.deepEqual(s.line, []);
});

test('the line is capped', () => {
  const s = emptyState();
  full(s);
  for (let i = 0; i < LIMITS.lineMax; i++) join(s, `ip${i}`);
  assert.equal(admit(s, 'late', null, 0).error, 'full');
});

test('with nobody waiting a newcomer takes a free slot at once', () => {
  const s = emptyState();
  assert.ok(admit(s, 'a', null, 0).ticket);
  assert.equal(s.line.length, 0);
});

test('a live session can open one round, and only while it holds a slot', () => {
  const s = emptyState();
  const { ticket } = admit(s, 'a', null, 0);
  assert.equal(claimRound(s, 'jwt-a'), false);
  attach(s, ticket, 'jwt-a');
  assert.equal(claimRound(s, 'nope'), false);
  assert.equal(claimRound(s, 'jwt-a'), true);
  assert.equal(claimRound(s, 'jwt-a'), false);
  release(s, 'jwt-a');
  assert.equal(claimRound(s, 'jwt-a'), false);
});

test('a game that checks in and then goes quiet loses its slot', () => {
  const s = emptyState();
  const r = open(s, 'a');
  assert.equal(register(s, jwtOf(r), 'sess-1', 0), true);
  assert.equal(alive(s, jwtOf(r), 10_000), true);
  assert.equal(nextWake(s), 10_000 + LIMITS.aliveMs);
  assert.equal(alive(s, jwtOf(r), 20_000), true);
  assert.deepEqual(sweep(s, 20_000 + LIMITS.aliveMs - 1), []);
  const [gone] = sweep(s, 20_000 + LIMITS.aliveMs);
  assert.equal(gone.sessionId, 'sess-1');
  assert.equal(alive(s, jwtOf(r), 70_000), false);
});

test('checking in never stretches a session past its 4 minutes', () => {
  const s = emptyState();
  const r = open(s, 'a');
  register(s, jwtOf(r), 'sess-1', 0);
  const end = LIMITS.sessionMs + LIMITS.graceMs;
  alive(s, jwtOf(r), end - 1_000);
  assert.equal(nextWake(s), end);
  assert.equal(sweep(s, end).length, 1);
});

// Wait estimate.
const one = { ...LIMITS, slots: 1 };

test('with one slot, the wait is the rest of the current round plus a round per player ahead', () => {
  const s = emptyState();
  assert.ok(admit(s, 'a', null, 0, one).ticket);
  assert.equal(admit(s, 'b', null, 60_000, one).queue.wait, 90);
  assert.equal(admit(s, 'c', null, 60_000, one).queue.wait, 240);
  // A round running past the usual time means any moment now, not a negative wait.
  assert.equal(estimateWait(s, 0, 400_000, one), 0);
});

test('the wait follows how long recent rounds really took', () => {
  const s = emptyState();
  for (const ms of [100_000, 120_000]) timeRound(s, { sessionId: 'x', since: 0 }, ms, one);
  timeRound(s, { sessionId: null, since: 0 }, 5_000, one); // a start that never reached Reactor isn't a round
  assert.deepEqual(s.rounds, [100_000, 120_000]);
  assert.ok(admit(s, 'a', null, 0, one).ticket);
  assert.equal(admit(s, 'b', null, 0, one).queue.wait, 110);
  for (let i = 0; i < 20; i++) timeRound(s, { sessionId: 'x', since: 0 }, 60_000, one);
  assert.equal(s.rounds.length, LIMITS.timedRounds);
});

test('a round in progress is judged by the recent rounds that ran at least as long', () => {
  const s = emptyState();
  // Two players quit early, three played a full round (about 145 s from token to slot end).
  for (const ms of [40_000, 60_000, 145_000, 145_000, 145_000]) timeRound(s, { sessionId: 'x', since: 0 }, ms, one);
  assert.ok(admit(s, 'a', null, 0, one).ticket);
  // 113 s in, the average round (107 s) says it's over; the full rounds say about 32 s are left.
  assert.equal(lineStatus(s, 113_000, one).wait, 32);
  // Early on, the rounds that quit still count: they might happen again.
  assert.equal(lineStatus(s, 30_000, one).wait, 77);
  // Past every recent round: any moment now.
  assert.equal(lineStatus(s, 150_000, one).wait, 0);
  // Players ahead each take the usual (average) round.
  admit(s, 'b', null, 113_000, one);
  assert.equal(lineStatus(s, 113_000, one).wait, 32 + 107);
});

test('with several slots, the line spreads across whichever frees up first', () => {
  const s = emptyState();
  const two = { ...LIMITS, slots: 2 };
  assert.ok(admit(s, 'a', null, 0, two).ticket);
  assert.ok(admit(s, 'b', null, 100_000, two).ticket);
  assert.equal(admit(s, 'c', null, 100_000, two).queue.wait, 50);
  assert.equal(admit(s, 'd', null, 100_000, two).queue.wait, 150);
  assert.equal(admit(s, 'e', null, 100_000, two).queue.wait, 200);
});

test('before joining, a player sees how many are waiting and the wait if they join now', () => {
  const s = emptyState();
  assert.deepEqual(lineStatus(s, 0, one), { waiting: 0, wait: 0 });
  assert.ok(admit(s, 'a', null, 0, one).ticket);
  assert.deepEqual(lineStatus(s, 60_000, one), { waiting: 0, wait: 90 });
  admit(s, 'b', null, 60_000, one);
  assert.deepEqual(lineStatus(s, 60_000, one), { waiting: 1, wait: 240 });
  // Someone who stopped checking in no longer counts.
  assert.equal(lineStatus(s, 60_000 + LIMITS.lineMs, one).waiting, 0);
});
