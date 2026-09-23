// Live-session slot bookkeeping, kept free of I/O so it can be unit tested.
// Reactor allows 5 sessions at once per account; 4 slots leave one free for testing.
export const LIMITS = {
  slots: 4,
  perIp: 2,
  dailyCap: 500,
  holdMs: 90_000, // a token must register its session within this time
  sessionMs: 240_000, // matches max_session_duration_seconds on the token
  graceMs: 15_000,
};

export const emptyState = () => ({ slots: {}, day: '', opened: 0 });

// Removes slots whose time is up and returns them so the caller can end their Reactor sessions.
export function sweep(state, now) {
  const expired = [];
  for (const [ticket, slot] of Object.entries(state.slots)) {
    if (slot.until <= now) { expired.push(slot); delete state.slots[ticket]; }
  }
  return expired;
}

export function reserve(state, ip, now, limits = LIMITS) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.opened = 0; }
  const slots = Object.values(state.slots);
  if (state.opened >= limits.dailyCap) return { error: 'daily' };
  if (slots.filter((s) => s.ip === ip).length >= limits.perIp) return { error: 'ip' };
  if (slots.length >= limits.slots) {
    const soonest = Math.min(...slots.map((s) => s.until));
    return { error: 'busy', retryAfter: Math.max(1, Math.ceil((soonest - now) / 1000)) };
  }
  const ticket = crypto.randomUUID();
  state.slots[ticket] = { ip, jwt: null, sessionId: null, until: now + limits.holdMs };
  state.opened++;
  return { ticket };
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

export function nextWake(state) {
  const times = Object.values(state.slots).map((s) => s.until);
  return times.length ? Math.min(...times) : null;
}
