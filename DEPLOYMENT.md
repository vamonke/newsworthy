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
   │                 │                                   ├─▶ R2 bucket "newsworthy-photos" (every judged photo)
   │                 │                                   └─▶ D1 database "newsworthy" (the round's score)
   │                 ├─ /api/leaderboard, /api/photo/… ─▶ D1 + R2
   │                 ├─ /api/event ─▶ Analytics Engine dataset "newsworthy_events"
   │                 └─ Turnstile check + rate limits before a live slot is given out;
   │                    a round (and so the photo judge) needs that live slot's token
   └──WebRTC video, straight to Reactor (never through Cloudflare)
```

Reactor (live video) and Gemini (photo judge) are the only services outside Cloudflare. The keys for both stay on the Worker.

| Piece | File | What it does |
|---|---|---|
| Router | `worker/src/index.js` | Serves the game, handles `/api/*`, checks the origin, rate limits (6 new rounds a minute and 240 API calls a minute per address) and Turnstile. `/api/news-round` needs the live-session token from `/api/token` and opens one round per token, so the photo judge sits behind the same Turnstile check. `/` serves `news-design.html`. |
| Gate | `worker/src/gate.js`, logic in `gate-core.js` | Four live slots (`LIVE_SLOTS`, one below Reactor's session limit) and a first-come-first-served line. `/api/status` also returns how many are `waiting` and the `wait` (seconds) for someone joining now; the How to play popup shows the wait and why there is one ("One player at a time. 4 ahead of you.") under its button, which reads Join the line while the game is busy, checking every 10 s while it's open. Players in line see their place and an estimated wait on the loading screen: the round being played is expected to run as much longer as the recent real rounds that got that far did (of the last 20; rounds that ended sooner, mostly players who quit, are left out, since counting them made a round in its last minute look nearly over), and each player ahead then takes the average round (150 s until any are timed). Each address can hold 2 places. Refusals carry a `code` (`ip`, `daily`, `line`, `expired`, `full`) that the game turns into its own title and note. A waiting ticket expires after 15 s without a check-in. A token that never starts a session loses its slot after 90 s, and a game whose start fails frees it at once. When a round ends, the slot is held until Reactor confirms the session is gone, so the next player isn't refused by Reactor's limit. A session keeps its slot for 240 s + 15 s, then the Gate's alarm ends it with Reactor. While it holds a slot the game checks in every 10 s (`/api/alive`); a slot whose check-ins stop for 40 s is ended, because browsers don't send the goodbye cleanup when a tab is destroyed. There's a cap of 500 sessions a day. "Stop previous session" ends only the caller's own sessions. |
| Round | `worker/src/round.js` | Runs `createNewsJudge` from `orbis-motion-test/news-judge-api.js` for one round and saves after every photo (`snapshot`/`restore`), because idle Durable Objects are dropped from memory. After each photo it writes the photo to R2 and the round's score to D1. An hour after the round starts it copies itself to R2; nothing is deleted. |
| Leaderboard | `worker/src/leaderboard.js`, schema in `worker/migrations/` | See "Leaderboard and saved photos". |
| Reactor client | `worker/src/reactor.js` | Mints tokens with `max_sessions: 1` and `max_session_duration_seconds: 240`, and deletes sessions. Reads the balance and recent sessions for the alerts. |
| Monitor | `worker/src/monitor.js`, logic in `monitor-core.js` | Checks photo scoring every 15 min and Reactor hourly (Cron Trigger), watches real photo reviews and rounds, and alerts Varick by Telegram and email. See "Alerts". |
| Config | `worker/wrangler.jsonc` | Bindings, the custom domain route, the vars `LIVE_SLOTS`, `SLOTS_PER_IP`, `DAILY_SESSION_CAP` and `TURNSTILE_SITE_KEY`. |
| Deploy filter | `orbis-motion-test/public/.assetsignore` | Keeps unused local-only public files (brand concepts, old opening images, `preview.webm`) out of the upload. |

The local Vite dev server (`orbis-motion-test/newsworthy.vite.config.js`) still has its own in-memory copy of the API for local play. It allows one session at a time and has no line or Turnstile, but `/news-round` also needs a token from `/token`. Changes to the API usually need making in both places.

## Limits that drive the design

- **Reactor:** **5 concurrent sessions** for the account (`concurrent_sessions`), and 10 new sessions a minute (3 back-to-back, then about 1 every 6 s). Rate limits return 429. Until 2026-09-29 the account also had `concurrent_sessions_per_model` = 1 for `visko-orbis-stable`, which isn't in Reactor's docs (https://docs.reactor.inc/resources/rate-limits only lists the 5); Reactor removed it on request. Read the account's real quotas with:

  ```bash
  RK=$(grep -h REACTOR_API_KEY worker/.dev.vars | cut -d= -f2- | tr -d '"')
  A=$(curl -s https://api.reactor.inc/me -H "Reactor-API-Key: $RK" | jq -r .account_id)
  curl -s "https://api.reactor.inc/accounts/$A/quotas" -H "Reactor-API-Key: $RK"   # model ids: https://api.reactor.inc/models
  ```

  `LIVE_SLOTS` is 4, one below the quota, so a test round or a session Reactor is still closing doesn't make a player's start fail. It must not be higher than any session limit the quotas show (a `concurrent_sessions_per_model` entry comes back if Reactor sets one): a session over the limit is refused with `quota_exceeded` before it starts, so extra slots only turn waiting in line into failed starts. To raise the limit, email support@reactor.inc (Ahmed, ahmed@reactor.inc, raised it last time), check the quotas above, then change `LIVE_SLOTS`.
- **Rounds:** each round opens its own Reactor session and closes it at the end, so the 4-minute cap applies to a single round (up to 2 min loading plus the 2-minute round).
- **Workers Static Assets:** 25 MiB per file.

## Secrets

These are set on the Worker with `wrangler secret`, never committed:

- `REACTOR_API_KEY`
- `GEMINI_API_KEY`
- `TURNSTILE_SECRET`: from the Turnstile widget "Newsworthy", which allows `newsworthy.vamonke.com`, `newsworthy.vamonke.workers.dev` and `localhost`. The site key is public and lives in `wrangler.jsonc`.
- `PLAYER_SALT`: a random value that keys the hashed IP used to count unique players (see Analytics) and to make up leaderboard names. Without it no player id is recorded. Keep it the same, or players are counted again and every name on the leaderboard changes.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ALERT_EMAIL_TO`: where alerts go. See "Alerts". Without them the checks still run, but `/api/health` shows `alerts: "failing"`.
- `TURNSTILE_BYPASS`: a secret pass that skips Turnstile, so agents' test browsers (which Turnstile blocks) can play in production. Open the game once with `?pass=<value>`; the tab keeps it and removes it from the address bar. The value is in `worker/.dev.vars`. Live-slot and rate limits still apply. To revoke it, run `npx wrangler secret delete TURNSTILE_BYPASS`, or `put` a new value.

For local runs, the same keys go in `worker/.dev.vars`, which git ignores. The Reactor and Gemini values are also in the root `.env.local`.

## Deploy

**Always deploy from a clean copy of `origin/main`.** Other agents leave unfinished work uncommitted in the shared checkout, and a build from there ships it.

```bash
git fetch && git worktree add --detach /tmp/nw-deploy origin/main
cd /tmp/nw-deploy && npm ci && (cd worker && npm ci)
npm run build:newsworthy
cd worker && npx wrangler d1 migrations apply newsworthy --remote   # only does anything when worker/migrations/ has a new file
npx wrangler deploy
cd / && git -C ~/dev/misc/newsworthy worktree remove --force /tmp/nw-deploy
```

After deploying, check that `curl -s https://newsworthy.vamonke.com/api/status` shows `configured: true` and the `turnstile` key. Then check that `curl -s -X POST -d '{}' https://newsworthy.vamonke.com/api/token` is refused with the bot-check message, and that `curl -s https://newsworthy.vamonke.com/api/leaderboard` returns the board.

## Take it down or roll back

Run these from `worker/`:

| Situation | Command | Effect |
|---|---|---|
| Stop Reactor spending, keep the site up | `npx wrangler secret delete REACTOR_API_KEY` | New rounds fail with an error. Put the key back with `npx wrangler secret put REACTOR_API_KEY`. |
| Fewer players at once | change `LIVE_SLOTS` in `wrangler.jsonc`, then deploy | Changes the slot count. `0` isn't supported; use the line above instead. |
| Bad deploy | `npx wrangler rollback` | Switches back to the previous version. The D1 scores and R2 photos aren't touched. |
| Take the site offline | `npx wrangler delete` | Removes the Worker, its domain and its secrets. Redeploying needs every secret in the Secrets list again. The D1 database and R2 bucket are separate and stay. |

The dashboard can do all of these under Workers & Pages → newsworthy.

## Watching it

- `npx wrangler tail newsworthy` streams live requests and errors (run from `worker/`).
- Workers Logs and metrics are in the dashboard, because `observability` is on.
- `curl -s https://newsworthy.vamonke.com/api/status` shows slots in use.
- Game and page events go to Analytics Engine. See Analytics below.
- **Failed photo reviews** ("Couldn't review this photo") are recorded as `photo_failed` events, with the message players saw in blob3: `SELECT timestamp, index1, blob3 FROM newsworthy_events WHERE blob1='photo_failed' ORDER BY timestamp DESC`. The cause is in Workers Logs. Each failed Gemini attempt logs `[judge] attempt N failed: …` from the Round Durable Object, with the HTTP status and the start of the body, a timeout, a cancel, or the unreadable or invalid output. Every `/api` error also logs `/api/<path> failed: …` before its 502.
- **Reading Workers Logs from the terminal.** Wrangler's login can't read them, so use the read-only token "newsworthy logs read" (Workers Observability: Read, vamonke account only), saved on Varick's Mac at `~/.config/newsworthy/cf-logs-token`. If it's lost, roll it under My Profile → API Tokens. Logs keep only a few days. Search the last 2 hours for judge failures:

  ```bash
  LT=$(cat ~/.config/newsworthy/cf-logs-token); NOW=$(($(date +%s)*1000))
  curl -s https://api.cloudflare.com/client/v4/accounts/6fd560e6892546be11ef30883a03dd71/workers/observability/telemetry/query \
    -H "Authorization: Bearer $LT" -H 'Content-Type: application/json' \
    -d "{\"queryId\":\"adhoc\",\"timeframe\":{\"from\":$((NOW-7200000)),\"to\":$NOW},\"view\":\"events\",\"limit\":20,\"parameters\":{\"needle\":{\"value\":\"[judge]\"}}}" \
    | jq -r '.result.events.events[] | "\(.timestamp/1000|floor|todate) \(.source.message // .["$metadata"].message)"'
  ```
- **Gemini `402`** means the prepaid credits ran out (it happened on 26 Sep 2026). Top up at https://ai.studio/projects. No redeploy is needed.
- **Gemini `429` "exceeded its monthly spending cap"** means the project's spend cap was reached (28–29 Sep 2026). Raise it at https://ai.studio/projects → Billing. No redeploy is needed.

## Alerts

The Worker checks itself and messages Varick on Telegram and by email when something breaks, again every hour (every day for Reactor credits and the Reactor API) while it stays broken, and once when it recovers. Added after photo scoring was down for 16½ hours on 28–29 Sep 2026 (see "Lessons from launch").

| Check | How | Alerts when |
|---|---|---|
| Photo scoring | Every 15 min the Cron Trigger runs the real judge code and relay (`createNewsJudge`, `withRelay`) with the production key on a fixed test photo (`worker/src/probe-image.js`). Real players' photo reviews also report to the Monitor from the Round object. | The test photo fails with a billing, key or rejected-request error (402, 429 spending cap, 401/403, other 400s), or twice in a row with one that may pass (timeouts, 5xx, rate limits). Or 3 players' photo reviews in a row fail. Only Gemini failures count, not "Invalid photograph" or "Round expired". |
| The US relay | The same test photo, forced through `GeminiRelay`, hourly. | It fails while the direct path works. |
| Live video | `slot_opened` from `/api/token`, and `first_video_frame`, `photo_captured`, `start_failed` and `closed` from `/api/event`, matched by run id. | The last 3 rounds that got a slot had no video after 3 min. Players who leave in the first minute don't count. |
| Reactor | Hourly: mints a token (free, no session), reads the balance and last 20 sessions from the account API. | Under $20 left, a session open more than 5 min (past the 240 s cap), or the API fails. |

- **Nothing is saved from the test photo.** It doesn't use a Round object, R2, D1 or Analytics Engine, so it's off the leaderboard and out of player numbers, and it never touches Reactor. It costs about 5 small Gemini calls an hour (the 15-min check plus the hourly relay check), each one 160×120 image. Workers Logs show `[probe] direct ok in … ms` or `[probe] … failed: …`.
- **Every alert is in Workers Logs** as `[alert] …`, and delivery failures as `[alert] delivery failed: …`.
- **`GET /api/health`** says which checks are failing, when the test photo last ran and whether the last alert went out: `{"ok":true,"failing":[],"lastProbeAt":"…","probeStale":false,"alerts":"ok"}`. No error details. The daily health check reads it, so it notices if the cron stops (`probeStale`) or alerts can't be delivered (`alerts: "failing"`). The Monitor state is one Durable Object (`MONITOR`, name `monitor`).
- **When a channel is added or changed**, the next cron run sends "Newsworthy alerts are on (Telegram and email)", so a wrong token or address shows up at once.
- **Not covered:** the Worker itself being down (the daily health check covers that), and Reactor video when nobody is playing. A scheduled full round would cover the second, but costs about $1.16 each and takes a live slot from players, so it isn't run; play a round after deploys instead.
- **Test it locally:** `npx wrangler dev --test-scheduled --var ALERT_EMAIL_TO:test@example.com` in `worker/`, then `curl "http://127.0.0.1:8787/__scheduled?cron=*/15+*+*+*+*"`. Wrangler saves the email under `worker/.wrangler/tmp/email/`. Add `--var GEMINI_API_KEY:bad` to see a failure alert. Each run makes real Gemini calls with the `.dev.vars` key.

### Setting up the alert channels

1. **Telegram:** message @BotFather, send `/newbot`, and keep the token. Send your new bot `/start`, then read your chat id from `curl -s https://api.telegram.org/bot<token>/getUpdates | jq '.result[0].message.chat.id'`. In `worker/`: `npx wrangler secret put TELEGRAM_BOT_TOKEN` and `npx wrangler secret put TELEGRAM_CHAT_ID`.
2. **Email** (set up 2026-09-29: Email Routing is on for `vamonke.com`, the alert address is a verified destination and `ALERT_EMAIL_TO` is set; redo only to change the address): in the Cloudflare dashboard, `vamonke.com` → Email → Email Routing → enable it (it adds MX and SPF records; the domain had no MX records, and its old Namecheap SPF record goes). Under Destination addresses, add the address alerts go to and click the link in the verification email. Then `npx wrangler secret put ALERT_EMAIL_TO`. Mail comes from `alerts@vamonke.com` (`ALERT_EMAIL_FROM`). Don't commit the address: the repo is public.
3. Within 15 min you should get "Newsworthy alerts are on" on both.

### Preventing a spend-cap outage

- **Keep the Gemini spend cap well above real spend.** It was SGD 2, which normal play used up in September; it's SGD 50 since 2026-09-29. Check real spend in AI Studio → Billing once a month and keep the cap at 3× or more.
- **Budget alerts in Google Cloud** on project `gen-lang-client-0867812658` (Billing → Budgets & alerts): email at 50%, 80% and 100% of the cap. They come from Google's own spend figures, so they warn before the cap is reached; this Worker can only see the failure.

## Analytics

Why we track, the numbers so far and ready-made queries are in [ANALYTICS.md](ANALYTICS.md). This section is the technical reference.

The game sends every event to `POST /api/event` with `track(type, {run, label, detail, value, value2, value3})` from `orbis-motion-test/newsworthy-track.js`, which uses `sendBeacon` so clicks on outside links still arrive. The Worker (`worker/src/events.js`) accepts only the types it lists, adds the player id, and writes one row to the Analytics Engine dataset `newsworthy_events`.

Columns never change meaning, so old queries keep working. Add new fields in new columns.

| Column | Meaning |
|---|---|
| index1 | run id during a round, otherwise the page session |
| blob1 | event type |
| blob2 | label (see the event table) |
| blob3 | detail: an error or reason |
| blob4 | player id (hashed IP) |
| blob5 | page session: one per browser tab, kept across reloads |
| blob6 | run id: one per round, empty outside a round |
| blob7 | country: Cloudflare's two-letter code for the player's IP (since 2026-09-27) |
| double1 | value (see the event table) |
| double2 | value2 (see the event table; 0 when unused, since 2026-09-27) |
| double3 | value3 (see the event table; 0 when unused, since 2026-09-27) |

| Event | When | label | detail | value |
|---|---|---|---|---|
| `page_opened` | the game page loads | referring site's hostname, empty if none | | |
| `link_clicked` | a link with `data-track` is clicked | the link's `data-track` name | | |
| `slot_opened` | the Worker hands out a live slot | `direct`, or `line` after waiting | | |
| `line_joined` | all slots are busy and the player joins the line | | | place in line |
| `turned_away` | the line is full, or today's cap is reached | `full` or `daily` | | |
| `command_sent` | a command is sent to the live video | command | | ms spent queued |
| `command_ack` | the live video confirms a command | command | | ms to confirm |
| `model_error` | the live video rejects a command | | reason | |
| `incident_clicked` | the player picks a scene | scene name | | |
| `first_video_frame` | live video starts | | | seconds since the slot opened (loading time) |
| `photo_captured` | a photo is taken | photo id | | |
| `photo_result` | a photo is reviewed | photo id | | dollars earned |
| `photo_failed` | a photo couldn't be reviewed | photo id | message the player saw | |
| `start_failed` | a round couldn't start (from 2026-09-28) | | the error, e.g. Reactor's `quota_exceeded` | |
| `closed` | the round's live session closes; only rounds that opened a Reactor session (from 2026-09-28) | `ended` (round finished or stopped in the game), `left` (page closed mid-round) or `failed` (the start failed after the session opened) | | seconds since the slot opened (Reactor time used) |
| `stream_fps` | with `closed`, if live video played | as `closed` | | average frames per second the player saw. value2: % of seconds under 5 fps. value3: average fps over the first 15 seconds |
| `slow_video` | the slow video notice shows or goes away | `started` or `ended` | | seconds of live video so far |

`slot_opened`, `line_joined` and `turned_away` are recorded by the Worker in `/api/token`, not by the game, and `/api/event` refuses them (`SERVER_EVENT_TYPES` in `events.js`). The game sends its page session and run id with `/api/token` so they join the round's other events. Time spent waiting is the gap between `line_joined` and `slot_opened` for the same session, and a `line_joined` with no `slot_opened` after it is a player who gave up.

The Reactor links carry `utm_source=newsworthy&utm_medium=referral` and `utm_content` for the spot (`ticker`, `how_it_works`), so Reactor can see these visits in its own analytics.

The link names are `header_profile`, `header_github`, `ticker_hire_me`, `ticker_reactor`, `ticker_nicky_case` and `how_it_works_visko_orbis`.

**To track something new**, add its type to `EVENT_TYPES` in `worker/src/events.js`, call `track()` (or `city.record()` inside a round, which adds the run id), and add a row to the table above. For a new link, add `data-track="<name>"` to the `<a>`; nothing else is needed. The Worker refuses unknown types, so a new type only records after the Worker is deployed.

- **Frame rate** is counted from the frames the page shows (`requestVideoFrameCallback`, `orbis-motion-test/newsworthy-fps.js`), once a second while the tab is visible. It measures what reached the player, not what Reactor generated: on 2026-09-27 the stream from Singapore ran at 2–3 fps while Reactor's own recording of the same sessions ran at 18. The game shows a "slow video" notice after 5 seconds in a row under 5 fps and hides it after 5 seconds in a row at 8 fps or more.
- **Unique players:** blob4 is the first 16 hex characters of an HMAC-SHA256 of the player's IP, keyed with `PLAYER_SALT`, so it's the same for one IP across rounds and days but the IP can't be recovered from it. People sharing a network count as one player, and one person on two networks counts as two. Changing `PLAYER_SALT` gives everyone new ids.
- **Rows from before 2026-09-25** came from the old `/api/save`: index1 was the run id, blob2 the command, blob3 the error and double1 the ms, as now, but blob4 to blob6 are empty and there is no `page_opened` or `link_clicked`.
- **Analytics Engine samples rows**, so plain counts undercount. Each row's `_sample_interval` says how many events it stands for: use `sum(_sample_interval)` for totals, and don't expect a complete timeline for one round. For an exact record of one round, use Workers Logs or `wrangler tail`.
- **Querying:** the SQL API works with wrangler's login token (run `npx wrangler whoami` first if it has expired):

```bash
TOKEN=$(grep oauth_token ~/Library/Preferences/.wrangler/config/default.toml | cut -d'"' -f2)
curl -s https://api.cloudflare.com/client/v4/accounts/6fd560e6892546be11ef30883a03dd71/analytics_engine/sql \
  -H "Authorization: Bearer $TOKEN" \
  -d "SELECT blob2 AS link, sum(_sample_interval) AS clicks, count(DISTINCT blob4) AS players FROM newsworthy_events WHERE blob1='link_clicked' GROUP BY link ORDER BY clicks DESC FORMAT JSONEachRow"
```

Unique players: `SELECT count(DISTINCT blob4) FROM newsworthy_events WHERE blob4 != ''`. Visitors who never started a round: sessions with `page_opened` but no `first_video_frame`.

## Bot protection

- **Turnstile** runs in `interaction-only` mode, so most players never see it. The script downloads with the page, and the check runs when the player presses Start. Only `/api/token` (a new live slot) needs it. Players waiting in line check in with their ticket instead.
- **Rounds and the photo judge** sit behind the same check. `/api/news-round` needs the live-slot token from `/api/token` and opens one round per token, and `/api/news-photo` needs that round's id.
- **Secret pass** (`TURNSTILE_BYPASS`): skips Turnstile for agent browsers. See the next section.

## Playing in production (agents)

Turnstile blocks automated browsers (error 600010), so an agent can't pass it. Use the secret pass instead:

1. Read `TURNSTILE_BYPASS` from `worker/.dev.vars`. Git ignores that file, and the same value is set on the Worker.
2. Open `https://newsworthy.vamonke.com/?pass=<value>` in the browser pane. The tab keeps the pass and removes it from the address bar.
3. Press **Start shooting**. The round skips Turnstile, and the Worker logs "Turnstile skipped with the secret pass". A How to play popup can appear over the live round; its button closes it. Pick a scene in the left panel, then click the video to take a photo.
4. Every round uses real Reactor and Gemini time and takes one of the 4 live slots, so when the game is busy players wait in line behind it. Ask Varick before playing, and keep rounds short.
   Rounds played this way are posted to the leaderboard like anyone else's, under Varick's network player id (`bdf0edb99a002e95`, shown as "Lively Yak 14"). Varick chose to keep them there.
5. When done, close the tab. With the heartbeat the slot frees itself within about 40 s. The auto-mode permission check blocks calling `/api/stop-sessions` from curl, so don't count on that.

Revoke or rotate the pass with `npx wrangler secret delete TURNSTILE_BYPASS`, or `npx wrangler secret put TURNSTILE_BYPASS` with a new value (update `.dev.vars` too). Slot, line and rate limits still apply with the pass.

## Testing locally

- **Run the Worker locally.** Run `npm run build:newsworthy` at the repo root, then `npx wrangler dev --port 8787 --ip 127.0.0.1` in `worker/`. Or use the `newsworthy-worker` entry in `.claude/launch.json`.
- **Unit tests.** Run `cd worker && npm test` for the Gate and line, analytics events, the alerts (`monitor-core.test.js`) and the leaderboard (its queries run against the real schema in Node's built-in SQLite), and `npm run test:newsworthy` for the judge, including save/restore.
- **Turnstile blocks automated browsers** (error 600010), so it can't be passed from a test browser. To test the flow, use Cloudflare's always-pass pair: site key `1x00000000000000000000AA` (via `--var TURNSTILE_SITE_KEY:...`) and secret `1x0000000000000000000000000000000AA` in `.dev.vars`. Put the real secret back afterwards. Requests that carry a waiting-line `ticket` skip Turnstile.
- **Test the Gate for free.** Minting Reactor tokens with curl costs nothing, and you can pretend to be different players with the `CF-Connecting-IP` header. Only a real browser round uses Reactor time.

## Lessons from launch

- **Gemini refuses some locations, Hong Kong among them.** On 2026-09-24 every photo in one round failed with "Editor unavailable (400)", and Gemini's reply was "User location is not supported for the API use." A Round object calls Gemini from wherever Cloudflare created it, which is near where the player's request landed. Players in Singapore were served from Singapore, Hong Kong and even Madrid. Pinning every round to the US fixed it but made each photo 1.5–3 s slower from Singapore, mostly from carrying the photo across the Pacific. So rounds now stay near the player, and only when Gemini refuses the location does that round send its Gemini calls through `GeminiRelay` (`worker/src/relay.js`), one Durable Object created in western North America. Workers Logs show "Gemini refused this round's location…" and "Relayed a Gemini call from the US" when that happens. To test the relay locally, run `wrangler dev --var GEMINI_RELAY_ALWAYS:1`.
- **Secrets reach every copy of the Worker a few seconds after a deploy.** Right after the first deploy, one `/api/token` request got through without Turnstile. It only happens on a first deploy; later deploys keep the existing secrets.
- **Browsers pause animations in hidden or covered windows.** Photos used to wait for the shutter flash before being sent, so they stalled in background tabs. `shutter()` in `newsworthy-motion.js` now gives up after 300 ms.
- **Reactor runs one session per model at a time, not five.** Until 2026-09-28 the Gate gave out 4 slots, so while one player was live the next got a slot, Reactor refused the session within 2 s, and the game retried every 10 s. Each failed try kept its slot for 90 s, so after two tries the player was told another session was still open. Nobody was ever put in line. On 2026-09-28, 19 of 40 starts failed this way. It was found by the pattern that no two Reactor sessions ever overlapped (`/accounts/<id>/sessions`) and confirmed with `/accounts/<id>/quotas`. Failed starts are now recorded as `start_failed`. Reactor removed the per-model limit on 2026-09-29 and `LIVE_SLOTS` went to 4.
- **Photo scoring was down for 16½ hours because the Gemini spend cap was SGD 2.** From 2026-09-28 13:09 UTC every photo got HTTP 429 "Your project has exceeded its monthly spending cap", and players saw "Editor unavailable (429). Retry this photo." 57 players in 70 rounds had 561 photos fail, and none were scored until about 05:38 UTC on 09-29. The daily health check found it hours later. The cap is now SGD 50, and the Worker now checks scoring every 15 min and alerts at once (see "Alerts").
- **Durable Objects are dropped from memory after about 70–140 s idle.** The stream can take up to 2 minutes to load before the first photo, so rounds must stay saved in storage.

## Leaderboard and saved photos

- **Every judged photo is kept** in the R2 bucket `newsworthy-photos`: `rounds/<round id>/shot-N.jpg` (the 640px copy the judge saw) and `shot-N.json` (its result). An hour after a round starts, `round.json` and thumbnails of its accepted photos are added. Rounds from before 2026-09-25 were deleted after an hour and are gone.
- **Every round with a score is posted**, by the Round object after each photo, to the `scores` table in the D1 database `newsworthy`. The total comes from the Round object, never the browser. Players don't enter anything.
- **Names are made up from the player id** (`nameFor` in `leaderboard.js`): two words and a number, about 370,000 names. The player id is the hashed IP, so a player on another network gets another name, and people sharing one network share one. Rounds with no player id use the round id.
- **Each round keeps the player's country** (`scores.country`, Cloudflare's two-letter code for the IP that opened the round, `''` when unknown), shown as a flag before the name. The flags are SVGs from flag-icons (MIT) in `orbis-motion-test/public/flags/`, because Windows shows flag emoji as two letters. Rounds from before 2026-09-28 were filled in from Cloudflare's request logs by matching each round's scoring minutes to the country of the `/api/news-photo` requests then; all 22 matched one country.
- **The board** (`GET /api/leaderboard`) shows each player's best round, top 10, all time. The viewer's row is marked "(you)" by their player id (their best round), so it shows from the header and after a refresh; `?round=<id>`, sent from the results popup, marks that round instead. Photos are served by `GET /api/photo/<round>/shot-N.jpg`, only for photos a posted round sold.
- **The game** opens it from the header and from See leaderboard on the results popup (`orbis-motion-test/newsworthy-leaderboard.js`). The local Vite server returns an empty board; run the Worker locally for real data.
- **Schema changes** go in a new file in `worker/migrations/`, applied with `npx wrangler d1 migrations apply newsworthy --remote` (and `--local` for local runs) before deploying code that needs them.
- **Test rounds stay on the board.** Varick's and agents' rounds come from player `bdf0edb99a002e95` and are kept on purpose (2026-09-26).
- **Photo content isn't reviewed.** Photos are frames of the generated video and players aren't told they're kept; the 9 rescued on 2026-09-25 were checked by eye and were fine. Remove a round if something bad reaches the board.
- **To remove a round from the board:** `npx wrangler d1 execute newsworthy --remote --command "DELETE FROM scores WHERE round = '<round id>'"`.

## Not built yet

- **Estimated wait in the line.**
- **Retrying a failed line check-in.** Right now one network error ends the wait.
- **AI Gateway in front of Gemini, with a fallback.** Logs and per-request cost for every judge call, and a fallback to a second Gemini key in a project with its own billing (or another provider) when the first answers 402 or 429, so a billing problem on one project doesn't stop scoring. Test it against the location refusals first: the Gateway calls Gemini from Cloudflare's location, like a round does.
