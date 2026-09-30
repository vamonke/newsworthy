import { Gate } from './gate.js';
import { Round } from './round.js';
import { GeminiRelay } from './relay.js';
import { Monitor, report, health, scheduledChecks } from './monitor.js';
import { MODEL } from './reactor.js';
import { toDataPoint, playerId, SERVER_EVENT_TYPES } from './events.js';
import { TOP, RANK, ROUND, BEST, SOLD, ROUND_PHOTOS, weekStart, toBoard, toSold, listsPhoto } from './leaderboard.js';

// Records an analytics event from the Worker itself, e.g. demand for live slots.
async function record(env, request, ip, event) {
  const point = toDataPoint(event, await playerId(env.PLAYER_SALT, ip), SERVER_EVENT_TYPES, request.cf?.country);
  if (point) env.EVENTS?.writeDataPoint(point);
}

export { Gate, Round, GeminiRelay, Monitor };

// Round events the Monitor uses to tell whether live video starts.
const VIDEO_EVENTS = new Set(['first_video_frame', 'photo_captured', 'start_failed', 'closed']);

const reply = (status, body, headers = {}) => Response.json(body, { status, headers });
const ROUND_ID = /^[0-9a-f]{64}$/;
const LIMITS = { token: 4096, session: 20_000, photo: 1_900_000, event: 2048 };

async function readJson(request, limit) {
  const text = await request.text();
  if (text.length > limit) throw new Error('Request too large');
  return JSON.parse(text || '{}');
}

// Cloudflare Turnstile. Enforced only when TURNSTILE_SECRET is set; /api/status then gives the game the site key.
// A matching secret pass (TURNSTILE_BYPASS) skips it, so a test browser that Turnstile blocks can still play.
async function samePass(pass, secret) {
  if (typeof pass !== 'string' || !secret || pass.length > 200) return false;
  const [a, b] = await Promise.all([pass, secret].map((v) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
  return crypto.subtle.timingSafeEqual(a, b);
}

async function human(env, token, ip, pass) {
  if (!env.TURNSTILE_SECRET) return true;
  if (await samePass(pass, env.TURNSTILE_BYPASS)) { console.log('Turnstile skipped with the secret pass'); return true; }
  if (typeof token !== 'string' || !token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET); form.append('response', token); form.append('remoteip', ip);
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form }).then((r) => r.json()).catch(() => ({}));
  return result.success === true;
}

async function api(request, env, path, ip, ctx) {
  const gate = env.GATE.get(env.GATE.idFromName('gate'));
  if (path === 'status' && request.method === 'GET') {
    // waiting and wait (seconds) are shown under Start shooting, before the player joins the line.
    const { active, slots, waiting, wait } = await gate.status();
    return reply(200, { configured: Boolean(env.REACTOR_API_KEY), model: MODEL, activeSessions: active, slots, waiting, wait, turnstile: env.TURNSTILE_SECRET ? env.TURNSTILE_SITE_KEY : null });
  }
  if (path === 'health' && request.method === 'GET') {
    // Which production checks are failing, without details; the daily health check reads it. See DEPLOYMENT.md, "Alerts".
    if (env.API_LIMITER && !(await env.API_LIMITER.limit({ key: ip })).success) return reply(429, { error: 'Too many requests. Slow down a little.' });
    return reply(200, await health(env), { 'Cache-Control': 'no-store' });
  }
  if (path === 'leaderboard' && request.method === 'GET') {
    if (env.API_LIMITER && !(await env.API_LIMITER.limit({ key: ip })).success) return reply(429, { error: 'Too many requests. Slow down a little.' });
    // Top 10, each player's best round: ?board=week (the default, since Monday 00:00 UTC) or ?board=all.
    // The viewer is found by their player id, so their row is marked after a refresh too. ?round= (sent from
    // the results popup) marks that round instead, when it's on this board, and also covers a round with no player id.
    const params = new URL(request.url).searchParams;
    const since = params.get('board') === 'all' ? 0 : weekStart(Date.now());
    const round = params.get('round');
    const viewer = await playerId(env.PLAYER_SALT, ip);
    const posted = ROUND_ID.test(round || '') ? await env.SCORES.prepare(ROUND).bind(round).first() : null;
    const mine = (posted && posted.created >= since ? posted : null)
      || (posted && await env.SCORES.prepare(BEST).bind(posted.player, since).first())
      || (viewer && await env.SCORES.prepare(BEST).bind(viewer, since).first()) || null;
    const { results } = await env.SCORES.prepare(TOP).bind(since).all();
    const rank = mine ? (await env.SCORES.prepare(RANK).bind(mine.player, mine.total, since).first()).rank : null;
    // `asked` tells the results popup that `you` is the round it asked about, so it can add this round's
    // latest total to the player's lifetime earnings without counting it twice.
    const board = toBoard(results, mine, rank);
    if (board.you && posted && mine === posted) board.you.asked = true;
    return reply(200, board, { 'Cache-Control': 'no-store' });
  }
  if (path === 'sold' && request.method === 'GET') {
    // The latest sold photos, for the "just sold" pop-up. Open games check every 15 s; one D1 read per 10 s
    // per Cloudflare location answers all of them.
    if (env.API_LIMITER && !(await env.API_LIMITER.limit({ key: ip })).success) return reply(429, { error: 'Too many requests. Slow down a little.' });
    // The browser gets no-store: a cached copy comes back from the Cache API with the zone's Browser Cache TTL
    // (4 h) in its Cache-Control, which would freeze the feed in the browser. The 10 s is for this cache only.
    const key = new Request(new URL('/api/sold', request.url));
    const cached = await caches.default.match(key);
    if (cached) return new Response(cached.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    const body = JSON.stringify(toSold((await env.SCORES.prepare(SOLD).all()).results));
    ctx.waitUntil(caches.default.put(key, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=10' } })));
    return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  const photoPath = request.method === 'GET' && path.match(/^photo\/([0-9a-f]{64})\/(shot-[0-9]{1,2})\.jpg$/);
  if (photoPath) {
    // Only photos that a leaderboard round sold.
    const [, round, id] = photoPath;
    if (!listsPhoto(await env.SCORES.prepare(ROUND_PHOTOS).bind(round).first(), id)) return reply(404, { error: 'Not found' });
    const object = await env.PHOTOS.get(`rounds/${round}/${id}.jpg`);
    if (!object) return reply(404, { error: 'Not found' });
    return new Response(object.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
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
    if (!ticket && !(await human(env, body.turnstile, ip, body.pass))) return reply(403, { error: 'The bot check didn’t go through. Try again.' });
    const result = await gate.open(ip, ticket);
    // Demand for live slots, for showing how many people wanted to play. The game sends its page session and run id.
    const ids = { session: typeof body.session === 'string' ? body.session : 'none', run: body.run };
    if (result.jwt) await record(env, request, ip, { ...ids, type: 'slot_opened', label: ticket ? 'line' : 'direct' });
    else if (result.queue && !ticket) await record(env, request, ip, { ...ids, type: 'line_joined', value: result.queue.position });
    else if (result.error === 'full' || result.error === 'daily') await record(env, request, ip, { ...ids, type: 'turned_away', label: result.error });
    // The Monitor checks that rounds given a slot get live video (see monitor-core.js).
    if (result.jwt && typeof body.run === 'string') ctx.waitUntil(report(env, 'slotOpened', body.run.slice(0, 80)));
    if (result.jwt) return reply(200, { jwt: result.jwt });
    // `code` lets the game show its own title and note for each case (newsworthy.js, CANT_START).
    // This wording keeps the game's "stop the previous session" button working.
    if (result.error === 'ip') return reply(409, { error: 'Another live session is still open. Stop it before starting another.', code: 'ip' });
    if (result.error === 'daily') return reply(503, { error: 'Newsworthy has reached today’s limit. Come back tomorrow.', code: 'daily' });
    if (result.error === 'line') return reply(429, { error: 'You’re already waiting in line in another tab.', code: 'line' });
    if (result.error === 'expired') return reply(410, { error: 'You lost your place in line. Try again.', code: 'expired' });
    if (result.error === 'full') return reply(503, { error: 'The line is full. Try again in a few minutes.', code: 'full' }, { 'Retry-After': '60' });
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
  if (path === 'alive') {
    // The game checks in every 10 s while it holds a live slot; see alive() in gate-core.js.
    const { jwt } = await readJson(request, LIMITS.session);
    if (typeof jwt !== 'string' || !(await gate.alive(jwt))) return reply(410, { error: 'This live session has ended.' });
    return reply(200, { alive: true });
  }
  if (path === 'stop-sessions') { await gate.stopIp(ip); return reply(200, { stopped: true }); }
  if (path === 'news-round') {
    // Only a live session (handed out after the bot check) can open a round, once.
    const { jwt } = await readJson(request, LIMITS.session);
    if (typeof jwt !== 'string' || !(await gate.claimRound(jwt))) return reply(403, { error: 'Start a live session before a round.' });
    const id = env.ROUND.newUniqueId();
    return reply(200, await env.ROUND.get(id).start(id.toString(), await playerId(env.PLAYER_SALT, ip), request.cf?.country));
  }
  if (path === 'news-photo') {
    const photo = await readJson(request, LIMITS.photo);
    if (typeof photo.roundId !== 'string' || !/^[0-9a-f]{64}$/.test(photo.roundId)) return reply(400, { error: 'Round expired. Start a new round.' });
    return reply(200, await env.ROUND.get(env.ROUND.idFromString(photo.roundId)).judgePhoto(photo));
  }
  if (path === 'event') {
    // One analytics event per request; see events.js for the columns.
    const point = toDataPoint(await readJson(request, LIMITS.event), await playerId(env.PLAYER_SALT, ip), undefined, request.cf?.country);
    if (!point) return reply(400, { error: 'Unknown event' });
    env.EVENTS?.writeDataPoint(point);
    const [type, label, , , , run] = point.blobs;
    if (VIDEO_EVENTS.has(type) && run) ctx.waitUntil(report(env, 'roundEvent', { type, run, label, value: point.doubles[0] }));
    return reply(200, { saved: true });
  }
  return reply(404, { error: 'Not found' });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      try { return await api(request, env, url.pathname.slice(5), ip, ctx); }
      catch (error) {
        // Workers Logs keeps this; the player only sees the short message.
        console.error(`/api/${url.pathname.slice(5)} failed:`, error?.message, error?.detail || '', error?.stack || '');
        return reply(502, { error: error?.message || 'Something went wrong' });
      }
    }
    if (url.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/news-design.html', url), request));
    return env.ASSETS.fetch(request);
  },
  // The Cron Trigger in wrangler.jsonc: checks photo scoring and Reactor (see monitor.js).
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(scheduledChecks(env, controller.scheduledTime));
  },
};
