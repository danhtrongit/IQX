-- Fresh v2 invariants: application concurrency checks are backed by PostgreSQL.
ALTER TABLE virtual_trading_accounts ADD CONSTRAINT ck_v2_account_nonnegative_cash
  CHECK (initial_cash_vnd >= 0 AND cash_available_vnd >= 0 AND cash_reserved_vnd >= 0 AND cash_pending_vnd >= 0);
ALTER TABLE virtual_positions ADD CONSTRAINT ck_v2_position_nonnegative
  CHECK (quantity_total >= 0 AND quantity_sellable >= 0 AND quantity_pending >= 0 AND quantity_reserved >= 0 AND avg_cost_vnd >= 0);
ALTER TABLE virtual_positions ADD CONSTRAINT ck_v2_position_quantity_balance
  CHECK (quantity_total = quantity_sellable + quantity_pending + quantity_reserved);
ALTER TABLE virtual_orders ADD CONSTRAINT ck_v2_order_positive_quantity
  CHECK (quantity > 0 AND reserved_cash_vnd >= 0 AND reserved_quantity >= 0);
ALTER TABLE virtual_trading_configs ADD CONSTRAINT ck_v2_config_ranges
  CHECK (initial_cash_vnd >= 0 AND board_lot_size > 0 AND buy_fee_rate_bps BETWEEN 0 AND 10000 AND sell_fee_rate_bps BETWEEN 0 AND 10000 AND sell_tax_rate_bps BETWEEN 0 AND 10000);
CREATE UNIQUE INDEX uq_v2_active_trading_config ON virtual_trading_configs(is_active) WHERE is_active;
CREATE INDEX ix_v2_pending_orders ON virtual_orders(account_id, status, created_at);
CREATE INDEX ix_v2_due_settlements ON virtual_settlements(account_id, status, due_date);
CREATE INDEX ix_v2_active_refresh_family ON refresh_tokens(user_id, token_family, expires_at) WHERE revoked = false;

INSERT INTO premium_plans(code,name,description,price_vnd,duration_days,is_active,sort_order)
VALUES ('TRIAL_7D','Dùng thử 7 ngày','Dùng thử các tính năng Premium trong 7 ngày',0,7,true,-1)
ON CONFLICT (code) DO NOTHING;
INSERT INTO virtual_trading_configs(initial_cash_vnd,buy_fee_rate_bps,sell_fee_rate_bps,sell_tax_rate_bps,settlement_mode,board_lot_size,trading_enabled,is_active)
SELECT 100000000,15,15,10,'T0',100,true,true
WHERE NOT EXISTS (SELECT 1 FROM virtual_trading_configs WHERE is_active);
