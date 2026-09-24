-- Fresh backend-v2 billing schema. This is intentionally separate from the
-- legacy Alembic migration chain; apply it only when creating a v2 database.

alter table premium_payment_orders
  add column if not exists plan_code_snapshot varchar(50),
  add column if not exists plan_name_snapshot varchar(200),
  add column if not exists duration_days_snapshot integer,
  add column if not exists refunded_amount_vnd bigint not null default 0,
  add column if not exists grant_type varchar(40),
  add column if not exists granted_by_user_id uuid references users(id) on delete set null,
  add column if not exists grant_note text,
  add column if not exists raw_ipn jsonb;

create table if not exists billing_entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_id uuid references premium_plans(id) on delete set null,
  order_id uuid references premium_payment_orders(id) on delete set null,
  kind varchar(40) not null check (kind in ('payment', 'admin_confirmed', 'admin_grant', 'trial', 'admin_extension')),
  duration_days integer not null check (duration_days > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  original_ends_at timestamptz not null,
  status varchar(20) not null default 'active' check (status in ('active', 'revoked', 'expired')),
  granted_by_user_id uuid references users(id) on delete set null,
  note text,
  revoked_at timestamptz,
  revoked_by_user_id uuid references users(id) on delete set null,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  check (original_ends_at >= starts_at)
);
create unique index if not exists uq_billing_grant_order
  on billing_entitlement_grants(order_id) where order_id is not null;
create index if not exists ix_billing_grants_user_status_end
  on billing_entitlement_grants(user_id, status, ends_at desc);

create table if not exists billing_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references premium_payment_orders(id) on delete restrict,
  amount_vnd bigint not null check (amount_vnd > 0),
  reason varchar(1000) not null,
  created_by_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists ix_billing_refunds_order on billing_refunds(order_id, created_at desc);

alter table sepay_ipn_logs
  add column if not exists retried_from_log_id uuid references sepay_ipn_logs(id) on delete set null;

create table if not exists billing_subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_id uuid references premium_plans(id) on delete set null,
  event_type varchar(40) not null,
  actor_user_id uuid references users(id) on delete set null,
  reason varchar(1000),
  days_delta integer,
  created_at timestamptz not null default now()
);
create index if not exists ix_billing_subscription_history_user_created
  on billing_subscription_history(user_id, created_at desc);

