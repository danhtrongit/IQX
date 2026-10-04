-- IQX Academy (bot-v2): server-graded lesson quizzes and learned-capability grants.
-- option_orders stores the per-attempt shuffled option ids ({question_id: [option_id,...]});
-- answer keys never leave the server-side question bank. A grant is created only by an 8/8
-- submission and is never removed by a later retake.
CREATE TABLE IF NOT EXISTS academy_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id varchar(32) NOT NULL,
  content_version varchar(32) NOT NULL,
  questions_version char(64) NOT NULL,
  question_ids text[] NOT NULL,
  option_orders jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted')),
  idempotency_key varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  score integer CHECK (score BETWEEN 0 AND 8),
  passed boolean,
  CONSTRAINT uq_academy_attempts_user_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT ck_academy_attempts_submission CHECK (
    (status = 'open' AND submitted_at IS NULL AND score IS NULL AND passed IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND score IS NOT NULL AND passed IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_academy_attempts_user_lesson ON academy_attempts(user_id, lesson_id, created_at DESC);

CREATE TABLE IF NOT EXISTS academy_answers (
  attempt_id uuid NOT NULL REFERENCES academy_attempts(id) ON DELETE CASCADE,
  question_id varchar(64) NOT NULL,
  option_id varchar(64) NOT NULL,
  correct boolean NOT NULL,
  CONSTRAINT pk_academy_answers PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS academy_grants (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id varchar(32) NOT NULL,
  capability_ids text[] NOT NULL,
  attempt_id uuid NOT NULL REFERENCES academy_attempts(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  content_version varchar(32) NOT NULL,
  CONSTRAINT pk_academy_grants PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS ix_academy_grants_attempt ON academy_grants(attempt_id);
