-- Bot Academy activation policy. This migration preserves all accounts, positions,
-- executions, receipts and decision history; only new policy metadata is added.
ALTER TABLE bot_positions
  ALTER COLUMN take_profit_vnd DROP NOT NULL;

ALTER TABLE bot_positions
  DROP CONSTRAINT ck_bot_positions_bot_position_take_profit;

ALTER TABLE bot_positions
  ADD CONSTRAINT ck_bot_positions_bot_position_take_profit
  CHECK (take_profit_vnd IS NULL OR take_profit_vnd > entry_price_vnd);

ALTER TABLE bot_positions
  ADD COLUMN entry_config_revision INTEGER NULL
  CHECK (entry_config_revision >= 1);

COMMENT ON COLUMN bot_positions.take_profit_vnd IS
  'Legacy audit value only; ignored by the Bot Academy activation policy.';

ALTER TABLE bot_decisions
  ADD COLUMN decision_config_revision INTEGER NULL,
  ADD COLUMN condition_snapshot JSONB NULL
  CHECK (condition_snapshot IS NULL OR jsonb_typeof(condition_snapshot) = 'object');

ALTER TABLE bot_run_receipts
  ADD COLUMN policy_version VARCHAR(64) NULL;
