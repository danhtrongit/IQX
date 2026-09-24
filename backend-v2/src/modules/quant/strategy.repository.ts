import { Injectable } from '@nestjs/common';
import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';

export type StrategyRow = {
  id: string;
  user_id: string;
  name: string;
  symbol: string | null;
  config: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
};

@Injectable()
export class StrategyRepository {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string): Promise<StrategyRow[]> {
    return this.database.query<StrategyRow>(
      `select id,user_id,name,symbol,config,created_at,updated_at from backtest_strategies where user_id=$1 order by updated_at desc`,
      [userId],
    );
  }

  async find(
    userId: string,
    id: string,
    client: Pick<SqlClient, 'query'> = this.database,
  ): Promise<StrategyRow | null> {
    return (
      (
        await client.query<StrategyRow>(
          `select id,user_id,name,symbol,config,created_at,updated_at from backtest_strategies where user_id=$1 and id=$2 limit 1`,
          [userId, id],
        )
      )[0] ?? null
    );
  }

  create(
    userId: string,
    name: string,
    symbol: string | null,
    config: Record<string, unknown>,
  ): Promise<StrategyRow> {
    return this.database.transaction(async (transaction) => {
      const rows = await transaction.query<StrategyRow>(
        `insert into backtest_strategies (id,user_id,name,symbol,config,created_at,updated_at) values (gen_random_uuid(),$1,$2,$3,$4::jsonb,now(),now()) returning id,user_id,name,symbol,config,created_at,updated_at`,
        [userId, name, symbol, JSON.stringify(config)],
      );
      return rows[0]!;
    });
  }

  update(
    userId: string,
    id: string,
    changes: { name?: string; symbol?: string | null; config?: Record<string, unknown> },
  ): Promise<StrategyRow | null> {
    return this.database.transaction(async (transaction) => {
      const current = await this.find(userId, id, transaction);
      if (!current) return null;
      const rows = await transaction.query<StrategyRow>(
        `update backtest_strategies set name=$3,symbol=$4,config=$5::jsonb,updated_at=now() where user_id=$1 and id=$2 returning id,user_id,name,symbol,config,created_at,updated_at`,
        [
          userId,
          id,
          changes.name ?? current.name,
          changes.symbol === undefined ? current.symbol : changes.symbol,
          JSON.stringify(changes.config ?? current.config),
        ],
      );
      return rows[0] ?? null;
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.database.transaction(
      async (transaction) =>
        (
          await transaction.query<{ id: string }>(
            `delete from backtest_strategies where user_id=$1 and id=$2 returning id`,
            [userId, id],
          )
        ).length > 0,
    );
  }
}
