-- Thông báo người dùng: Bản tin cuối phiên + Bot giao dịch
-- (backend/docs/update-22-11/IQX-Bot-Chien-Luoc-SPEC.md §8, PLAN-bot-strategy.md §5.1 / D20 / D21).
-- Additive: three new tables, no backfill. A user without a settings row gets the defaults
-- (master on, both types on, email off). Safe to run twice.

-- 1. Per-user settings. Not part of any strategy; changes apply immediately.
CREATE TABLE IF NOT EXISTS user_notification_settings (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  bulletin boolean NOT NULL DEFAULT true,
  bot_trades boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Inbox (bell). At most one notification per (user, type, session): the unique key is the
--    dedupe for job retries and for a bulletin published again.
CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type varchar(16) NOT NULL,
  trade_date date NOT NULL,
  title varchar(200) NOT NULL,
  body varchar(1000) NOT NULL,
  link varchar(500) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_user_notifications_type CHECK (type IN ('bulletin', 'bot_trades')),
  CONSTRAINT uq_user_notifications_user_type_date UNIQUE (user_id, type, trade_date)
);
CREATE INDEX IF NOT EXISTS ix_user_notifications_user_created
  ON user_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_user_notifications_user_unread
  ON user_notifications (user_id) WHERE read_at IS NULL;

-- 3. Email outbox: one row per notification sent by email. `html` keeps the placeholder of the
--    unsubscribe link; the dispatcher signs the token from the row id when it sends.
--    `next_attempt_at` is the claim/backoff time of the dispatcher (max 3 attempts).
CREATE TABLE IF NOT EXISTS user_notification_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES user_notifications (id) ON DELETE CASCADE,
  to_email varchar(320) NOT NULL,
  sender varchar(320),
  subject varchar(300) NOT NULL,
  html text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error varchar(500),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  unsubscribe_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_user_notification_emails_status
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  CONSTRAINT ck_user_notification_emails_attempts CHECK (attempts >= 0),
  CONSTRAINT uq_user_notification_emails_notification UNIQUE (notification_id)
);
CREATE INDEX IF NOT EXISTS ix_user_notification_emails_pending
  ON user_notification_emails (created_at) WHERE status = 'pending';
