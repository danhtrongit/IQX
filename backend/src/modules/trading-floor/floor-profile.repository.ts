/**
 * Lưu trữ hồ sơ trên sàn (`tf_profiles`) và tên hiển thị của tài khoản. Chỉ đọc và ghi, mọi quy tắc
 * nằm ở `FloorProfileService`.
 */

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import { cleanAvatar, cleanOutfitColor } from './floor-profile.logic.js';
import type { FloorProfile } from './floor-types.js';

export const FLOOR_PROFILE_REPOSITORY = Symbol('FLOOR_PROFILE_REPOSITORY');

export interface FloorUserBasics {
  readonly id: string;
  readonly fullName: string;
  readonly username: string;
}

export interface FloorProfileRepository {
  find(db: SqlClient, userId: string): Promise<FloorProfile | null>;
  upsert(db: SqlClient, userId: string, profile: FloorProfile, at: Date): Promise<void>;
  userBasics(db: SqlClient, userId: string): Promise<FloorUserBasics | null>;
  /** Khách (`tf_guests`): hồ sơ theo id khách. */
  findGuest(db: SqlClient, guestId: string): Promise<FloorProfile | null>;
  /** Tạo khách mới; chỉ lưu băm của token. Trả id khách. */
  createGuest(
    db: SqlClient,
    input: { tokenHash: string; profile: FloorProfile; ip: string | null },
  ): Promise<string>;
  /** Đổi tên và nhân vật của khách; false khi khách không còn. */
  updateGuest(db: SqlClient, guestId: string, profile: FloorProfile, at: Date): Promise<boolean>;
}

type Row = Record<string, unknown>;

export const toFloorProfile = (row: Row): FloorProfile => ({
  name: String(row.display_name),
  avatar: cleanAvatar(row.avatar) ?? 'male01',
  color: cleanOutfitColor(row.color),
});

@Injectable()
export class PgFloorProfileRepository implements FloorProfileRepository {
  async find(db: SqlClient, userId: string): Promise<FloorProfile | null> {
    const rows = await db.query<Row>(
      `select display_name, avatar, color from tf_profiles where user_id = $1`,
      [userId],
    );
    return rows[0] ? toFloorProfile(rows[0]) : null;
  }

  async upsert(db: SqlClient, userId: string, profile: FloorProfile, at: Date): Promise<void> {
    await db.query(
      `insert into tf_profiles (user_id, display_name, avatar, color, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $5)
       on conflict (user_id) do update
         set display_name = excluded.display_name, avatar = excluded.avatar,
             color = excluded.color, updated_at = excluded.updated_at`,
      [userId, profile.name, profile.avatar, profile.color, at],
    );
  }

  async findGuest(db: SqlClient, guestId: string): Promise<FloorProfile | null> {
    const rows = await db.query<Row>(
      `select display_name, avatar, color from tf_guests where id = $1`,
      [guestId],
    );
    return rows[0] ? toFloorProfile(rows[0]) : null;
  }

  async createGuest(
    db: SqlClient,
    input: { tokenHash: string; profile: FloorProfile; ip: string | null },
  ): Promise<string> {
    const rows = await db.query<{ id: string }>(
      `insert into tf_guests (token_hash, display_name, avatar, color, created_ip)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [input.tokenHash, input.profile.name, input.profile.avatar, input.profile.color, input.ip],
    );
    return String(rows[0]!.id);
  }

  async updateGuest(
    db: SqlClient,
    guestId: string,
    profile: FloorProfile,
    at: Date,
  ): Promise<boolean> {
    const rows = await db.query<{ id: string }>(
      `update tf_guests
          set display_name = $2, avatar = $3, color = $4, updated_at = $5, last_seen_at = $5
        where id = $1
        returning id`,
      [guestId, profile.name, profile.avatar, profile.color, at],
    );
    return rows.length > 0;
  }

  async userBasics(db: SqlClient, userId: string): Promise<FloorUserBasics | null> {
    const rows = await db.query<Row>(
      `select id, full_name, username from users where id = $1 and deleted_at is null`,
      [userId],
    );
    const row = rows[0];
    return row
      ? { id: String(row.id), fullName: String(row.full_name ?? ''), username: String(row.username ?? '') }
      : null;
  }
}
