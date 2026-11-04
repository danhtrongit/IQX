-- Flashback v2.1 §1: phòng chơi tối đa 30 người (trước đây 1-4).
-- Hai ràng buộc cùng đổi: fb_rooms.max_players (thiết lập phòng) và fb_matches.player_count (số
-- người của một ván). ck_fb_rooms_stake (cược chỉ khi max_players > 1) và ck_fb_matches_stake
-- (pot = stake * player_count) giữ nguyên. Idempotent: DROP IF EXISTS rồi ADD lại; không sửa dữ liệu.
ALTER TABLE fb_rooms DROP CONSTRAINT IF EXISTS ck_fb_rooms_max_players;
ALTER TABLE fb_rooms
  ADD CONSTRAINT ck_fb_rooms_max_players CHECK (max_players BETWEEN 1 AND 30);

ALTER TABLE fb_matches DROP CONSTRAINT IF EXISTS ck_fb_matches_players;
ALTER TABLE fb_matches
  ADD CONSTRAINT ck_fb_matches_players CHECK (player_count BETWEEN 1 AND 30);
