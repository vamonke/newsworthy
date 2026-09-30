-- The "just sold" feed reads the rounds updated last (SOLD in src/leaderboard.js).
CREATE INDEX scores_updated ON scores (updated DESC);
