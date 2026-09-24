import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import type { DrawingState } from './chart-drawings.schemas.js';
import type { ChartDrawingRow } from './chart-drawings.types.js';

@Injectable()
export class ChartDrawingsService {
  constructor(private readonly database: DatabaseService) {}

  async getForUser(userId: string, rawSymbol: string): Promise<ChartDrawingRow | null> {
    const [row] = await this.database.query<ChartDrawingRow>(
      `SELECT id, user_id, symbol, state, created_at, updated_at
         FROM chart_drawings
        WHERE user_id = $1 AND symbol = $2
        LIMIT 1`,
      [userId, rawSymbol.trim().toUpperCase()],
    );
    return row ?? null;
  }

  upsertForUser(userId: string, rawSymbol: string, state: DrawingState): Promise<ChartDrawingRow> {
    const symbol = rawSymbol.trim().toUpperCase();
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction.query<ChartDrawingRow>(
        `INSERT INTO chart_drawings (id, user_id, symbol, state, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, now(), now())
         ON CONFLICT (user_id, symbol)
         DO UPDATE SET state = EXCLUDED.state, updated_at = now()
         RETURNING id, user_id, symbol, state, created_at, updated_at`,
        [randomUUID(), userId, symbol, JSON.stringify(state)],
      );
      if (!row) throw new Error('Upserted chart drawing was not returned');
      return row;
    });
  }

  async deleteForUser(userId: string, rawSymbol: string): Promise<void> {
    await this.database.transaction((transaction) =>
      transaction.query(
        `DELETE FROM chart_drawings
          WHERE user_id = $1 AND symbol = $2`,
        [userId, rawSymbol.trim().toUpperCase()],
      ),
    );
  }
}
