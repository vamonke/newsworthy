-- One row per round with a score. See src/leaderboard.js.
CREATE TABLE scores (
  round TEXT PRIMARY KEY,   -- Round Durable Object id
  player TEXT NOT NULL,     -- player id (HMAC of the IP), or the round id when there is none
  name TEXT NOT NULL,       -- made up from the player id
  total INTEGER NOT NULL,   -- dollars, from the Round object
  photos TEXT NOT NULL,     -- JSON [{id, headline, earned}], best first
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX scores_player ON scores (player, total DESC);
CREATE INDEX scores_total ON scores (total DESC);
