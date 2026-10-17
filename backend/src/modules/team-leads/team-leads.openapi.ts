import type { SchemaObject } from '@nestjs/swagger';

/** Response shapes of admin/team-leads (admin spec v1.1 §4.2), matching TeamLeadsService. */

const nullable = (schema: SchemaObject): SchemaObject => ({ ...schema, nullable: true });
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const dateTime: SchemaObject = { type: 'string', format: 'date-time' };
const integer: SchemaObject = { type: 'integer' };
const offerType: SchemaObject = { type: 'string', enum: ['none', 'days', 'lifetime'] };
const offerDays: SchemaObject = { type: 'integer', enum: [7, 30, 90, 180, 365], nullable: true };
const leadStatus: SchemaObject = { type: 'string', enum: ['active', 'revoked'] };
const joinVia: SchemaObject = { type: 'string', enum: ['code', 'admin'] };

function object(properties: Record<string, SchemaObject>): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

const userSummaryProperties: Record<string, SchemaObject> = {
  id: uuid,
  username: { type: 'string' },
  email: { type: 'string' },
  full_name: { type: 'string' },
  role: { type: 'string', enum: ['admin', 'team_lead', 'user', 'premium'] },
  status: { type: 'string', enum: ['active', 'inactive', 'suspended', 'deleted'] },
};
const userSummary = object(userSummaryProperties);

function pageOf(item: SchemaObject): SchemaObject {
  return object({
    items: { type: 'array', items: item },
    total: integer,
    page: integer,
    page_size: integer,
    total_pages: integer,
  });
}

export const TEAM_LEAD_LIST_SCHEMA = pageOf(
  object({
    user: userSummary,
    code: { type: 'string' },
    status: leadStatus,
    appointed_at: dateTime,
    revoked_at: nullable(dateTime),
    member_count: integer,
    commission_pct: nullable(integer),
    offer_type: nullable(offerType),
    offer_days: offerDays,
    revenue_30d_vnd: integer,
    commission_30d_vnd: integer,
  }),
);

export const TEAM_LEAD_DETAIL_SCHEMA = object({
  user: userSummary,
  code: { type: 'string' },
  status: leadStatus,
  accepting_new_users: { type: 'boolean' },
  appointed_at: dateTime,
  appointed_by: nullable(uuid),
  revoked_at: nullable(dateTime),
  revoked_by: nullable(uuid),
  policy: nullable(
    object({
      id: uuid,
      commission_pct: integer,
      offer_type: offerType,
      offer_days: offerDays,
      offer_version_id: uuid,
      effective_from: dateTime,
      reason: { type: 'string' },
      created_by: nullable(uuid),
    }),
  ),
  metrics: object({
    member_count: integer,
    revenue_30d_vnd: integer,
    commission_30d_vnd: integer,
    active_free_premium_count: integer,
  }),
  history: {
    type: 'array',
    items: object({
      id: uuid,
      created_at: dateTime,
      action: { type: 'string' },
      actor_role: { type: 'string', enum: ['admin', 'team_lead', 'system'] },
      actor: nullable(
        object({
          id: uuid,
          username: nullable({ type: 'string' }),
          full_name: nullable({ type: 'string' }),
        }),
      ),
      before: { nullable: true },
      after: { nullable: true },
      reason: nullable({ type: 'string' }),
    }),
  },
});

const memberSchema = object({
  ...userSummaryProperties,
  group_join_via: joinVia,
  group_joined_at: dateTime,
  created_at: dateTime,
});

export const TEAM_LEAD_MEMBERS_SCHEMA = pageOf(memberSchema);

export const TEAM_LEAD_MEMBER_ADD_SCHEMA = object({
  action: { type: 'string', enum: ['add', 'move'] },
  lead_user_id: uuid,
  previous_lead_user_id: nullable(uuid),
  member: memberSchema,
  offer_grant: nullable(
    object({
      grant_id: uuid,
      starts_at: dateTime,
      ends_at: dateTime,
      offer_type: { type: 'string', enum: ['days', 'lifetime'] },
      offer_days: offerDays,
    }),
  ),
});

export const TEAM_LEAD_MEMBER_REMOVE_SCHEMA = object({
  lead_user_id: uuid,
  user_id: uuid,
  removed_at: dateTime,
});

const eligibility = (reasons: string[], withAction: boolean): SchemaObject =>
  object({
    eligible: { type: 'boolean' },
    reason: { type: 'string', enum: reasons, nullable: true },
    ...(withAction ? { action: { type: 'string', enum: ['add', 'move'], nullable: true } } : {}),
  });

export const TEAM_LEAD_LOOKUP_SCHEMA = object({
  user: userSummary,
  team_lead: nullable(object({ status: leadStatus, appointed_at: dateTime })),
  group: nullable(
    object({
      lead_user_id: uuid,
      lead_username: { type: 'string' },
      lead_full_name: { type: 'string' },
      lead_status: leadStatus,
      join_via: joinVia,
      joined_at: dateTime,
    }),
  ),
  appoint: eligibility(['TEAM_LEAD_EXISTS', 'USER_NOT_ELIGIBLE'], false),
  add_member: eligibility(['TARGET_IS_TEAM_LEAD', 'USER_NOT_ELIGIBLE', 'ALREADY_IN_GROUP'], true),
});
