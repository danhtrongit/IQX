-- Shop SPEC 10.2: the compensation backfill pays 100 xu for lessons completed BEFORE the Shop
-- that still map to the current catalog. Those completions are the `legacy_migration` rows that
-- migration 0014 carried over from academy_grants, so lesson_rewards must be able to record that
-- completion method. Relaxes a CHECK only: no row is changed or dropped, and the primary key
-- (user_id, lesson_key) plus the ledger unique key stay the single gate against paying a lesson
-- twice. Idempotent.
ALTER TABLE lesson_rewards DROP CONSTRAINT IF EXISTS ck_lesson_rewards_method;
ALTER TABLE lesson_rewards
  ADD CONSTRAINT ck_lesson_rewards_method
  CHECK (completion_method IN ('quiz', 'guide', 'legacy_migration'));
