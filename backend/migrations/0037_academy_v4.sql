-- Học viện v4 (IQX-Hoc-Vien-SPEC v4, catalog iqx-academy-v4.0-12ch-116lessons).
-- Additive and idempotent. v4 needs no change to the existing Academy tables (spec §5.2):
--   * academy_completions keeps one row per (user, lesson_key); every v3.3 lesson keeps its key, so progress carries
--     over by key (spec §5.3). New exam keys (`exam:ch08-v4` .. `exam:ch12-v4`) already fit ck_academy_completions_key.
--   * academy_attempts / academy_answers / lesson_rewards / academy_scenario_choices / academy_practice_notes unchanged;
--     attempts of earlier catalogs stay as history (they are never graded or resumed again).
--   * academy_grants is no longer read to gate any indicator or metric (spec §4.2); the table is kept for its history
--     and for the legacy `lesson:*` capabilities of the advanced backtest features.
--
-- The one thing v4 has to remember that no table holds: "bài đang học" (spec §4.1) is the lesson the learner opened
-- last, and the admin / team-lead views show it. One row per account, upserted when a lesson or exam is opened.

CREATE TABLE IF NOT EXISTS academy_last_opened (
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Durable identity (like academy_completions): the current catalog finds the item by this key.
  lesson_key      varchar(96) NOT NULL,
  lesson_id       varchar(32) NOT NULL,
  catalog_version varchar(64) NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_academy_last_opened PRIMARY KEY (user_id),
  CONSTRAINT ck_academy_last_opened_key
    CHECK (lesson_key ~ '^(technical|fundamental|concept|guide|exam):[a-z0-9_-]+$')
);
