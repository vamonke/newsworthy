// Live-session slot bookkeeping, kept free of I/O so it can be unit tested.
// Production sets the slot count with LIVE_SLOTS (wrangler.jsonc) to Reactor's per-model session limit;
// these defaults are what the unit tests run with.
export const LIMITS = {
  slots: 4,
  perIp: 2,
  dailyCap: 500,
  holdMs: 90_000, // a token must register its session within this time
  sessionMs: 240_000, // matches max_session_duration_seconds on the token
  graceMs: 15_000,
  lineMs: 15_000, // a waiting player who stops checking in loses their place
  lineMax: 100,
  pollMs: 3_000, // how often a waiting player checks in
  aliveMs: 40_000, // a game that has checked in and then goes quiet this long has left (the game checks in every 10 s)
  roundMs: 150_000, // how long a player usually holds a slot, until real rounds have been timed
  timedRounds: 20, // the wait estimate learns from this many recent rounds
};

export const emptyState = () => ({ slots: {}, line: [], day: '', opened: 0, rounds: [] });

// When a slot ends: its time is up, or its game checked in and then went quiet (the tab closed or
// crashed without saying goodbye). Slots that never checked in keep the old timing.
const endsAt = (slot, limits) => (slot.alive ? Math.min(slot.until, slot.alive + limits.aliveMs) : slot.until);

// Removes slots whose time is up and returns them so the caller can end their Reactor sessions.
export function sweep(state, now, limits = LIMITS) {
  const expired = [];
  for (const [ticket, slot] of Object.entries(state.slots)) {
    if (endsAt(slot, limits) <= now) { expired.push(slot); delete state.slots[ticket]; }
  }
  return expired;
}

function newDay(state, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.opened = 0; }
}

function take(state, ip, now, limits) {
  const ticket = crypto.randomUUID();
  state.slots[ticket] = { ip, jwt: null, sessionId: null, until: now + limits.holdMs, since: now };
  state.opened++;
  return { ticket };
}

const held = (state, ip) => Object.values(state.slots).filter((s) => s.ip === ip).length;

// Hands out a slot straight away, with no waiting line. Kept for callers that don't queue.
export function reserve(state, ip, now, limits = LIMITS) {
  newDay(state, now);
  const slots = Object.values(state.slots);
  if (state.opened >= limits.dailyCap) return { error: 'daily' };
  if (held(state, ip) >= limits.perIp) return { error: 'ip' };
  if (slots.length >= limits.slots) {
    const soonest = Math.min(...slots.map((s) => s.until));
    return { error: 'busy', retryAfter: Math.max(1, Math.ceil((soonest - now) / 1000)) };
  }
  return take(state, ip, now, limits);
}

// Drops waiting players who stopped checking in (closed the tab, lost connection).
export function sweepLine(state, now, limits = LIMITS) {
  state.line = (state.line || []).filter((w) => w.lastSeen + limits.lineMs > now);
}

// Times a slot that held a real round (one that reached Reactor), for the wait estimate.
export function timeRound(state, slot, now, limits = LIMITS) {
  if (!slot?.sessionId || slot.since == null) return;
  state.rounds = [...(state.rounds || []), now - slot.since].slice(-limits.timedRounds);
}

// How much longer a slot's round will run. Some players quit early, so the average round is shorter
// than a full one, and "average minus time so far" said a round in its last minute was nearly over.
// Rounds that ended before this one's time so far say nothing about it, so this averages how much
// longer the recent rounds that went past that point ran. None did: it's due to end any moment.
function restOf(slot, rounds, usual, now) {
  const ran = now - (slot.since ?? now);
  if (!rounds.length) return Math.max(0, usual - ran);
  const longer = rounds.filter((d) => d > ran);
  return longer.length ? longer.reduce((a, d) => a + d - ran, 0) / longer.length : 0;
}

// Seconds until the player at this place in line (0 = front) gets a slot: each slot frees up when its
// round has run its likely course, and each player ahead then takes one for the usual time.
export function estimateWait(state, i, now, limits = LIMITS) {
  const rounds = state.rounds || [];
  const usual = rounds.length ? rounds.reduce((a, b) => a + b, 0) / rounds.length : limits.roundMs;
  const free = Object.values(state.slots).map((s) => restOf(s, rounds, usual, now));
  while (free.length < limits.slots) free.push(0);
  let wait = 0;
  for (let k = 0; k <= i; k++) {
    free.sort((a, b) => a - b);
    wait = free.shift();
    free.push(wait + usual);
  }
  return Math.round(wait / 1000);
}

// The line as someone who hasn't joined sees it: how many are waiting, and their wait if they join now.
export function lineStatus(state, now, limits = LIMITS) {
  const waiting = (state.line || []).filter((w) => w.lastSeen + limits.lineMs > now).length;
  return { waiting, wait: estimateWait(state, waiting, now, limits) };
}

const waiting = (state, i, now, limits) => ({ error: 'busy', retryAfter: Math.ceil(limits.pollMs / 1000), queue: { ticket: state.line[i].ticket, position: i + 1, ahead: i, wait: estimateWait(state, i, now, limits) } });

// First come, first served. With no ticket the player gets a slot only if nobody is waiting,
// otherwise joins the end of the line. With a ticket the player gets a slot once the number of
// free slots reaches their place in line, so nobody behind them can cut in.
export function admit(state, ip, ticket, now, limits = LIMITS) {
  newDay(state, now);
  sweepLine(state, now, limits);
  const free = limits.slots - Object.keys(state.slots).length;
  if (ticket) {
    const i = state.line.findIndex((w) => w.ticket === ticket);
    if (i < 0) return { error: 'expired' };
    const me = state.line[i];
    me.lastSeen = now;
    if (i >= free) return waiting(state, i, now, limits);
    state.line.splice(i, 1);
    if (state.opened >= limits.dailyCap) return { error: 'daily' };
    if (held(state, me.ip) >= limits.perIp) return { error: 'ip' };
    return take(state, me.ip, now, limits);
  }
  if (state.opened >= limits.dailyCap) return { error: 'daily' };
  const mine = held(state, ip), queued = state.line.filter((w) => w.ip === ip).length;
  if (mine >= limits.perIp) return { error: 'ip' };
  if (!state.line.length && free > 0) return take(state, ip, now, limits);
  // Slots and places in line together count toward the per-address limit.
  if (mine + queued >= limits.perIp) return { error: 'line' };
  if (state.line.length >= limits.lineMax) return { error: 'full' };
  state.line.push({ ticket: crypto.randomUUID(), ip, lastSeen: now });
  return waiting(state, state.line.length - 1, now, limits);
}

export function attach(state, ticket, jwt) {
  const slot = state.slots[ticket];
  if (slot) slot.jwt = jwt;
  return Boolean(slot);
}

const byJwt = (state, jwt) => Object.entries(state.slots).find(([, s]) => s.jwt && s.jwt === jwt);

// Once the browser reports its session id, the slot lasts as long as the session can.
export function register(state, jwt, sessionId, now, limits = LIMITS) {
  const hit = byJwt(state, jwt);
  if (!hit) return false;
  const slot = hit[1];
  if (slot.sessionId && slot.sessionId !== sessionId) return false;
  if (!slot.sessionId) { slot.sessionId = sessionId; slot.until = now + limits.sessionMs + limits.graceMs; }
  return true;
}

// A live session may open one photo round. Since only a player who passed the bot check gets a
// session, this keeps the photo judge behind the same check.
export function claimRound(state, jwt) {
  const hit = byJwt(state, jwt);
  if (!hit || hit[1].round) return false;
  hit[1].round = true;
  return true;
}

// The game checks in every few seconds while it holds a slot. Browsers don't reliably send a
// cleanup when a tab closes, so a slot whose check-ins stop is ended by sweep().
export function alive(state, jwt, now) {
  const hit = byJwt(state, jwt);
  if (!hit) return false;
  hit[1].alive = now;
  return true;
}

export function holder(state, jwt) {
  return byJwt(state, jwt)?.[1] ?? null;
}

export function release(state, jwt) {
  const hit = byJwt(state, jwt);
  if (!hit) return null;
  delete state.slots[hit[0]];
  return hit[1];
}

// Frees only the caller's own slots, so one player can never end someone else's round.
export function releaseIp(state, ip) {
  const freed = [];
  for (const [ticket, slot] of Object.entries(state.slots)) {
    if (slot.ip === ip) { freed.push(slot); delete state.slots[ticket]; }
  }
  return freed;
}

export function nextWake(state, limits = LIMITS) {
  const times = [...Object.values(state.slots).map((s) => endsAt(s, limits)), ...(state.line || []).map((w) => w.lastSeen + limits.lineMs)];
  return times.length ? Math.min(...times) : null;
}
