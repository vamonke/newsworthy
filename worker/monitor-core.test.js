import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, photo, probe, slotOpened, roundEvent, videoCheck, reactor, health, judgeCause, isJudgeFailure, LIMITS } from './src/monitor-core.js';

const MIN = 60_000, HOUR = 3600_000;
// The exact error players got from 2026-09-28 13:09 UTC.
const CAP = { message: 'Editor unavailable (429). Retry this photo.', detail: 'HTTP 429: {"error":{"code":429,"message":"Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap."}}' };
const CREDITS = { message: 'Editor unavailable (402). Retry this photo.', detail: 'HTTP 402: {"error":{"message":"Your prepayment credits are depleted."}}' };
const TIMEOUT = { message: 'Editor took too long. Retry this photo.', detail: 'timed out after 30000ms' };
const SERVER = { message: 'Editor unavailable (503). Retry this photo.', detail: 'HTTP 503: overloaded' };

test('each known outage gets its own fix, and billing errors count as definite', () => {
  assert.match(judgeCause(CAP.message, CAP.detail).fix, /spend cap/);
  assert.equal(judgeCause(CAP.message, CAP.detail).definite, true);
  assert.match(judgeCause(CREDITS.message, CREDITS.detail).fix, /Top up/);
  assert.equal(judgeCause(CREDITS.message, CREDITS.detail).definite, true);
  assert.equal(judgeCause('', 'HTTP 403: API key not valid').definite, true);
  assert.match(judgeCause('', 'HTTP 400: [{ "error": { "code": 400, "message": "Please pass a valid API key" } }]').fix, /API key/);
  assert.equal(judgeCause('', 'HTTP 400: model not found').definite, true);
  assert.equal(judgeCause('', 'HTTP 429: Resource exhausted').definite, false);
  assert.equal(judgeCause(SERVER.message, SERVER.detail).definite, false);
  assert.equal(judgeCause(TIMEOUT.message, TIMEOUT.detail).definite, false);
  assert.equal(judgeCause('Photo judge is not configured.').definite, true);
});

test('only Gemini failures count, not bad requests from the browser', () => {
  assert.equal(isJudgeFailure(CAP.message, CAP.detail), true);
  assert.equal(isJudgeFailure('Photo judge is not configured.'), true);
  assert.equal(isJudgeFailure('Invalid photograph'), false);
  assert.equal(isJudgeFailure('Round expired. Start a new round.'), false);
  const s = emptyState();
  for (let i = 0; i < 5; i++) assert.deepEqual(photo(s, { ok: false, message: 'Invalid photograph' }, i), []);
});

test('the spend-cap outage alerts on the third failed photo, with the fix, then reminds hourly and recovers once', () => {
  const s = emptyState();
  let t = 0;
  assert.deepEqual(photo(s, { ok: false, ...CAP }, t), []);
  assert.deepEqual(photo(s, { ok: false, ...CAP }, t += 1000), []);
  const [alert] = photo(s, { ok: false, ...CAP }, t += 1000);
  assert.equal(alert.kind, 'broken');
  assert.match(alert.text, /^NEWSWORTHY PROBLEM: Photo scoring is failing/);
  assert.match(alert.text, /monthly spending cap/);
  assert.doesNotMatch(alert.text.split('\n')[1], /\s{2}/); // Gemini's JSON on one line
  assert.match(alert.text, /Fix: .*ai\.studio\/projects/);
  assert.match(alert.text, /3 failed photo reviews/);
  // 500 more failures within the hour: no more messages.
  for (let i = 0; i < 500; i++) assert.deepEqual(photo(s, { ok: false, ...CAP }, t += 5000), []);
  t = 2000 + HOUR; // an hour after the first alert
  const [reminder] = photo(s, { ok: false, ...CAP }, t);
  assert.equal(reminder.kind, 'still');
  assert.match(reminder.text, /^STILL BROKEN \(60 min\)/);
  assert.match(reminder.text, /504 failed photo reviews/);
  const [fixed] = photo(s, { ok: true }, t += 1000);
  assert.equal(fixed.kind, 'recovered');
  assert.match(fixed.text, /^RECOVERED/);
  assert.deepEqual(photo(s, { ok: true }, t += 1000), []);
});

test('a success between failures resets the count', () => {
  const s = emptyState();
  photo(s, { ok: false, ...SERVER }, 0);
  photo(s, { ok: false, ...SERVER }, 1);
  photo(s, { ok: true }, 2);
  assert.deepEqual(photo(s, { ok: false, ...SERVER }, 3), []);
  assert.deepEqual(photo(s, { ok: false, ...SERVER }, 4), []);
  assert.equal(photo(s, { ok: false, ...SERVER }, 5).length, 1);
});

test('the probe alerts at once on a definite error, and after two in a row on one that may pass', () => {
  const s = emptyState();
  const [alert] = probe(s, { path: 'direct', ok: false, ...CAP }, 0);
  assert.equal(alert.kind, 'broken');
  assert.match(alert.text, /check on a test photo failed/);
  const t = emptyState();
  assert.deepEqual(probe(t, { path: 'direct', ok: false, ...TIMEOUT }, 0), []);
  assert.equal(probe(t, { path: 'direct', ok: false, ...TIMEOUT }, 15 * MIN)[0].kind, 'broken');
  assert.equal(probe(t, { path: 'direct', ok: true }, 30 * MIN)[0].kind, 'recovered');
});

test('probe and players share one check, so an outage is one alert, not two', () => {
  const s = emptyState();
  assert.equal(probe(s, { path: 'direct', ok: false, ...CAP }, 0).length, 1);
  for (let i = 1; i <= 10; i++) assert.deepEqual(photo(s, { ok: false, ...CAP }, i * 1000), []);
  assert.equal(s.checks.judge.count, 10);
});

test('a relay failure during a wider outage is not a second alert', () => {
  const s = emptyState();
  assert.equal(probe(s, { path: 'direct', ok: false, ...CAP }, 0).length, 1);
  assert.deepEqual(probe(s, { path: 'relay', ok: false, ...CAP }, 1000), []);
  probe(s, { path: 'direct', ok: true }, HOUR);
  assert.equal(probe(s, { path: 'relay', ok: false, ...CAP }, HOUR + 1000)[0].kind, 'broken');
});

test('the relay has its own check', () => {
  const s = emptyState();
  const [alert] = probe(s, { path: 'relay', ok: false, message: 'Editor unavailable (400). Retry this photo.', detail: 'HTTP 400: User location is not supported for the API use.' }, 0);
  assert.match(alert.text, /US relay/);
  assert.deepEqual(probe(s, { path: 'direct', ok: true }, 1), []);
  assert.ok(s.checks.relay);
});

test('three rounds in a row with a slot and no video alert; one with video recovers', () => {
  const s = emptyState();
  slotOpened(s, 'newsworthy-1', 0);
  slotOpened(s, 'newsworthy-2', 4 * MIN);
  roundEvent(s, { type: 'start_failed', run: 'newsworthy-2' }, 4 * MIN + 5000);
  slotOpened(s, 'newsworthy-3', 8 * MIN);
  assert.deepEqual(videoCheck(s, 10 * MIN), []); // the third may still load
  const [alert] = videoCheck(s, 11 * MIN);
  assert.equal(alert.kind, 'broken');
  assert.match(alert.text, /last 3 rounds got a live slot but no video \(1 reported a failed start\)/);
  slotOpened(s, 'newsworthy-4', 12 * MIN);
  assert.equal(roundEvent(s, { type: 'first_video_frame', run: 'newsworthy-4', value: 40 }, 13 * MIN)[0].kind, 'recovered');
});

test('players who leave in the first minute, and rounds still loading, are not counted', () => {
  const s = emptyState();
  for (let i = 0; i < 3; i++) {
    slotOpened(s, `r${i}`, i * MIN);
    roundEvent(s, { type: 'closed', run: `r${i}`, label: 'left', value: 20 }, i * MIN + 20_000);
  }
  assert.deepEqual(videoCheck(s, HOUR), []);
  slotOpened(s, 'ok', 0);
  roundEvent(s, { type: 'photo_captured', run: 'ok' }, MIN);
  slotOpened(s, 'a', 2 * MIN); slotOpened(s, 'b', 3 * MIN); slotOpened(s, 'c', 4 * MIN);
  assert.deepEqual(videoCheck(s, 5 * MIN), []);
});

test('events for unknown runs are ignored, and old runs are dropped', () => {
  const s = emptyState();
  assert.deepEqual(roundEvent(s, { type: 'first_video_frame', run: 'nope' }, 0), []);
  for (let i = 0; i < 80; i++) slotOpened(s, `r${i}`, i);
  videoCheck(s, 100);
  assert.equal(Object.keys(s.runs).length, LIMITS.maxRuns);
  videoCheck(s, 2 * 24 * HOUR);
  assert.equal(Object.keys(s.runs).length, 0);
});

test('Reactor: low balance, a leaking session and a broken API each alert', () => {
  const now = Date.parse('2026-09-29T06:00:00Z');
  const s = emptyState();
  const sessions = [
    { session_id: 'old', created_at: '2026-09-29T05:50:00.1234Z', closed: false },
    { session_id: 'live', created_at: '2026-09-29T05:58:00Z', closed: false },
    { session_id: 'done', created_at: '2026-09-29T01:00:00Z', closed: true },
  ];
  const alerts = reactor(s, { balance: 12.5, sessions }, now);
  assert.deepEqual(alerts.map((a) => a.key), ['reactorBalance', 'reactorLeak']);
  assert.match(alerts[0].text, /\$12\.50 left/);
  assert.match(alerts[1].text, /Session old open since 2026-09-29 05:50 UTC/);
  assert.doesNotMatch(alerts[1].text, /live|done/);
  // Low balance reminds daily, not hourly.
  assert.deepEqual(reactor(s, { balance: 12, sessions }, now + 2 * HOUR).map((a) => a.key), ['reactorLeak']);
  assert.deepEqual(reactor(s, { balance: 30, sessions: [] }, now + 3 * HOUR).map((a) => a.kind), ['recovered', 'recovered']);
  const [api] = reactor(s, { error: 'Reactor /accounts/<id>/credits returned 404' }, now + 4 * HOUR);
  assert.match(api.text, /Reactor check failing/);
  assert.equal(reactor(s, { balance: 30, sessions: [] }, now + 5 * HOUR)[0].kind, 'recovered');
});

test('health shows failing checks, a stale probe and broken alert delivery, without details', () => {
  const t = Date.parse('2026-09-29T06:00:00Z');
  const s = emptyState();
  assert.equal(health(s, t).ok, false); // no probe yet
  probe(s, { path: 'direct', ok: true }, t);
  assert.deepEqual(health(s, t + 10 * MIN), { ok: true, failing: [], lastProbeAt: '2026-09-29T06:00:00.000Z', probeStale: false, alerts: 'ok' });
  assert.equal(health(s, t + HOUR).probeStale, true);
  probe(s, { path: 'direct', ok: false, ...CAP }, t + HOUR);
  s.alertError = 'Telegram 401';
  const h = health(s, t + HOUR);
  assert.deepEqual(h.failing, ['judge']);
  assert.equal(h.alerts, 'failing');
  assert.doesNotMatch(JSON.stringify(h), /spending|Telegram/);
});
