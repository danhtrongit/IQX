-- IQX Academy catalog `iqx-academy-outline-13ch-71lessons-v1` (13 chapters / 71 lessons).
--
-- Additive and idempotent. academy_attempts, academy_answers and academy_grants (the legacy
-- 18-chapter / 125-lesson catalog) are never rewritten, truncated or dropped: they stay as
-- evidence and as the source of the legacy `lesson:<id>` capabilities. Lesson progress moves to
-- academy_completions, one row per user and stable lesson key (technical:<indicator id>,
-- fundamental:<metric id>, concept:hop_luu, guide:ch02-l01 ...), which survives catalog renumbering.
--
-- Legacy progress is carried over only where the lesson maps one-to-one by capability (the
-- mapping below, Hoc-Vien SPEC Appendix B / Bot SPEC Appendix C). Nothing is mapped by position:
--   * legacy ch07-l01 is ATR, the new ch07-l01 is OBV     -> ATR is not mapped, OBV comes from ch07-l04
--   * legacy ch05-l04 is ADX                               -> ADX is not mapped to Stochastic (ch05-l05)
--   * legacy ch02 (18), ch04 (10), ch09, ch13, ch16-18, ADX, ATR, ATR%, Relative Volume, Keltner,
--     BandWidth and Parabolic SAR have no lesson in the new catalog -> not mapped, grants kept as history
--   * legacy ch10/12/14/15 fundamentals are new ch09/11/12/13, mapped per metric id, not per index.

-- A. Attempts remember the catalog they belong to. Existing rows are legacy attempts; their
--    default keeps an application rollback valid.
ALTER TABLE academy_attempts
  ADD COLUMN IF NOT EXISTS catalog_version varchar(64) NOT NULL DEFAULT 'iqx-academy-legacy-18ch-125lessons',
  ADD COLUMN IF NOT EXISTS lesson_key varchar(96);
CREATE INDEX IF NOT EXISTS ix_academy_attempts_user_lesson_key
  ON academy_attempts(user_id, lesson_key, created_at DESC)
  WHERE lesson_key IS NOT NULL;

-- B. Completions: the only source of progress and of `indicator:*` / `metric:*` capabilities.
--    quiz   = 8/8 attempt (attempt_id is the evidence)
--    guide  = "Hoan thanh bai hoc" acknowledgment (request_id makes it idempotent)
--    legacy_migration = carried over from academy_grants (attempt_id is the legacy evidence)
CREATE TABLE IF NOT EXISTS academy_completions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_key varchar(96) NOT NULL,
  catalog_version varchar(64) NOT NULL,
  lesson_id varchar(32) NOT NULL,
  completion_method varchar(24) NOT NULL,
  attempt_id uuid REFERENCES academy_attempts(id),
  request_id varchar(128),
  content_version varchar(32),
  completed_at timestamptz NOT NULL DEFAULT now(),
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_academy_completions PRIMARY KEY (user_id, lesson_key),
  CONSTRAINT ck_academy_completions_key
    CHECK (lesson_key ~ '^(technical|fundamental|concept|guide):[a-z0-9_-]+$'),
  CONSTRAINT ck_academy_completions_method
    CHECK (completion_method IN ('quiz', 'guide', 'legacy_migration')),
  CONSTRAINT ck_academy_completions_evidence CHECK (
    (completion_method = 'quiz' AND attempt_id IS NOT NULL AND request_id IS NULL)
    OR (completion_method = 'guide' AND attempt_id IS NULL AND request_id IS NOT NULL)
    OR (completion_method = 'legacy_migration' AND request_id IS NULL)
  ),
  CONSTRAINT ck_academy_completions_source CHECK (jsonb_typeof(source) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_academy_completions_user_request
  ON academy_completions(user_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_academy_completions_attempt
  ON academy_completions(attempt_id)
  WHERE attempt_id IS NOT NULL;

-- C. Legacy backfill from academy_grants through an explicit mapping
--    (legacy lesson id, new lesson key, new lesson id). Re-running inserts nothing new.
INSERT INTO academy_completions
  (user_id, lesson_key, catalog_version, lesson_id, completion_method, attempt_id,
   content_version, completed_at, source)
SELECT g.user_id,
       m.lesson_key,
       'iqx-academy-outline-13ch-71lessons-v1',
       m.lesson_id,
       'legacy_migration',
       g.attempt_id,
       g.content_version,
       g.granted_at,
       jsonb_build_object(
         'migration', '0014_academy_catalog_v1',
         'legacy_catalog_version', 'iqx-academy-legacy-18ch-125lessons',
         'legacy_lesson_id', g.lesson_id,
         'legacy_capability_ids', to_jsonb(g.capability_ids)
       )
FROM academy_grants g
JOIN (VALUES
    ('ch01-l01', 'technical:rsi', 'ch01-l01'),
    ('ch01-l02', 'technical:macd', 'ch01-l02'),
    ('ch01-l03', 'technical:ma', 'ch01-l03'),
    ('ch01-l04', 'technical:bollinger', 'ch01-l04'),
    ('ch01-l05', 'technical:volume', 'ch01-l05'),
    ('ch01-l06', 'concept:hop_luu', 'ch01-l06'),
    ('ch03-l01', 'fundamental:revenue_yoy', 'ch03-l01'),
    ('ch03-l02', 'fundamental:profit_yoy', 'ch03-l02'),
    ('ch03-l03', 'fundamental:eps_yoy', 'ch03-l03'),
    ('ch03-l04', 'fundamental:gross_margin', 'ch03-l04'),
    ('ch03-l05', 'fundamental:net_margin', 'ch03-l05'),
    ('ch03-l06', 'fundamental:roe', 'ch03-l06'),
    ('ch05-l01', 'technical:ema', 'ch05-l01'),
    ('ch05-l02', 'technical:ma_cross', 'ch05-l02'),
    ('ch05-l03', 'technical:dmi', 'ch05-l03'),
    ('ch05-l05', 'technical:stochastic', 'ch05-l04'),
    ('ch05-l06', 'technical:cci', 'ch05-l05'),
    ('ch06-l01', 'fundamental:roa', 'ch06-l01'),
    ('ch06-l02', 'fundamental:roic', 'ch06-l02'),
    ('ch06-l03', 'fundamental:debt_equity', 'ch06-l03'),
    ('ch06-l04', 'fundamental:net_debt_ebitda', 'ch06-l04'),
    ('ch06-l05', 'fundamental:current_ratio', 'ch06-l05'),
    ('ch06-l06', 'fundamental:interest_coverage', 'ch06-l06'),
    ('ch07-l04', 'technical:obv', 'ch07-l01'),
    ('ch07-l05', 'technical:mfi', 'ch07-l02'),
    ('ch07-l06', 'technical:cmf', 'ch07-l03'),
    ('ch08-l01', 'fundamental:cfo_margin', 'ch08-l01'),
    ('ch08-l02', 'fundamental:cfo_profit', 'ch08-l02'),
    ('ch08-l03', 'fundamental:fcf_margin', 'ch08-l03'),
    ('ch08-l04', 'fundamental:fcf_yoy', 'ch08-l04'),
    ('ch08-l05', 'fundamental:capex_revenue', 'ch08-l05'),
    ('ch08-l06', 'fundamental:accrual', 'ch08-l06'),
    ('ch10-l01', 'fundamental:pe', 'ch09-l01'),
    ('ch10-l02', 'fundamental:pb', 'ch09-l02'),
    ('ch10-l03', 'fundamental:ps', 'ch09-l03'),
    ('ch10-l04', 'fundamental:ev_ebitda', 'ch09-l04'),
    ('ch10-l05', 'fundamental:peg', 'ch09-l05'),
    ('ch10-l06', 'fundamental:fcf_yield', 'ch09-l06'),
    ('ch11-l01', 'technical:donchian', 'ch10-l01'),
    ('ch11-l04', 'technical:roc', 'ch10-l02'),
    ('ch11-l05', 'technical:williams_r', 'ch10-l03'),
    ('ch12-l01', 'fundamental:revenue_cagr3', 'ch11-l01'),
    ('ch12-l02', 'fundamental:profit_cagr3', 'ch11-l02'),
    ('ch12-l03', 'fundamental:eps_cagr3', 'ch11-l03'),
    ('ch12-l04', 'fundamental:asset_turnover', 'ch11-l04'),
    ('ch12-l05', 'fundamental:ccc', 'ch11-l05'),
    ('ch12-l06', 'fundamental:working_cap_turnover', 'ch11-l06'),
    ('ch14-l01', 'fundamental:revenue_growth_stability', 'ch12-l01'),
    ('ch14-l02', 'fundamental:eps_growth_stability', 'ch12-l02'),
    ('ch14-l03', 'fundamental:net_margin_stability', 'ch12-l03'),
    ('ch14-l04', 'fundamental:roic_stability', 'ch12-l04'),
    ('ch14-l05', 'fundamental:fcf_positive_streak', 'ch12-l05'),
    ('ch14-l06', 'fundamental:profit_positive_streak', 'ch12-l06'),
    ('ch15-l01', 'fundamental:dividend_yield', 'ch13-l01'),
    ('ch15-l02', 'fundamental:payout_ratio', 'ch13-l02'),
    ('ch15-l03', 'fundamental:dividend_cagr3', 'ch13-l03'),
    ('ch15-l04', 'fundamental:share_count_yoy', 'ch13-l04'),
    ('ch15-l05', 'fundamental:buyback_yield', 'ch13-l05'),
    ('ch15-l06', 'fundamental:shareholder_yield', 'ch13-l06')
) AS m(legacy_lesson_id, lesson_key, lesson_id) ON m.legacy_lesson_id = g.lesson_id
ON CONFLICT (user_id, lesson_key) DO NOTHING;
