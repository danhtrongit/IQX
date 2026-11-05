/**
 * Lưu trữ chat phòng Flashback (spec v2.4 §3.6). Lọc tin theo người nhận nằm ở service
 * (`chatVisibleTo`); ở đây chỉ đọc và ghi.
 */

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';

export const FLASHBACK_CHAT_REPOSITORY = Symbol('FLASHBACK_CHAT_REPOSITORY');

export interface FbChatMessageRow {
  readonly id: string;
  readonly roomId: string;
  readonly matchId: string | null;
  readonly matchStartedAt: Date | null;
  readonly userId: string;
  readonly name: string;
  readonly phien: number;
  readonly text: string;
  readonly createdAt: Date;
}

export interface NewFbChatMessage {
  readonly roomId: string;
  readonly matchId: string | null;
  readonly userId: string;
  readonly phien: number;
  readonly text: string;
  readonly createdAt: Date;
}

/** Ván hiện tại của phòng nhìn từ một người: chỉ các cột nhẹ, vì được đọc mỗi lần polling. */
export interface FbChatMatchInfo {
  readonly matchId: string;
  readonly startedAt: Date;
  readonly endsAt: Date;
  readonly playBars: number;
  readonly live: boolean;
  /** null khi người này không có lượt trong ván. */
  readonly step: number | null;
  readonly finished: boolean;
}

export interface FbChatMutedUser {
  readonly userId: string;
  readonly name: string;
}

export type FbChatReportStatus = 'open' | 'resolved' | 'dismissed';

export interface FbChatReportContextItem {
  readonly name: string;
  readonly phien: number;
  readonly waiting: boolean;
  readonly text: string;
  readonly at: string;
}

export interface NewFbChatReport {
  readonly messageId: string;
  readonly roomCode: string;
  readonly reporterId: string;
  readonly reportedUserId: string;
  readonly messageText: string;
  readonly messagePhien: number;
  readonly messageAt: Date;
  readonly context: readonly FbChatReportContextItem[];
  readonly createdAt: Date;
}

export interface FbChatReportRow {
  readonly id: string;
  readonly roomCode: string;
  readonly reporterName: string;
  readonly reportedUserId: string;
  readonly reportedName: string;
  readonly messageText: string;
  readonly messagePhien: number;
  readonly messageAt: Date;
  readonly context: readonly FbChatReportContextItem[];
  readonly status: FbChatReportStatus;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
}

export abstract class FlashbackChatRepository {
  abstract currentMatch(
    db: SqlClient,
    matchId: string,
    userId: string,
  ): Promise<FbChatMatchInfo | null>;
  /** Tin gần nhất của phòng, mới nhất trước. */
  abstract recentMessages(
    db: SqlClient,
    roomId: string,
    limit: number,
  ): Promise<FbChatMessageRow[]>;
  abstract messageById(
    db: SqlClient,
    roomId: string,
    messageId: string,
  ): Promise<FbChatMessageRow | null>;
  /** Tin trước một tin trong cùng phòng, mới nhất trước. */
  abstract messagesBefore(
    db: SqlClient,
    message: FbChatMessageRow,
    limit: number,
  ): Promise<FbChatMessageRow[]>;
  abstract insertMessage(tx: SqlClient, input: NewFbChatMessage): Promise<FbChatMessageRow>;
  /** Giữ khoá theo người gửi tới hết transaction, để hai tin gửi cùng lúc không cùng lọt qua giới hạn. */
  abstract lockSender(tx: SqlClient, userId: string): Promise<void>;
  abstract lastSentAt(tx: SqlClient, userId: string): Promise<Date | null>;
  abstract mutedUsers(db: SqlClient, roomId: string, userId: string): Promise<FbChatMutedUser[]>;
  abstract setMuted(
    tx: SqlClient,
    roomId: string,
    userId: string,
    targetId: string,
    muted: boolean,
    at: Date,
  ): Promise<void>;
  abstract bannedWords(db: SqlClient): Promise<string[]>;
  abstract replaceBannedWords(
    tx: SqlClient,
    words: readonly string[],
    adminId: string,
    at: Date,
  ): Promise<void>;
  /** false khi người này đã báo cáo tin này rồi. */
  abstract insertReport(tx: SqlClient, input: NewFbChatReport): Promise<boolean>;
  abstract markReported(tx: SqlClient, messageId: string): Promise<void>;
  abstract reports(
    db: SqlClient,
    status: FbChatReportStatus,
    limit: number,
  ): Promise<FbChatReportRow[]>;
  abstract decideReport(
    tx: SqlClient,
    reportId: string,
    status: Exclude<FbChatReportStatus, 'open'>,
    adminId: string,
    at: Date,
  ): Promise<boolean>;
  /** Xoá tin và tắt tiếng cũ hơn mốc; trả số tin đã xoá. */
  abstract purge(db: SqlClient, before: Date): Promise<number>;
}

type Row = Record<string, unknown>;

const DISPLAY_NAME = (alias: string) =>
  `coalesce(nullif(${alias}.username, ''), nullif(${alias}.full_name, ''), 'Người chơi')`;

const MESSAGE_SELECT = `select c.id, c.room_id, c.match_id, m.started_at as match_started_at, c.user_id,
         ${DISPLAY_NAME('u')} as name, c.phien, c.text, c.created_at
    from fb_chat_messages c
    join users u on u.id = c.user_id
    left join fb_matches m on m.id = c.match_id`;

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));
const toDateOrNull = (value: unknown): Date | null =>
  value === null || value === undefined ? null : toDate(value);

const mapMessage = (row: Row): FbChatMessageRow => ({
  id: String(row.id),
  roomId: String(row.room_id),
  matchId: row.match_id === null ? null : String(row.match_id),
  matchStartedAt: toDateOrNull(row.match_started_at),
  userId: String(row.user_id),
  name: String(row.name ?? ''),
  phien: Number(row.phien),
  text: String(row.text),
  createdAt: toDate(row.created_at),
});

@Injectable()
export class PgFlashbackChatRepository extends FlashbackChatRepository {
  async currentMatch(
    db: SqlClient,
    matchId: string,
    userId: string,
  ): Promise<FbChatMatchInfo | null> {
    const rows = await db.query<Row>(
      `select m.id, m.started_at, m.ends_at, m.play_bars, m.status, e.step, e.status as entry_status
         from fb_matches m
         left join fb_entries e on e.match_id = m.id and e.user_id = $2
        where m.id = $1`,
      [matchId, userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      matchId: String(row.id),
      startedAt: toDate(row.started_at),
      endsAt: toDate(row.ends_at),
      playBars: Number(row.play_bars),
      live: row.status === 'playing',
      step: row.step === null ? null : Number(row.step),
      finished: row.entry_status === 'finished',
    };
  }

  async recentMessages(db: SqlClient, roomId: string, limit: number): Promise<FbChatMessageRow[]> {
    const rows = await db.query<Row>(
      `${MESSAGE_SELECT} where c.room_id = $1 order by c.created_at desc, c.id desc limit $2`,
      [roomId, limit],
    );
    return rows.map(mapMessage);
  }

  async messageById(
    db: SqlClient,
    roomId: string,
    messageId: string,
  ): Promise<FbChatMessageRow | null> {
    const rows = await db.query<Row>(`${MESSAGE_SELECT} where c.room_id = $1 and c.id = $2`, [
      roomId,
      messageId,
    ]);
    return rows[0] ? mapMessage(rows[0]) : null;
  }

  async messagesBefore(
    db: SqlClient,
    message: FbChatMessageRow,
    limit: number,
  ): Promise<FbChatMessageRow[]> {
    const rows = await db.query<Row>(
      `${MESSAGE_SELECT}
        where c.room_id = $1 and c.id <> $2 and c.created_at <= $3
        order by c.created_at desc, c.id desc limit $4`,
      [message.roomId, message.id, message.createdAt, limit],
    );
    return rows.map(mapMessage);
  }

  async insertMessage(tx: SqlClient, input: NewFbChatMessage): Promise<FbChatMessageRow> {
    const rows = await tx.query<Row>(
      `insert into fb_chat_messages (room_id, match_id, user_id, phien, text, created_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [input.roomId, input.matchId, input.userId, input.phien, input.text, input.createdAt],
    );
    const saved = await this.messageById(tx, input.roomId, String(rows[0]!.id));
    return saved!;
  }

  async lockSender(tx: SqlClient, userId: string): Promise<void> {
    await tx.query(`select pg_advisory_xact_lock(hashtextextended($1, 2404))`, [userId]);
  }

  async lastSentAt(tx: SqlClient, userId: string): Promise<Date | null> {
    const rows = await tx.query<Row>(
      `select created_at from fb_chat_messages where user_id = $1 order by created_at desc limit 1`,
      [userId],
    );
    return rows[0] ? toDate(rows[0].created_at) : null;
  }

  async mutedUsers(db: SqlClient, roomId: string, userId: string): Promise<FbChatMutedUser[]> {
    const rows = await db.query<Row>(
      `select t.muted_user_id, ${DISPLAY_NAME('u')} as name
         from fb_chat_mutes t
         join users u on u.id = t.muted_user_id
        where t.room_id = $1 and t.user_id = $2
        order by t.created_at`,
      [roomId, userId],
    );
    return rows.map((row) => ({ userId: String(row.muted_user_id), name: String(row.name ?? '') }));
  }

  async setMuted(
    tx: SqlClient,
    roomId: string,
    userId: string,
    targetId: string,
    muted: boolean,
    at: Date,
  ): Promise<void> {
    if (muted) {
      await tx.query(
        `insert into fb_chat_mutes (room_id, user_id, muted_user_id, created_at)
         values ($1, $2, $3, $4) on conflict do nothing`,
        [roomId, userId, targetId, at],
      );
      return;
    }
    await tx.query(
      `delete from fb_chat_mutes where room_id = $1 and user_id = $2 and muted_user_id = $3`,
      [roomId, userId, targetId],
    );
  }

  async bannedWords(db: SqlClient): Promise<string[]> {
    const rows = await db.query<Row>(`select word from fb_chat_banned_words order by word`);
    return rows.map((row) => String(row.word));
  }

  async replaceBannedWords(
    tx: SqlClient,
    words: readonly string[],
    adminId: string,
    at: Date,
  ): Promise<void> {
    await tx.query(`delete from fb_chat_banned_words where not (word = any($1::text[]))`, [words]);
    await tx.query(
      `insert into fb_chat_banned_words (word, created_by, created_at)
       select unnest($1::text[]), $2::uuid, $3::timestamptz on conflict (word) do nothing`,
      [words, adminId, at],
    );
  }

  async insertReport(tx: SqlClient, input: NewFbChatReport): Promise<boolean> {
    const rows = await tx.query<Row>(
      `insert into fb_chat_reports
         (message_id, room_code, reporter_id, reported_user_id, message_text, message_phien,
          message_at, context, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       on conflict (message_id, reporter_id) do nothing
       returning id`,
      [
        input.messageId,
        input.roomCode,
        input.reporterId,
        input.reportedUserId,
        input.messageText,
        input.messagePhien,
        input.messageAt,
        JSON.stringify(input.context),
        input.createdAt,
      ],
    );
    return rows.length > 0;
  }

  async markReported(tx: SqlClient, messageId: string): Promise<void> {
    await tx.query(`update fb_chat_messages set reported = true where id = $1`, [messageId]);
  }

  async reports(
    db: SqlClient,
    status: FbChatReportStatus,
    limit: number,
  ): Promise<FbChatReportRow[]> {
    const rows = await db.query<Row>(
      `select r.id, r.room_code, ${DISPLAY_NAME('a')} as reporter_name, r.reported_user_id,
              ${DISPLAY_NAME('b')} as reported_name, r.message_text, r.message_phien, r.message_at,
              r.context, r.status, r.created_at, r.decided_at
         from fb_chat_reports r
         join users a on a.id = r.reporter_id
         join users b on b.id = r.reported_user_id
        where r.status = $1
        order by r.created_at desc limit $2`,
      [status, limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      roomCode: String(row.room_code),
      reporterName: String(row.reporter_name ?? ''),
      reportedUserId: String(row.reported_user_id),
      reportedName: String(row.reported_name ?? ''),
      messageText: String(row.message_text),
      messagePhien: Number(row.message_phien),
      messageAt: toDate(row.message_at),
      context: (row.context ?? []) as FbChatReportContextItem[],
      status: String(row.status) as FbChatReportStatus,
      createdAt: toDate(row.created_at),
      decidedAt: toDateOrNull(row.decided_at),
    }));
  }

  async decideReport(
    tx: SqlClient,
    reportId: string,
    status: Exclude<FbChatReportStatus, 'open'>,
    adminId: string,
    at: Date,
  ): Promise<boolean> {
    const rows = await tx.query<Row>(
      `update fb_chat_reports set status = $2, decided_by = $3, decided_at = $4
        where id = $1 and status = 'open' returning id`,
      [reportId, status, adminId, at],
    );
    return rows.length > 0;
  }

  async purge(db: SqlClient, before: Date): Promise<number> {
    await db.query(`delete from fb_chat_mutes where created_at < $1`, [before]);
    const rows = await db.query<Row>(
      `delete from fb_chat_messages where created_at < $1 returning id`,
      [before],
    );
    return rows.length;
  }
}
