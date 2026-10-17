import type { SchemaObject } from '@nestjs/swagger';

/**
 * Response shapes of the admin spec v1.1 §5.1.3 / §5.1.4 user insights (group, referral offer,
 * Demo Trading / Bot results in percent, Academy progress), shared by the admin user 360 and
 * the team views. They match AdminUsersService.insights, member-performance.ts and
 * AcademyProgressReader.
 */

const nullable = (schema: SchemaObject): SchemaObject => ({ ...schema, nullable: true });
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const dateTime: SchemaObject = { type: 'string', format: 'date-time' };
const date: SchemaObject = { type: 'string', format: 'date' };
const integer: SchemaObject = { type: 'integer' };
const number: SchemaObject = { type: 'number' };
const string: SchemaObject = { type: 'string' };
const boolean: SchemaObject = { type: 'boolean' };

export function closedObject(properties: Record<string, SchemaObject>): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

export const USER_GROUP_SCHEMA = nullable(
  closedObject({
    lead_user_id: uuid,
    lead_username: string,
    lead_full_name: string,
    lead_status: { type: 'string', enum: ['active', 'revoked'] },
    code: string,
    join_via: { type: 'string', enum: ['code', 'admin'] },
    joined_at: dateTime,
  }),
);

export const USER_REFERRAL_OFFER_SCHEMA = nullable(
  closedObject({
    grant_id: uuid,
    lead_user_id: nullable(uuid),
    offer_type: { type: 'string', enum: ['days', 'lifetime'] },
    offer_days: nullable(integer),
    status: string,
    starts_at: dateTime,
    ends_at: dateTime,
    lifetime: boolean,
    active: boolean,
  }),
);

export const DEMO_TRADING_RESULT_SCHEMA = closedObject({
  activated: boolean,
  account_id: nullable(uuid),
  status: nullable(string),
  activated_at: nullable(dateTime),
  pnl_pct: nullable(number),
  last_activity_at: nullable(dateTime),
});

export const BOT_RESULT_SCHEMA = closedObject({
  activated: boolean,
  account_id: nullable(uuid),
  status: nullable(string),
  activated_at: nullable(dateTime),
  pnl_pct: nullable(number),
  as_of: nullable(date),
  last_activity_at: nullable(dateTime),
});

const lessonRefProperties: Record<string, SchemaObject> = {
  lesson_id: string,
  chapter: integer,
  order: integer,
  name: string,
  label: string,
};

const academySummaryProperties: Record<string, SchemaObject> = {
  started: boolean,
  completed: integer,
  total: integer,
  all_done: boolean,
  /** Current required item: a lesson or a chapter exam ("Bài thi Chương c"). */
  current_lesson: nullable(
    closedObject({
      ...lessonRefProperties,
      kind: { type: 'string', enum: ['lesson', 'chapter_exam'] },
    }),
  ),
};

export const ACADEMY_SUMMARY_SCHEMA = closedObject(academySummaryProperties);

export const ACADEMY_DETAIL_SCHEMA = closedObject({
  ...academySummaryProperties,
  catalog_version: string,
  chapter_exams: closedObject({ total: integer, passed: integer }),
  last_completion: nullable(
    closedObject({
      ...lessonRefProperties,
      completed_at: dateTime,
      reward_coins: nullable(integer),
    }),
  ),
  learning_coins: integer,
  chapters: {
    type: 'array',
    items: closedObject({
      no: integer,
      title: string,
      total: integer,
      completed: integer,
      exam_passed: boolean,
      lessons: {
        type: 'array',
        items: closedObject({
          lesson_id: string,
          order: integer,
          name: string,
          kind: { type: 'string', enum: ['lesson', 'practice', 'chapter_exam'] },
          /** Practice (Phòng tập thực chiến): never counted in totals. */
          optional: boolean,
          status: {
            type: 'string',
            enum: ['completed', 'in_progress', 'failed', 'not_started', 'locked'],
          },
          attempts: integer,
          latest_score: nullable(integer),
          /** Question count of the item (3, 5, 20 or 30). */
          max_score: integer,
          completed_at: nullable(dateTime),
          is_current: boolean,
        }),
      },
    }),
  },
});

/** Fields every user 360 (admin or team) carries in addition to the v1.0 blocks. */
export const USER_INSIGHT_PROPERTIES: Record<string, SchemaObject> = {
  group: USER_GROUP_SCHEMA,
  referral_offer: USER_REFERRAL_OFFER_SCHEMA,
  demo_trading: DEMO_TRADING_RESULT_SCHEMA,
  bot: BOT_RESULT_SCHEMA,
  academy: ACADEMY_DETAIL_SCHEMA,
};
