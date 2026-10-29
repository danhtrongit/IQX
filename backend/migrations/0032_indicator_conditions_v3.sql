-- Indicator conditions V3 (SPEC V3 §6, design §3.4): DDL and backups only. Additive and
-- idempotent: no existing row is updated or deleted here. The configs themselves are reset to
-- the V3 defaults afterwards by `scripts/indicator-conditions-v3-migrate.ts` (TS, because a
-- revision's config_hash is computed in TypeScript), which reads these backups for rollback.
--
--   backup_v3_shared_config_revisions   full copy of every shared-config revision
--   backup_v3_effective_config_sessions full copy of every effective-session row
--   backup_v3_practice_progress         the Luyện tập drafts (only the columns the reset touches)
--   backup_v3_strategy_alerts           full copy of the alert definitions (current_version,
--                                       enabled and paused_at change when an alert is re-pinned)
--   backup_v3_strategy_alert_versions   full copy of the pinned alert versions
--   bot_config_pauses                   silent Bot pause of the upgrade (SPEC V3 §6.2)
--
-- Re-running only adds rows that are not backed up yet (ON CONFLICT DO NOTHING): a backup row
-- is never overwritten, so it keeps the value it had before the first run.

-- 1. Shared config: revisions and their effective sessions.
CREATE TABLE IF NOT EXISTS backup_v3_shared_config_revisions (
  LIKE shared_config_revisions INCLUDING DEFAULTS,
  PRIMARY KEY (id)
);
INSERT INTO backup_v3_shared_config_revisions
SELECT * FROM shared_config_revisions
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS backup_v3_effective_config_sessions (
  LIKE effective_config_sessions INCLUDING DEFAULTS,
  PRIMARY KEY (user_id, revision)
);
INSERT INTO backup_v3_effective_config_sessions
SELECT * FROM effective_config_sessions
ON CONFLICT (user_id, revision) DO NOTHING;

-- 2. Luyện tập drafts. Locked practice_runs are never touched, so they are not copied.
CREATE TABLE IF NOT EXISTS backup_v3_practice_progress (
  user_id uuid NOT NULL,
  indicator_id varchar(32) NOT NULL,
  set_version varchar(64) NOT NULL,
  draft jsonb NOT NULL,
  draft_revision integer NOT NULL,
  PRIMARY KEY (user_id, indicator_id, set_version)
);
INSERT INTO backup_v3_practice_progress (user_id, indicator_id, set_version, draft, draft_revision)
SELECT user_id, indicator_id, set_version, draft, draft_revision FROM practice_progress
ON CONFLICT (user_id, indicator_id, set_version) DO NOTHING;

-- 3. Strategy alerts (owner decision 2: re-pinned to the migrated revision; history kept).
CREATE TABLE IF NOT EXISTS backup_v3_strategy_alerts (
  LIKE strategy_alerts INCLUDING DEFAULTS,
  PRIMARY KEY (id)
);
INSERT INTO backup_v3_strategy_alerts
SELECT * FROM strategy_alerts
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS backup_v3_strategy_alert_versions (
  LIKE strategy_alert_versions INCLUDING DEFAULTS,
  PRIMARY KEY (alert_id, version)
);
INSERT INTO backup_v3_strategy_alert_versions
SELECT * FROM strategy_alert_versions
ON CONFLICT (alert_id, version) DO NOTHING;

COMMENT ON TABLE backup_v3_shared_config_revisions IS
  'Indicator conditions V3: shared-config revisions before the reset to V3 defaults (rollback).';
COMMENT ON TABLE backup_v3_effective_config_sessions IS
  'Indicator conditions V3: effective-session rows before the reset to V3 defaults (rollback).';
COMMENT ON TABLE backup_v3_practice_progress IS
  'Indicator conditions V3: Luyện tập drafts before the reset to V3 defaults (rollback).';
COMMENT ON TABLE backup_v3_strategy_alerts IS
  'Indicator conditions V3: strategy alerts before the re-pin to the migrated revision (rollback).';
COMMENT ON TABLE backup_v3_strategy_alert_versions IS
  'Indicator conditions V3: strategy alert versions before the re-pin (rollback).';

-- 4. Silent Bot pause (SPEC V3 §6.2). Kept apart from bot_accounts.status so an admin
--    suspension stays distinct. The Bot skips a session while the row exists and either
--    resume_revision is NULL or the revision effective for that session is older than it;
--    saving the shared config sets resume_revision (and resumed_at) in the same transaction.
CREATE TABLE IF NOT EXISTS bot_config_pauses (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reason varchar(48) NOT NULL CHECK (reason = 'indicator_conditions_v3'),
  paused_at timestamptz NOT NULL DEFAULT now(),
  -- Revision appended by the migration script (the V3 defaults); NULL when none was written.
  paused_revision integer CHECK (paused_revision IS NULL OR paused_revision >= 1),
  -- First revision the user saved after the pause; the Bot runs again once it is effective.
  resume_revision integer CHECK (resume_revision IS NULL OR resume_revision >= 1),
  resumed_at timestamptz,
  CONSTRAINT ck_bot_config_pauses_resume CHECK (
    (resume_revision IS NULL AND resumed_at IS NULL)
    OR (resume_revision IS NOT NULL AND resumed_at IS NOT NULL)
  )
);
COMMENT ON TABLE bot_config_pauses IS
  'Bot tạm dừng im lặng khi nâng cấp điều kiện chỉ báo V3; hết tạm dừng khi cấu hình lưu sau đó có hiệu lực.';

-- 5. Log the backup sizes.
DO $$
BEGIN
  RAISE NOTICE 'indicator conditions v3 backup: % shared-config revision(s), % effective session(s), % practice draft(s), % strategy alert(s), % alert version(s)',
    (SELECT count(*) FROM backup_v3_shared_config_revisions),
    (SELECT count(*) FROM backup_v3_effective_config_sessions),
    (SELECT count(*) FROM backup_v3_practice_progress),
    (SELECT count(*) FROM backup_v3_strategy_alerts),
    (SELECT count(*) FROM backup_v3_strategy_alert_versions);
  RAISE NOTICE 'indicator conditions v3: % Bot pause row(s) present',
    (SELECT count(*) FROM bot_config_pauses);
END $$;
