-- Học viện v3.2: chapter exams, variable quiz sizes, exam keys, scenario choices, practice notes.
-- Idempotent. Existing rows are untouched: old completions keep their keys (5 indicator keys carry over).

-- Attempts: kind + score bound by the attempt's own question count (3/5/20/30; legacy 8).
ALTER TABLE academy_attempts ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'lesson';
ALTER TABLE academy_attempts DROP CONSTRAINT IF EXISTS ck_academy_attempts_kind;
ALTER TABLE academy_attempts
  ADD CONSTRAINT ck_academy_attempts_kind CHECK (kind IN ('lesson', 'chapter_exam'));
ALTER TABLE academy_attempts DROP CONSTRAINT IF EXISTS academy_attempts_score_check;
ALTER TABLE academy_attempts DROP CONSTRAINT IF EXISTS ck_academy_attempts_score;
ALTER TABLE academy_attempts
  ADD CONSTRAINT ck_academy_attempts_score
  CHECK (score IS NULL OR (score >= 0 AND score <= cardinality(question_ids)));
-- Exams have no lesson content: content_version is NULL for chapter_exam attempts.
-- Rollback-safe: old code always supplies a value.
ALTER TABLE academy_attempts ALTER COLUMN content_version DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ix_academy_attempts_user_key_catalog
  ON academy_attempts (user_id, lesson_key, catalog_version, created_at DESC)
  WHERE lesson_key IS NOT NULL;

-- Completions: allow exam:chNN keys.
ALTER TABLE academy_completions DROP CONSTRAINT IF EXISTS ck_academy_completions_key;
ALTER TABLE academy_completions
  ADD CONSTRAINT ck_academy_completions_key
  CHECK (lesson_key ~ '^(technical|fundamental|concept|guide|exam):[a-z0-9_-]+$');

-- Rewards: chapter exams never pay (defence in depth; the service never calls the hook for exams).
ALTER TABLE lesson_rewards DROP CONSTRAINT IF EXISTS ck_lesson_rewards_not_exam;
ALTER TABLE lesson_rewards
  ADD CONSTRAINT ck_lesson_rewards_not_exam CHECK (lesson_key NOT LIKE 'exam:%');

-- Scenario choice per account: insert once (spec §2.3, §5.2). Only exception: when scenario_hash differs from the
-- current scenario (content changed), the next POST replaces the stale row once.
CREATE TABLE IF NOT EXISTS academy_scenario_choices (
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_key     varchar(96) NOT NULL,
  lesson_id      varchar(32) NOT NULL,
  choice         smallint    NOT NULL,
  scenario_hash  char(64)    NOT NULL,
  catalog_version varchar(64) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_academy_scenario_choices PRIMARY KEY (user_id, lesson_key),
  CONSTRAINT ck_academy_scenario_choices_choice CHECK (choice BETWEEN 0 AND 2)
);

-- Practice notes per account: workpads, checklists, roleplay scores. Revisioned, size capped.
CREATE TABLE IF NOT EXISTS academy_practice_notes (
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_key  varchar(96) NOT NULL,
  lesson_id   varchar(32) NOT NULL,
  texts       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  checks      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  scores      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  revision    integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_academy_practice_notes PRIMARY KEY (user_id, lesson_key),
  CONSTRAINT ck_academy_practice_notes_revision CHECK (revision >= 1),
  CONSTRAINT ck_academy_practice_notes_shape CHECK (
    jsonb_typeof(texts) = 'object' AND jsonb_typeof(checks) = 'object' AND jsonb_typeof(scores) = 'object'),
  CONSTRAINT ck_academy_practice_notes_size CHECK (
    octet_length(texts::text) + octet_length(checks::text) + octet_length(scores::text) <= 65536)
);
