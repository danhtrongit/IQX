DO $$ BEGIN
  CREATE TYPE alert_side AS ENUM ('buy', 'sell');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id varchar(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_linked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_telegram_chat_id ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS alert_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key varchar(40) NOT NULL UNIQUE,
  side alert_side NOT NULL, ta_name varchar(60) NOT NULL, message_title varchar(200) NOT NULL,
  combination jsonb NOT NULL, is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL, side alert_side NOT NULL, base_signal_key varchar(40), combination jsonb NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_user_alert_rules_user_id ON user_alert_rules(user_id);
CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES user_alert_rules(id) ON DELETE CASCADE, symbol varchar(20) NOT NULL,
  signal_key varchar(40), session_date date NOT NULL, fired_at timestamptz NOT NULL,
  price numeric(18,4), delivered boolean NOT NULL DEFAULT false, delivery_error varchar(300),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_alert_events_user_rule_symbol_date UNIQUE(user_id, rule_id, symbol, session_date)
);
CREATE INDEX IF NOT EXISTS ix_alert_events_user_id ON alert_events(user_id);
CREATE INDEX IF NOT EXISTS ix_alert_events_rule_id ON alert_events(rule_id);
CREATE INDEX IF NOT EXISTS ix_alert_events_symbol ON alert_events(symbol);
CREATE INDEX IF NOT EXISTS ix_alert_events_pending_delivery ON alert_events(delivered, fired_at) WHERE delivered = false;
