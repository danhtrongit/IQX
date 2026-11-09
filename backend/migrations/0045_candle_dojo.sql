-- Candle Dojo v1.2 · tiến độ học, kho thẻ nến, thi đai và thưởng xu (IQX-Candle-Dojo-SPEC-v1.2.md).
-- Additive and idempotent: no existing column is dropped or rewritten. Shop, wallet and ledger keep their
-- structure; the only change to an existing object is two new `coin_ledger.kind` values.
--
--   cd_user_progress    one row per learner: belt (-1 none, 0 white .. 5 black), intro, daily-practice streak
--   cd_lesson_progress  best result of each lesson (stars 1-3); a row means "lesson completed"
--   cd_exam_attempts    belt exams served and graded by the server (questions and answers live here)
--   cd_user_cards       candle cards owned (price paid, ledger row, first time met in Flashback)
--   cd_rewards          first-time-only xu rewards: the primary key is the idempotency gate
--
-- Rewards (+100 intro, +100 lesson, +300 belt, +20 daily practice) are written to the ledger as kind
-- 'dojo_reward'; card purchases as kind 'card_purchase' with unique_key 'card:<user_id>:<card_id>'.

-- 1. Ledger kinds. Rebuild the CHECK from the kinds it already allows plus the two new ones, so this
--    migration stays correct whatever other migrations added to the list before or after it.
DO $$
DECLARE
  kinds text[];
BEGIN
  SELECT array_agg(DISTINCT lit[1] ORDER BY lit[1])
    INTO kinds
    FROM pg_constraint c,
         LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS lit
   WHERE c.conrelid = 'coin_ledger'::regclass
     AND c.conname = 'ck_coin_ledger_kind';
  IF kinds IS NULL THEN
    RAISE EXCEPTION 'ck_coin_ledger_kind not found on coin_ledger';
  END IF;
  kinds := ARRAY(SELECT DISTINCT k FROM unnest(kinds || ARRAY['card_purchase', 'dojo_reward']) AS k ORDER BY k);
  ALTER TABLE coin_ledger DROP CONSTRAINT ck_coin_ledger_kind;
  EXECUTE format(
    'ALTER TABLE coin_ledger ADD CONSTRAINT ck_coin_ledger_kind CHECK (kind IN (%s))',
    (SELECT string_agg(quote_literal(k), ', ') FROM unnest(kinds) AS k)
  );
END $$;

-- ck_coin_ledger_delta_sign lets unknown kinds through, so the sign of the new kinds is its own rule.
ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_candle_dojo_sign;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_candle_dojo_sign CHECK (
    (kind = 'card_purchase' AND delta < 0)
    OR (kind = 'dojo_reward' AND delta > 0)
    OR kind NOT IN ('card_purchase', 'dojo_reward')
  );

-- 2. Learner progress.
CREATE TABLE IF NOT EXISTS cd_user_progress (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- -1 = no belt yet, 0 = white (Nhập môn) ... 5 = black (Dojo 5). Only ever goes up.
  belt smallint NOT NULL DEFAULT -1,
  intro_completed_at timestamptz,
  -- Daily practice: one reward per Vietnam calendar day; the streak counts consecutive days.
  streak_days integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_drill_day date,
  drills_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_cd_user_progress_belt CHECK (belt BETWEEN -1 AND 5),
  CONSTRAINT ck_cd_user_progress_streak CHECK (streak_days >= 0 AND best_streak >= streak_days AND drills_total >= 0)
);

CREATE TABLE IF NOT EXISTS cd_lesson_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id varchar(40) NOT NULL,
  -- Best result so far: 1 = finished, +1 for the hunt, +1 for the twins (spec §5.1).
  stars smallint NOT NULL,
  hunt_star boolean NOT NULL DEFAULT false,
  twin_star boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 1,
  first_completed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_cd_lesson_progress PRIMARY KEY (user_id, lesson_id),
  CONSTRAINT ck_cd_lesson_progress_stars CHECK (stars BETWEEN 1 AND 3),
  CONSTRAINT ck_cd_lesson_progress_attempts CHECK (attempts >= 1)
);

-- 3. Belt exams: the server picks the questions, keeps the answers and grades.
CREATE TABLE IF NOT EXISTS cd_exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dojo smallint NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'open',
  -- [{qid, options: [card_id x4], answer: card_id}] in the order shown to the learner.
  questions jsonb NOT NULL,
  -- What the learner submitted and the per-question result, filled when graded.
  answers jsonb,
  score smallint,
  pass_mark smallint NOT NULL,
  belt_awarded boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT ck_cd_exam_attempts_dojo CHECK (dojo BETWEEN 1 AND 5),
  CONSTRAINT ck_cd_exam_attempts_status CHECK (status IN ('open', 'passed', 'failed', 'abandoned')),
  CONSTRAINT ck_cd_exam_attempts_score CHECK (score IS NULL OR score BETWEEN 0 AND 8)
);
CREATE INDEX IF NOT EXISTS ix_cd_exam_attempts_user ON cd_exam_attempts (user_id, dojo, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cd_exam_attempts_one_open
  ON cd_exam_attempts (user_id, dojo) WHERE status = 'open';

-- 4. Cards owned. One row per (user, card): the key is the "no double purchase" rule of spec §8.2.
CREATE TABLE IF NOT EXISTS cd_user_cards (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id varchar(32) NOT NULL,
  price_xu integer NOT NULL,
  ledger_id uuid,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  -- First time the card showed up in a Flashback match ("Đã gặp" in the Shop); NULL until then.
  seen_at timestamptz,
  CONSTRAINT pk_cd_user_cards PRIMARY KEY (user_id, card_id),
  CONSTRAINT ck_cd_user_cards_price CHECK (price_xu >= 0)
);
CREATE INDEX IF NOT EXISTS ix_cd_user_cards_card ON cd_user_cards (card_id);

-- 5. First-time-only rewards. `reward_key`: 'intro', 'lesson:<id>', 'belt:<dojo>', 'drill:<YYYY-MM-DD>'.
CREATE TABLE IF NOT EXISTS cd_rewards (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_key varchar(64) NOT NULL,
  xu integer NOT NULL,
  ledger_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_cd_rewards PRIMARY KEY (user_id, reward_key),
  CONSTRAINT ck_cd_rewards_xu CHECK (xu > 0)
);

COMMENT ON TABLE cd_user_progress IS 'Candle Dojo: đai hiện tại, Nhập môn và chuỗi luyện công của từng người học.';
COMMENT ON TABLE cd_lesson_progress IS 'Candle Dojo: kết quả cao nhất của từng bài (1-3 sao); có dòng nghĩa là đã học xong bài.';
COMMENT ON TABLE cd_exam_attempts IS 'Candle Dojo: lượt thi đai do server ra đề và chấm; đáp án chỉ nằm ở đây.';
COMMENT ON TABLE cd_user_cards IS 'Candle Dojo: thẻ nến đã mua; khoá (user, card) chặn mua trùng; seen_at = lần đầu gặp ở Flashback.';
COMMENT ON TABLE cd_rewards IS 'Candle Dojo: thưởng xu chỉ nhận một lần; khoá chính là cổng idempotent.';
