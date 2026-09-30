// Leaderboard: every round with a score is posted to the D1 table `scores` (migrations/0001_scores.sql).
// Two boards, each player's best round, top 10: this week (the default, since Monday 00:00 UTC) and all time.
// Every row also carries the player's lifetime earnings across all their rounds. Players never type a name:
// it is made up from their player id (see playerId in events.js), so the same player keeps the same name.

const ADJ = ['Swift', 'Lucky', 'Bold', 'Sneaky', 'Sharp', 'Quick', 'Brave', 'Calm', 'Wild', 'Keen', 'Sly', 'Jolly',
  'Eager', 'Happy', 'Clever', 'Daring', 'Fuzzy', 'Gentle', 'Grumpy', 'Hasty', 'Humble', 'Jumpy', 'Mighty', 'Nimble',
  'Noisy', 'Plucky', 'Proud', 'Quiet', 'Rapid', 'Rusty', 'Salty', 'Shy', 'Silly', 'Sleepy', 'Snappy', 'Spicy',
  'Steady', 'Sunny', 'Tiny', 'Witty', 'Zippy', 'Cosmic', 'Dizzy', 'Fancy', 'Frosty', 'Giant', 'Golden', 'Honest',
  'Lively', 'Loyal', 'Lunar', 'Merry', 'Misty', 'Peppy', 'Polite', 'Rowdy', 'Shiny', 'Sneezy', 'Speedy', 'Stormy',
  'Turbo', 'Wacky', 'Wise', 'Zesty'];
const NOUN = ['Heron', 'Otter', 'Falcon', 'Gecko', 'Lynx', 'Magpie', 'Koala', 'Badger', 'Raven', 'Panda', 'Moth', 'Fox',
  'Beaver', 'Bison', 'Camel', 'Crab', 'Crow', 'Dingo', 'Dolphin', 'Eagle', 'Ferret', 'Finch', 'Frog', 'Goose',
  'Hamster', 'Hedgehog', 'Hippo', 'Ibis', 'Jackal', 'Kiwi', 'Lemur', 'Llama', 'Mole', 'Moose', 'Newt', 'Owl',
  'Parrot', 'Pelican', 'Penguin', 'Pigeon', 'Puffin', 'Quail', 'Rabbit', 'Seal', 'Shark', 'Sloth', 'Snail', 'Squid',
  'Stork', 'Swan', 'Tapir', 'Tiger', 'Toad', 'Toucan', 'Turtle', 'Walrus', 'Wombat', 'Yak', 'Zebra', 'Mantis',
  'Weasel', 'Cobra', 'Donkey', 'Lobster'];

// Two words and a number from the id: 64 × 64 × 90 ≈ 370,000 names, so 1,000 players rarely share one.
export function nameFor(id) {
  const hex = (from) => parseInt(String(id).slice(from, from + 4).padEnd(4, '0'), 16) || 0;
  return `${ADJ[hex(0) % ADJ.length]} ${NOUN[hex(4) % NOUN.length]} ${10 + (hex(8) % 90)}`;
}

// The round's sold photos, best first, from the judge's snapshot (photos are [photoId, hash, result]).
export function soldPhotos(snapshot) {
  return (snapshot?.photos || [])
    .filter(([, , result]) => result?.earned > 0)
    .map(([id, , result]) => ({ id, headline: String(result.headline || '').slice(0, 160), earned: result.earned }))
    .sort((a, b) => b.earned - a.earned);
}

// The player's country, for the flag on the board: Cloudflare's two-letter code for their IP. Its other
// values (XX for unknown, T1 for Tor) and anything else are kept as '', which shows no flag.
export const countryCode = (code) => (/^[A-Z]{2}$/.test(code ?? '') && code !== 'XX' ? code : '');

// Rounds only ever gain money. Writes can land out of order, so one with a lower total is ignored.
export const UPSERT = `INSERT INTO scores (round, player, name, total, photos, created, updated, country) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)
  ON CONFLICT(round) DO UPDATE SET total = excluded.total, photos = excluded.photos, updated = excluded.updated
  WHERE excluded.total >= scores.total`;

// The week starts Monday 00:00 UTC. The weekly board counts rounds started since then.
const DAY = 86_400_000;
export function weekStart(now) {
  const midnight = Math.floor(now / DAY) * DAY;
  return midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * DAY;
}

// Each player's best round since ?1 (0 for all time; earliest wins a tie), top 10, with their lifetime
// earnings, which count every round they've played, not only those on this board.
export const TOP = `SELECT round, player, name, total, photos, country, lifetime FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY player ORDER BY total DESC, created ASC) AS n
    FROM (SELECT *, SUM(total) OVER (PARTITION BY player) AS lifetime FROM scores) WHERE created >= ?1
  ) WHERE n = 1 ORDER BY total DESC, created ASC LIMIT 10`;

// Where a round places on a board: 1 + the number of other players whose best since ?3 beats it.
export const RANK = `SELECT 1 + COUNT(*) AS rank FROM (
    SELECT player, MAX(total) AS best FROM scores WHERE player != ?1 AND created >= ?3 GROUP BY player
  ) WHERE best > ?2`;

const LIFETIME = '(SELECT SUM(total) FROM scores AS mine WHERE mine.player = scores.player) AS lifetime';
export const ROUND = `SELECT round, player, name, total, photos, country, created, ${LIFETIME} FROM scores WHERE round = ?1`;

// A player's best round since ?2, to find the viewer on the board.
export const BEST = `SELECT round, player, name, total, photos, country, created, ${LIFETIME} FROM scores WHERE player = ?1 AND created >= ?2 ORDER BY total DESC, created ASC LIMIT 1`;

// The latest sold photos, for the "just sold" pop-up: the sold photos of the 6 rounds updated last.
// A round's row is updated after every photo, so a new sale shows up here within seconds.
export const SOLD = `SELECT s.round, s.name, s.country, s.updated,
    json_extract(p.value, '$.id') AS id, json_extract(p.value, '$.headline') AS headline, json_extract(p.value, '$.earned') AS earned
  FROM (SELECT round, name, country, updated, photos FROM scores ORDER BY updated DESC LIMIT 6) AS s, json_each(s.photos) AS p
  ORDER BY s.updated DESC, earned DESC LIMIT 20`;

const photoUrl = (round, id) => `/api/photo/${round}/${id}.jpg`;

const photosOf = (row) => JSON.parse(row.photos).map((p) => ({ src: photoUrl(row.round, p.id), headline: p.headline, earned: p.earned }));
const entry = (row) => ({ name: row.name, country: row.country || '', total: row.total, lifetime: row.lifetime ?? row.total, photos: photosOf(row) });

// What the game gets: names, countries, totals and photo links, never player ids. `you` marks the viewer's own
// row, and also carries it whole, so the game can show it under the board when it's outside the top 10.
export function toBoard(rows, mine, rank) {
  return {
    top: rows.map((row) => ({ ...entry(row), you: Boolean(mine && row.player === mine.player) })),
    you: mine ? { ...entry(mine), rank } : null,
  };
}

// The "just sold" feed. `key` tells the game which sales it has already shown; `at` is when the round last sold one.
export const toSold = (rows) => ({
  sold: rows.map((row) => ({ key: `${row.round}/${row.id}`, src: photoUrl(row.round, row.id), name: row.name, country: row.country || '', headline: row.headline, earned: row.earned, at: row.updated })),
});

// A leaderboard photo is served only if it is one of that round's sold photos.
export const ROUND_PHOTOS = 'SELECT photos FROM scores WHERE round = ?1';
export const listsPhoto = (row, id) => Boolean(row) && JSON.parse(row.photos).some((p) => p.id === id);
