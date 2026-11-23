-- Khu Văn phòng (Office Workspace) integrity & concurrency fixes.
-- Additive and idempotent: repairs any pre-existing duplicates before enforcing uniqueness.

-- 1. Ensure bosses never hold a staff desk_index, repair any duplicate active
--    (team_id, desk_index) assignments deterministically, then enforce partial uniqueness.
UPDATE office_members
   SET desk_index = NULL,
       updated_at = now()
 WHERE role = 'boss'
   AND desk_index IS NOT NULL;

WITH ranked_desks AS (
  SELECT
    id,
    team_id,
    desk_index,
    row_number() OVER (
      PARTITION BY team_id, desk_index
      ORDER BY created_at ASC, id ASC
    ) AS desk_rn
  FROM office_members
  WHERE active = true
    AND desk_index IS NOT NULL
),
duplicate_desks AS (
  SELECT
    id,
    team_id,
    row_number() OVER (
      PARTITION BY team_id
      ORDER BY desk_index ASC, id ASC
    ) AS team_dupe_rn
  FROM ranked_desks
  WHERE desk_rn > 1
),
team_max_desk AS (
  SELECT
    team_id,
    coalesce(max(desk_index), -1) AS max_desk
  FROM office_members
  WHERE desk_index IS NOT NULL
  GROUP BY team_id
)
UPDATE office_members om
   SET desk_index = tm.max_desk + d.team_dupe_rn,
       updated_at = now()
  FROM duplicate_desks d
  JOIN team_max_desk tm ON tm.team_id = d.team_id
 WHERE om.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_office_members_team_desk_active
  ON office_members (team_id, desk_index)
  WHERE desk_index IS NOT NULL AND active = true;

-- 2. Deduplicate office_attendance per (user_id, work_date) keeping the earliest check-in,
--    then enforce global daily uniqueness per user (Spec §9 & §13.1).
WITH ranked_attendance AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, work_date
      ORDER BY checked_in_at ASC, id ASC
    ) AS rn
  FROM office_attendance
)
DELETE FROM office_attendance oa
USING ranked_attendance ra
WHERE oa.id = ra.id
  AND ra.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_office_attendance_user_date
  ON office_attendance (user_id, work_date);
