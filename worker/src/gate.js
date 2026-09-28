import { DurableObject } from 'cloudflare:workers';
import { LIMITS, emptyState, sweep, sweepLine, admit, attach, register, claimRound, alive, holder, release, timeRound, releaseIp, nextWake } from './gate-core.js';
import { mintToken, endSession } from './reactor.js';

// One instance for the whole game: it decides who gets one of the live slots.
export class Gate extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.limits = {
      ...LIMITS,
      slots: Number(env.LIVE_SLOTS) || LIMITS.slots,
      perIp: Number(env.SLOTS_PER_IP) || LIMITS.perIp,
      dailyCap: Number(env.DAILY_SESSION_CAP) || LIMITS.dailyCap,
    };
    ctx.blockConcurrencyWhile(async () => { this.state = { ...emptyState(), ...(await ctx.storage.get('state')) }; });
  }

  async save() {
    await this.ctx.storage.put('state', this.state);
    const wake = nextWake(this.state, this.limits);
    if (wake) await this.ctx.storage.setAlarm(wake); else await this.ctx.storage.deleteAlarm();
  }

  // Slots that have just ended: times their rounds for the wait estimate and ends their Reactor sessions.
  end(slots) {
    for (const slot of slots) timeRound(this.state, slot, Date.now(), this.limits);
    const live = slots.filter((s) => s.sessionId && s.jwt);
    if (live.length) this.ctx.waitUntil(Promise.allSettled(live.map((s) => endSession(s.sessionId, s.jwt))));
  }

  // Returns { jwt }, or { error } where a 'busy' error carries the player's place in line.
  async open(ip, ticket) {
    this.end(sweep(this.state, Date.now(), this.limits));
    const held = admit(this.state, ip, ticket, Date.now(), this.limits);
    await this.save();
    if (held.error) return held;
    try {
      const jwt = await mintToken(this.env.REACTOR_API_KEY, this.limits.sessionMs / 1000);
      attach(this.state, held.ticket, jwt);
      await this.save();
      return { jwt };
    } catch (error) {
      delete this.state.slots[held.ticket];
      await this.save();
      throw error;
    }
  }

  async register(sessionId, jwt) {
    const ok = register(this.state, jwt, sessionId, Date.now(), this.limits);
    if (ok) await this.save();
    return ok;
  }

  async alive(jwt) {
    const ok = alive(this.state, jwt, Date.now());
    if (ok) await this.save();
    return ok;
  }

  async claimRound(jwt) {
    const ok = claimRound(this.state, jwt);
    if (ok) await this.save();
    return ok;
  }

  async cleanup(sessionId, jwt) {
    const slot = holder(this.state, jwt);
    // The slot is already gone when a game whose start failed freed it before Reactor reported the
    // session id. End that late session anyway: it would otherwise hold Reactor's only session.
    if (!slot) { if (sessionId) await endSession(sessionId, jwt); return false; }
    // Hold the slot until Reactor has ended the session, so the next player isn't let in while
    // Reactor still counts it against the per-model limit.
    const id = slot.sessionId || sessionId;
    try { if (id) await endSession(id, jwt); } finally { release(this.state, jwt); timeRound(this.state, slot, Date.now(), this.limits); await this.save(); }
    return true;
  }

  async stopIp(ip) {
    const freed = releaseIp(this.state, ip);
    this.end(freed);
    await this.save();
    return freed.length;
  }

  status() {
    return { active: Object.keys(this.state.slots).length, slots: this.limits.slots };
  }

  async alarm() {
    this.end(sweep(this.state, Date.now(), this.limits));
    sweepLine(this.state, Date.now(), this.limits);
    await this.save();
  }
}
