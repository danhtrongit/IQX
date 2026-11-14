/**
 * Lưu trữ quyền SACO (`tf_sacos`): một dòng cho mỗi tài khoản, giữ lại cả khi gỡ quyền để chat cũ
 * còn đọc được. `position` trong cột luôn được giữ liền 1..n giữa các SACO còn hoạt động; thứ hạng
 * trả ra (`rank`) lại tính bằng `row_number()` để vẫn đúng nếu có dữ liệu lệch.
 */

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import type { SacoSelf } from './floor-types.js';

export const FLOOR_SACO_REPOSITORY = Symbol('FLOOR_SACO_REPOSITORY');

export interface FloorSacoRow {
  readonly id: string;
  readonly userId: string;
  readonly leadUserId: string;
  readonly name: string;
  readonly icon: string;
  readonly active: boolean;
  readonly onDuty: boolean;
  /** Thứ hạng 1..n giữa các SACO còn hoạt động; null khi đã gỡ quyền. */
  readonly rank: number | null;
  readonly leadName: string;
  readonly email: string;
  readonly removedAt: Date | null;
}

export interface FloorSacoManageRow extends FloorSacoRow {
  readonly convs: number;
  readonly accepted: number;
  readonly declined: number;
  readonly timedOut: number;
}

export interface FloorGrantUser {
  readonly id: string;
  readonly role: string;
  readonly status: string;
  readonly groupLeadId: string | null;
  readonly fullName: string;
  readonly username: string;
}

export interface FloorCandidate {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly leadUserId: string | null;
  readonly leadName: string | null;
}

export interface FloorLead {
  readonly id: string;
  readonly name: string;
}

export interface FloorSacoRepository {
  findById(db: SqlClient, id: string): Promise<FloorSacoRow | null>;
  findByUser(db: SqlClient, userId: string): Promise<FloorSacoRow | null>;
  /** SACO còn hoạt động theo đúng thứ tự khớp. */
  listActive(db: SqlClient): Promise<FloorSacoRow[]>;
  /** Danh sách quản trị: mọi SACO còn hoạt động, thêm SACO đã gỡ (của nhóm `leadId`, hoặc tất cả khi null). */
  listManage(db: SqlClient, leadId: string | null): Promise<FloorSacoManageRow[]>;
  candidates(db: SqlClient, query: string, leadId: string | null): Promise<FloorCandidate[]>;
  grantUser(db: SqlClient, userId: string): Promise<FloorGrantUser | null>;
  activeLead(db: SqlClient, leadId: string): Promise<FloorLead | null>;
  activeLeads(db: SqlClient): Promise<FloorLead[]>;
  totalCount(db: SqlClient): Promise<number>;
  maxActivePosition(db: SqlClient): Promise<number>;
  /** Khoá thứ tự: mọi thao tác cấp, gỡ, đổi chỗ tuần tự hoá theo khoá này tới hết transaction. */
  lockOrder(tx: SqlClient): Promise<void>;
  insert(
    tx: SqlClient,
    input: {
      userId: string;
      leadUserId: string;
      name: string;
      icon: string;
      position: number;
      at: Date;
      by: string;
    },
  ): Promise<string>;
  restore(
    tx: SqlClient,
    id: string,
    input: { leadUserId: string; name: string | null; position: number; at: Date; by: string },
  ): Promise<void>;
  updateMeta(
    tx: SqlClient,
    id: string,
    input: { name: string; leadUserId: string; at: Date },
  ): Promise<void>;
  deactivate(tx: SqlClient, id: string, at: Date, by: string): Promise<void>;
  setDuty(db: SqlClient, id: string, on: boolean, at: Date): Promise<void>;
  renumber(tx: SqlClient, orderedIds: readonly string[], at: Date): Promise<void>;
}

type Row = Record<string, unknown>;

const BASE = `
  with ranked as (
    select s.*,
           case when s.active
                then row_number() over (partition by s.active order by s.position, s.assigned_at, s.id)::int
           end as rank
      from tf_sacos s
  )
  select r.id, r.user_id, r.lead_user_id, r.display_name, r.icon, r.active, r.on_duty, r.rank,
         r.removed_at,
         coalesce(nullif(btrim(l.full_name), ''), l.username) as lead_name,
         u.email`;

const FROM = `
    from ranked r
    join users u on u.id = r.user_id
    join users l on l.id = r.lead_user_id`;

const STATS = `,
         (select count(*) from tf_chat_convs c where c.saco_id = r.id)::int as convs,
         (select count(*) from tf_chat_invites i where i.saco_id = r.id and i.result = 'accept')::int as accepted,
         (select count(*) from tf_chat_invites i where i.saco_id = r.id and i.result = 'decline')::int as declined,
         (select count(*) from tf_chat_invites i where i.saco_id = r.id and i.result = 'timeout')::int as timed_out`;

/** Dòng SACO nhìn từ chính chủ tài khoản (`/me`, hộp thư, công tắc trực). */
export const toSacoSelf = (row: FloorSacoRow): SacoSelf => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  team: row.leadName,
  active: row.active,
  onDuty: row.onDuty,
  position: row.active ? row.rank : null,
});

const toDateOrNull = (value: unknown): Date | null =>
  value === null || value === undefined ? null : new Date(value as string | number | Date);

const toRow = (row: Row): FloorSacoRow => ({
  id: String(row.id),
  userId: String(row.user_id),
  leadUserId: String(row.lead_user_id),
  name: String(row.display_name),
  icon: String(row.icon),
  active: row.active === true,
  onDuty: row.on_duty === true,
  rank: row.rank === null || row.rank === undefined ? null : Number(row.rank),
  leadName: String(row.lead_name ?? ''),
  email: String(row.email ?? ''),
  removedAt: toDateOrNull(row.removed_at),
});

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class PgFloorSacoRepository implements FloorSacoRepository {
  async findById(db: SqlClient, id: string): Promise<FloorSacoRow | null> {
    const rows = await db.query<Row>(`${BASE} ${FROM} where r.id = $1`, [id]);
    return rows[0] ? toRow(rows[0]) : null;
  }

  async findByUser(db: SqlClient, userId: string): Promise<FloorSacoRow | null> {
    const rows = await db.query<Row>(`${BASE} ${FROM} where r.user_id = $1`, [userId]);
    return rows[0] ? toRow(rows[0]) : null;
  }

  async listActive(db: SqlClient): Promise<FloorSacoRow[]> {
    const rows = await db.query<Row>(`${BASE} ${FROM} where r.active order by r.rank`);
    return rows.map(toRow);
  }

  async listManage(db: SqlClient, leadId: string | null): Promise<FloorSacoManageRow[]> {
    const rows = await db.query<Row>(
      `${BASE}${STATS} ${FROM}
        where r.active or $1::uuid is null or r.lead_user_id = $1::uuid
        order by r.active desc, r.rank, r.removed_at desc nulls last, lower(r.display_name), r.id`,
      [leadId],
    );
    return rows.map((row) => ({
      ...toRow(row),
      convs: Number(row.convs),
      accepted: Number(row.accepted),
      declined: Number(row.declined),
      timedOut: Number(row.timed_out),
    }));
  }

  async candidates(
    db: SqlClient,
    query: string,
    leadId: string | null,
  ): Promise<FloorCandidate[]> {
    const pattern = `%${escapeLike(query.trim())}%`;
    const rows = await db.query<Row>(
      `select u.id, coalesce(nullif(btrim(u.full_name), ''), u.username) as name, u.email,
              u.group_lead_id,
              coalesce(nullif(btrim(l.full_name), ''), l.username) as lead_name
         from users u
         left join users l on l.id = u.group_lead_id
        where u.deleted_at is null and u.status = 'active'
          and u.role::text in ('user', 'premium')
          and not exists (select 1 from tf_sacos s where s.user_id = u.id and s.active)
          and ($1::uuid is null or u.group_lead_id = $1::uuid)
          and ($2 = '' or u.username ilike $3 or u.email ilike $3 or u.full_name ilike $3)
        order by lower(coalesce(nullif(btrim(u.full_name), ''), u.username)), u.id
        limit 20`,
      [leadId, query.trim(), pattern],
    );
    return rows.map((row) => ({
      userId: String(row.id),
      name: String(row.name ?? ''),
      email: String(row.email ?? ''),
      leadUserId: row.group_lead_id === null ? null : String(row.group_lead_id),
      leadName: row.lead_name === null || row.lead_name === undefined ? null : String(row.lead_name),
    }));
  }

  async grantUser(db: SqlClient, userId: string): Promise<FloorGrantUser | null> {
    const rows = await db.query<Row>(
      `select id, role::text as role, status::text as status, group_lead_id, full_name, username
         from users where id = $1 and deleted_at is null`,
      [userId],
    );
    const row = rows[0];
    return row
      ? {
          id: String(row.id),
          role: String(row.role),
          status: String(row.status),
          groupLeadId: row.group_lead_id === null ? null : String(row.group_lead_id),
          fullName: String(row.full_name ?? ''),
          username: String(row.username ?? ''),
        }
      : null;
  }

  async activeLead(db: SqlClient, leadId: string): Promise<FloorLead | null> {
    const rows = await db.query<Row>(
      `select u.id, coalesce(nullif(btrim(u.full_name), ''), u.username) as name
         from team_lead_profiles p join users u on u.id = p.user_id
        where p.user_id = $1 and p.status = 'active'`,
      [leadId],
    );
    return rows[0] ? { id: String(rows[0].id), name: String(rows[0].name) } : null;
  }

  async activeLeads(db: SqlClient): Promise<FloorLead[]> {
    const rows = await db.query<Row>(
      `select u.id, coalesce(nullif(btrim(u.full_name), ''), u.username) as name
         from team_lead_profiles p join users u on u.id = p.user_id
        where p.status = 'active'
        order by lower(coalesce(nullif(btrim(u.full_name), ''), u.username)), u.id`,
    );
    return rows.map((row) => ({ id: String(row.id), name: String(row.name) }));
  }

  async totalCount(db: SqlClient): Promise<number> {
    const rows = await db.query<Row>(`select count(*)::int as n from tf_sacos`);
    return Number(rows[0]?.n ?? 0);
  }

  async maxActivePosition(db: SqlClient): Promise<number> {
    const rows = await db.query<Row>(
      `select coalesce(max(position), 0)::int as p from tf_sacos where active`,
    );
    return Number(rows[0]?.p ?? 0);
  }

  async lockOrder(tx: SqlClient): Promise<void> {
    await tx.query(`select pg_advisory_xact_lock(hashtext('tf_saco_order'))`);
  }

  async insert(
    tx: SqlClient,
    input: {
      userId: string;
      leadUserId: string;
      name: string;
      icon: string;
      position: number;
      at: Date;
      by: string;
    },
  ): Promise<string> {
    const rows = await tx.query<Row>(
      `insert into tf_sacos
         (user_id, lead_user_id, display_name, icon, position, active, on_duty,
          assigned_at, assigned_by, created_at, updated_at)
       values ($1, $2, $3, $4, $5, true, false, $6, $7, $6, $6)
       returning id`,
      [input.userId, input.leadUserId, input.name, input.icon, input.position, input.at, input.by],
    );
    return String(rows[0]!.id);
  }

  async restore(
    tx: SqlClient,
    id: string,
    input: { leadUserId: string; name: string | null; position: number; at: Date; by: string },
  ): Promise<void> {
    await tx.query(
      `update tf_sacos
          set active = true, on_duty = false, lead_user_id = $2,
              display_name = coalesce($3, display_name), position = $4,
              assigned_at = $5, assigned_by = $6, removed_at = null, removed_by = null,
              updated_at = $5
        where id = $1`,
      [id, input.leadUserId, input.name, input.position, input.at, input.by],
    );
  }

  async updateMeta(
    tx: SqlClient,
    id: string,
    input: { name: string; leadUserId: string; at: Date },
  ): Promise<void> {
    await tx.query(
      `update tf_sacos set display_name = $2, lead_user_id = $3, updated_at = $4 where id = $1`,
      [id, input.name, input.leadUserId, input.at],
    );
  }

  async deactivate(tx: SqlClient, id: string, at: Date, by: string): Promise<void> {
    await tx.query(
      `update tf_sacos
          set active = false, on_duty = false, removed_at = $2, removed_by = $3, updated_at = $2
        where id = $1`,
      [id, at, by],
    );
  }

  async setDuty(db: SqlClient, id: string, on: boolean, at: Date): Promise<void> {
    await db.query(`update tf_sacos set on_duty = $2, updated_at = $3 where id = $1 and active`, [
      id,
      on,
      at,
    ]);
  }

  async renumber(tx: SqlClient, orderedIds: readonly string[], at: Date): Promise<void> {
    if (orderedIds.length === 0) return;
    await tx.query(
      `update tf_sacos s set position = v.position, updated_at = $3
         from unnest($1::uuid[], $2::int[]) as v(id, position)
        where s.id = v.id and s.position is distinct from v.position`,
      [orderedIds, orderedIds.map((_, index) => index + 1), at],
    );
  }
}
