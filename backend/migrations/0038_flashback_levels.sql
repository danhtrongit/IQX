-- Flashback v2.1 · Cấp, điểm và bảng xếp hạng (IQX-Flashback-SPEC-BoSung §3, §4, §10.1).
-- Additive and idempotent: only adds columns/tables and re-derives the new data from rows that
-- already exist, so running it twice leaves the same result.
--
--   fb_entries.points              level points this player earned from the match (0 when solo)
--   fb_entries.is_win              won a match of 2+ players (rank 1, ties included); false when solo
--   fb_entries.points_awarded_at   when the points were awarded; NULL = not yet awarded. The match
--                                  settlement and the repair sweep only award rows where it IS NULL,
--                                  so a (match, user) pair is paid out exactly once.
--   fb_player_stats                running totals per player: points, games (2+ players), wins and
--                                  reached_points_at (when the current total was reached; breaks
--                                  ties on the leaderboard). Level and rank are derived, never stored.

-- 1. Entries.
ALTER TABLE fb_entries
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_win boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS points_awarded_at timestamptz;

ALTER TABLE fb_entries DROP CONSTRAINT IF EXISTS ck_fb_entries_points;
ALTER TABLE fb_entries
  ADD CONSTRAINT ck_fb_entries_points CHECK (points >= 0);

-- Finished entries still waiting for points (the settlement repair sweep looks them up).
CREATE INDEX IF NOT EXISTS ix_fb_entries_points_pending
  ON fb_entries (match_id) WHERE points_awarded_at IS NULL AND status = 'finished';

-- 2. Player stats.
CREATE TABLE IF NOT EXISTS fb_player_stats (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  games integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  reached_points_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_fb_player_stats_counts CHECK (
    points >= 0 AND games >= 0 AND wins >= 0 AND wins <= games
  )
);

-- Leaderboard order (spec §4.1): points desc, wins desc, who reached the points first, then the
-- user id so the order is total and stable. Only players with at least one 2+ player game.
CREATE INDEX IF NOT EXISTS ix_fb_player_stats_rank
  ON fb_player_stats (points DESC, wins DESC, reached_points_at ASC, user_id ASC)
  WHERE games > 0;

-- 3. Backfill from matches that were settled before this migration.
--    Every finished entry of a match with 2+ players gets 10 (rank 1) or 3 points, solo matches
--    get 0; all of them are stamped as awarded at the moment the match ended. Rows that already
--    have points_awarded_at (a second run, or settled by the new code) are never touched.
UPDATE fb_entries e
   SET points = CASE WHEN m.player_count >= 2 THEN CASE WHEN e.rank = 1 THEN 10 ELSE 3 END ELSE 0 END,
       is_win = (m.player_count >= 2 AND e.rank = 1),
       points_awarded_at = COALESCE(m.ended_at, m.paid_at, now())
  FROM fb_matches m
 WHERE m.id = e.match_id
   AND m.status IN ('finished', 'paid')
   AND e.status = 'finished'
   AND e.rank IS NOT NULL
   AND e.points_awarded_at IS NULL;

-- Rebuild the totals from the awarded entries (the single source of truth). An existing stats row
-- is overwritten with the recomputed numbers, which already include every awarded entry.
INSERT INTO fb_player_stats (user_id, points, games, wins, reached_points_at, updated_at)
SELECT e.user_id,
       SUM(e.points)::integer,
       COUNT(*)::integer,
       COUNT(*) FILTER (WHERE e.is_win)::integer,
       MAX(e.points_awarded_at),
       now()
  FROM fb_entries e
  JOIN fb_matches m ON m.id = e.match_id
 WHERE e.points_awarded_at IS NOT NULL
   AND m.player_count >= 2
 GROUP BY e.user_id
ON CONFLICT (user_id) DO UPDATE
   SET points = EXCLUDED.points,
       games = EXCLUDED.games,
       wins = EXCLUDED.wins,
       reached_points_at = EXCLUDED.reached_points_at,
       updated_at = EXCLUDED.updated_at;

COMMENT ON COLUMN fb_entries.points IS 'Điểm cấp nhận được từ ván: thắng 10, thua 3, chơi 1 mình 0.';
COMMENT ON COLUMN fb_entries.is_win IS 'Thắng ván từ 2 người (hạng 1, gồm cả hoà); chơi 1 mình luôn false.';
COMMENT ON COLUMN fb_entries.points_awarded_at IS 'Lúc cộng điểm; NULL là chưa cộng. Chỉ dòng NULL mới được cộng, nên mỗi (ván, người) một lần.';
COMMENT ON TABLE fb_player_stats IS 'Tổng điểm, số ván từ 2 người và số ván thắng của từng người; cấp và hạng tính từ đây.';
COMMENT ON COLUMN fb_player_stats.reached_points_at IS 'Lúc đạt mốc điểm hiện tại, dùng xếp hạng khi bằng điểm và bằng số ván thắng.';
