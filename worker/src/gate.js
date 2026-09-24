import { DurableObject } from 'cloudflare:workers';
import { LIMITS, emptyState, sweep, sweepLine, admit, attach, register, claimRound, release, releaseIp, nextWake } from './gate-core.js';
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

  end(slots) {
    const live = slots.filter((s) => s.sessionId && s.jwt);
    if (live.length) this.ctx.waitUntil(Promise.allSettled(live.map((s) => endSession(s.sessionId, s.jwt))));
  }

  // Returns { jwt }, or { error } where a 'busy' error carries the player's place in line.
  async open(ip, ticket) {
    this.end(sweep(this.state, Date.now()));
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

  async claimRound(jwt) {
    const ok = claimRound(this.state, jwt);
    if (ok) await this.save();
    return ok;
  }

  async cleanup(sessionId, jwt) {
    const slot = release(this.state, jwt);
    if (!slot) return false;
    await this.save();
    const id = slot.sessionId || sessionId;
    if (id) await endSession(id, jwt);
    return true;
  }

  async stopIp(ip) {
    const freed = releaseIp(this.state, ip);
    await this.save();
    this.end(freed);
    return freed.length;
  }

  status() {
    return { active: Object.keys(this.state.slots).length, slots: this.limits.slots };
  }

  async alarm() {
    this.end(sweep(this.state, Date.now()));
    sweepLine(this.state, Date.now(), this.limits);
    await this.save();
  }
}
