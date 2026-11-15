-- Khu giao dịch: khách không cần đăng nhập (update 15-11). Khách chỉ nhập tên và chọn nhân vật; trình
-- duyệt giữ một token ngẫu nhiên, server chỉ lưu băm SHA-256 của token. Additive and idempotent.

CREATE TABLE IF NOT EXISTS tf_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  avatar text NOT NULL,
  color text NOT NULL DEFAULT 'default',
  created_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tf_guests_last_seen ON tf_guests (last_seen_at);
