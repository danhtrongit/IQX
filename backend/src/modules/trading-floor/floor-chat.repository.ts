/**
 * Lưu trữ Nhắn tin với SACO: cuộc trò chuyện (`tf_chat_convs`), tin nhắn, nhật ký lời mời. Không ai sửa
 * hay xoá tin; người gửi chỉ thu hồi (`recalled_at`): hai bên thấy "đã thu hồi", lịch sử của trưởng nhóm
 * và quản trị vẫn giữ nguyên chữ. Chỉ đọc và ghi; quy tắc nằm ở `FloorChatService`.
 *
 * Mọi mốc thời gian do dịch vụ truyền vào (cùng độ chính xác mili giây) để so sánh `created_at` với
 * `*_read_at` không bị lệch giữa đồng hồ JS và đồng hồ cơ sở dữ liệu.
 */

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import { splitOwner } from './floor-actor.js';
import { guestLabel } from './floor-chat.logic.js';
import type { ChatImage, ChatMessage, ChatSender, InviteResult } from './floor-types.js';

export const FLOOR_CHAT_REPOSITORY = Symbol('FLOOR_CHAT_REPOSITORY');

/**
 * Một cuộc trò chuyện kèm mọi thứ cần để dựng `ConvSummary` cho một phía. `userId` là chủ cuộc chat
 * (`ownerId`): uuid tài khoản, hoặc `g:<uuid khách>` khi người chat là khách.
 */
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
  /** Chủ cuộc chat là khách chưa đăng nhập. */
  readonly userGuest: boolean;
  readonly last: ChatMessage | null;
  /** Số tin chưa đọc của phía được hỏi. */
  readonly unread: number;
}

export interface MatchedConvRef {
  readonly id: string;
  readonly sacoId: string;
}

/** Một tin để kiểm tra quyền thu hồi. */
export interface ChatMessageRef {
  readonly id: number;
  readonly from: ChatSender;
  readonly imageId: string | null;
  readonly recalled: boolean;
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

/** Mọi tham số `ownerId` là uuid tài khoản hoặc `g:<uuid khách>` (xem `splitOwner`). */
export interface FloorChatRepository {
  convView(db: SqlClient, convId: string, side: 'user' | 'saco'): Promise<ChatConvView | null>;
  userConvs(db: SqlClient, ownerId: string, limit: number): Promise<ChatConvView[]>;
  sacoConvs(db: SqlClient, sacoId: string, limit: number): Promise<ChatConvView[]>;
  matchedConv(db: SqlClient, ownerId: string): Promise<MatchedConvRef | null>;
  /** Tạo cuộc trò chuyện nếu chưa có; `direct` bật cờ nhắn trực tiếp. Trả về id. */
  ensureConv(
    db: SqlClient,
    ownerId: string,
    sacoId: string,
    at: Date,
    options?: { direct?: boolean },
  ): Promise<string>;
  markMatched(db: SqlClient, convId: string, at: Date): Promise<void>;
  /** `image`: tin ảnh (chữ để trống). */
  insertMessage(
    db: SqlClient,
    convId: string,
    sender: ChatSender,
    text: string,
    at: Date,
    image?: ChatImage,
  ): Promise<ChatMessage>;
  markRead(db: SqlClient, convId: string, side: 'user' | 'saco', at: Date): Promise<void>;
  /**
   * Tin gần nhất theo thứ tự cũ → mới. Hai bên thấy tin thu hồi trống chữ, không ảnh; `staff` (lịch sử
   * của trưởng nhóm) giữ chữ gốc kèm dấu thu hồi.
   */
  messages(
    db: SqlClient,
    convId: string,
    limit: number,
    options?: { staff?: boolean },
  ): Promise<ChatMessage[]>;
  findMessage(db: SqlClient, convId: string, messageId: number): Promise<ChatMessageRef | null>;
  /** Đánh dấu thu hồi; null khi tin đã thu hồi từ trước (hoặc không có). */
  recallMessage(
    db: SqlClient,
    convId: string,
    messageId: number,
    at: Date,
  ): Promise<{ imageId: string | null } | null>;
  /** Cuộc chat của một ảnh, để phát; null khi không có ảnh này. */
  chatImage(
    db: SqlClient,
    imageId: string,
  ): Promise<{ convId: string; recalled: boolean } | null>;
  /** `userId` là chủ cuộc chat (uuid tài khoản hoặc `g:<uuid khách>`). */
  convIdsOfSaco(db: SqlClient, sacoId: string): Promise<Array<{ id: string; userId: string }>>;
  insertInvite(
    db: SqlClient,
    input: { runId: string; ownerId: string; sacoId: string; result: InviteResult; at: Date },
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

/** Tên người chat: hồ sơ trên sàn, rồi tên khách, rồi họ tên tài khoản (khách không có `u` và `p`). */
const USER_NAME = `coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(g.display_name), ''), nullif(btrim(u.full_name), ''), u.username)`;
const OWNER_ID = `coalesce(c.user_id::text, 'g:' || c.guest_id::text)`;

const MESSAGE_COLUMNS = 'id, sender, text, created_at, image_id, image_w, image_h, recalled_at';

/**
 * Một dòng `tf_chat_messages` thành tin. Tin thu hồi: hai bên nhận chữ trống, không ảnh, `recalled`;
 * `staff` giữ chữ gốc (ảnh thì đã xoá).
 */
export const toChatMessage = (row: Row, staff = false): ChatMessage => {
  const recalled = row.recalled_at !== null && row.recalled_at !== undefined;
  const message: ChatMessage = {
    id: Number(row.id),
    from: row.sender as ChatSender,
    text: recalled && !staff ? '' : String(row.text),
    at: toDate(row.created_at).getTime(),
  };
  if (recalled) message.recalled = true;
  else if (row.image_id !== null && row.image_id !== undefined) {
    message.image = { id: String(row.image_id), w: Number(row.image_w), h: Number(row.image_h) };
  }
  return message;
};

const lastOf = (row: Row, staff = false): ChatMessage | null =>
  row.last_id === null || row.last_id === undefined
    ? null
    : toChatMessage(
        {
          id: row.last_id,
          sender: row.last_sender,
          text: row.last_text,
          created_at: row.last_created,
          image_id: row.last_image_id,
          image_w: row.last_image_w,
          image_h: row.last_image_h,
          recalled_at: row.last_recalled_at,
        },
        staff,
      );

/** Câu SELECT một cuộc trò chuyện cho phía `side`: số chưa đọc đếm tin của bên kia sau mốc đã đọc. */
function convSelect(side: 'user' | 'saco'): string {
  const other = side === 'user' ? 's' : 'u';
  const readColumn = side === 'user' ? 'user_read_at' : 'saco_read_at';
  return `
    select c.id, ${OWNER_ID} as owner_id, c.saco_id, c.matched, c.matched_at, c.direct, c.last_at,
           c.user_read_at, c.saco_read_at,
           s.display_name as saco_name, s.icon as saco_icon, s.active as saco_active,
           s.on_duty as saco_on_duty, s.user_id as saco_user_id,
           ${USER_NAME} as user_name, (c.guest_id is not null) as user_guest,
           lm.id as last_id, lm.sender as last_sender, lm.text as last_text,
           lm.created_at as last_created, lm.image_id as last_image_id, lm.image_w as last_image_w,
           lm.image_h as last_image_h, lm.recalled_at as last_recalled_at,
           (select count(*) from tf_chat_messages m
             where m.conv_id = c.id and m.sender = '${other}' and m.recalled_at is null
               and m.created_at > coalesce(c.${readColumn}, '-infinity'::timestamptz))::int as unread
      from tf_chat_convs c
      join tf_sacos s on s.id = c.saco_id
      left join users u on u.id = c.user_id
      left join tf_guests g on g.id = c.guest_id
      left join tf_profiles p on p.user_id = c.user_id
      left join lateral (
        select ${MESSAGE_COLUMNS} from tf_chat_messages
         where conv_id = c.id order by id desc limit 1
      ) lm on true`;
}

const toConvView = (row: Row): ChatConvView => ({
  id: String(row.id),
  userId: String(row.owner_id),
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
  userGuest: row.user_guest === true,
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

  async userConvs(db: SqlClient, ownerId: string, limit: number): Promise<ChatConvView[]> {
    const { userId, guestId } = splitOwner(ownerId);
    const rows = await db.query<Row>(
      `${convSelect('user')} where (c.user_id = $1::uuid or c.guest_id = $2::uuid)
        order by c.last_at desc, c.id limit $3`,
      [userId, guestId, limit],
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

  async matchedConv(db: SqlClient, ownerId: string): Promise<MatchedConvRef | null> {
    const { userId, guestId } = splitOwner(ownerId);
    const rows = await db.query<Row>(
      `select c.id, c.saco_id from tf_chat_convs c join tf_sacos s on s.id = c.saco_id
        where (c.user_id = $1::uuid or c.guest_id = $2::uuid) and c.matched and s.active
        order by c.matched_at desc nulls last, c.id limit 1`,
      [userId, guestId],
    );
    return rows[0] ? { id: String(rows[0].id), sacoId: String(rows[0].saco_id) } : null;
  }

  async ensureConv(
    db: SqlClient,
    ownerId: string,
    sacoId: string,
    at: Date,
    options: { direct?: boolean } = {},
  ): Promise<string> {
    const { userId, guestId } = splitOwner(ownerId);
    // Hai đường: khoá duy nhất của khách là chỉ mục từng phần nên `on conflict` phải nêu đúng vị từ đó.
    const rows =
      guestId === null
        ? await db.query<Row>(
            `insert into tf_chat_convs (user_id, saco_id, direct, created_at, last_at)
             values ($1, $2, $3, $4, $4)
             on conflict (user_id, saco_id) do update set direct = tf_chat_convs.direct or excluded.direct
             returning id`,
            [userId, sacoId, options.direct === true, at],
          )
        : await db.query<Row>(
            `insert into tf_chat_convs (guest_id, saco_id, direct, created_at, last_at)
             values ($1, $2, $3, $4, $4)
             on conflict (guest_id, saco_id) where guest_id is not null
             do update set direct = tf_chat_convs.direct or excluded.direct
             returning id`,
            [guestId, sacoId, options.direct === true, at],
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
    image?: ChatImage,
  ): Promise<ChatMessage> {
    const rows = await db.query<Row>(
      `insert into tf_chat_messages (conv_id, sender, text, created_at, image_id, image_w, image_h)
       values ($1, $2, $3, $4, $5, $6, $7) returning ${MESSAGE_COLUMNS}`,
      [convId, sender, text, at, image?.id ?? null, image?.w ?? null, image?.h ?? null],
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

  async messages(
    db: SqlClient,
    convId: string,
    limit: number,
    options: { staff?: boolean } = {},
  ): Promise<ChatMessage[]> {
    const rows = await db.query<Row>(
      `select ${MESSAGE_COLUMNS} from tf_chat_messages
        where conv_id = $1 order by id desc limit $2`,
      [convId, limit],
    );
    return rows.map((row) => toChatMessage(row, options.staff === true)).reverse();
  }

  async findMessage(
    db: SqlClient,
    convId: string,
    messageId: number,
  ): Promise<ChatMessageRef | null> {
    const rows = await db.query<Row>(
      `select id, sender, image_id, recalled_at from tf_chat_messages where id = $1 and conv_id = $2`,
      [messageId, convId],
    );
    const row = rows[0];
    return row
      ? {
          id: Number(row.id),
          from: row.sender as ChatSender,
          imageId: row.image_id === null || row.image_id === undefined ? null : String(row.image_id),
          recalled: row.recalled_at !== null && row.recalled_at !== undefined,
        }
      : null;
  }

  async recallMessage(
    db: SqlClient,
    convId: string,
    messageId: number,
    at: Date,
  ): Promise<{ imageId: string | null } | null> {
    const rows = await db.query<Row>(
      `update tf_chat_messages set recalled_at = $3
        where id = $1 and conv_id = $2 and recalled_at is null
        returning image_id`,
      [messageId, convId, at],
    );
    const row = rows[0];
    if (!row) return null;
    return { imageId: row.image_id === null || row.image_id === undefined ? null : String(row.image_id) };
  }

  async chatImage(
    db: SqlClient,
    imageId: string,
  ): Promise<{ convId: string; recalled: boolean } | null> {
    const rows = await db.query<Row>(
      `select conv_id, recalled_at from tf_chat_messages where image_id = $1`,
      [imageId],
    );
    const row = rows[0];
    return row
      ? { convId: String(row.conv_id), recalled: row.recalled_at !== null && row.recalled_at !== undefined }
      : null;
  }

  async convIdsOfSaco(
    db: SqlClient,
    sacoId: string,
  ): Promise<Array<{ id: string; userId: string }>> {
    const rows = await db.query<Row>(
      `select id, coalesce(user_id::text, 'g:' || guest_id::text) as owner_id
         from tf_chat_convs where saco_id = $1 order by created_at, id`,
      [sacoId],
    );
    return rows.map((row) => ({ id: String(row.id), userId: String(row.owner_id) }));
  }

  async insertInvite(
    db: SqlClient,
    input: { runId: string; ownerId: string; sacoId: string; result: InviteResult; at: Date },
  ): Promise<void> {
    const { userId, guestId } = splitOwner(input.ownerId);
    await db.query(
      `insert into tf_chat_invites (run_id, user_id, guest_id, saco_id, result, created_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [input.runId, userId, guestId, input.sacoId, input.result, input.at],
    );
  }

  async staffInvites(
    db: SqlClient,
    leadId: string | null,
    limit: number,
  ): Promise<StaffInviteRow[]> {
    const rows = await db.query<Row>(
      `select i.id, i.result, i.created_at, s.display_name as saco_name, s.icon as saco_icon,
              ${USER_NAME} as user_name, (i.guest_id is not null) as user_guest
         from tf_chat_invites i
         join tf_sacos s on s.id = i.saco_id
         left join users u on u.id = i.user_id
         left join tf_guests g on g.id = i.guest_id
         left join tf_profiles p on p.user_id = i.user_id
        where ${STAFF_SCOPE}
        order by i.id desc
        limit $2`,
      [leadId, limit],
    );
    return rows.map((row) => ({
      at: toDate(row.created_at).getTime(),
      userName: guestLabel(String(row.user_name ?? ''), row.user_guest === true),
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
  userName: guestLabel(String(row.user_name ?? ''), row.user_guest === true),
  sacoName: String(row.saco_name),
  sacoIcon: String(row.saco_icon),
  matched: row.matched === true,
  last: lastOf(row, true),
});
