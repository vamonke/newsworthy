# Newsworthy in production

Read this before deploying, changing `worker/`, or touching anything about live sessions, keys, limits or the domain.

- **Live:** https://newsworthy.vamonke.com (also https://newsworthy.vamonke.workers.dev)
- **Host:** Cloudflare only. Worker `newsworthy` on the Cloudflare account `vamonke` (`6fd560e6892546be11ef30883a03dd71`), the same account as `hospital.vamonke.com`.
- **Went live:** 2026-09-24.
- **Architecture page:** https://claude.ai/artifact/Auwh4ZzZ8W8J2NxYUWSmob (private to Varick). It was written before the build, so where they differ, this file is correct.

## How it fits together

```
Browser ──HTTPS──▶ Worker "newsworthy" (worker/src/index.js)
   │                 ├─ Static Assets: the Vite build (orbis-motion-test/dist)
   │                 ├─ /api/token, /session, /cleanup, /stop-sessions ─▶ Gate Durable Object (one for the whole game)
   │                 ├─ /api/news-round, /news-photo ─▶ Round Durable Object (one per round) ─▶ Gemini API
   │                 ├─ /api/save ─▶ Analytics Engine dataset "newsworthy_events"
   │                 └─ Turnstile check + rate limits before a live slot is given out
   └──WebRTC video, straight to Reactor (never through Cloudflare)
```

Reactor (live video) and Gemini (photo judge) are the only services outside Cloudflare. The keys for both stay on the Worker.

| Piece | File | What it does |
|---|---|---|
| Router | `worker/src/index.js` | Serves the game, handles `/api/*`, checks the origin, rate limits (6 new rounds a minute and 240 API calls a minute per address) and Turnstile. `/` serves `news-design.html`. |
| Gate | `worker/src/gate.js`, logic in `gate-core.js` | 4 live slots and a first-come-first-served line. Each address can hold 2 places. A waiting ticket expires after 15 s without a check-in. A token that never starts a session loses its slot after 90 s. A session keeps its slot for 240 s + 15 s, then the Gate's alarm ends it with Reactor. There's a cap of 500 sessions a day. "Stop previous session" ends only the caller's own sessions. |
| Round | `worker/src/round.js` | Runs `createNewsJudge` from `orbis-motion-test/news-judge-api.js` for one round and saves after every photo (`snapshot`/`restore`), because idle Durable Objects are dropped from memory. Stored for 1 hour. |
| Reactor client | `worker/src/reactor.js` | Mints tokens with `max_sessions: 1` and `max_session_duration_seconds: 240`, and deletes sessions. |
| Config | `worker/wrangler.jsonc` | Bindings, the custom domain route, the vars `LIVE_SLOTS`, `SLOTS_PER_IP`, `DAILY_SESSION_CAP` and `TURNSTILE_SITE_KEY`. |
| Deploy filter | `orbis-motion-test/public/.assetsignore` | Keeps unused public files (brand concepts, old opening images, `preview.webm`) out of the upload. |

The local Vite dev server (`orbis-motion-test/newsworthy.vite.config.js`) still has its own in-memory copy of the API for local play. It allows one session at a time and has no line or Turnstile. Changes to the API usually need making in both places.

## Limits that drive the design

- **Reactor:** 5 concurrent sessions per account, shared by every key, and 10 new sessions a minute (3 back-to-back, then about 1 every 6 s). Going over returns 429. Source: https://docs.reactor.inc/resources/rate-limits. We use 4 slots so one is left for testing. To raise the limit, email support@reactor.inc, then change `LIVE_SLOTS`.
- **Rounds:** each round opens its own Reactor session and closes it at the end, so the 4-minute cap applies to a single round (up to 2 min loading plus the 2-minute round).
- **Workers Static Assets:** 25 MiB per file.

## Secrets

These are set on the Worker with `wrangler secret`, never committed:

- `REACTOR_API_KEY`
- `GEMINI_API_KEY`
- `TURNSTILE_SECRET`: from the Turnstile widget "Newsworthy", which allows `newsworthy.vamonke.com`, `newsworthy.vamonke.workers.dev` and `localhost`. The site key is public and lives in `wrangler.jsonc`.

For local runs, the same three keys go in `worker/.dev.vars`, which git ignores. The Reactor and Gemini values are also in the root `.env.local`.

## Deploy

**Always deploy from a clean copy of `origin/main`.** Other agents leave unfinished work uncommitted in the shared checkout, and a build from there ships it.

```bash
git fetch && git worktree add --detach /tmp/nw-deploy origin/main
cd /tmp/nw-deploy && npm ci && (cd worker && npm ci)
npm run build:newsworthy
cd worker && npx wrangler deploy
cd / && git -C ~/dev/misc/newsworthy worktree remove --force /tmp/nw-deploy
```

After deploying, check that `curl -s https://newsworthy.vamonke.com/api/status` shows `configured: true` and the `turnstile` key. Then check that `curl -s -X POST -d '{}' https://newsworthy.vamonke.com/api/token` is refused with the bot-check message.

## Take it down or roll back

Run these from `worker/`:

| Situation | Command | Effect |
|---|---|---|
| Stop Reactor spending, keep the site up | `npx wrangler secret delete REACTOR_API_KEY` | New rounds fail with an error. Put the key back with `npx wrangler secret put REACTOR_API_KEY`. |
| Fewer players at once | change `LIVE_SLOTS` in `wrangler.jsonc`, then deploy | Changes the slot count. `0` isn't supported; use the line above instead. |
| Bad deploy | `npx wrangler rollback` | Switches back to the previous version. |
| Take the site offline | `npx wrangler delete` | Removes the Worker, its domain and its secrets. Redeploying needs all three secrets again. |

The dashboard can do all of these under Workers & Pages → newsworthy.

## Watching it

- `npx wrangler tail newsworthy` streams live requests and errors (run from `worker/`).
- Workers Logs and metrics are in the dashboard, because `observability` is on.
- `curl -s https://newsworthy.vamonke.com/api/status` shows slots in use.
- Game events go to the Analytics Engine dataset `newsworthy_events`: index = run id, blobs = event type and command, double = ms.

## Testing locally

- **Run the Worker locally.** Run `npm run build:newsworthy` at the repo root, then `npx wrangler dev --port 8787 --ip 127.0.0.1` in `worker/`. Or use the `newsworthy-worker` entry in `.claude/launch.json`.
- **Unit tests.** Run `cd worker && npm test` for the Gate and line, and `npm run test:newsworthy` for the judge, including save/restore.
- **Turnstile blocks automated browsers** (error 600010), so it can't be passed from a test browser. To test the flow, use Cloudflare's always-pass pair: site key `1x00000000000000000000AA` (via `--var TURNSTILE_SITE_KEY:...`) and secret `1x0000000000000000000000000000000AA` in `.dev.vars`. Put the real secret back afterwards. Requests that carry a waiting-line `ticket` skip Turnstile.
- **Test the Gate for free.** Minting Reactor tokens with curl costs nothing, and you can pretend to be different players with the `CF-Connecting-IP` header. Only a real browser round uses Reactor time.

## Lessons from launch

- **Secrets reach every copy of the Worker a few seconds after a deploy.** Right after the first deploy, one `/api/token` request got through without Turnstile. It only happens on a first deploy; later deploys keep the existing secrets.
- **Browsers pause animations in hidden or covered windows.** Photos used to wait for the shutter flash before being sent, so they stalled in background tabs. `shutter()` in `newsworthy-motion.js` now gives up after 300 ms.
- **Durable Objects are dropped from memory after about 70–140 s idle.** The stream can take up to 2 minutes to load before the first photo, so rounds must stay saved in storage.

## Not built yet

- **Leaderboard.** `POST /api/score {roundId, name}` should read the total from the Round object, never from the browser, and store it in D1. `GET /api/leaderboard` then serves the table. The popup in `news-design.html` is a placeholder, and there are notes in `worker/src/index.js` and `newsworthy.vite.config.js`.
- **Estimated wait in the line.**
- **Retrying a failed line check-in.** Right now one network error ends the wait.
- **AI Gateway in front of Gemini**, for logs and a spend cap.
