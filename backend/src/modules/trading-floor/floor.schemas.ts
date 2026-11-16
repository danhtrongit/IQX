/**
 * Schema Zod của API Khu giao dịch (thân, truy vấn, tham số) và schema OpenAPI của các phản hồi.
 * JSON camelCase như hợp đồng; thời gian là epoch ms.
 */

import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { FLOOR_AVATARS, FLOOR_OUTFIT_COLORS, INVITE_RESULTS } from './floor-types.js';

export const openapi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

// ---------- thân, truy vấn, tham số ----------

export const floorProfileBodySchema = z.strictObject({
  name: z.string().max(100),
  avatar: z.enum(FLOOR_AVATARS),
  color: z.enum(FLOOR_OUTFIT_COLORS).default('default'),
});
export type FloorProfileBody = z.infer<typeof floorProfileBodySchema>;

export const floorIdParamSchema = z.uuid();
export const floorInviteIdParamSchema = z.coerce.number().int().min(1).max(2_147_483_647);
export const floorMessageIdParamSchema = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/** Độ dài thật (1.000 ký tự sau khi làm sạch) do service kiểm tra để trả đúng mã lỗi. */
export const floorChatSendBodySchema = z.strictObject({ text: z.string().max(4000) });
export const floorChatOpenBodySchema = z.strictObject({ sacoId: z.uuid() });
export const floorInviteAnswerBodySchema = z.strictObject({ accept: z.boolean() });
export const floorDutyBodySchema = z.strictObject({ on: z.boolean() });

export const sacoGrantBodySchema = z.strictObject({
  userId: z.uuid(),
  leadUserId: z.uuid().optional(),
  displayName: z.string().max(100).optional(),
});
export type SacoGrantBody = z.infer<typeof sacoGrantBodySchema>;

export const sacoUpdateBodySchema = z
  .strictObject({
    displayName: z.string().max(100).optional(),
    leadUserId: z.uuid().optional(),
  })
  .refine((body) => body.displayName !== undefined || body.leadUserId !== undefined, {
    message: 'Cần displayName hoặc leadUserId',
  });
export type SacoUpdateBody = z.infer<typeof sacoUpdateBodySchema>;

export const sacoMoveBodySchema = z.strictObject({ dir: z.enum(['up', 'down']) });

export const sacoCandidatesQuerySchema = z.object({ q: z.string().max(100).default('') });
export const manageInvitesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(300),
});

// ---------- phản hồi ----------

const profile = z.object({
  name: z.string(),
  avatar: z.enum(FLOOR_AVATARS),
  color: z.enum(FLOOR_OUTFIT_COLORS),
});

const sacoSelf = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  team: z.string(),
  active: z.boolean(),
  onDuty: z.boolean(),
  position: z.number().int().nullable(),
});

const chatMessage = z.object({
  id: z.number().int(),
  from: z.enum(['u', 's', 'x']),
  text: z.string(),
  at: z.number(),
  image: z.object({ id: z.string(), w: z.number().int(), h: z.number().int() }).optional(),
  recalled: z.literal(true).optional(),
});

const convSummary = z.object({
  id: z.string(),
  side: z.enum(['user', 'saco']),
  peerName: z.string(),
  peerIcon: z.string(),
  matched: z.boolean(),
  writable: z.boolean(),
  online: z.boolean(),
  last: chatMessage.nullable(),
  unread: z.number().int(),
});

const manageSaco = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  icon: z.string(),
  leadUserId: z.string(),
  leadName: z.string(),
  active: z.boolean(),
  onDuty: z.boolean(),
  online: z.boolean(),
  position: z.number().int().nullable(),
  convs: z.number().int(),
  accepted: z.number().int(),
  declined: z.number().int(),
  timedOut: z.number().int(),
  mine: z.boolean(),
});

const lead = z.object({ id: z.string(), name: z.string() });

const manageConv = z.object({
  id: z.string(),
  userName: z.string(),
  sacoName: z.string(),
  sacoIcon: z.string(),
  matched: z.boolean(),
  last: chatMessage.nullable(),
});

export const FLOOR_ME_SCHEMA = openapi(
  z.object({
    profile: profile.nullable(),
    suggestedName: z.string(),
    saco: sacoSelf.nullable(),
    guest: z.boolean(),
  }),
);
export const FLOOR_PROFILE_SCHEMA = openapi(profile);
export const FLOOR_GUEST_CREATED_SCHEMA = openapi(
  z.object({ token: z.string(), guestId: z.string(), profile }),
);
export const FLOOR_INBOX_SCHEMA = openapi(
  z.object({
    saco: sacoSelf.nullable(),
    asUser: z.array(convSummary),
    asSaco: z.array(convSummary),
    matchedConvId: z.string().nullable(),
  }),
);
export const FLOOR_MATCH_SCHEMA = openapi(
  z.union([z.object({ convId: z.string() }), z.object({ running: z.literal(true) })]),
);
export const FLOOR_START_SCHEMA = openapi(
  z.union([
    z.object({ convId: z.string(), message: chatMessage }),
    z.object({ pending: z.literal(true) }),
  ]),
);
export const FLOOR_OK_SCHEMA = openapi(z.object({ ok: z.literal(true) }));
export const FLOOR_CONV_SUMMARY_SCHEMA = openapi(convSummary);
export const FLOOR_CONV_DETAIL_SCHEMA = openapi(
  convSummary.extend({ messages: z.array(chatMessage), peerReadAt: z.number() }),
);
export const FLOOR_MESSAGE_SCHEMA = openapi(chatMessage);
export const FLOOR_SACO_SELF_SCHEMA = openapi(sacoSelf);

export const FLOOR_MANAGE_LIST_SCHEMA = openapi(
  z.object({ items: z.array(manageSaco), leads: z.array(lead) }),
);
export const FLOOR_MANAGE_SACO_SCHEMA = openapi(manageSaco);
export const FLOOR_CANDIDATES_SCHEMA = openapi(
  z.object({
    items: z.array(
      z.object({
        userId: z.string(),
        name: z.string(),
        email: z.string(),
        leadUserId: z.string().nullable(),
        leadName: z.string().nullable(),
      }),
    ),
  }),
);
export const FLOOR_MANAGE_INVITES_SCHEMA = openapi(
  z.object({
    items: z.array(
      z.object({
        at: z.number(),
        userName: z.string(),
        sacoName: z.string(),
        sacoIcon: z.string(),
        result: z.enum(INVITE_RESULTS),
      }),
    ),
  }),
);
export const FLOOR_MANAGE_CONVS_SCHEMA = openapi(z.object({ items: z.array(manageConv) }));
export const FLOOR_MANAGE_CONV_SCHEMA = openapi(
  manageConv.extend({ messages: z.array(chatMessage) }),
);
