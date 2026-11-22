import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import {
  strategyConfigHash,
  type ResolvedStrategy,
  type StrategyContent,
  type StrategyReaderPort,
  type StrategySource,
} from '../strategy-rules/index.js';
import { iqxDefinitionAsContent, iqxVersionLabel, userVersionLabel } from './strategies.labels.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UserVersionRow = {
  id: string;
  name: string;
  version: number;
  content: StrategyContent;
  config_hash: string;
  created_at: Date | string;
  deleted_at: Date | string | null;
};

type IqxVersionRow = {
  id: string;
  version: number;
  visibility: 'shown' | 'hidden';
  content: Record<string, unknown>;
};

/**
 * `STRATEGY_READER` (PLAN §4): `{source, id, version?}` → content + label + hidden/deleted.
 * - `user`: only the caller's own strategies; soft-deleted ones still resolve (history, §4.6).
 *   `version` omitted = latest.
 * - `iqx`: any published Chiến lược IQX (hidden ones too: pinned Bots keep running them, §7.2);
 *   `id` is the template uuid or its slug; `version` omitted = current.
 */
@Injectable()
export class StrategyReaderService implements StrategyReaderPort {
  constructor(private readonly database: DatabaseService) {}

  async resolve(
    userId: string,
    ref: { source: StrategySource; id: string; version?: number },
    client?: SqlClient,
  ): Promise<ResolvedStrategy | null> {
    const db: Pick<SqlClient, 'query'> = client ?? this.database;
    if (ref.source === 'user') {
      if (!UUID.test(ref.id)) return null;
      const [row] = await db.query<UserVersionRow>(
        `select s.id, s.name, v.version, v.content, trim(v.config_hash) as config_hash,
                v.created_at, s.deleted_at
           from user_strategies s
           join user_strategy_versions v
             on v.strategy_id = s.id and v.version = coalesce($3::int, s.latest_version)
          where s.id = $1::uuid and s.user_id = $2::uuid`,
        [ref.id, userId, ref.version ?? null],
      );
      if (!row) return null;
      return {
        ref: { source: 'user', id: row.id, version: Number(row.version) },
        name: row.name,
        version_label: userVersionLabel(row.created_at),
        content: row.content,
        config_hash: row.config_hash,
        hidden: false,
        deleted: row.deleted_at !== null,
      };
    }
    const byId = UUID.test(ref.id);
    const [row] = await db.query<IqxVersionRow>(
      `select t.id, v.version, t.visibility, v.content
         from iqx_templates t
         join iqx_template_versions v
           on v.template_id = t.id and v.version = coalesce($2::int, t.current_version)
        where t.kind = 'strategy' and t.current_version is not null
          and ${byId ? 't.id = $1::uuid' : 't.slug = $1'}`,
      [ref.id, ref.version ?? null],
    );
    if (!row) return null;
    const content = iqxDefinitionAsContent(row.content.definition as Record<string, unknown>);
    return {
      ref: { source: 'iqx', id: row.id, version: Number(row.version) },
      name: typeof row.content.name === 'string' ? row.content.name : 'Chiến lược IQX',
      version_label: iqxVersionLabel(Number(row.version)),
      content,
      config_hash: strategyConfigHash(content),
      hidden: row.visibility === 'hidden',
      deleted: false,
    };
  }
}
