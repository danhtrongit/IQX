-- Vốn Demo Trading nhất quán (IQX-Flashback-SPEC §1.3): tài khoản Demo mở với 0đ, người dùng
-- phải đổi từ xu sang tiền; % lợi nhuận Demo tính theo vốn nạp ròng nên vốn nạp ròng = 0
-- thì lợi nhuận = 0 (không chia 0). Admin reset cũng phải cấp lại 0đ và đặt lại vốn nạp ròng.
-- Idempotent: chỉ đổi MẶC ĐỊNH của cột và hàng cấu hình đang hoạt động; KHÔNG sửa dữ liệu lịch sử.
-- Tài khoản Bot (bot_accounts, BOT_POLICY.initial_cash_vnd = 100.000.000đ) không đụng tới.

-- 1. Journey Cấp 0: vốn mở tài khoản Demo được ghi ở cap0_progress.virtual_balance_init.
--    Trước đây cột này và tài khoản ảo cùng mang 100.000.000đ; giờ cả hai bằng 0.
ALTER TABLE cap0_progress ALTER COLUMN virtual_balance_init SET DEFAULT 0;

-- 2. Cấu hình giao dịch ảo: initial_cash_vnd là tham số "cấp lại vốn" cho tài khoản Demo
--    sau khi admin reset. Mặc định mới là 0đ (admin vẫn đặt được vốn khác nếu chủ động chỉnh).
ALTER TABLE virtual_trading_configs ALTER COLUMN initial_cash_vnd SET DEFAULT 0;

-- 3. Hàng cấu hình đang hoạt động vẫn còn đúng mặc định cũ (100.000.000đ, chưa ai sửa tay)
--    thì về 0đ. Một giá trị do admin chủ động đặt khác 100.000.000đ được giữ nguyên.
UPDATE virtual_trading_configs
   SET initial_cash_vnd = 0, updated_at = now()
 WHERE is_active = true
   AND initial_cash_vnd = 100000000;

-- 4. Tài khoản Demo đã tồn tại giữ nguyên vốn và vốn nạp ròng: đó là dữ liệu lịch sử của
--    người dùng (migration 0027 đã đặt net_deposited_cash_vnd = initial_cash_vnd cho họ).
--    Chỉ tài khoản mở từ thời điểm này mới bắt đầu với 0đ.

COMMENT ON COLUMN cap0_progress.virtual_balance_init IS
  'Vốn mở tài khoản Demo Trading khi vào Cấp 0; 0 đồng theo spec §1.3 (đổi từ xu sang tiền).';
COMMENT ON COLUMN virtual_trading_configs.initial_cash_vnd IS
  'Vốn cấp lại cho tài khoản Demo sau khi admin reset; mặc định 0 đồng theo spec §1.3.';
