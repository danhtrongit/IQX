import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../platform/database/database.service.js';
import type { Numeric } from './financials.types.js';

@Injectable()
export class PeerMediansRepository {
  constructor(private readonly db: DatabaseService) {}
  async find(
    sector: string,
    asof: string,
  ): Promise<{ medians: Record<string, Numeric>; peerCount: number } | null> {
    const rows = await this.db.query<{ medians: Record<string, Numeric>; peer_count: number }>(
      'select medians, peer_count from sector_median_cache where icb_lv2=$1 and asof_date=$2::date limit 1',
      [sector, asof],
    );
    const row = rows[0];
    return row ? { medians: row.medians, peerCount: Number(row.peer_count) } : null;
  }
  async upsert(sector: string, asof: string, medians: Record<string, Numeric>, peerCount: number) {
    return this.db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${sector}|${asof}`,
      ]);
      const hit = await tx.query<{ medians: Record<string, Numeric>; peer_count: number }>(
        'select medians, peer_count from sector_median_cache where icb_lv2=$1 and asof_date=$2::date limit 1',
        [sector, asof],
      );
      if (hit[0]) return { medians: hit[0].medians, peerCount: Number(hit[0].peer_count) };
      await tx.query(
        'insert into sector_median_cache (id,icb_lv2,asof_date,medians,peer_count,computed_at) values (gen_random_uuid(),$1,$2::date,$3::jsonb,$4,now()) on conflict (icb_lv2,asof_date) do update set medians=excluded.medians,peer_count=excluded.peer_count,computed_at=now()',
        [sector, asof, JSON.stringify(medians), peerCount],
      );
      return { medians, peerCount };
    });
  }
  async peerSymbols(sector: string, limit: number): Promise<string[]> {
    const rows = await this.db.query<{ symbol: string }>(
      'select symbol from symbols where is_active=true and lower(icb_lv2)=lower($1) order by current_price_vnd desc nulls last, symbol limit $2',
      [sector, limit],
    );
    return rows.map((row) => row.symbol);
  }
}
