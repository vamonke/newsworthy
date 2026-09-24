import { Gate } from './gate.js';
import { Round } from './round.js';
import { MODEL } from './reactor.js';

export { Gate, Round };

const reply = (status, body, headers = {}) => Response.json(body, { status, headers });
const LIMITS = { token: 1024, session: 20_000, photo: 1_900_000, save: 2 * 1024 * 1024 };

async function readJson(request, limit) {
  const text = await request.text();
  if (text.length > limit) throw new Error('Request too large');
  return JSON.parse(text || '{}');
}

// Cloudflare Turnstile. Enforced only when TURNSTILE_SECRET is set; /api/status then gives the game the site key.
async function human(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || !token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET); form.append('response', token); form.append('remoteip', ip);
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form }).then((r) => r.json()).catch(() => ({}));
  return result.success === true;
}

async function api(request, env, path, ip) {
  const gate = env.GATE.get(env.GATE.idFromName('gate'));
  if (path === 'status' && request.method === 'GET') {
    const { active, slots } = await gate.status();
    return reply(200, { configured: Boolean(env.REACTOR_API_KEY), model: MODEL, activeSessions: active, slots, turnstile: env.TURNSTILE_SECRET ? env.TURNSTILE_SITE_KEY : null });
  }
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return reply(403, { error: 'Invalid origin' });
  if (env.API_LIMITER && !(await env.API_LIMITER.limit({ key: ip })).success) return reply(429, { error: 'Too many requests. Slow down a little.' });

  if (path === 'token') {
    const body = await readJson(request, LIMITS.token);
    // A player waiting in line checks in every few seconds with their ticket. The Gate checks the
    // ticket, so only a first request counts toward the new-round limit and needs the bot check.
    const ticket = typeof body.ticket === 'string' && body.ticket.length <= 64 ? body.ticket : null;
    if (!ticket && env.TOKEN_LIMITER && !(await env.TOKEN_LIMITER.limit({ key: ip })).success) return reply(429, { error: 'Too many new rounds. Wait a minute and try again.' });
    if (!ticket && !(await human(env, body.turnstile, ip))) return reply(403, { error: 'The bot check didn’t go through. Try again.' });
    const result = await gate.open(ip, ticket);
    if (result.jwt) return reply(200, { jwt: result.jwt });
    // This wording keeps the game's "stop the previous session" button working.
    if (result.error === 'ip') return reply(409, { error: 'Another live session is still open. Stop it before starting another.' });
    if (result.error === 'daily') return reply(503, { error: 'Newsworthy has reached today’s limit. Come back tomorrow.' });
    if (result.error === 'line') return reply(429, { error: 'You’re already waiting in line in another tab.' });
    if (result.error === 'expired') return reply(410, { error: 'You lost your place in line. Try again.' });
    if (result.error === 'full') return reply(503, { error: 'Lots of people are playing right now. Try again in a few minutes.' }, { 'Retry-After': '60' });
    // Busy: the player is in line. The game shows their place and checks in again with the ticket.
    return reply(503, { error: 'All live cameras are in use. You’re in line.', queue: result.queue }, { 'Retry-After': String(result.retryAfter) });
  }
  if (path === 'session' || path === 'cleanup') {
    const { sessionId, jwt } = await readJson(request, LIMITS.session);
    if (typeof sessionId !== 'string' || sessionId.length > 200 || typeof jwt !== 'string') return reply(400, { error: 'Unknown live session' });
    if (path === 'cleanup') { await gate.cleanup(sessionId, jwt); return reply(200, { stopped: true }); }
    if (!(await gate.register(sessionId, jwt))) return reply(400, { error: 'Unknown live session' });
    return reply(200, { registered: true });
  }
  if (path === 'stop-sessions') { await gate.stopIp(ip); return reply(200, { stopped: true }); }
  if (path === 'news-round') {
    // Only a live session (handed out after the bot check) can open a round, once.
    const { jwt } = await readJson(request, LIMITS.session);
    if (typeof jwt !== 'string' || !(await gate.claimRound(jwt))) return reply(403, { error: 'Start a live session before a round.' });
    const id = env.ROUND.newUniqueId();
    return reply(200, await env.ROUND.get(id).start(id.toString()));
  }
  if (path === 'news-photo') {
    const photo = await readJson(request, LIMITS.photo);
    if (typeof photo.roundId !== 'string' || !/^[0-9a-f]{64}$/.test(photo.roundId)) return reply(400, { error: 'Round expired. Start a new round.' });
    return reply(200, await env.ROUND.get(env.ROUND.idFromString(photo.roundId)).judgePhoto(photo));
  }
  if (path === 'save') {
    // The game posts its whole event log each time; only the newest event is recorded.
    // blob1 = event type, blob2 = command, blob3 = error message (photo_failed).
    const log = await readJson(request, LIMITS.save);
    const event = log.events?.at?.(-1);
    if (env.EVENTS && typeof log.id === 'string' && event?.type) {
      env.EVENTS.writeDataPoint({ indexes: [log.id.slice(0, 96)], blobs: [String(event.type).slice(0, 64), String(event.command || '').slice(0, 64), String(event.error || '').slice(0, 200)], doubles: [Number(event.queueMs ?? event.ackMs ?? 0)] });
    }
    return reply(200, { saved: true });
  }
  // Leaderboard (planned, not built): POST /api/score {roundId, name} reads the total from the
  // Round object, never from the browser, and stores it in D1; GET /api/leaderboard serves the table.
  return reply(404, { error: 'Not found' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      try { return await api(request, env, url.pathname.slice(5), ip); }
      catch (error) {
        // Workers Logs keeps this; the player only sees the short message.
        console.error(`/api/${url.pathname.slice(5)} failed:`, error?.message, error?.detail || '', error?.stack || '');
        return reply(502, { error: error?.message || 'Something went wrong' });
      }
    }
    if (url.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/news-design.html', url), request));
    return env.ASSETS.fetch(request);
  },
};
