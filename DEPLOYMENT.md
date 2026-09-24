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
   │                 │                                   (via GeminiRelay in the US if Gemini refuses the round's location)
   │                 ├─ /api/save ─▶ Analytics Engine dataset "newsworthy_events"
   │                 └─ Turnstile check + rate limits before a live slot is given out;
   │                    a round (and so the photo judge) needs that live slot's token
   └──WebRTC video, straight to Reactor (never through Cloudflare)
```

Reactor (live video) and Gemini (photo judge) are the only services outside Cloudflare. The keys for both stay on the Worker.

| Piece | File | What it does |
|---|---|---|
| Router | `worker/src/index.js` | Serves the game, handles `/api/*`, checks the origin, rate limits (6 new rounds a minute and 240 API calls a minute per address) and Turnstile. `/api/news-round` needs the live-session token from `/api/token` and opens one round per token, so the photo judge sits behind the same Turnstile check. `/` serves `news-design.html`. |
| Gate | `worker/src/gate.js`, logic in `gate-core.js` | 4 live slots and a first-come-first-served line. Each address can hold 2 places. A waiting ticket expires after 15 s without a check-in. A token that never starts a session loses its slot after 90 s. A session keeps its slot for 240 s + 15 s, then the Gate's alarm ends it with Reactor. While it holds a slot the game checks in every 10 s (`/api/alive`); a slot whose check-ins stop for 40 s is ended, because browsers don't send the goodbye cleanup when a tab is destroyed. There's a cap of 500 sessions a day. "Stop previous session" ends only the caller's own sessions. |
| Round | `worker/src/round.js` | Runs `createNewsJudge` from `orbis-motion-test/news-judge-api.js` for one round and saves after every photo (`snapshot`/`restore`), because idle Durable Objects are dropped from memory. Stored for 1 hour. |
| Reactor client | `worker/src/reactor.js` | Mints tokens with `max_sessions: 1` and `max_session_duration_seconds: 240`, and deletes sessions. |
| Config | `worker/wrangler.jsonc` | Bindings, the custom domain route, the vars `LIVE_SLOTS`, `SLOTS_PER_IP`, `DAILY_SESSION_CAP` and `TURNSTILE_SITE_KEY`. |
| Deploy filter | `orbis-motion-test/public/.assetsignore` | Keeps unused public files (brand concepts, old opening images, `preview.webm`) out of the upload. |

The local Vite dev server (`orbis-motion-test/newsworthy.vite.config.js`) still has its own in-memory copy of the API for local play. It allows one session at a time and has no line or Turnstile, but `/news-round` also needs a token from `/token`. Changes to the API usually need making in both places.

## Limits that drive the design

- **Reactor:** 5 concurrent sessions per account, shared by every key, and 10 new sessions a minute (3 back-to-back, then about 1 every 6 s). Going over returns 429. Source: https://docs.reactor.inc/resources/rate-limits. We use 4 slots so one is left for testing. To raise the limit, email support@reactor.inc, then change `LIVE_SLOTS`.
- **Rounds:** each round opens its own Reactor session and closes it at the end, so the 4-minute cap applies to a single round (up to 2 min loading plus the 2-minute round).
- **Workers Static Assets:** 25 MiB per file.

## Secrets

These are set on the Worker with `wrangler secret`, never committed:

- `REACTOR_API_KEY`
- `GEMINI_API_KEY`
- `TURNSTILE_SECRET`: from the Turnstile widget "Newsworthy", which allows `newsworthy.vamonke.com`, `newsworthy.vamonke.workers.dev` and `localhost`. The site key is public and lives in `wrangler.jsonc`.
- `TURNSTILE_BYPASS`: a secret pass that skips Turnstile, so agents' test browsers (which Turnstile blocks) can play in production. Open the game once with `?pass=<value>`; the tab keeps it and removes it from the address bar. The value is in `worker/.dev.vars`. Live-slot and rate limits still apply. To revoke it, run `npx wrangler secret delete TURNSTILE_BYPASS`, or `put` a new value.

For local runs, the same keys go in `worker/.dev.vars`, which git ignores. The Reactor and Gemini values are also in the root `.env.local`.

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
- Game events go to the Analytics Engine dataset `newsworthy_events`: index1 = run id, blob1 = event type, blob2 = command, blob3 = error message, double1 = ms.
- **Analytics Engine samples these rows**, so a round's events can be missing and plain counts undercount. Each row's `_sample_interval` says how many events it stands for: use `sum(_sample_interval)` for totals, and don't expect a complete timeline for one round. For an exact record of one round, use Workers Logs or `wrangler tail`.
- **Failed photo reviews** ("Couldn't review this photo") are recorded as `photo_failed` events, with the message players saw in blob3: `SELECT timestamp, index1, blob3 FROM newsworthy_events WHERE blob1='photo_failed' ORDER BY timestamp DESC`. The cause is in Workers Logs. Each failed Gemini attempt logs `[judge] attempt N failed: …` from the Round Durable Object, with the HTTP status and the start of the body, a timeout, a cancel, or the unreadable or invalid output. Every `/api` error also logs `/api/<path> failed: …` before its 502.

## Bot protection

- **Turnstile** runs in `interaction-only` mode, so most players never see it. The script downloads with the page, and the check runs when the player presses Start. Only `/api/token` (a new live slot) needs it. Players waiting in line check in with their ticket instead.
- **Rounds and the photo judge** sit behind the same check. `/api/news-round` needs the live-slot token from `/api/token` and opens one round per token, and `/api/news-photo` needs that round's id.
- **Secret pass** (`TURNSTILE_BYPASS`): skips Turnstile for agent browsers. See the next section.

## Playing in production (agents)

Turnstile blocks automated browsers (error 600010), so an agent can't pass it. Use the secret pass instead:

1. Read `TURNSTILE_BYPASS` from `worker/.dev.vars`. Git ignores that file, and the same value is set on the Worker.
2. Open `https://newsworthy.vamonke.com/?pass=<value>` in the browser pane. The tab keeps the pass and removes it from the address bar.
3. Press **Start shooting**. The round skips Turnstile, and the Worker logs "Turnstile skipped with the secret pass". A How to play popup can appear over the live round; its button closes it. Pick a scene in the left panel, then click the video to take a photo.
4. Every round uses real Reactor and Gemini time and takes one of the 4 live slots from players. Ask Varick before playing, and keep rounds short.
5. When done, close the tab. With the heartbeat the slot frees itself within about 40 s. The auto-mode permission check blocks calling `/api/stop-sessions` from curl, so don't count on that.

Revoke or rotate the pass with `npx wrangler secret delete TURNSTILE_BYPASS`, or `npx wrangler secret put TURNSTILE_BYPASS` with a new value (update `.dev.vars` too). Slot, line and rate limits still apply with the pass.

## Testing locally

- **Run the Worker locally.** Run `npm run build:newsworthy` at the repo root, then `npx wrangler dev --port 8787 --ip 127.0.0.1` in `worker/`. Or use the `newsworthy-worker` entry in `.claude/launch.json`.
- **Unit tests.** Run `cd worker && npm test` for the Gate and line, and `npm run test:newsworthy` for the judge, including save/restore.
- **Turnstile blocks automated browsers** (error 600010), so it can't be passed from a test browser. To test the flow, use Cloudflare's always-pass pair: site key `1x00000000000000000000AA` (via `--var TURNSTILE_SITE_KEY:...`) and secret `1x0000000000000000000000000000000AA` in `.dev.vars`. Put the real secret back afterwards. Requests that carry a waiting-line `ticket` skip Turnstile.
- **Test the Gate for free.** Minting Reactor tokens with curl costs nothing, and you can pretend to be different players with the `CF-Connecting-IP` header. Only a real browser round uses Reactor time.

## Lessons from launch

- **Gemini refuses some locations, Hong Kong among them.** On 2026-09-24 every photo in one round failed with "Editor unavailable (400)", and Gemini's reply was "User location is not supported for the API use." A Round object calls Gemini from wherever Cloudflare created it, which is near where the player's request landed. Players in Singapore were served from Singapore, Hong Kong and even Madrid. Pinning every round to the US fixed it but made each photo 1.5–3 s slower from Singapore, mostly from carrying the photo across the Pacific. So rounds now stay near the player, and only when Gemini refuses the location does that round send its Gemini calls through `GeminiRelay` (`worker/src/relay.js`), one Durable Object created in western North America. Workers Logs show "Gemini refused this round's location…" and "Relayed a Gemini call from the US" when that happens. To test the relay locally, run `wrangler dev --var GEMINI_RELAY_ALWAYS:1`.
- **Secrets reach every copy of the Worker a few seconds after a deploy.** Right after the first deploy, one `/api/token` request got through without Turnstile. It only happens on a first deploy; later deploys keep the existing secrets.
- **Browsers pause animations in hidden or covered windows.** Photos used to wait for the shutter flash before being sent, so they stalled in background tabs. `shutter()` in `newsworthy-motion.js` now gives up after 300 ms.
- **Durable Objects are dropped from memory after about 70–140 s idle.** The stream can take up to 2 minutes to load before the first photo, so rounds must stay saved in storage.

## Not built yet

- **Leaderboard.** `POST /api/score {roundId, name}` should read the total from the Round object, never from the browser, and store it in D1. `GET /api/leaderboard` then serves the table. The popup in `news-design.html` is a placeholder, and there are notes in `worker/src/index.js` and `newsworthy.vite.config.js`.
- **Estimated wait in the line.**
- **Retrying a failed line check-in.** Right now one network error ends the wait.
- **AI Gateway in front of Gemini**, for logs and a spend cap.
