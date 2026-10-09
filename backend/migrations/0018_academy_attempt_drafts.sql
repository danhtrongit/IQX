-- Server-side draft selections of an open Academy quiz attempt (Học viện SPEC §4.1 "Phục hồi đúng
-- đề/lựa chọn đã lưu", §8.2). Additive and idempotent.
--
-- A draft is only the learner's current radio choices, {question_id: option_id}, kept so that a
-- reload, a lost connection or another device resumes the same attempt where it was left. It is
-- never graded and carries no correctness: academy_answers (graded answers, written once by a
-- submit) is untouched. `revision` counts the saves of the draft so a stale tab can be told apart
-- from the latest one (optimistic expected_revision); it never decreases.
--
-- Ownership is the attempt's: the application reaches a draft only through the owner's locked
-- attempt row. The row disappears with its attempt, and the application deletes it on submit.
CREATE TABLE IF NOT EXISTS academy_attempt_drafts (
  attempt_id uuid PRIMARY KEY REFERENCES academy_attempts(id) ON DELETE CASCADE,
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_academy_attempt_drafts_selections CHECK (jsonb_typeof(selections) = 'object'),
  CONSTRAINT ck_academy_attempt_drafts_revision CHECK (revision >= 1)
);
