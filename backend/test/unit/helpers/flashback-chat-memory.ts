import { randomUUID } from 'node:crypto';

import type { SqlClient } from '../../../src/platform/database/database.service.js';
import {
  FlashbackChatRepository,
  type FbChatMatchInfo,
  type FbChatMessageRow,
  type FbChatMutedUser,
  type FbChatReportRow,
  type FbChatReportStatus,
  type NewFbChatMessage,
  type NewFbChatReport,
} from '../../../src/modules/flashback/flashback-chat.repository.js';
import type { MemoryRoomsRepository } from './flashback-rooms-memory.js';

type StoredReport = NewFbChatReport & {
  id: string;
  status: FbChatReportStatus;
  decidedAt: Date | null;
};

/** Kho chat trong bộ nhớ, đọc ván và tên từ kho phòng trong bộ nhớ. */
export class MemoryChatRepository extends FlashbackChatRepository {
  readonly messages: (FbChatMessageRow & { reported: boolean })[] = [];
  readonly mutes: { roomId: string; userId: string; targetId: string; at: Date }[] = [];
  readonly reportRows: StoredReport[] = [];
  words: string[] = [];

  constructor(private readonly rooms: MemoryRoomsRepository) {
    super();
  }

  private nameOf(userId: string): string {
    return this.rooms.state.users.get(userId)?.name ?? 'Người chơi';
  }

  async currentMatch(
    _db: SqlClient,
    matchId: string,
    userId: string,
  ): Promise<FbChatMatchInfo | null> {
    const match = this.rooms.state.matches.find((item) => item.id === matchId);
    if (!match) return null;
    const entry = this.rooms.state.entries.find(
      (item) => item.matchId === matchId && item.userId === userId,
    );
    return {
      matchId,
      startedAt: match.startedAt,
      endsAt: match.endsAt,
      playBars: match.playBars,
      live: match.status === 'playing',
      step: entry ? entry.step : null,
      finished: entry?.status === 'finished',
    };
  }

  async recentMessages(_db: SqlClient, roomId: string, limit: number): Promise<FbChatMessageRow[]> {
    return this.messages
      .filter((message) => message.roomId === roomId)
      .reverse()
      .slice(0, limit);
  }

  async messageById(
    _db: SqlClient,
    roomId: string,
    messageId: string,
  ): Promise<FbChatMessageRow | null> {
    return (
      this.messages.find((message) => message.roomId === roomId && message.id === messageId) ?? null
    );
  }

  async messagesBefore(
    _db: SqlClient,
    message: FbChatMessageRow,
    limit: number,
  ): Promise<FbChatMessageRow[]> {
    const index = this.messages.findIndex((item) => item.id === message.id);
    return this.messages
      .slice(0, index)
      .filter((item) => item.roomId === message.roomId)
      .reverse()
      .slice(0, limit);
  }

  async insertMessage(_tx: SqlClient, input: NewFbChatMessage): Promise<FbChatMessageRow> {
    const match = this.rooms.state.matches.find((item) => item.id === input.matchId);
    const row = {
      id: randomUUID(),
      roomId: input.roomId,
      matchId: input.matchId,
      matchStartedAt: match?.startedAt ?? null,
      userId: input.userId,
      name: this.nameOf(input.userId),
      phien: input.phien,
      text: input.text,
      createdAt: input.createdAt,
      reported: false,
    };
    this.messages.push(row);
    return row;
  }

  async lockSender(): Promise<void> {}

  async lastSentAt(_tx: SqlClient, userId: string): Promise<Date | null> {
    const mine = this.messages.filter((message) => message.userId === userId);
    return mine.at(-1)?.createdAt ?? null;
  }

  async mutedUsers(_db: SqlClient, roomId: string, userId: string): Promise<FbChatMutedUser[]> {
    return this.mutes
      .filter((mute) => mute.roomId === roomId && mute.userId === userId)
      .map((mute) => ({ userId: mute.targetId, name: this.nameOf(mute.targetId) }));
  }

  async setMuted(
    _tx: SqlClient,
    roomId: string,
    userId: string,
    targetId: string,
    muted: boolean,
    at: Date,
  ): Promise<void> {
    const index = this.mutes.findIndex(
      (mute) => mute.roomId === roomId && mute.userId === userId && mute.targetId === targetId,
    );
    if (muted && index < 0) this.mutes.push({ roomId, userId, targetId, at });
    if (!muted && index >= 0) this.mutes.splice(index, 1);
  }

  async bannedWords(): Promise<string[]> {
    return [...this.words];
  }

  async replaceBannedWords(_tx: SqlClient, words: readonly string[]): Promise<void> {
    this.words = [...words];
  }

  async insertReport(_tx: SqlClient, input: NewFbChatReport): Promise<boolean> {
    if (
      this.reportRows.some(
        (row) => row.messageId === input.messageId && row.reporterId === input.reporterId,
      )
    )
      return false;
    this.reportRows.push({ ...input, id: randomUUID(), status: 'open', decidedAt: null });
    return true;
  }

  async markReported(_tx: SqlClient, messageId: string): Promise<void> {
    const message = this.messages.find((item) => item.id === messageId);
    if (message) message.reported = true;
  }

  async reports(
    _db: SqlClient,
    status: FbChatReportStatus,
    limit: number,
  ): Promise<FbChatReportRow[]> {
    return this.reportRows
      .filter((row) => row.status === status)
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        roomCode: row.roomCode,
        reporterName: this.nameOf(row.reporterId),
        reportedUserId: row.reportedUserId,
        reportedName: this.nameOf(row.reportedUserId),
        messageText: row.messageText,
        messagePhien: row.messagePhien,
        messageAt: row.messageAt,
        context: row.context,
        status: row.status,
        createdAt: row.createdAt,
        decidedAt: row.decidedAt,
      }));
  }

  async decideReport(
    _tx: SqlClient,
    reportId: string,
    status: 'resolved' | 'dismissed',
    _adminId: string,
    at: Date,
  ): Promise<boolean> {
    const row = this.reportRows.find((item) => item.id === reportId && item.status === 'open');
    if (!row) return false;
    row.status = status;
    row.decidedAt = at;
    return true;
  }

  async purge(_db: SqlClient, before: Date): Promise<number> {
    const start = this.messages.length;
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      if (this.messages[index]!.createdAt.getTime() < before.getTime())
        this.messages.splice(index, 1);
    }
    return start - this.messages.length;
  }
}
