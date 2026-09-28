-- Mobile device registration, notification preferences, and privacy requests.
-- These records are user-owned and must follow the account lifecycle.
CREATE TABLE mobile_devices (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(200) NOT NULL,
  platform VARCHAR(16) NOT NULL CHECK (platform IN ('ios', 'android')),
  push_token VARCHAR(4096),
  app_version VARCHAR(100),
  locale VARCHAR(35),
  timezone VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT pk_mobile_devices PRIMARY KEY (id),
  CONSTRAINT uq_mobile_devices_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX ix_mobile_devices_user_id ON mobile_devices (user_id);

CREATE TABLE mobile_notification_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notifications_enabled BOOLEAN DEFAULT true NOT NULL,
  marketing_enabled BOOLEAN DEFAULT false NOT NULL,
  locale VARCHAR(35),
  timezone VARCHAR(100),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT pk_mobile_notification_preferences PRIMARY KEY (user_id)
);

CREATE TYPE mobile_account_request_kind AS ENUM ('deletion', 'export');
CREATE TYPE mobile_account_request_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

CREATE TABLE mobile_account_requests (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind mobile_account_request_kind NOT NULL,
  status mobile_account_request_status DEFAULT 'queued' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT pk_mobile_account_requests PRIMARY KEY (id)
);

CREATE INDEX ix_mobile_account_requests_user_kind ON mobile_account_requests (user_id, kind, created_at DESC);
