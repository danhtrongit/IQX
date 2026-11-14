/**
 * Lưu trữ Nhắn tin với SACO: cuộc trò chuyện (`tf_chat_convs`), tin nhắn, nhật ký lời mời. Nobody
 * edits or deletes a message. Chỉ đọc và ghi; quy tắc nằm ở `FloorChatService`.
 *
 * Mọi mốc thời gian do dịch vụ truyền vào (cùng độ chính xác mili giây) để so sánh `created_at` với
 * `*_read_at` không bị lệch giữa đồng hồ JS và đồng hồ cơ sở dữ liệu.
 */

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import type { ChatMessage, ChatSender, InviteResult } from './floor-types.js';

export const FLOOR_CHAT_REPOSITORY = Symbol('FLOOR_CHAT_REPOSITORY');

/** Một cuộc trò chuyện kèm mọi thứ cần để dựng `ConvSummary` cho một phía. */
export interface ChatConvView {
  readonly id: string;
  readonly userId: string;
  readonly sacoId: string;
  readonly matched: boolean;
  readonly matchedAt: Date | null;
  readonly direct: boolean;
  readonly lastAt: Date;
  readonly userReadAt: Date | null;
  readonly sacoReadAt: Date | null;
  readonly sacoName: string;
  readonly sacoIcon: string;
  readonly sacoActive: boolean;
  readonly sacoOnDuty: boolean;
  /** Tài khoản đang giữ quyền SACO này. */
  readonly sacoUserId: string;
  readonly userName: string;
  readonly last: ChatMessage | null;
  /** Số tin chưa đọc của phía được hỏi. */
  readonly unread: number;
}

export interface MatchedConvRef {
  readonly id: string;
  readonly sacoId: string;
}

export interface StaffInviteRow {
  readonly at: number;
  readonly userName: string;
  readonly sacoName: string;
  readonly sacoIcon: string;
  readonly result: InviteResult;
}

export interface StaffConvRow {
  readonly id: string;
  readonly userName: string;
  readonly sacoName: string;
  readonly sacoIcon: string;
  readonly matched: boolean;
  readonly last: ChatMessage | null;
}

export interface FloorChatRepository {
  convView(db: SqlClient, convId: string, side: 'user' | 'saco'): Promise<ChatConvView | null>;
  userConvs(db: SqlClient, userId: string, limit: number): Promise<ChatConvView[]>;
  sacoConvs(db: SqlClient, sacoId: string, limit: number): Promise<ChatConvView[]>;
  matchedConv(db: SqlClient, userId: string): Promise<MatchedConvRef | null>;
  /** Tạo cuộc trò chuyện nếu chưa có; `direct` bật cờ nhắn trực tiếp. Trả về id. */
  ensureConv(
    db: SqlClient,
    userId: string,
    sacoId: string,
    at: Date,
    options?: { direct?: boolean },
  ): Promise<string>;
  markMatched(db: SqlClient, convId: string, at: Date): Promise<void>;
  insertMessage(
    db: SqlClient,
    convId: string,
    sender: ChatSender,
    text: string,
    at: Date,
  ): Promise<ChatMessage>;
  markRead(db: SqlClient, convId: string, side: 'user' | 'saco', at: Date): Promise<void>;
  /** Tin gần nhất theo thứ tự cũ → mới. */
  messages(db: SqlClient, convId: string, limit: number): Promise<ChatMessage[]>;
  convIdsOfSaco(db: SqlClient, sacoId: string): Promise<Array<{ id: string; userId: string }>>;
  insertInvite(
    db: SqlClient,
    input: { runId: string; userId: string; sacoId: string; result: InviteResult; at: Date },
  ): Promise<void>;
  staffInvites(db: SqlClient, leadId: string | null, limit: number): Promise<StaffInviteRow[]>;
  staffConvs(db: SqlClient, leadId: string | null, limit: number): Promise<StaffConvRow[]>;
  staffConv(db: SqlClient, convId: string, leadId: string | null): Promise<StaffConvRow | null>;
}

type Row = Record<string, unknown>;

const toDate = (value: unknown): Date =>
  value instanceof Date ? value : new Date(value as string | number);
const toDateOrNull = (value: unknown): Date | null =>
  value === null || value === undefined ? null : toDate(value);

const USER_NAME = `coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(u.full_name), ''), u.username)`;

export const toChatMessage = (row: Row): ChatMessage => ({
  id: Number(row.id),
  from: row.sender as ChatSender,
  text: String(row.text),
  at: toDate(row.created_at).getTime(),
});

const lastOf = (row: Row): ChatMessage | null =>
  row.last_id === null || row.last_id === undefined
    ? null
    : toChatMessage({
        id: row.last_id,
        sender: row.last_sender,
        text: row.last_text,
        created_at: row.last_created,
      });

/** Câu SELECT một cuộc trò chuyện cho phía `side`: số chưa đọc đếm tin của bên kia sau mốc đã đọc. */
function convSelect(side: 'user' | 'saco'): string {
  const other = side === 'user' ? 's' : 'u';
  const readColumn = side === 'user' ? 'user_read_at' : 'saco_read_at';
  return `
    select c.id, c.user_id, c.saco_id, c.matched, c.matched_at, c.direct, c.last_at,
           c.user_read_at, c.saco_read_at,
           s.display_name as saco_name, s.icon as saco_icon, s.active as saco_active,
           s.on_duty as saco_on_duty, s.user_id as saco_user_id,
           ${USER_NAME} as user_name,
           lm.id as last_id, lm.sender as last_sender, lm.text as last_text,
           lm.created_at as last_created,
           (select count(*) from tf_chat_messages m
             where m.conv_id = c.id and m.sender = '${other}'
               and m.created_at > coalesce(c.${readColumn}, '-infinity'::timestamptz))::int as unread
      from tf_chat_convs c
      join tf_sacos s on s.id = c.saco_id
      join users u on u.id = c.user_id
      left join tf_profiles p on p.user_id = c.user_id
      left join lateral (
        select id, sender, text, created_at from tf_chat_messages
         where conv_id = c.id order by id desc limit 1
      ) lm on true`;
}

const toConvView = (row: Row): ChatConvView => ({
  id: String(row.id),
  userId: String(row.user_id),
  sacoId: String(row.saco_id),
  matched: row.matched === true,
  matchedAt: toDateOrNull(row.matched_at),
  direct: row.direct === true,
  lastAt: toDate(row.last_at),
  userReadAt: toDateOrNull(row.user_read_at),
  sacoReadAt: toDateOrNull(row.saco_read_at),
  sacoName: String(row.saco_name),
  sacoIcon: String(row.saco_icon),
  sacoActive: row.saco_active === true,
  sacoOnDuty: row.saco_on_duty === true,
  sacoUserId: String(row.saco_user_id),
  userName: String(row.user_name ?? ''),
  last: lastOf(row),
  unread: Number(row.unread ?? 0),
});

/** Phạm vi trưởng nhóm: SACO của nhóm (kể cả đã gỡ); null = mọi SACO (quản trị viên). */
const STAFF_SCOPE = `($1::uuid is null or s.lead_user_id = $1::uuid)`;

@Injectable()
export class PgFloorChatRepository implements FloorChatRepository {
  async convView(
    db: SqlClient,
    convId: string,
    side: 'user' | 'saco',
  ): Promise<ChatConvView | null> {
    const rows = await db.query<Row>(`${convSelect(side)} where c.id = $1`, [convId]);
    return rows[0] ? toConvView(rows[0]) : null;
  }

  async userConvs(db: SqlClient, userId: string, limit: number): Promise<ChatConvView[]> {
    const rows = await db.query<Row>(
      `${convSelect('user')} where c.user_id = $1 order by c.last_at desc, c.id limit $2`,
      [userId, limit],
    );
    return rows.map(toConvView);
  }

  async sacoConvs(db: SqlClient, sacoId: string, limit: number): Promise<ChatConvView[]> {
    const rows = await db.query<Row>(
      `${convSelect('saco')} where c.saco_id = $1 order by c.last_at desc, c.id limit $2`,
      [sacoId, limit],
    );
    return rows.map(toConvView);
  }

  async matchedConv(db: SqlClient, userId: string): Promise<MatchedConvRef | null> {
    const rows = await db.query<Row>(
      `select c.id, c.saco_id from tf_chat_convs c join tf_sacos s on s.id = c.saco_id
        where c.user_id = $1 and c.matched and s.active
        order by c.matched_at desc nulls last, c.id limit 1`,
      [userId],
    );
    return rows[0] ? { id: String(rows[0].id), sacoId: String(rows[0].saco_id) } : null;
  }

  async ensureConv(
    db: SqlClient,
    userId: string,
    sacoId: string,
    at: Date,
    options: { direct?: boolean } = {},
  ): Promise<string> {
    const rows = await db.query<Row>(
      `insert into tf_chat_convs (user_id, saco_id, direct, created_at, last_at)
       values ($1, $2, $3, $4, $4)
       on conflict (user_id, saco_id) do update set direct = tf_chat_convs.direct or excluded.direct
       returning id`,
      [userId, sacoId, options.direct === true, at],
    );
    return String(rows[0]!.id);
  }

  async markMatched(db: SqlClient, convId: string, at: Date): Promise<void> {
    await db.query(`update tf_chat_convs set matched = true, matched_at = $2 where id = $1`, [
      convId,
      at,
    ]);
  }

  async insertMessage(
    db: SqlClient,
    convId: string,
    sender: ChatSender,
    text: string,
    at: Date,
  ): Promise<ChatMessage> {
    const rows = await db.query<Row>(
      `insert into tf_chat_messages (conv_id, sender, text, created_at)
       values ($1, $2, $3, $4) returning id, sender, text, created_at`,
      [convId, sender, text, at],
    );
    await db.query(`update tf_chat_convs set last_at = greatest(last_at, $2) where id = $1`, [
      convId,
      at,
    ]);
    return toChatMessage(rows[0]!);
  }

  async markRead(
    db: SqlClient,
    convId: string,
    side: 'user' | 'saco',
    at: Date,
  ): Promise<void> {
    const column = side === 'user' ? 'user_read_at' : 'saco_read_at';
    await db.query(
      `update tf_chat_convs set ${column} = greatest(coalesce(${column}, $2), $2) where id = $1`,
      [convId, at],
    );
  }

  async messages(db: SqlClient, convId: string, limit: number): Promise<ChatMessage[]> {
    const rows = await db.query<Row>(
      `select id, sender, text, created_at from tf_chat_messages
        where conv_id = $1 order by id desc limit $2`,
      [convId, limit],
    );
    return rows.map(toChatMessage).reverse();
  }

  async convIdsOfSaco(
    db: SqlClient,
    sacoId: string,
  ): Promise<Array<{ id: string; userId: string }>> {
    const rows = await db.query<Row>(
      `select id, user_id from tf_chat_convs where saco_id = $1 order by created_at, id`,
      [sacoId],
    );
    return rows.map((row) => ({ id: String(row.id), userId: String(row.user_id) }));
  }

  async insertInvite(
    db: SqlClient,
    input: { runId: string; userId: string; sacoId: string; result: InviteResult; at: Date },
  ): Promise<void> {
    await db.query(
      `insert into tf_chat_invites (run_id, user_id, saco_id, result, created_at)
       values ($1, $2, $3, $4, $5)`,
      [input.runId, input.userId, input.sacoId, input.result, input.at],
    );
  }

  async staffInvites(
    db: SqlClient,
    leadId: string | null,
    limit: number,
  ): Promise<StaffInviteRow[]> {
    const rows = await db.query<Row>(
      `select i.id, i.result, i.created_at, s.display_name as saco_name, s.icon as saco_icon,
              ${USER_NAME} as user_name
         from tf_chat_invites i
         join tf_sacos s on s.id = i.saco_id
         join users u on u.id = i.user_id
         left join tf_profiles p on p.user_id = i.user_id
        where ${STAFF_SCOPE}
        order by i.id desc
        limit $2`,
      [leadId, limit],
    );
    return rows.map((row) => ({
      at: toDate(row.created_at).getTime(),
      userName: String(row.user_name ?? ''),
      sacoName: String(row.saco_name),
      sacoIcon: String(row.saco_icon),
      result: row.result as InviteResult,
    }));
  }

  async staffConvs(db: SqlClient, leadId: string | null, limit: number): Promise<StaffConvRow[]> {
    const rows = await db.query<Row>(
      `${convSelect('saco')} where ${STAFF_SCOPE} order by c.last_at desc, c.id limit $2`,
      [leadId, limit],
    );
    return rows.map(toStaffConv);
  }

  async staffConv(
    db: SqlClient,
    convId: string,
    leadId: string | null,
  ): Promise<StaffConvRow | null> {
    const rows = await db.query<Row>(
      `${convSelect('saco')} where c.id = $2 and ${STAFF_SCOPE}`,
      [leadId, convId],
    );
    return rows[0] ? toStaffConv(rows[0]) : null;
  }
}

const toStaffConv = (row: Row): StaffConvRow => ({
  id: String(row.id),
  userName: String(row.user_name ?? ''),
  sacoName: String(row.saco_name),
  sacoIcon: String(row.saco_icon),
  matched: row.matched === true,
  last: lastOf(row),
});
