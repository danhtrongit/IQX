-- Flashback hardening (spec cập nhật 22-10, §1 FB-01..FB-12 và §5.3).
-- Additive and idempotent: no history column is dropped, no existing row is rewritten
-- except the `config` row of flashback_settings, which only gains the missing `entry_fee_xu` key.
--
--   flashback_rounds.price_source     nguồn và đơn vị giá của nến khi tạo đề (FB-04, chỉ server)
--   flashback_entries.device_id       mã thiết bị do trình duyệt sinh, gửi kèm khi tham gia (FB-07)
--   flashback_entries.join_ip         địa chỉ IP lúc tham gia (FB-07)
--   flashback_reward_holds            thưởng đang giữ của tài khoản bị đánh dấu nghi gian lận (FB-07)
--   flashback_settings.config         thêm `entry_fee_xu` (mặc định 100, 0 = miễn phí) (§1.14)
--
-- Cột chỉ server: price_source, device_id, join_ip. API người chơi không bao giờ trả về chúng.

-- 1. Nguồn giá của đề: ví dụ 'VCI:dong:adjusted' hoặc 'VND:x1000:adjusted'. NULL cho đề tạo
--    trước migration này (chưa ghi nguồn).
ALTER TABLE flashback_rounds ADD COLUMN IF NOT EXISTS price_source varchar(64);
COMMENT ON COLUMN flashback_rounds.price_source IS
  'Chỉ server: nguồn nến, đơn vị đã chuẩn hoá về đồng và chế độ giá điều chỉnh, dùng để đối soát.';

-- 2. Dấu hiệu nhận diện tài khoản phụ ghi ngay lúc tham gia một đề.
ALTER TABLE flashback_entries ADD COLUMN IF NOT EXISTS device_id varchar(64);
ALTER TABLE flashback_entries ADD COLUMN IF NOT EXISTS join_ip varchar(64);
CREATE INDEX IF NOT EXISTS ix_flashback_entries_round_device
  ON flashback_entries (round_id, device_id) WHERE device_id IS NOT NULL;
COMMENT ON COLUMN flashback_entries.device_id IS
  'Chỉ server: mã thiết bị do trình duyệt sinh (localStorage), gửi kèm khi tham gia.';
COMMENT ON COLUMN flashback_entries.join_ip IS 'Chỉ server: địa chỉ IP lúc tham gia đề.';

-- 3. Phí tham gia cấu hình được (entry_fee_xu): bỏ ràng buộc cũ fee_xu IN (0, 100).
ALTER TABLE flashback_entries DROP CONSTRAINT IF EXISTS ck_flashback_entries_fee;
ALTER TABLE flashback_entries
  ADD CONSTRAINT ck_flashback_entries_fee CHECK (fee_xu >= 0 AND fee_xu <= 100000);

-- 4. Thưởng đang giữ: tài khoản bị đánh dấu không được trả tự động. Quản trị viên bấm
--    "Trả thưởng" (ghi coin_ledger với khoá flashback_reward:{round}:{user}) hoặc "Huỷ thưởng".
CREATE TABLE IF NOT EXISTS flashback_reward_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES flashback_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES flashback_entries(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  -- Các lý do đánh dấu, cách nhau dấu phẩy: same_device, same_phone, same_ip.
  reason text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'held',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_flashback_reward_holds_round_user UNIQUE (round_id, user_id),
  CONSTRAINT ck_flashback_reward_holds_status CHECK (status IN ('held', 'released', 'voided')),
  CONSTRAINT ck_flashback_reward_holds_amount CHECK (amount > 0),
  CONSTRAINT ck_flashback_reward_holds_decided CHECK (
    (status = 'held' AND decided_at IS NULL) OR (status <> 'held' AND decided_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_flashback_reward_holds_status
  ON flashback_reward_holds (status, created_at DESC);
COMMENT ON TABLE flashback_reward_holds IS
  'Thưởng Flashback đang giữ của tài khoản bị đánh dấu nghi gian lận, chờ quản trị viên duyệt.';

-- 5. Tham số phí tham gia. Chỉ thêm khoá còn thiếu, không đổi các tham số đã có.
INSERT INTO flashback_settings (key, value) VALUES ('config', '{"entry_fee_xu": 100}'::jsonb)
ON CONFLICT (key) DO NOTHING;
UPDATE flashback_settings
   SET value = value || '{"entry_fee_xu": 100}'::jsonb, updated_at = now()
 WHERE key = 'config' AND jsonb_typeof(value) = 'object' AND NOT (value ? 'entry_fee_xu');

-- 6. Đọc nhanh rổ VN30 hiện hành.
CREATE INDEX IF NOT EXISTS ix_vn30_constituents_current
  ON vn30_constituents (symbol) WHERE effective_to IS NULL;
