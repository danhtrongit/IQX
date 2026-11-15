-- Thần Tài v2 (update 15-11): daily I Ching ritual (gieo quẻ, dự đoán VNINDEX, cầu mã) in Khu giao dịch.
-- Spec: backend/docs/than-tai/SPEC.md; names and types: backend/docs/than-tai/CONTRACT.md.
-- Additive and idempotent. The old ritual tables (tf_rituals, tf_ritual_sessions) are kept untouched.
-- The 64 quẻ and the lá rows are seeded by 0050_than_tai_library.sql.
--
--   tf_kd_que         64 hexagrams (King Wen order), fixed content except edits in admin.
--   tf_kd_la          one hexagram + one moving line = one lá (up to 384); only `active` lá can be drawn.
--   tf_hanh_config    5 elements: industries, colours and direction shown on the card.
--   tf_khan_daily     one ritual per actor and VN day: the drawn lá, the VNINDEX call and up to 3 tickers.
--   tf_la_seen        lá an actor already drew in the current no-repeat cycle of its rank.
--
-- `actor_key` is 'u:<users.id>' or 'g:<tf_guests.id>' (see floor-actor.ts); there is deliberately no FK to users.

CREATE TABLE IF NOT EXISTS tf_kd_que (
  id smallint PRIMARY KEY CHECK (id BETWEEN 1 AND 64),
  ten text NOT NULL,
  chu_han text NOT NULL,
  -- Six lines drawn bottom to top: '1' = yang (solid), '0' = yin (broken); index 0 is the bottom line.
  hao char(6) NOT NULL CHECK (hao ~ '^[01]{6}$'),
  que_tren text NOT NULL CHECK (que_tren IN ('can', 'khon', 'chan', 'kham', 'can_son', 'ton', 'ly', 'doai')),
  que_duoi text NOT NULL CHECK (que_duoi IN ('can', 'khon', 'chan', 'kham', 'can_son', 'ton', 'ly', 'doai')),
  tuong text NOT NULL,
  thoan text NOT NULL,
  thoan_nghia text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tf_kd_la (
  id serial PRIMARY KEY,
  que_id smallint NOT NULL REFERENCES tf_kd_que(id),
  hao_dong smallint NOT NULL CHECK (hao_dong BETWEEN 1 AND 6),
  ten_hao text NOT NULL,
  hao_van text NOT NULL,
  hao_nghia text NOT NULL,
  hang text NOT NULL CHECK (hang IN ('dai_cat', 'thuong_cat', 'trung_cat', 'tieu_cat', 'than_trong')),
  luan text NOT NULL,
  chot text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tf_kd_la_que_hao UNIQUE (que_id, hao_dong)
);

CREATE INDEX IF NOT EXISTS ix_tf_kd_la_hang_active ON tf_kd_la (hang) WHERE active;

CREATE TABLE IF NOT EXISTS tf_hanh_config (
  hanh text PRIMARY KEY CHECK (hanh IN ('kim', 'moc', 'thuy', 'hoa', 'tho')),
  nganh text[] NOT NULL DEFAULT '{}',
  -- [{ "ten": "Trắng", "hex": "#F8FAFC" }, ...]
  mau jsonb NOT NULL DEFAULT '[]'::jsonb,
  huong text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tf_khan_daily (
  actor_key text NOT NULL,
  -- Vietnam calendar day (UTC+7).
  ngay date NOT NULL,
  la_id integer NOT NULL REFERENCES tf_kd_la(id),
  hang text NOT NULL CHECK (hang IN ('dai_cat', 'thuong_cat', 'trung_cat', 'tieu_cat', 'than_trong')),
  -- NULL until step 2 is confirmed.
  du_doan text CHECK (du_doan IN ('up', 'flat', 'down')),
  -- NULL until step 3 is confirmed; '{}' = the actor skipped step 3.
  ma_cau text[] CHECK (ma_cau IS NULL OR cardinality(ma_cau) <= 3),
  -- Next step to do: 2 after the draw, 3 after the prediction, 4 once step 3 is done or skipped.
  step smallint NOT NULL DEFAULT 2 CHECK (step BETWEEN 1 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_key, ngay),
  -- Tickers can only be offered after the prediction.
  CONSTRAINT ck_tf_khan_daily_order CHECK (ma_cau IS NULL OR du_doan IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_tf_khan_daily_ngay ON tf_khan_daily (ngay);

CREATE TABLE IF NOT EXISTS tf_la_seen (
  actor_key text NOT NULL,
  hang text NOT NULL CHECK (hang IN ('dai_cat', 'thuong_cat', 'trung_cat', 'tieu_cat', 'than_trong')),
  la_id integer NOT NULL REFERENCES tf_kd_la(id) ON DELETE CASCADE,
  PRIMARY KEY (actor_key, la_id)
);

CREATE INDEX IF NOT EXISTS ix_tf_la_seen_actor_hang ON tf_la_seen (actor_key, hang);

-- Element configuration seeded from the spec tables "Ngành theo hành" and "Hợp, kiêng, màu và hướng".
-- Whatever an admin edits later is kept: re-running this file never overwrites an existing row.
INSERT INTO tf_hanh_config (hanh, nganh, mau, huong) VALUES
  (
    'kim',
    ARRAY['Ngân hàng', 'Chứng khoán', 'Bảo hiểm', 'Thép và kim loại', 'Vàng bạc', 'Ô tô và máy móc'],
    '[{"ten": "Trắng", "hex": "#F4F4F5"}, {"ten": "Vàng ánh kim", "hex": "#D4AF37"}]'::jsonb,
    'Tây'
  ),
  (
    'moc',
    ARRAY['Gỗ', 'Giấy', 'Cao su', 'Nông nghiệp và phân bón', 'Dệt may', 'Dược phẩm', 'Giáo dục'],
    '[{"ten": "Xanh lá", "hex": "#22A653"}, {"ten": "Xanh rêu", "hex": "#6B7F3A"}]'::jsonb,
    'Đông'
  ),
  (
    'thuy',
    ARRAY['Thủy sản', 'Cảng biển và vận tải biển', 'Logistics', 'Nước sạch', 'Đồ uống', 'Du lịch'],
    '[{"ten": "Đen huyền", "hex": "#1F2937"}, {"ten": "Xanh lam", "hex": "#2563EB"}]'::jsonb,
    'Bắc'
  ),
  (
    'hoa',
    ARRAY['Điện', 'Dầu khí', 'Xăng dầu', 'Công nghệ và viễn thông', 'Truyền thông', 'Hàng điện tử'],
    '[{"ten": "Đỏ", "hex": "#DC2626"}, {"ten": "Tím", "hex": "#7E22CE"}]'::jsonb,
    'Nam'
  ),
  (
    'tho',
    ARRAY['Bất động sản', 'Khu công nghiệp', 'Xây dựng', 'Xi măng và vật liệu', 'Khoáng sản'],
    '[{"ten": "Vàng đất", "hex": "#C99A2E"}, {"ten": "Nâu", "hex": "#8B5A2B"}]'::jsonb,
    'Đông Bắc'
  )
ON CONFLICT (hanh) DO NOTHING;
