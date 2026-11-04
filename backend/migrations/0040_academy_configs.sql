-- Học viện v4.1 · Cấu hình Học viện theo trưởng nhóm (IQX-Hoc-Vien-SPEC-BoSung §8.1).
-- Additive and idempotent. A config says WHICH chapters of the 12-chapter catalog a group learns and HOW (free or
-- sequential). Nothing is stored per learner: the config of a user is resolved on every call from his group
-- (users.group_lead_id, admin spec v1.1), so a config edit or a change of group applies at once and no progress row is
-- ever rewritten, moved or deleted (academy_completions / attempts / rewards stay as they are, spec §7).
--
--   * exactly one `default` config (seeded below: Học tự do, all 12 chapters, like Học viện v4);
--   * at most one `leader` config per team lead (a lead without one uses the default, spec §1.1);
--   * `chapter_ids` are the fixed chapter ids of the catalog (`ch01`..`ch12`) in catalog order; the displayed chapter
--     numbers are computed when the Academy API answers (spec §2.3), never stored.

CREATE TABLE IF NOT EXISTS academy_configs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type  varchar(8)  NOT NULL,
  -- null for the default config; a team lead profile otherwise (a lead is never a member of a group).
  leader_id   uuid        REFERENCES team_lead_profiles(user_id) ON DELETE CASCADE,
  mode        varchar(16) NOT NULL,
  chapter_ids text[]      NOT NULL,
  updated_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_academy_configs_owner CHECK (
    (owner_type = 'default' AND leader_id IS NULL) OR (owner_type = 'leader' AND leader_id IS NOT NULL)
  ),
  CONSTRAINT ck_academy_configs_mode CHECK (mode IN ('free', 'sequential')),
  -- At least one chapter (spec §1.2); which ids are valid is the catalog's business (checked by the API).
  CONSTRAINT ck_academy_configs_chapters CHECK (cardinality(chapter_ids) >= 1)
);

-- Only one default config, at most one config per team lead (spec §8.1).
CREATE UNIQUE INDEX IF NOT EXISTS ux_academy_configs_default
  ON academy_configs (owner_type) WHERE owner_type = 'default';
CREATE UNIQUE INDEX IF NOT EXISTS ux_academy_configs_leader
  ON academy_configs (leader_id) WHERE owner_type = 'leader';

-- Change log (spec §1.3): who changed what, when, before and after. No foreign key on config_id: the log of a config
-- that was deleted ("Về mặc định") stays, with the leader it belonged to.
CREATE TABLE IF NOT EXISTS academy_config_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id   uuid        NOT NULL,
  owner_type  varchar(8)  NOT NULL,
  leader_id   uuid,
  action      varchar(8)  NOT NULL,
  changed_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  -- { "mode": "free" | "sequential", "chapter_ids": ["ch01", ...] }; null before a create and after a delete.
  before      jsonb,
  after       jsonb,
  CONSTRAINT ck_academy_config_logs_owner CHECK (owner_type IN ('default', 'leader')),
  CONSTRAINT ck_academy_config_logs_action CHECK (action IN ('create', 'update', 'delete'))
);
CREATE INDEX IF NOT EXISTS ix_academy_config_logs_config
  ON academy_config_logs (config_id, changed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_academy_config_logs_leader
  ON academy_config_logs (leader_id, changed_at DESC) WHERE leader_id IS NOT NULL;

-- The default config at rollout (owner decision, spec §11.1): Học tự do, all 12 chapters.
INSERT INTO academy_configs (owner_type, leader_id, mode, chapter_ids)
SELECT 'default', NULL, 'free',
       ARRAY['ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch10', 'ch11', 'ch12']
 WHERE NOT EXISTS (SELECT 1 FROM academy_configs WHERE owner_type = 'default');
