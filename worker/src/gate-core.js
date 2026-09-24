// Live-session slot bookkeeping, kept free of I/O so it can be unit tested.
// Reactor allows 5 sessions at once per account; 4 slots leave one free for testing.
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
};

export const emptyState = () => ({ slots: {}, line: [], day: '', opened: 0 });

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
  state.slots[ticket] = { ip, jwt: null, sessionId: null, until: now + limits.holdMs };
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

const waiting = (state, i, limits) => ({ error: 'busy', retryAfter: Math.ceil(limits.pollMs / 1000), queue: { ticket: state.line[i].ticket, position: i + 1, ahead: i } });

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
    if (i >= free) return waiting(state, i, limits);
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
  return waiting(state, state.line.length - 1, limits);
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
