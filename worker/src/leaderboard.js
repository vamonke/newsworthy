// Leaderboard: every round with a score is posted to the D1 table `scores` (migrations/0001_scores.sql).
// The board shows each player's best round, top 10, all time. Players never type a name: it is made up
// from their player id (see playerId in events.js), so the same player keeps the same name.

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

// Rounds only ever gain money. Writes can land out of order, so one with a lower total is ignored.
export const UPSERT = `INSERT INTO scores (round, player, name, total, photos, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
  ON CONFLICT(round) DO UPDATE SET total = excluded.total, photos = excluded.photos, updated = excluded.updated
  WHERE excluded.total >= scores.total`;

// Each player's best round (earliest wins a tie), top 10.
export const TOP = `SELECT round, player, name, total, photos FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY player ORDER BY total DESC, created ASC) AS n FROM scores
  ) WHERE n = 1 ORDER BY total DESC, created ASC LIMIT 10`;

// Where a round places: 1 + the number of other players whose best beats it.
export const RANK = `SELECT 1 + COUNT(*) AS rank FROM (
    SELECT player, MAX(total) AS best FROM scores WHERE player != ?1 GROUP BY player
  ) WHERE best > ?2`;

export const ROUND = 'SELECT round, player, total, photos FROM scores WHERE round = ?1';

// A player's best round, to find the viewer on the board.
export const BEST = 'SELECT round, player, total, photos FROM scores WHERE player = ?1 ORDER BY total DESC, created ASC LIMIT 1';

const photoUrl = (round, id) => `/api/photo/${round}/${id}.jpg`;

// What the game gets: names, totals and photo links, never player ids. `you` marks the viewer's own row.
export function toBoard(rows, mine, rank) {
  return {
    top: rows.map((row) => ({
      name: row.name,
      total: row.total,
      you: Boolean(mine && row.player === mine.player),
      photos: JSON.parse(row.photos).map((p) => ({ src: photoUrl(row.round, p.id), headline: p.headline, earned: p.earned })),
    })),
    you: mine ? { rank, total: mine.total } : null,
  };
}

// A leaderboard photo is served only if it is one of that round's sold photos.
export const listsPhoto = (row, id) => Boolean(row) && JSON.parse(row.photos).some((p) => p.id === id);
