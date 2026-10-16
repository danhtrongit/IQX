import type { SchemaObject } from '@nestjs/swagger';

import {
  ACADEMY_SUMMARY_SCHEMA,
  closedObject,
  USER_INSIGHT_PROPERTIES,
} from '../users/member-insights.openapi.js';

/** Response shapes of `team/*` (admin spec v1.1 §4.3), matching TeamService. */

const nullable = (schema: SchemaObject): SchemaObject => ({ ...schema, nullable: true });
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const dateTime: SchemaObject = { type: 'string', format: 'date-time' };
const integer: SchemaObject = { type: 'integer' };
const string: SchemaObject = { type: 'string' };
const boolean: SchemaObject = { type: 'boolean' };
const ref = (name: string): SchemaObject =>
  ({ $ref: `#/components/schemas/${name}` }) as unknown as SchemaObject;

export const TEAM_ME_SCHEMA = closedObject({
  user: closedObject({ id: uuid, username: string, full_name: string }),
  code: string,
  status: { type: 'string', enum: ['active'] },
  appointed_at: dateTime,
  commission_pct: nullable(integer),
  offer_type: nullable({ type: 'string', enum: ['none', 'days', 'lifetime'] }),
  offer_days: { type: 'integer', enum: [7, 30, 90, 180, 365], nullable: true },
  member_count: integer,
});

/** Same definitions as admin/metrics/overview, restricted to the group (§6). */
export const TEAM_OVERVIEW_SCHEMA = ref('Legacy_MetricsOverview');

export const TEAM_REVENUE_SCHEMA: SchemaObject = {
  type: 'array',
  items: ref('Legacy_DailyRevenuePoint'),
};

export const TEAM_USERS_SCHEMA = closedObject({
  items: {
    type: 'array',
    items: closedObject({
      id: uuid,
      username: string,
      full_name: string,
      email: string,
      role: { type: 'string', enum: ['admin', 'team_lead', 'user', 'premium'] },
      status: { type: 'string', enum: ['active', 'inactive', 'suspended', 'deleted'] },
      is_email_verified: boolean,
      last_login_at: nullable(dateTime),
      created_at: dateTime,
      group_join_via: { type: 'string', enum: ['code', 'admin'] },
      group_joined_at: dateTime,
      demo_trading: closedObject({ activated: boolean, pnl_pct: nullable({ type: 'number' }) }),
      bot: closedObject({
        activated: boolean,
        pnl_pct: nullable({ type: 'number' }),
        as_of: nullable({ type: 'string', format: 'date' }),
      }),
      academy: ACADEMY_SUMMARY_SCHEMA,
    }),
  },
  total: integer,
  page: integer,
  page_size: integer,
  total_pages: integer,
});

/** The admin user 360 without the VT account (capital, cash) and VT order prices. */
export const TEAM_USER_360_SCHEMA = closedObject({
  user: ref('Legacy_UserBriefForAdmin'),
  // Same nullable-reference form as the legacy User360Response.
  subscription: {
    anyOf: [ref('Legacy_SubscriptionBrief'), { type: 'string', enum: [null], nullable: true }],
  } as SchemaObject,
  subscription_history: { type: 'array', items: ref('Legacy_SubscriptionBrief') },
  payment_history: { type: 'array', items: ref('Legacy_PaymentOrderBrief') },
  trial_used: boolean,
  login_history: { type: 'array', items: ref('Legacy_LoginHistoryRow') },
  ...USER_INSIGHT_PROPERTIES,
});

export const TEAM_LOGIN_HISTORY_SCHEMA = ref('Legacy_PaginatedResponse_LoginHistoryRow_');

export const TEAM_MEMBER_REMOVE_SCHEMA = closedObject({
  lead_user_id: uuid,
  user_id: uuid,
  removed_at: dateTime,
});
