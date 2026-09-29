// Decides when production is broken and what to tell Varick. Pure functions over a plain state object,
// kept by the Monitor Durable Object (monitor.js). Fed by real traffic (photo reviews, live slots and
// video events) and by the scheduled checks (a probe of the photo judge, Reactor's account).
// See DEPLOYMENT.md, "Alerts".

export const LIMITS = {
  photoFails: 3, // real photo reviews failing in a row, across players
  probeFails: 2, // probe failures in a row, for errors that often pass by themselves (timeouts, 5xx, rate limits)
  videoRounds: 3, // rounds in a row that got a slot but no video
  videoWaitMs: 3 * 60_000, // the game waits up to 2 min for the first frame
  leftEarlyMs: 60_000, // a player who leaves this soon after getting a slot says nothing about video
  minBalanceUsd: 20,
  leakMs: 5 * 60_000, // sessions are capped at 240 s, so one open this long is leaking
  staleProbeMs: 45 * 60_000, // the probe runs every 15 min
  keepRunsMs: 24 * 3600_000,
  maxRuns: 50,
};

// What each check means, how to fix it, and how often to remind while it stays broken.
export const CHECKS = {
  judge: { title: 'Photo scoring is failing', remindMs: 3600_000 },
  relay: { title: 'Photo scoring through the US relay is failing (used where Gemini refuses the location)', remindMs: 3600_000 },
  video: { title: 'Live video isn’t starting', remindMs: 3600_000, fix: 'Check Reactor (https://reactor.inc/dashboard) and Workers Logs. Rounds are costing Reactor time without video.' },
  reactorBalance: { title: 'Reactor credits are low', remindMs: 24 * 3600_000, fix: 'Ask Reactor for more credits (ANALYTICS.md has the pitch numbers).' },
  reactorLeak: { title: 'A Reactor session is open past the 240 s cap', remindMs: 3600_000, fix: 'It spends $0.0097/s. The account is shared with local dev, so check nothing local is running, then end it from https://reactor.inc/dashboard.' },
  reactorApi: { title: 'Reactor check failing', remindMs: 24 * 3600_000, fix: 'If the key works but /accounts/… fails, Reactor changed its undocumented account API: check https://reactor.inc/dashboard by hand.' },
};

export const emptyState = () => ({ checks: {}, photoFails: 0, probeFails: { direct: 0, relay: 0 }, runs: {}, lastProbeAt: 0, alertError: '' });

// What a judge failure means and how to fix it. `definite` failures (billing, keys, rejected requests)
// won't pass by themselves, so one is enough to alert.
export function judgeCause(message = '', detail = '') {
  const status = Number(/HTTP (\d{3})/.exec(detail)?.[1]) || 0;
  if (/not configured/i.test(message)) return { definite: true, fix: 'GEMINI_API_KEY isn’t set on the Worker: npx wrangler secret put GEMINI_API_KEY.' };
  if (status === 429 && /spending cap/i.test(detail)) return { definite: true, fix: 'The Gemini project hit its monthly spend cap. Raise it at https://ai.studio/projects → Billing (project gen-lang-client-0867812658). No redeploy needed.' };
  if (status === 402) return { definite: true, fix: 'Gemini’s prepaid credits ran out. Top up at https://ai.studio/projects → Billing. No redeploy needed.' };
  if (status === 401 || status === 403 || /API key/i.test(detail)) return { definite: true, fix: 'Gemini refused the API key. Check the key in AI Studio and the GEMINI_API_KEY secret.' };
  if (status === 400 && /location is not supported/i.test(detail)) return { definite: true, fix: 'Gemini refused the location, even through the relay. See "Lessons from launch" in DEPLOYMENT.md.' };
  if (status === 429) return { definite: false, fix: 'Gemini rate limit. Check the project’s quotas at https://ai.studio/projects.' };
  if (status >= 400 && status < 500) return { definite: true, fix: 'Gemini rejected the request (model renamed or retired?). Search Workers Logs for "[judge]".' };
  if (status >= 500) return { definite: false, fix: 'Gemini is returning server errors. These usually pass; search Workers Logs for "[judge]".' };
  if (/timed out|too long/i.test(`${message} ${detail}`)) return { definite: false, fix: 'Gemini is timing out. Search Workers Logs for "[judge]".' };
  return { definite: false, fix: 'Unexpected judge failure. Search Workers Logs for "[judge]".' };
}

// Only failures of the Gemini call count; a bad request from the browser ("Invalid photograph",
// "Round expired") says nothing about scoring.
export const isJudgeFailure = (message = '', detail = '') => Boolean(detail) || /not configured/i.test(message);

const minutes = (ms) => (ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3600_000).toFixed(1)} h`);
const utc = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function text(kind, key, check, now) {
  const { title } = CHECKS[key];
  if (kind === 'recovered') return `RECOVERED: Newsworthy: ${title.split(' (')[0]}, fixed after ${minutes(now - check.since)}.`;
  const lead = kind === 'broken' ? 'NEWSWORTHY PROBLEM' : `STILL BROKEN (${minutes(now - check.since)})`;
  const lines = [`${lead}: ${title}.`, check.detail.replace(/\s+/g, ' ').slice(0, 400)];
  if (check.count) lines.push(`${check.count} failed photo review${check.count === 1 ? '' : 's'} by players since ${utc(check.since)}.`);
  if (check.fix) lines.push(`Fix: ${check.fix}`);
  return lines.filter(Boolean).join('\n');
}

// Moves one check to failing or ok. Returns the alert to send, or null: one when it breaks, a reminder
// every remindMs while it stays broken, and one when it recovers.
export function setCheck(state, key, failing, now, { detail = '', fix = CHECKS[key].fix, photos = 0 } = {}) {
  const check = state.checks[key];
  if (!failing) {
    if (!check) return null;
    delete state.checks[key];
    return { key, kind: 'recovered', text: text('recovered', key, check, now) };
  }
  if (!check) {
    const fresh = state.checks[key] = { since: now, alertedAt: now, detail, fix, count: photos };
    return { key, kind: 'broken', text: text('broken', key, fresh, now) };
  }
  Object.assign(check, { detail: detail || check.detail, fix: fix || check.fix, count: check.count + photos });
  if (now - check.alertedAt < CHECKS[key].remindMs) return null;
  check.alertedAt = now;
  return { key, kind: 'still', text: text('still', key, check, now) };
}

const alerts = (...list) => list.filter(Boolean);

// A real player's photo review. `message` is what the player saw, `detail` the Gemini error.
export function photo(state, { ok, message = '', detail = '' }, now, limits = LIMITS) {
  if (ok) { state.photoFails = 0; return alerts(setCheck(state, 'judge', false, now)); }
  if (!isJudgeFailure(message, detail)) return [];
  state.photoFails++;
  const failing = state.photoFails >= limits.photoFails || Boolean(state.checks.judge);
  if (!failing) return [];
  return alerts(setCheck(state, 'judge', true, now, { detail: `Players see "${message}". Gemini: ${detail || message}`, fix: judgeCause(message, detail).fix, photos: state.checks.judge ? 1 : state.photoFails }));
}

// The scheduled probe: the real judge code on a test photo, `path` 'direct' or through the 'relay'.
export function probe(state, { path, ok, message = '', detail = '' }, now, limits = LIMITS) {
  const key = path === 'relay' ? 'relay' : 'judge';
  state.lastProbeAt = now;
  if (ok) { state.probeFails[path] = 0; return alerts(setCheck(state, key, false, now)); }
  state.probeFails[path] = (state.probeFails[path] || 0) + 1;
  const cause = judgeCause(message, detail);
  if (!cause.definite && state.probeFails[path] < limits.probeFails) return [];
  // With scoring already failing everywhere, a failing relay is the same outage: one alert, not two.
  if (key === 'relay' && state.checks.judge && !state.checks.relay) return [];
  return alerts(setCheck(state, key, true, now, { detail: `The ${path === 'relay' ? 'relay ' : ''}check on a test photo failed: ${detail || message}`, fix: cause.fix }));
}

// Live slots and the round events that show whether video started. `run` is the game's run id.
export function slotOpened(state, run, now) {
  if (!run || state.runs[run]) return;
  state.runs[run] = { at: now };
}

export function roundEvent(state, { type, run, label, value }, now, limits = LIMITS) {
  const r = state.runs[run];
  if (!r) return [];
  if (type === 'first_video_frame' || type === 'photo_captured') r.video = true;
  else if (type === 'start_failed') r.failed = true;
  else if (type === 'closed' && label === 'left' && !r.video && Number(value) * 1000 < limits.leftEarlyMs) r.skip = true;
  return videoCheck(state, now, limits);
}

// Broken when the last few rounds that should have had video by now all didn't; fixed once one does.
export function videoCheck(state, now, limits = LIMITS) {
  for (const [run, r] of Object.entries(state.runs)) if (now - r.at > limits.keepRunsMs) delete state.runs[run];
  const runs = Object.entries(state.runs).sort(([, a], [, b]) => b.at - a.at);
  for (const [run] of runs.slice(limits.maxRuns)) delete state.runs[run];
  const decided = runs.map(([, r]) => r).filter((r) => !r.skip && (r.video || now - r.at >= limits.videoWaitMs));
  if (decided[0]?.video) return alerts(setCheck(state, 'video', false, now));
  const latest = decided.slice(0, limits.videoRounds);
  if (latest.length < limits.videoRounds || latest.some((r) => r.video)) return [];
  const failed = latest.filter((r) => r.failed).length;
  return alerts(setCheck(state, 'video', true, now, { detail: `The last ${latest.length} rounds got a live slot but no video${failed ? ` (${failed} reported a failed start)` : ''}. Latest at ${utc(latest[0].at)}.` }));
}

const time = (value) => Date.parse(String(value).slice(0, 19) + 'Z');

// The hourly Reactor check: { error } if the API couldn't be read, else { balance, sessions }.
export function reactor(state, { error, balance, sessions = [] }, now, limits = LIMITS) {
  if (error) return alerts(setCheck(state, 'reactorApi', true, now, { detail: error }));
  const leaks = sessions.filter((s) => !s.closed && now - time(s.created_at) > limits.leakMs);
  return alerts(
    setCheck(state, 'reactorApi', false, now),
    setCheck(state, 'reactorBalance', Number.isFinite(balance) && balance < limits.minBalanceUsd, now, { detail: `$${balance?.toFixed?.(2)} left (alert under $${limits.minBalanceUsd}).` }),
    setCheck(state, 'reactorLeak', leaks.length > 0, now, { detail: leaks.map((s) => `Session ${s.session_id ?? '?'} open since ${utc(time(s.created_at))}`).join('\n') }),
  );
}

// For GET /api/health: which checks are failing, without the details.
export function health(state, now, limits = LIMITS) {
  const failing = Object.keys(state.checks);
  const probeStale = !state.lastProbeAt || now - state.lastProbeAt > limits.staleProbeMs;
  return { ok: !failing.length && !probeStale && !state.alertError, failing, lastProbeAt: state.lastProbeAt ? new Date(state.lastProbeAt).toISOString() : null, probeStale, alerts: state.alertError ? 'failing' : 'ok' };
}
