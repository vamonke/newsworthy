-- The player's country when the round started: Cloudflare's two-letter code, or '' when unknown.
-- Rounds from before 2026-09-28 were filled in from Cloudflare's request logs. See src/leaderboard.js.
ALTER TABLE scores ADD COLUMN country TEXT NOT NULL DEFAULT '';
