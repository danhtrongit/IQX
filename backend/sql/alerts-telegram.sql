-- IQX backend-v2 alert/Telegram tables. Apply after the v2 users/watchlist baseline.
-- This script is intentionally independent of legacy Alembic migrations.
do $$ begin
  create type alert_side as enum ('buy', 'sell');
exception when duplicate_object then null; end $$;

alter table users add column if not exists telegram_chat_id varchar(32);
alter table users add column if not exists telegram_linked_at timestamptz;
create unique index if not exists ix_users_telegram_chat_id on users (telegram_chat_id) where telegram_chat_id is not null;

create table if not exists alert_signals (
  id uuid primary key,
  key varchar(40) not null unique,
  side alert_side not null,
  ta_name varchar(60) not null,
  message_title varchar(200) not null,
  combination jsonb not null,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_alert_rules (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  name varchar(120) not null,
  side alert_side not null,
  base_signal_key varchar(40),
  combination jsonb not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_user_alert_rules_user_id on user_alert_rules(user_id);

create table if not exists alert_events (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  rule_id uuid not null references user_alert_rules(id) on delete cascade,
  symbol varchar(20) not null,
  signal_key varchar(40),
  session_date date not null,
  fired_at timestamptz not null,
  price numeric(18,4),
  delivered boolean not null default false,
  delivery_error varchar(300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_alert_events_user_rule_symbol_date unique(user_id, rule_id, symbol, session_date)
);
create index if not exists ix_alert_events_user_id on alert_events(user_id);
create index if not exists ix_alert_events_rule_id on alert_events(rule_id);
create index if not exists ix_alert_events_symbol on alert_events(symbol);
create index if not exists ix_alert_events_pending_delivery on alert_events(delivered, fired_at) where delivered = false;
