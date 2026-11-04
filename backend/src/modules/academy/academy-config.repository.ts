import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { AcademyConfigData } from './academy.config.js';
import type { AcademyAccessMode } from './content/v4/schema.js';

export type AcademyConfigOwner = 'default' | 'leader';

/** One row of `academy_configs` (migration 0040). */
export type AcademyConfigRow = {
  id: string;
  owner_type: AcademyConfigOwner;
  /** null for the default config. */
  leader_id: string | null;
  mode: AcademyAccessMode;
  /** Fixed chapter ids in catalog order. */
  chapter_ids: string[];
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type AcademyConfigWithActor = AcademyConfigRow & {
  updated_by_username: string | null;
  updated_by_full_name: string | null;
};

/** What decides which config a user gets (spec §8.2): role, own lead profile and group. */
export type AcademySubjectRow = {
  user_id: string;
  role: string;
  /** The user holds an ACTIVE team lead profile: he learns with his own group's config. */
  is_active_lead: boolean;
  /** The lead whose group the user belongs to (revoked leads keep their members), if any. */
  group_lead_id: string | null;
};

export type AcademyLeaderRow = {
  user_id: string;
  username: string;
  full_name: string;
  status: 'active' | 'revoked';
};

export type AcademyConfigLogRow = {
  id: string;
  config_id: string;
  owner_type: AcademyConfigOwner;
  leader_id: string | null;
  action: 'create' | 'update' | 'delete';
  changed_by: string | null;
  changed_by_username: string | null;
  changed_by_full_name: string | null;
  changed_at: Date;
  before: AcademyConfigData | null;
  after: AcademyConfigData | null;
};

export type AcademyNewLog = {
  config_id: string;
  owner_type: AcademyConfigOwner;
  leader_id: string | null;
  action: 'create' | 'update' | 'delete';
  changed_by: string;
  before: AcademyConfigData | null;
  after: AcademyConfigData | null;
};

const CONFIG_COLUMNS = `id, owner_type, leader_id, mode, chapter_ids, updated_by, created_at, updated_at`;

/** Live users of a group, as every team view counts them. */
const LIVE_USER = `m.deleted_at is null and m.status <> 'deleted'`;

/**
 * SQL of the Academy configs (supplement v4.1 §8). Reads take a `SqlClient`, so the same functions serve the pool
 * (request-time resolution) and a transaction (admin writes).
 */
@Injectable()
export class AcademyConfigRepository {
  constructor(private readonly database: DatabaseService) {}

  transaction<T>(operation: (client: SqlClient) => Promise<T>): Promise<T> {
    return this.database.transaction(operation);
  }

  /** Role, own lead profile and group of the users (unknown ids have no row). */
  subjects(userIds: readonly string[]): Promise<AcademySubjectRow[]> {
    return this.database.query<AcademySubjectRow>(
      `select u.id as user_id, u.role::text as role,
              exists (select 1 from team_lead_profiles p
                       where p.user_id = u.id and p.status = 'active') as is_active_lead,
              u.group_lead_id
         from users u
        where u.id = any($1::uuid[])`,
      [userIds],
    );
  }

  /**
   * The default config plus every own config a given user could resolve to (his own, as a lead, or his group's lead's):
   * everything `configsOf` needs, in one query that runs next to `subjects` (spec §8.2).
   */
  async configsForUsers(userIds: readonly string[]): Promise<AcademyConfigRow[]> {
    return this.database.query<AcademyConfigRow>(
      `select ${CONFIG_COLUMNS} from academy_configs
        where owner_type = 'default'
           or leader_id in (select u.id from users u where u.id = any($1::uuid[]))
           or leader_id in (select u.group_lead_id from users u
                             where u.id = any($1::uuid[]) and u.group_lead_id is not null)`,
      [userIds],
    );
  }

  /** Every config with the account that saved it last (admin table, spec §1.4). */
  async allConfigs(client: SqlClient = this.database): Promise<AcademyConfigWithActor[]> {
    return client.query<AcademyConfigWithActor>(
      `select c.id, c.owner_type, c.leader_id, c.mode, c.chapter_ids, c.updated_by, c.created_at,
              c.updated_at, u.username as updated_by_username, u.full_name as updated_by_full_name
         from academy_configs c
         left join users u on u.id = c.updated_by
        order by c.owner_type, c.created_at, c.id`,
    );
  }

  async configById(
    id: string,
    client: SqlClient = this.database,
    lock = false,
  ): Promise<AcademyConfigRow | null> {
    const [row] = await client.query<AcademyConfigRow>(
      `select ${CONFIG_COLUMNS} from academy_configs where id = $1 ${lock ? 'for update' : ''}`,
      [id],
    );
    return row ?? null;
  }

  async defaultConfig(client: SqlClient = this.database): Promise<AcademyConfigRow | null> {
    const [row] = await client.query<AcademyConfigRow>(
      `select ${CONFIG_COLUMNS} from academy_configs where owner_type = 'default'`,
    );
    return row ?? null;
  }

  async leaderConfig(
    leaderId: string,
    client: SqlClient = this.database,
  ): Promise<AcademyConfigRow | null> {
    const [row] = await client.query<AcademyConfigRow>(
      `select ${CONFIG_COLUMNS} from academy_configs
        where owner_type = 'leader' and leader_id = $1`,
      [leaderId],
    );
    return row ?? null;
  }

  /**
   * Team leads shown in the config table (spec §1.4): every active lead, and a revoked one while he still has members or
   * an own config (his group keeps learning with it).
   */
  leaders(client: SqlClient = this.database): Promise<AcademyLeaderRow[]> {
    return client.query<AcademyLeaderRow>(
      `select p.user_id, u.username, u.full_name, p.status::text as status
         from team_lead_profiles p
         join users u on u.id = p.user_id
        where p.status = 'active'
           or exists (select 1 from academy_configs c where c.leader_id = p.user_id)
           or exists (select 1 from users m where m.group_lead_id = p.user_id and ${LIVE_USER})
        order by lower(u.full_name), u.id`,
    );
  }

  /** The lead profile with its user (any status), or null. */
  async leader(leaderId: string, client: SqlClient = this.database): Promise<AcademyLeaderRow | null> {
    const [row] = await client.query<AcademyLeaderRow>(
      `select p.user_id, u.username, u.full_name, p.status::text as status
         from team_lead_profiles p
         join users u on u.id = p.user_id
        where p.user_id = $1`,
      [leaderId],
    );
    return row ?? null;
  }

  /** Live non-admin members per lead (admins always learn with the built-in config). */
  async memberCounts(client: SqlClient = this.database): Promise<Map<string, number>> {
    const rows = await client.query<{ leader_id: string; members: number }>(
      `select m.group_lead_id as leader_id, count(*)::int as members
         from users m
        where m.group_lead_id is not null and m.role <> 'admin' and ${LIVE_USER}
        group by m.group_lead_id`,
    );
    return new Map(rows.map((row) => [row.leader_id, Number(row.members)]));
  }

  /** Live non-admin users who learn with the default config: no own-config group, not a lead with an own config. */
  async defaultUserCount(client: SqlClient = this.database): Promise<number> {
    const [row] = await client.query<{ users: number }>(
      `select count(*)::int as users
         from users m
        where m.role <> 'admin' and ${LIVE_USER}
          and not exists (
            select 1 from academy_configs c
             where c.owner_type = 'leader'
               and c.leader_id = case
                     when exists (select 1 from team_lead_profiles p
                                   where p.user_id = m.id and p.status = 'active')
                     then m.id else m.group_lead_id end)`,
    );
    return Number(row?.users ?? 0);
  }

  /** Active leads who are not admins: each learns with his own group's config (spec §1.1). */
  async activeLeadIds(client: SqlClient = this.database): Promise<Set<string>> {
    const rows = await client.query<{ user_id: string }>(
      `select p.user_id
         from team_lead_profiles p
         join users m on m.id = p.user_id
        where p.status = 'active' and m.role <> 'admin' and ${LIVE_USER}`,
    );
    return new Set(rows.map((row) => row.user_id));
  }

  async insertConfig(
    client: SqlClient,
    input: {
      owner_type: AcademyConfigOwner;
      leader_id: string | null;
      mode: AcademyAccessMode;
      chapter_ids: readonly string[];
      updated_by: string;
    },
  ): Promise<AcademyConfigRow | null> {
    const [row] = await client.query<AcademyConfigRow>(
      `insert into academy_configs (owner_type, leader_id, mode, chapter_ids, updated_by)
       values ($1, $2, $3, $4::text[], $5)
       on conflict do nothing
       returning ${CONFIG_COLUMNS}`,
      [input.owner_type, input.leader_id, input.mode, input.chapter_ids, input.updated_by],
    );
    return row ?? null;
  }

  async updateConfig(
    client: SqlClient,
    id: string,
    input: AcademyConfigData & { updated_by: string },
  ): Promise<AcademyConfigRow> {
    const [row] = await client.query<AcademyConfigRow>(
      `update academy_configs
          set mode = $2, chapter_ids = $3::text[], updated_by = $4, updated_at = now()
        where id = $1
        returning ${CONFIG_COLUMNS}`,
      [id, input.mode, input.chapter_ids, input.updated_by],
    );
    if (!row) throw new Error('academy config disappeared during update');
    return row;
  }

  async deleteConfig(client: SqlClient, id: string): Promise<void> {
    await client.query(`delete from academy_configs where id = $1`, [id]);
  }

  async insertLog(client: SqlClient, log: AcademyNewLog): Promise<void> {
    await client.query(
      `insert into academy_config_logs
         (config_id, owner_type, leader_id, action, changed_by, before, after)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        log.config_id,
        log.owner_type,
        log.leader_id,
        log.action,
        log.changed_by,
        log.before === null ? null : JSON.stringify(log.before),
        log.after === null ? null : JSON.stringify(log.after),
      ],
    );
  }

  /**
   * Change log of the default config or of one lead's config, newest first. A lead's log is found by the lead, so it
   * also holds the changes of an own config that was deleted ("Về mặc định") and created again.
   */
  logs(
    owner: { owner_type: 'default' } | { owner_type: 'leader'; leader_id: string },
    limit: number,
    client: SqlClient = this.database,
  ): Promise<AcademyConfigLogRow[]> {
    const where =
      owner.owner_type === 'default'
        ? `l.owner_type = 'default'`
        : `l.owner_type = 'leader' and l.leader_id = $2`;
    return client.query<AcademyConfigLogRow>(
      `select l.id, l.config_id, l.owner_type, l.leader_id, l.action, l.changed_by,
              u.username as changed_by_username, u.full_name as changed_by_full_name,
              l.changed_at, l.before, l.after
         from academy_config_logs l
         left join users u on u.id = l.changed_by
        where ${where}
        order by l.changed_at desc, l.id desc
        limit $1`,
      owner.owner_type === 'default' ? [limit] : [limit, owner.leader_id],
    );
  }
}
