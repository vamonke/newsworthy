# Analytics

Why Newsworthy records what it does, what we know so far, and how to pull the numbers. The technical details (columns, event table, how to add an event) are in [DEPLOYMENT.md](DEPLOYMENT.md), "Analytics".

## Why

Every round uses Reactor credits, roughly $1–2 a round. As of 2026-09-25 about $80 of credits were left. When they run low, Varick will ask Reactor (or another sponsor) for more. The pitch is: "your credits put your model in front of this many people, and this many of them went on to look at Reactor and Visko Orbis." The analytics exist to back that up with numbers.

The numbers a sponsor cares about:

| Question | Where it comes from |
|---|---|
| How many people saw and played it? | unique players, page opens, rounds |
| How much of our model did they use? | Reactor minutes (`closed` value) |
| Did they check us out? | `link_clicked` on the Reactor and Visko Orbis links, plus UTM visits in Reactor's own analytics |
| Is there more demand than credits? | `line_joined`, `turned_away` |
| What does each player cost us? | credits spent ÷ unique players |
| Where are they from? | Cloudflare traffic by country |

## What's tracked, and since when

All game events go to the Analytics Engine dataset `newsworthy_events` on the Cloudflare account `vamonke`. Times below are UTC.

| Since | What |
|---|---|
| 2026-09-23 (testing), 2026-09-24 (launch) | Round events: commands, scenes picked, photos taken and reviewed, failed reviews, round closed. No player ids, scene names or photo earnings in these rows. |
| 2026-09-25 ~13:55 | Unique players (hashed IP), `page_opened` with the referring site, `link_clicked` on every outside link, scene names, dollars earned per photo. |
| 2026-09-25 ~14:23 | UTM tags on the Reactor links, `slot_opened`, `line_joined`, `turned_away`, Reactor seconds per round on `closed`, loading seconds on `first_video_frame`. |
| 2026-09-25 ~14:43 | `closed` also recorded when a player leaves mid-round (label `left`; normal ends are `ended`). |

Cloudflare's own traffic data for `newsworthy.vamonke.com` (page loads, countries, devices) covers the whole time since launch. Referring sites aren't available there on the free plan, which is why `page_opened` records them.

## Baseline (launch to 2026-09-25 13:55 UTC)

Before player ids existed. Includes Varick's and agents' test rounds, which can't be separated.

- **Page loads:** about 240 (184 on 2026-09-24, 60 on 2026-09-25 by 14:20), about 185 after removing curl and bots. From 29 countries, led by Singapore (85) and the US (67), then Sweden, the Netherlands, Germany, the UK, Canada, Malaysia and Brazil. About 20% on mobile. Twitterbot fetched it, so it was shared on X.
- **Rounds:** 87 started, 66 got live video, 65 took at least one photo, 12 used all 12 shots.
- **Photos:** 481 taken and reviewed by AI, 7.4 per round that took any. 158 scenes triggered.
- **Live video:** a typical round ran about 2 minutes; about 117 minutes in total.
- **Estimated credit spend:** at $1–2 a round, about $66–130 for the 66 rounds with video. Check Reactor's dashboard for the real figure.

## Pitch queries

Exclude test traffic. Varick's and agents' player id is `bdf0edb99a002e95` (same network), and test runs used the page session `agent-check-1`. Add others here as they turn up.

Run these with the SQL API (see "Querying" in DEPLOYMENT.md for the token):

```bash
TOKEN=$(grep oauth_token ~/Library/Preferences/.wrangler/config/default.toml | cut -d'"' -f2)
q() { curl -s https://api.cloudflare.com/client/v4/accounts/6fd560e6892546be11ef30883a03dd71/analytics_engine/sql -H "Authorization: Bearer $TOKEN" -d "$1 FORMAT JSONEachRow"; echo; }
X="blob4 != 'bdf0edb99a002e95'"
```

| Number | Query |
|---|---|
| Unique players and page sessions | `q "SELECT count(DISTINCT blob4) AS players, count(DISTINCT blob5) AS sessions FROM newsworthy_events WHERE blob4 != '' AND $X"` |
| Rounds and players who played one | `q "SELECT count(DISTINCT blob6) AS rounds, count(DISTINCT blob4) AS players FROM newsworthy_events WHERE blob6 != '' AND blob4 != '' AND $X"` |
| Players by day | `q "SELECT toDate(timestamp) AS day, count(DISTINCT blob4) AS players FROM newsworthy_events WHERE blob4 != '' AND $X GROUP BY day ORDER BY day"` |
| Returning players (seen on 2+ days) | `q "SELECT count() AS returning FROM (SELECT blob4, count(DISTINCT toDate(timestamp)) AS days FROM newsworthy_events WHERE blob4 != '' AND $X GROUP BY blob4) WHERE days > 1"` |
| Reactor minutes, rounds ended vs left | `q "SELECT blob2 AS how, sum(_sample_interval) AS rounds, sum(double1 * _sample_interval) / 60 AS minutes FROM newsworthy_events WHERE blob1 = 'closed' AND blob2 != '' AND $X GROUP BY how"` |
| Link clicks, and players who clicked | `q "SELECT blob2 AS link, sum(_sample_interval) AS clicks, count(DISTINCT blob4) AS players FROM newsworthy_events WHERE blob1 = 'link_clicked' AND $X GROUP BY link ORDER BY clicks DESC"` |
| Demand: slots, line, turned away | `q "SELECT blob1, blob2, sum(_sample_interval) AS n, count(DISTINCT blob4) AS players FROM newsworthy_events WHERE blob1 IN ('slot_opened', 'line_joined', 'turned_away') AND $X GROUP BY blob1, blob2"` |
| Referring sites | `q "SELECT blob2 AS site, count(DISTINCT blob5) AS visits FROM newsworthy_events WHERE blob1 = 'page_opened' AND $X GROUP BY site ORDER BY visits DESC"` |
| Photos and earnings | `q "SELECT sum(_sample_interval) AS photos, sum(double1 * _sample_interval) AS dollars FROM newsworthy_events WHERE blob1 = 'photo_result' AND blob4 != '' AND $X"` |
| Scenes picked | `q "SELECT blob2 AS scene, sum(_sample_interval) AS n FROM newsworthy_events WHERE blob1 = 'incident_clicked' AND blob2 != '' AND $X GROUP BY scene ORDER BY n DESC"` |

Page loads and countries come from Cloudflare's GraphQL API for the zone `vamonke.com` (`3d98cf36bd545168c039055886ab863c`):

```bash
jq -n --arg q '{ viewer { zones(filter:{zoneTag:"3d98cf36bd545168c039055886ab863c"}) { httpRequestsAdaptiveGroups(limit:50, filter:{clientRequestHTTPHost:"newsworthy.vamonke.com", clientRequestPath:"/", datetime_geq:"2026-09-24T00:00:00Z", datetime_lt:"2026-10-01T00:00:00Z"}, orderBy:[count_DESC]) { count dimensions { clientCountryName } } } } }' '{query:$q}' \
  | curl -s https://api.cloudflare.com/client/v4/graphql -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d @-
```

Swap `clientCountryName` for `date`, or for `clientDeviceType userAgentBrowser` to spot bots and curl. That API keeps only about the last 30 days, so save the launch numbers before they age out.

In Reactor's own analytics, our visits show up as `utm_source=newsworthy`, `utm_medium=referral`, with `utm_content=ticker` or `how_it_works`.

## Caveats

- **Sampling:** Analytics Engine drops some rows even at low traffic. Each row's `_sample_interval` says how many events it stands for, so totals use `sum(_sample_interval)`. A single round's timeline can have gaps: `first_video_frame` was missing from two test rounds for this reason.
- **Unique players are unique networks.** An office or campus counts as one; one person on Wi-Fi and then mobile data counts as two.
- **Salt:** `PLAYER_SALT` was generated at deploy and never saved. Leave it alone, since changing it makes everyone look new.
- `closed` before 2026-09-25 ~14:43 is missing for players who left mid-round, so Reactor minutes before then undercount.
- Old rows (before 2026-09-25 ~13:55) have no player id, scene name or photo value.

## Ideas not built yet

- **Shares and saves:** record when a player saves or downloads the front-page keepsake, to show reach beyond players.
- **Custom scenes:** count scenes players typed themselves (maybe keep the text), to show people steering the model creatively.
- **One-page stats summary** for the pitch, pulled from the live data.
- **Qualitative proof:** screenshots of posts on X and the best photo and headline pairs.

## Log

- **2026-09-25:** checked the first numbers (above). Added player ids, `/api/event`, link tracking, slot demand, Reactor time and UTM tags; deployed three times. Each deploy was play-tested in production: rounds started, got live video, took a photo that sold for $1,000, and closed; events arrived with the new columns. Found and fixed `closed` missing when a player leaves mid-round.
