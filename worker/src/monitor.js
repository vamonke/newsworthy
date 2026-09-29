import { DurableObject } from 'cloudflare:workers';
import { EmailMessage } from 'cloudflare:email';
import { createNewsJudge } from '../../orbis-motion-test/news-judge-api.js';
import { withRelay } from './relay-core.js';
import { relayStub } from './relay.js';
import { reactorAccount, mintToken } from './reactor.js';
import { PROBE_IMAGE } from './probe-image.js';
import * as core from './monitor-core.js';

// One instance for the whole game. It watches real traffic and the scheduled checks, decides what's
// broken (monitor-core.js) and alerts Varick by Telegram and email. See DEPLOYMENT.md, "Alerts".
export class Monitor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.state = { ...core.emptyState(), ...(await ctx.storage.get('state')) }; });
  }

  async apply(list) {
    await this.ctx.storage.put('state', this.state);
    if (!list.length) return;
    const errors = [];
    for (const alert of list) {
      console.log(`[alert] ${alert.text}`);
      errors.push(...await notify(this.env, alert));
    }
    // A broken alert channel shows on /api/health, which the daily health check reads.
    this.state.alertError = errors.join('; ');
    if (errors.length) console.error(`[alert] delivery failed: ${this.state.alertError}`);
    await this.ctx.storage.put('state', this.state);
  }

  photo(result) { return this.apply(core.photo(this.state, result, Date.now())); }
  probe(result) { return this.apply(core.probe(this.state, result, Date.now())); }
  reactor(result) { return this.apply(core.reactor(this.state, result, Date.now())); }
  slotOpened(run) { core.slotOpened(this.state, run, Date.now()); return this.apply([]); }
  roundEvent(event) { return this.apply(core.roundEvent(this.state, event, Date.now())); }
  // Each cron run. Also confirms the alert channels work: a message whenever the configured set changes.
  tick() {
    const list = core.videoCheck(this.state, Date.now());
    const configured = channels(this.env).join(' and ');
    if (!configured) this.state.alertError = 'no alert channel is configured';
    else if (this.state.channels !== configured) {
      this.state.channels = configured;
      list.push({ key: 'setup', kind: 'setup', text: `Newsworthy alerts are on (${configured}). You'll hear here when photo scoring, live video or Reactor breaks, and when it recovers.` });
    }
    return this.apply(list);
  }
  health() { return core.health(this.state, Date.now()); }
}

const monitor = (env) => env.MONITOR.get(env.MONITOR.idFromName('monitor'));

// Sends one report to the Monitor. Never throws: watching must not break the game.
export function report(env, method, arg) {
  if (!env.MONITOR) return Promise.resolve();
  return monitor(env)[method](arg).catch((error) => console.error(`[monitor] ${method} failed:`, error?.message));
}

export const health = (env) => monitor(env).health();

// Sends the alert to every configured channel. Returns the errors, including "no channel configured".
const channels = (env) => [env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID && 'Telegram', env.ALERT_EMAIL && env.ALERT_EMAIL_TO && 'email'].filter(Boolean);

async function notify(env, { text }) {
  const sends = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) sends.push(telegram(env, text));
  if (env.ALERT_EMAIL && env.ALERT_EMAIL_TO) sends.push(email(env, text));
  if (!sends.length) return ['no alert channel is configured'];
  const results = await Promise.allSettled(sends);
  return results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message || String(r.reason));
}

async function telegram(env, text) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  if (!response.ok) throw new Error(`Telegram ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
}

// Through Cloudflare Email Routing: ALERT_EMAIL_TO must be a verified destination address.
async function email(env, text) {
  const from = env.ALERT_EMAIL_FROM || 'alerts@vamonke.com';
  const subject = text.split('\n')[0].replace(/[^\x20-\x7e]/g, '').slice(0, 150);
  const raw = [
    `From: Newsworthy alerts <${from}>`, `To: <${env.ALERT_EMAIL_TO}>`, `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', text, '',
  ].join('\r\n');
  await env.ALERT_EMAIL.send(new EmailMessage(from, env.ALERT_EMAIL_TO, raw));
}

// The same judge code and relay a round uses, on a fixed test photo. Nothing is saved: no Round
// object, R2, D1 or analytics, so it stays off the leaderboard and out of player numbers.
export async function probeJudge(env, path) {
  const fetcher = withRelay((url, init) => fetch(url, init), (url, init) => relayStub(env).fetch(url, init), { always: path === 'relay' });
  // A long backupAfter: one call normally, a second at once only if the first fails, as for players.
  const judge = createNewsJudge(env.GEMINI_API_KEY, fetcher, { backupAfter: 20000 });
  judge.create('probe');
  try {
    const result = await judge.judge({ roundId: 'probe', photoId: 'shot-1', image: PROBE_IMAGE });
    if (!Number.isFinite(result?.value) || typeof result.headline !== 'string') throw Object.assign(new Error('Editor response invalid.'), { detail: `unexpected result: ${JSON.stringify(result).slice(0, 200)}` });
    console.log(`[probe] ${path} ok in ${result.ms} ms: ${result.headline}`);
    return { path, ok: true };
  } catch (error) {
    console.error(`[probe] ${path} failed: ${error?.message} ${error?.detail || ''}`);
    return { path, ok: false, message: error?.message || String(error), detail: error?.detail || '' };
  }
}

// Reactor's balance and recent sessions, and that a token can be minted (free; no session is started).
export async function checkReactor(env) {
  try {
    await mintToken(env.REACTOR_API_KEY, 60);
    return await reactorAccount(env.REACTOR_API_KEY);
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

// The Cron Trigger, every 15 min: the judge probe each time; the relay probe and Reactor once an hour.
export async function scheduledChecks(env, scheduledTime) {
  const hourly = new Date(scheduledTime).getUTCMinutes() < 15;
  const tasks = [probeJudge(env, 'direct').then((r) => report(env, 'probe', r))];
  if (hourly) {
    tasks.push(probeJudge(env, 'relay').then((r) => report(env, 'probe', r)));
    tasks.push(checkReactor(env).then((r) => report(env, 'reactor', r)));
  }
  tasks.push(report(env, 'tick'));
  await Promise.all(tasks);
}
