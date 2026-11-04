-- Flashback v2 · Phòng chơi: "Sẵn sàng" và "Đuổi khỏi phòng".
-- Additive and idempotent.
--
--   fb_room_members.ready_at   when a non-owner member pressed "Sẵn sàng" in the waiting room;
--                              NULL = not ready. Reset for the whole room when a match starts
--                              and when the room goes back to waiting ("Chơi lại").
--
-- A kick needs no new table: it is a membership row closed with left_reason = 'kicked' (plus the
-- one-time notice shown to the kicked player by GET rooms/me). The 10-minute rejoin block reads
-- those rows, so this index only keeps that lookup cheap.

ALTER TABLE fb_room_members ADD COLUMN IF NOT EXISTS ready_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_fb_room_members_kicked
  ON fb_room_members (room_id, user_id, left_at DESC) WHERE left_reason = 'kicked';

COMMENT ON COLUMN fb_room_members.ready_at IS 'Flashback v2: thời điểm thành viên bấm Sẵn sàng ở phòng chờ; NULL là chưa sẵn sàng. Chủ phòng luôn được tính là sẵn sàng.';
