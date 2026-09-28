import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../platform/database/database.service.js';

@Injectable()
export class SnapshotRepository {
  constructor(private readonly database: DatabaseService) {}

  async latest(filters: { category?: string; date?: string; session?: string }) {
    const values: unknown[] = [];
    const where: string[] = [];
    if (filters.category) {
      values.push(filters.category);
      where.push(`asset_category = $${values.length}`);
    }
    if (filters.date) {
      values.push(filters.date);
      where.push(`snapshot_date = $${values.length}::date`);
    }
    // v2's initial snapshot schema stores the trading session in market_state.
    if (filters.session) {
      values.push(filters.session);
      where.push(`market_state = $${values.length}`);
    }
    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const latest = filters.date
      ? ''
      : `${filter ? 'and' : 'where'} snapshot_date = (select max(snapshot_date) from market_data_snapshot)`;
    return this.database.query(
      `select snapshot_date::text, asset_category, symbol, name, last_price, previous_close, change_value, change_percent, day_high, day_low, volume, currency, market_state, market_state as session, market_time, source, stale, fetched_at from market_data_snapshot ${filter} ${latest} order by asset_category, symbol`,
      values,
    );
  }
}
