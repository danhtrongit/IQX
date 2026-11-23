-- Khu Văn phòng (Office Workspace): 13 office tables + notification type/index updates.
-- Spec: "Spec · Khu Văn phòng" (Nov 23, 2026). Additive and idempotent.

-- 1. Extend user_notifications to support the 6 office notification triggers while keeping
--    existing daily deduplication strictly on ('bulletin', 'bot_trades').
ALTER TABLE user_notifications
  ALTER COLUMN type TYPE varchar(32);

ALTER TABLE user_notifications
  DROP CONSTRAINT IF EXISTS ck_user_notifications_type;

ALTER TABLE user_notifications
  ADD CONSTRAINT ck_user_notifications_type CHECK (
    type IN (
      'bulletin',
      'bot_trades',
      'office_task_assigned',
      'office_task_approved',
      'office_task_returned',
      'office_task_submitted',
      'office_proposal_sent',
      'office_proposal_replied'
    )
  );

ALTER TABLE user_notifications
  DROP CONSTRAINT IF EXISTS uq_user_notifications_user_type_date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_user_type_date
  ON user_notifications (user_id, type, trade_date)
  WHERE type IN ('bulletin', 'bot_trades');

CREATE INDEX IF NOT EXISTS ix_user_notifications_office_created
  ON user_notifications (created_at)
  WHERE type LIKE 'office_%';

-- 2. Office teams: one virtual office per team lead (boss).
CREATE TABLE IF NOT EXISTS office_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  checkin_on_time_cutoff text NOT NULL DEFAULT '08:30',
  checkin_lock_cutoff text NOT NULL DEFAULT '12:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Office team members (boss + SACO staff).
CREATE TABLE IF NOT EXISTS office_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('boss', 'staff')),
  desk_index integer,
  join_date date NOT NULL DEFAULT CURRENT_DATE,
  accent_color text NOT NULL DEFAULT '#1D6FE8',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_office_members_team_user UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_office_members_team_active
  ON office_members (team_id, active, role, desk_index);
CREATE INDEX IF NOT EXISTS ix_office_members_user_active
  ON office_members (user_id, active);

-- 4. Task assignments (source group for "Đã giao", edit, delete, repeat_daily).
CREATE TABLE IF NOT EXISTS office_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('day', 'month', 'kpi')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  points integer NOT NULL CHECK (points BETWEEN 1 AND 1000),
  repeat_daily boolean NOT NULL DEFAULT false,
  due_date date,
  period_month text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_office_assignments_team_created
  ON office_assignments (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_office_assignments_repeat_active
  ON office_assignments (team_id, kind)
  WHERE repeat_daily = true AND deleted_at IS NULL;

-- 5. Target recipients of an assignment (used to instantiate daily repeating tasks).
CREATE TABLE IF NOT EXISTS office_assignment_targets (
  assignment_id uuid NOT NULL REFERENCES office_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_office_assignment_targets_user
  ON office_assignment_targets (user_id);

-- 6. Individual tasks per staff member (5-state lifecycle).
CREATE TABLE IF NOT EXISTS office_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES office_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('day', 'month', 'kpi')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  points integer NOT NULL CHECK (points BETWEEN 1 AND 1000),
  points_snapshot integer,
  repeat_daily boolean NOT NULL DEFAULT false,
  task_date date NOT NULL,
  due_date date,
  period_month text NOT NULL,
  status text NOT NULL CHECK (status IN ('todo', 'pending', 'returned', 'done', 'expired')),
  submit_note text CHECK (submit_note IS NULL OR char_length(submit_note) <= 500),
  submitted_at timestamptz,
  return_reason text CHECK (return_reason IS NULL OR char_length(return_reason) <= 300),
  returned_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_office_tasks_assignment_user_date
  ON office_tasks (assignment_id, user_id, task_date);
CREATE INDEX IF NOT EXISTS ix_office_tasks_team_user_status
  ON office_tasks (team_id, user_id, status);
CREATE INDEX IF NOT EXISTS ix_office_tasks_team_review
  ON office_tasks (team_id, submitted_at ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_office_tasks_team_kind_date
  ON office_tasks (team_id, kind, task_date);
CREATE INDEX IF NOT EXISTS ix_office_tasks_team_period
  ON office_tasks (team_id, period_month, kind);

-- 7. Task lifecycle audit trail.
CREATE TABLE IF NOT EXISTS office_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES office_tasks(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_office_task_events_task_created
  ON office_task_events (task_id, created_at DESC);

-- 8. Staff daily attendance check-ins (absence = no row for work_date).
CREATE TABLE IF NOT EXISTS office_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'late')),
  checked_in_at timestamptz NOT NULL,
  CONSTRAINT uq_office_attendance_team_user_date UNIQUE (team_id, user_id, work_date)
);

CREATE INDEX IF NOT EXISTS ix_office_attendance_team_date
  ON office_attendance (team_id, work_date);

-- 9. Staff-to-boss proposals (immutable once sent, single reply from boss).
CREATE TABLE IF NOT EXISTS office_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'seen', 'replied')),
  seen_at timestamptz,
  reply text CHECK (reply IS NULL OR char_length(btrim(reply)) BETWEEN 1 AND 1000),
  replied_by uuid REFERENCES users(id) ON DELETE SET NULL,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_office_proposals_team_created
  ON office_proposals (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_office_proposals_team_user_created
  ON office_proposals (team_id, user_id, created_at DESC);

-- 10. Private sticky notes (strictly scoped to author user_id).
CREATE TABLE IF NOT EXISTS office_sticky_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color text NOT NULL DEFAULT 'y' CHECK (color IN ('y', 'p', 'b', 'g')),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_office_sticky_notes_team_user
  ON office_sticky_notes (team_id, user_id, created_at DESC);

-- 11. Boss private notes on a staff member (isolated per team_id).
CREATE TABLE IF NOT EXISTS office_member_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  boss_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_office_member_notes_team_member
  ON office_member_notes (team_id, member_user_id, created_at DESC);

-- 12. Monthly achievement points with earliest reached_at tie-breaker.
CREATE TABLE IF NOT EXISTS office_points_monthly (
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  reached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id, period_month)
);

CREATE INDEX IF NOT EXISTS ix_office_points_monthly_ranking
  ON office_points_monthly (team_id, period_month, points DESC, reached_at ASC);

-- 13. Office meetings schedule.
CREATE TABLE IF NOT EXISTS office_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  platform text NOT NULL DEFAULT 'Google Meet',
  meeting_url text NOT NULL,
  agenda jsonb NOT NULL DEFAULT '[]'::jsonb,
  recurrence_weekly boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_office_meetings_team_starts
  ON office_meetings (team_id, starts_at ASC);

-- 14. Office shared documents metadata (files stored under MEDIA_ROOT/office-docs).
CREATE TABLE IF NOT EXISTS office_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES office_teams(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  file_name text NOT NULL,
  file_ext text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
  storage_rel_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_office_documents_team_created
  ON office_documents (team_id, created_at DESC);
