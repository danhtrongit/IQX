-- Tab IQX của Bộ lọc và Backtest + Quản trị › Mẫu IQX
-- (backend/docs/update-19-11/IQX-Tab-IQX-Loc-Backtest-SPEC.md §4.1, §5).
-- Additive: three new tables, one nullable column on shared_config_revisions and the seed of the
-- 6 Bộ lọc IQX + 5 Chiến lược IQX (version 1, shown, reason "Khởi tạo"). Safe to run twice.

-- 1. One row per Bộ lọc IQX / Chiến lược IQX. `current_version` is null until the first publish;
--    `draft` is admin-only work in progress and never reaches users.
CREATE TABLE IF NOT EXISTS iqx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(16) NOT NULL,
  slug varchar(64) NOT NULL,
  sort_order integer NOT NULL,
  visibility varchar(8) NOT NULL DEFAULT 'shown',
  current_version integer,
  draft jsonb,
  draft_updated_at timestamptz,
  draft_updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_iqx_templates_kind CHECK (kind IN ('filter', 'strategy')),
  CONSTRAINT ck_iqx_templates_visibility CHECK (visibility IN ('shown', 'hidden')),
  CONSTRAINT ck_iqx_templates_version CHECK (current_version IS NULL OR current_version >= 1),
  CONSTRAINT uq_iqx_templates_kind_slug UNIQUE (kind, slug)
);
CREATE INDEX IF NOT EXISTS ix_iqx_templates_kind_order ON iqx_templates (kind, sort_order);

-- 2. Published versions: immutable (no UPDATE, no DELETE), enforced by a trigger.
CREATE TABLE IF NOT EXISTS iqx_template_versions (
  template_id uuid NOT NULL REFERENCES iqx_templates (id) ON DELETE RESTRICT,
  version integer NOT NULL,
  content jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES users (id) ON DELETE SET NULL,
  reason varchar(500) NOT NULL,
  CONSTRAINT pk_iqx_template_versions PRIMARY KEY (template_id, version),
  CONSTRAINT ck_iqx_template_versions_version CHECK (version >= 1)
);

CREATE OR REPLACE FUNCTION iqx_template_versions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- ON DELETE SET NULL of published_by (a deleted admin account) is the only allowed change.
  IF TG_OP = 'UPDATE'
     AND NEW.template_id = OLD.template_id AND NEW.version = OLD.version
     AND NEW.content = OLD.content AND NEW.published_at = OLD.published_at
     AND NEW.reason = OLD.reason AND NEW.published_by IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'iqx_template_versions is immutable';
END $$;

DROP TRIGGER IF EXISTS tr_iqx_template_versions_immutable ON iqx_template_versions;
CREATE TRIGGER tr_iqx_template_versions_immutable
  BEFORE UPDATE OR DELETE ON iqx_template_versions
  FOR EACH ROW EXECUTE FUNCTION iqx_template_versions_immutable();

-- 3. "Người dùng bấm Dùng": one event per fill (§5.7); the admin list counts the last 30 days.
CREATE TABLE IF NOT EXISTS iqx_template_used (
  id bigserial PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES iqx_templates (id) ON DELETE CASCADE,
  version integer NOT NULL,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_iqx_template_used_template_time ON iqx_template_used (template_id, created_at);

-- 4. Lịch sử cấu hình Bot: where a saved revision came from (§3.3.6), e.g.
--    "Backtest · lần chạy {id} · từ Chiến lược IQX {tên}". Null for every earlier revision.
ALTER TABLE shared_config_revisions ADD COLUMN IF NOT EXISTS source_label varchar(300);

-- @seed (generated from backend/src/modules/iqx-templates/iqx-templates.seed.json; a unit test keeps the two equal)
WITH seed (kind, slug, sort_order, content) AS (
VALUES
  ('strategy', 'xuhuong', 1, '{"name":"Theo xu hướng","idea":"Đi theo xu hướng trung hạn bằng giao cắt hai đường trung bình.","origin":"Theo xu hướng (trend following)","when_wrong":"Thị trường đi ngang tạo nhiều tín hiệu giả, vào lệnh trễ ở đầu xu hướng.","definition":{"max_holding":60,"indicators":{"ma_cross":{"master_enabled":true,"buy":{"enabled":true,"rules":[{"id":"ma_cross.cross","enabled":true,"fast":20,"op":"cross_up","slow":50}]},"sell":{"enabled":true,"rules":[{"id":"ma_cross.cross","enabled":true,"fast":20,"op":"cross_down","slow":50}]}}}}}'),
  ('strategy', 'phadinh', 2, '{"name":"Phá đỉnh","idea":"Mua khi giá vượt đỉnh 20 phiên có khối lượng xác nhận.","origin":"Kênh Donchian; động lượng giá","when_wrong":"Hay thua khi thị trường đi ngang, vì có nhiều cú phá đỉnh giả.","definition":{"max_holding":30,"indicators":{"donchian":{"master_enabled":true,"buy":{"enabled":true,"rules":[{"id":"donchian.break","enabled":true,"op":">","band":"upper","period":20}]},"sell":{"enabled":true,"rules":[{"id":"donchian.break","enabled":true,"op":"<","band":"lower","period":10}]}},"volume":{"master_enabled":true,"buy":{"enabled":true,"params":{"lookback":20,"mult":1.5},"rules":[{"id":"r1","kind":"compare","lhs":{"kind":"series","key":"close","offset":0},"op":">","rhs":{"kind":"series","key":"close","offset":-1},"allowed_ops":[">","<"]},{"id":"r2","kind":"compare","lhs":{"kind":"series","key":"volume","offset":0},"op":">","rhs":{"kind":"series","key":"threshold","offset":0},"allowed_ops":[">","<"]}]},"sell":{"enabled":false,"params":{"lookback":20,"mult":1},"rules":[{"id":"r1","kind":"compare","lhs":{"kind":"series","key":"close","offset":0},"op":"<","rhs":{"kind":"series","key":"close","offset":-1},"allowed_ops":[">","<"]},{"id":"r2","kind":"compare","lhs":{"kind":"series","key":"volume","offset":0},"op":">","rhs":{"kind":"series","key":"threshold","offset":0},"allowed_ops":[">","<"]}]}}}}}'),
  ('strategy', 'macd', 3, '{"name":"Động lượng MACD","idea":"Mua khi động lượng chuyển dương và MACD đang ở vùng tích cực.","origin":"Gerald Appel (MACD)","when_wrong":"Tín hiệu đến chậm; thị trường giật mạnh dễ mua đỉnh, bán đáy.","definition":{"max_holding":40,"indicators":{"macd":{"master_enabled":true,"buy":{"enabled":true,"rules":[{"id":"macd.signal","enabled":true,"fast":12,"slow":26,"op":"cross_up","signal":9},{"id":"macd.zero","enabled":true,"fast":12,"slow":26,"op":">"},{"id":"macd.hist","enabled":false,"fast":12,"slow":26,"signal":9,"dir":"up"}]},"sell":{"enabled":true,"rules":[{"id":"macd.signal","enabled":true,"fast":12,"slow":26,"op":"cross_down","signal":9},{"id":"macd.zero","enabled":false,"fast":12,"slow":26,"op":"<"},{"id":"macd.hist","enabled":false,"fast":12,"slow":26,"signal":9,"dir":"down"}]}}}}}'),
  ('strategy', 'hoiphuc', 4, '{"name":"Hồi phục quá bán","idea":"Mua nhịp hồi ngắn sau khi giá rơi ra ngoài dải dưới Bollinger.","origin":"Hiệu ứng đảo chiều ngắn hạn","when_wrong":"Trong xu hướng giảm mạnh, quá bán có thể còn quá bán hơn.","definition":{"max_holding":10,"indicators":{"bollinger":{"master_enabled":true,"buy":{"enabled":true,"rules":[{"id":"bollinger.price_action","enabled":true,"action":"reenter_lower","period":20,"mult":2},{"id":"bollinger.price_dir","enabled":false,"dir":"up"},{"id":"bollinger.width","enabled":false,"period":20,"mult":2,"dir":"narrow"}]},"sell":{"enabled":false,"rules":[{"id":"bollinger.price_action","enabled":false,"action":"reenter_upper","period":20,"mult":2},{"id":"bollinger.price_dir","enabled":false,"dir":"down"},{"id":"bollinger.width","enabled":false,"period":20,"mult":2,"dir":"widen"}]}},"rsi":{"master_enabled":true,"buy":{"enabled":true,"rules":[{"id":"rsi.level","enabled":false,"period":14,"op":"<","threshold":30},{"id":"rsi.trend","enabled":true,"period":14,"dir":"up"}]},"sell":{"enabled":true,"rules":[{"id":"rsi.level","enabled":true,"period":14,"op":">","threshold":70},{"id":"rsi.trend","enabled":false,"period":14,"dir":"down"}]}}}}}'),
  ('strategy', 'dongtien', 5, '{"name":"Theo dòng tiền","idea":"Mua khi dòng tiền tích lũy chuyển sang tích cực.","origin":"OBV (Granville); Chaikin Money Flow","when_wrong":"Khối lượng bất thường (thỏa thuận, sự kiện) có thể làm sai tín hiệu dòng tiền.","definition":{"max_holding":30,"indicators":{"obv":{"master_enabled":true,"buy":{"enabled":true,"rules":[{"id":"obv.sma","enabled":true,"op":"cross_up","period":20},{"id":"obv.breakout","enabled":false,"action":"break_high","period":20}]},"sell":{"enabled":false,"rules":[{"id":"obv.sma","enabled":false,"op":"cross_down","period":20},{"id":"obv.breakout","enabled":false,"action":"break_low","period":20}]}},"cmf":{"master_enabled":true,"buy":{"enabled":true,"rules":[{"id":"cmf.cross","enabled":true,"period":20,"op":"cross_up","threshold":0}]},"sell":{"enabled":true,"rules":[{"id":"cmf.cross","enabled":true,"period":20,"op":"cross_down","threshold":0}]}}}}}'),
  ('filter', 'giatri', 1, '{"name":"Giá trị","idea":"Doanh nghiệp có lãi đều, ít nợ, đang được định giá thấp.","origin":"Benjamin Graham; Basu (1977); Fama và French (1992)","when_wrong":"Cổ phiếu rẻ có thể rẻ vì doanh nghiệp đang gặp vấn đề thật. Có thể mất nhiều năm thị trường mới nhìn nhận lại.","pair_slug":"dongtien","definition":{"schema_version":"4.0","name":"Giá trị","logic":"AND","data_mode":"latest_disclosed","market":{"exchanges":["HOSE"],"baskets":[],"statement_groups":["thuong"],"market_cap":{"min":null,"max":null},"avg_value":{"sessions":20,"min":3},"close_price":{"min":null,"max":null}},"rules":[{"id":"giatri-pe","metric_id":"pe","period":"ttm","operator":"<","value":12,"api_unit":"lần"},{"id":"giatri-pb","metric_id":"pb","period":"ttm","operator":"<","value":1.5,"api_unit":"lần"},{"id":"giatri-debt_equity","metric_id":"debt_equity","period":"quarter","operator":"<","value":1,"api_unit":"lần"},{"id":"giatri-profit_positive_streak","metric_id":"profit_positive_streak","period":"year","operator":">","value":4,"api_unit":"năm"},{"id":"giatri-fcf_margin","metric_id":"fcf_margin","period":"ttm","operator":">","value":0,"api_unit":"ratio"}],"technical":[],"columns":[]}}'),
  ('filter', 'chatluong', 2, '{"name":"Chất lượng","idea":"Sinh lời cao trên vốn, biên tốt, nợ thấp, dòng tiền thật.","origin":"Novy-Marx (2013)","when_wrong":"Doanh nghiệp tốt thường đã được định giá cao. Mua đắt vẫn có thể lỗ trong thời gian dài.","pair_slug":"xuhuong","definition":{"schema_version":"4.0","name":"Chất lượng","logic":"AND","data_mode":"latest_disclosed","market":{"exchanges":[],"baskets":[],"statement_groups":["thuong"],"market_cap":{"min":5000,"max":null},"avg_value":{"sessions":20,"min":null},"close_price":{"min":null,"max":null}},"rules":[{"id":"chatluong-roic","metric_id":"roic","period":"ttm","operator":">","value":0.15,"api_unit":"ratio"},{"id":"chatluong-roe","metric_id":"roe","period":"ttm","operator":">","value":0.15,"api_unit":"ratio"},{"id":"chatluong-gross_margin","metric_id":"gross_margin","period":"ttm","operator":">","value":0.25,"api_unit":"ratio"},{"id":"chatluong-net_debt_ebitda","metric_id":"net_debt_ebitda","period":"ttm","operator":"<","value":2,"api_unit":"lần"},{"id":"chatluong-cfo_profit","metric_id":"cfo_profit","period":"ttm","operator":">","value":0.8,"api_unit":"lần"}],"technical":[],"columns":[]}}'),
  ('filter', 'garp', 3, '{"name":"Tăng trưởng giá hợp lý","idea":"Lợi nhuận tăng đều mà giá chưa quá đắt so với tốc độ tăng.","origin":"Peter Lynch","when_wrong":"Tăng trưởng quá khứ có thể không lặp lại. PEG dựa trên tốc độ tăng đã qua.","pair_slug":"xuhuong","definition":{"schema_version":"4.0","name":"Tăng trưởng giá hợp lý","logic":"AND","data_mode":"latest_disclosed","market":{"exchanges":[],"baskets":[],"statement_groups":["thuong"],"market_cap":{"min":null,"max":null},"avg_value":{"sessions":20,"min":3},"close_price":{"min":null,"max":null}},"rules":[{"id":"garp-eps_yoy","metric_id":"eps_yoy","period":"ttm","operator":">","value":0.15,"api_unit":"ratio"},{"id":"garp-roe","metric_id":"roe","period":"ttm","operator":">","value":0.15,"api_unit":"ratio"},{"id":"garp-peg","metric_id":"peg","period":"ttm","operator":"<","value":1,"api_unit":"lần"},{"id":"garp-debt_equity","metric_id":"debt_equity","period":"quarter","operator":"<","value":1,"api_unit":"lần"}],"technical":[],"columns":[]}}'),
  ('filter', 'canslim', 4, '{"name":"CANSLIM","idea":"Lợi nhuận tăng mạnh, giá đang dẫn dắt, dòng tiền xác nhận.","origin":"William O''Neil; Ball và Brown (1968)","when_wrong":"Kém hiệu quả khi thị trường chung đi xuống. Cần cắt lỗ kỷ luật.","pair_slug":"macd","definition":{"schema_version":"4.0","name":"CANSLIM","logic":"AND","data_mode":"latest_disclosed","market":{"exchanges":[],"baskets":[],"statement_groups":[],"market_cap":{"min":null,"max":null},"avg_value":{"sessions":20,"min":5},"close_price":{"min":null,"max":null}},"rules":[{"id":"canslim-eps_yoy","metric_id":"eps_yoy","period":"quarter","operator":">","value":0.25,"api_unit":"ratio"},{"id":"canslim-eps_cagr3","metric_id":"eps_cagr3","period":"three_year","operator":">","value":0.2,"api_unit":"ratio"},{"id":"canslim-roe","metric_id":"roe","period":"ttm","operator":">","value":0.17,"api_unit":"ratio"}],"technical":[{"indicator":"ma","rules":[{"id":"ma.price_cross","enabled":false,"op":"cross_up","period":20},{"id":"ma.ma_cross","enabled":false,"fast":10,"op":"cross_up","slow":20},{"id":"ma.trend","enabled":true,"period":50,"dir":"up"}]},{"indicator":"volume","sessions":20,"factor":1.5,"ops":[">",">"]}],"columns":[]}}'),
  ('filter', 'phadinh', 5, '{"name":"Phá đỉnh có thanh khoản","idea":"Mã thanh khoản tốt vượt đỉnh 20 phiên, có dòng tiền xác nhận.","origin":"Động lượng giá: Jegadeesh và Titman (1993)","when_wrong":"Hay thua khi thị trường đi ngang, vì có nhiều cú phá đỉnh giả.","pair_slug":"phadinh","definition":{"schema_version":"4.0","name":"Phá đỉnh có thanh khoản","logic":"AND","data_mode":"latest_disclosed","market":{"exchanges":[],"baskets":["VN100"],"statement_groups":[],"market_cap":{"min":null,"max":null},"avg_value":{"sessions":20,"min":10},"close_price":{"min":null,"max":null}},"rules":[],"technical":[{"indicator":"donchian","rules":[{"id":"donchian.break","enabled":true,"op":">","band":"upper","period":20}]},{"indicator":"obv","rules":[{"id":"obv.sma","enabled":true,"op":"cross_up","period":20},{"id":"obv.breakout","enabled":false,"action":"break_high","period":20}]},{"indicator":"bollinger","rules":[{"id":"bollinger.price_action","enabled":false,"action":"reenter_lower","period":20,"mult":2},{"id":"bollinger.price_dir","enabled":false,"dir":"up"},{"id":"bollinger.width","enabled":true,"period":20,"mult":2,"dir":"widen"}]}],"columns":[]}}'),
  ('filter', 'hoiphuc', 6, '{"name":"Hồi phục từ quá bán","idea":"Mã thanh khoản tốt vừa giảm quá mức và bắt đầu quay lại.","origin":"Hiệu ứng đảo chiều ngắn hạn","when_wrong":"Trong xu hướng giảm mạnh, mã quá bán có thể tiếp tục giảm sâu hơn.","pair_slug":"hoiphuc","definition":{"schema_version":"4.0","name":"Hồi phục từ quá bán","logic":"AND","data_mode":"latest_disclosed","market":{"exchanges":[],"baskets":["VN100"],"statement_groups":[],"market_cap":{"min":null,"max":null},"avg_value":{"sessions":20,"min":5},"close_price":{"min":null,"max":null}},"rules":[],"technical":[{"indicator":"bollinger","rules":[{"id":"bollinger.price_action","enabled":true,"action":"reenter_lower","period":20,"mult":2},{"id":"bollinger.price_dir","enabled":false,"dir":"up"},{"id":"bollinger.width","enabled":false,"period":20,"mult":2,"dir":"narrow"}]},{"indicator":"rsi","rules":[{"id":"rsi.level","enabled":true,"period":14,"op":"<","threshold":35},{"id":"rsi.trend","enabled":false,"period":14,"dir":"up"}]},{"indicator":"volume","sessions":20,"factor":1.1,"ops":[">",">"]}],"columns":[]}}')
), inserted AS (
  INSERT INTO iqx_templates (kind, slug, sort_order, visibility, current_version)
  SELECT kind, slug, sort_order, 'shown', 1 FROM seed
  ON CONFLICT (kind, slug) DO NOTHING
  RETURNING id, kind, slug
)
INSERT INTO iqx_template_versions (template_id, version, content, reason)
SELECT inserted.id, 1, seed.content::jsonb, 'Khởi tạo'
  FROM inserted
  JOIN seed ON seed.kind = inserted.kind AND seed.slug = inserted.slug;
