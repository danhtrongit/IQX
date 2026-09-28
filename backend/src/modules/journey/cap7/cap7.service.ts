import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import {
  CAP7_MAX_SECTOR_WEIGHT_PCT,
  CAP7_MAX_SYMBOL_WEIGHT_PCT,
  CAP7_MIN_HELD_SYMBOLS,
  CAP7_MIN_KNOWN_SECTORS,
  type Cap7PortfolioSnapshot,
  type Cap7PositionInput,
  type Cap7Progress,
} from './cap7.types.js';

type ProgressRow = {
  id: string;
  user_id: string;
  entered_at: Date | string;
  can_doi_ok: boolean;
  graduated_at: Date | string | null;
  time_to_graduate_hours: number | string | null;
};

type AccountRow = {
  id: string;
  cash_available_vnd: bigint | number | string | null;
  cash_reserved_vnd: bigint | number | string | null;
  cash_pending_vnd: bigint | number | string | null;
};

type PositionRow = {
  symbol: string;
  quantity_total: number;
  current_price_vnd: bigint | number | string | null;
  icb_lv1: string | null;
  icb_lv2: string | null;
};

function finiteNonNegative(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normaliseSector(value: string | null): string | null {
  const sector = value?.trim();
  return sector || null;
}

/** Pure allocation evaluator shared by Cấp 7 and Cấp 8 exit projections. */
export function buildCap7PortfolioSnapshot(input: {
  cashVnd: number | null;
  positions: readonly Cap7PositionInput[];
}): Cap7PortfolioSnapshot {
  const held = input.positions
    .filter((position) => position.quantity > 0)
    .map((position) => ({ ...position, symbol: position.symbol.toUpperCase() }))
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
  const knownMarketValue = held.reduce(
    (sum, position) => sum + (finiteNonNegative(position.marketValueVnd) ?? 0),
    0,
  );
  const cash = finiteNonNegative(input.cashVnd);
  const nav = (cash ?? 0) + knownMarketValue;
  const sectorValues = new Map<string, number>();
  const knownSectors = new Set<string>();
  const unpriced: string[] = [];
  const unknownSectors: string[] = [];

  const positions = held.map((position) => {
    const marketValue = finiteNonNegative(position.marketValueVnd);
    const sector = normaliseSector(position.sector);
    if (marketValue === null) unpriced.push(position.symbol);
    if (sector === null) unknownSectors.push(position.symbol);
    else knownSectors.add(sector);
    if (marketValue !== null && sector !== null) {
      sectorValues.set(sector, (sectorValues.get(sector) ?? 0) + marketValue);
    }
    return {
      symbol: position.symbol,
      market_value_vnd: marketValue,
      weight_pct: marketValue !== null && nav > 0 ? (marketValue / nav) * 100 : null,
      sector,
    };
  });
  const sectors = [...sectorValues]
    .map(([sector, value]) => ({
      sector,
      market_value_vnd: value,
      weight_pct: nav > 0 ? (value / nav) * 100 : null,
    }))
    .sort(
      (left, right) =>
        (right.weight_pct ?? 0) - (left.weight_pct ?? 0) || left.sector.localeCompare(right.sector),
    );
  const maxPosition = positions
    .filter((position) => position.weight_pct !== null)
    .sort((left, right) => (right.weight_pct ?? 0) - (left.weight_pct ?? 0))[0];
  const maxSector = sectors[0];
  const dataComplete =
    nav > 0 && cash !== null && unpriced.length === 0 && unknownSectors.length === 0;
  const canBalance =
    dataComplete &&
    held.length >= CAP7_MIN_HELD_SYMBOLS &&
    knownSectors.size >= CAP7_MIN_KNOWN_SECTORS &&
    (maxPosition?.weight_pct ?? 0) <= CAP7_MAX_SYMBOL_WEIGHT_PCT &&
    (maxSector?.weight_pct ?? 0) <= CAP7_MAX_SECTOR_WEIGHT_PCT;

  return {
    nav_vnd: nav,
    cash_vnd: cash,
    cash_weight_pct: cash !== null && nav > 0 ? (cash / nav) * 100 : null,
    positions,
    sectors,
    held_symbol_count: held.length,
    known_sector_count: knownSectors.size,
    max_symbol: maxPosition?.symbol ?? null,
    max_symbol_weight_pct: maxPosition?.weight_pct ?? null,
    max_sector: maxSector?.sector ?? null,
    max_sector_weight_pct: maxSector?.weight_pct ?? null,
    unpriced_symbols: unpriced,
    unknown_sector_symbols: unknownSectors,
    data_complete: dataComplete,
    can_doi_ok: canBalance,
  };
}

@Injectable()
export class Cap7Service {
  constructor(private readonly database: DatabaseService) {}

  async getProgress(userId: string): Promise<Cap7Progress | null> {
    return this.database.transaction(async (tx) => {
      // All journey/trading decisions lock account -> positions -> progress.
      const snapshot = await this.snapshotInTransaction(tx, userId, { lock: true });
      const progress = await this.findProgress(tx, userId, true);
      if (!progress) return null;
      await tx.query('update cap7_progress set can_doi_ok = $2, updated_at = now() where id = $1', [
        progress.id,
        snapshot.can_doi_ok,
      ]);
      return this.toProgress(progress, snapshot);
    });
  }

  async enter(userId: string): Promise<Cap7Progress> {
    return this.database.transaction(async (tx) => {
      // Acquire the same account/position locks as fills before progress.
      const snapshot = await this.snapshotInTransaction(tx, userId, { lock: true });
      let progress = await this.findProgress(tx, userId, true);
      if (!progress) {
        this.assertEntryEnabled(7);
        const prior = await tx.query<{ graduated_at: Date | string | null }>(
          'select graduated_at from cap6_progress where user_id = $1',
          [userId],
        );
        if (!prior[0]) this.notFound('tiến trình Cấp 6');
        if (!prior[0].graduated_at) this.conflict('Chưa tốt nghiệp Cấp 6', 'CAP6_NOT_GRADUATED');
        await tx.query(
          `insert into cap7_progress
             (id, user_id, entered_at, can_doi_ok, created_at, updated_at)
           values ($1, $2, now(), false, now(), now())
           on conflict (user_id) do nothing`,
          [randomUUID(), userId],
        );
        progress = await this.findProgress(tx, userId, true);
      }
      if (!progress) throw new Error('Cấp 7 entry was not persisted');
      await tx.query('update cap7_progress set can_doi_ok = $2, updated_at = now() where id = $1', [
        progress.id,
        snapshot.can_doi_ok,
      ]);
      return this.toProgress(progress, snapshot);
    });
  }

  async portfolio(userId: string): Promise<Cap7PortfolioSnapshot> {
    return this.database.transaction(async (tx) => {
      if (!(await this.findProgress(tx, userId, false))) this.notFound('tiến trình Cấp 7');
      return this.snapshotInTransaction(tx, userId);
    });
  }

  async graduate(userId: string): Promise<Cap7Progress> {
    return this.database.transaction(async (tx) => {
      // Account then ordered positions is the same lock order used by trading fills.
      const snapshot = await this.snapshotInTransaction(tx, userId, { lock: true });
      const progress = await this.findProgress(tx, userId, true);
      if (!progress) this.notFound('tiến trình Cấp 7');
      await tx.query('update cap7_progress set can_doi_ok = $2, updated_at = now() where id = $1', [
        progress.id,
        snapshot.can_doi_ok,
      ]);
      if (progress.graduated_at) return this.toProgress(progress, snapshot);
      if (!snapshot.can_doi_ok) {
        this.conflict(
          'Danh mục chưa cân đối: cần tối đa 30% mỗi mã, 40% mỗi ngành, ít nhất 4 mã và 3 ngành với dữ liệu giá/ngành đầy đủ',
          'CAP7_BALANCE_GATE_FAILED',
        );
      }
      const rows = await tx.query<ProgressRow>(
        `update cap7_progress
         set graduated_at = coalesce(graduated_at, now()),
             time_to_graduate_hours = coalesce(
               time_to_graduate_hours,
               extract(epoch from (now() - entered_at)) / 3600.0
             ), updated_at = now()
         where id = $1
         returning id, user_id, entered_at, can_doi_ok, graduated_at, time_to_graduate_hours`,
        [progress.id],
      );
      return this.toProgress(rows[0]!, snapshot);
    });
  }

  async snapshotInTransaction(
    tx: SqlClient,
    userId: string,
    options: { lock?: boolean; sale?: { symbol: string; quantity: number } } = {},
  ): Promise<Cap7PortfolioSnapshot> {
    const accounts = await tx.query<AccountRow>(
      `select id, cash_available_vnd, cash_reserved_vnd, cash_pending_vnd
       from virtual_trading_accounts where user_id = $1${options.lock ? ' for update' : ''}`,
      [userId],
    );
    const account = accounts[0];
    if (!account) this.notFound('tài khoản giao dịch ảo');
    const rows = await tx.query<PositionRow>(
      `select p.symbol, p.quantity_total, s.current_price_vnd, s.icb_lv1, s.icb_lv2
       from virtual_positions p
       left join symbols s on s.symbol = p.symbol and s.is_active = true
       where p.account_id = $1 and p.quantity_total > 0
       order by p.symbol${options.lock ? ' for update of p' : ''}`,
      [account.id],
    );
    const cashParts = [
      finiteNonNegative(account.cash_available_vnd),
      finiteNonNegative(account.cash_reserved_vnd),
      finiteNonNegative(account.cash_pending_vnd),
    ];
    let cash = cashParts.every((part) => part !== null)
      ? cashParts.reduce<number>((sum, part) => sum + (part ?? 0), 0)
      : null;
    const saleSymbol = options.sale?.symbol.toUpperCase();
    const positions: Cap7PositionInput[] = rows.map((row) => {
      let quantity = Number(row.quantity_total);
      const price = finiteNonNegative(row.current_price_vnd);
      if (saleSymbol === row.symbol.toUpperCase()) {
        const saleQuantity = options.sale?.quantity ?? 0;
        if (saleQuantity <= 0 || saleQuantity > quantity) {
          throw new ConflictException({
            code: 'INVALID_SALE_QUANTITY',
            message: 'Khối lượng bán dự kiến không hợp lệ',
          });
        }
        quantity -= saleQuantity;
        if (cash !== null && price !== null) cash += saleQuantity * price;
      }
      return {
        symbol: row.symbol,
        quantity,
        marketValueVnd: price === null ? null : price * quantity,
        sector: normaliseSector(row.icb_lv2) ?? normaliseSector(row.icb_lv1),
      };
    });
    if (saleSymbol && !rows.some((row) => row.symbol.toUpperCase() === saleSymbol)) {
      this.notFound('vị thế');
    }
    return buildCap7PortfolioSnapshot({ cashVnd: cash, positions });
  }

  private async findProgress(
    tx: SqlClient,
    userId: string,
    lock: boolean,
  ): Promise<ProgressRow | null> {
    const rows = await tx.query<ProgressRow>(
      `select id, user_id, entered_at, can_doi_ok, graduated_at, time_to_graduate_hours
       from cap7_progress where user_id = $1${lock ? ' for update' : ''}`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private toProgress(progress: ProgressRow, snapshot: Cap7PortfolioSnapshot): Cap7Progress {
    return {
      id: progress.id,
      user_id: progress.user_id,
      entered_at: progress.entered_at,
      can_doi_ok: snapshot.can_doi_ok,
      so_ma_dang_giu: snapshot.held_symbol_count,
      so_nganh_dang_giu: snapshot.known_sector_count,
      ma_ty_trong_cao_nhat: snapshot.max_symbol,
      ty_trong_ma_cao_nhat_pct: snapshot.max_symbol_weight_pct,
      nganh_ty_trong_cao_nhat: snapshot.max_sector,
      ty_trong_nganh_cao_nhat_pct: snapshot.max_sector_weight_pct,
      ma_chua_co_gia: snapshot.unpriced_symbols,
      ma_chua_ro_nganh: snapshot.unknown_sector_symbols,
      du_lieu_day_du: snapshot.data_complete,
      nguong_ty_trong_ma_pct: CAP7_MAX_SYMBOL_WEIGHT_PCT,
      nguong_ty_trong_nganh_pct: CAP7_MAX_SECTOR_WEIGHT_PCT,
      toi_thieu_ma: CAP7_MIN_HELD_SYMBOLS,
      toi_thieu_nganh: CAP7_MIN_KNOWN_SECTORS,
      graduated_at: progress.graduated_at,
      time_to_graduate_hours:
        progress.time_to_graduate_hours === null ? null : Number(progress.time_to_graduate_hours),
    };
  }

  private assertEntryEnabled(level: number): void {
    const configured = Number(process.env.CAP_MAX_ENABLED ?? 6);
    const maximum = Number.isInteger(configured) ? configured : 6;
    if (level > maximum) {
      this.conflict(`Cấp ${level} hiện chưa mở cho tiến trình mới`, 'JOURNEY_LEVEL_DISABLED');
    }
  }

  private notFound(resource: string): never {
    throw new NotFoundException({ code: 'NOT_FOUND', message: `Không tìm thấy ${resource}` });
  }

  private conflict(message: string, code: string): never {
    throw new ConflictException({ code, message });
  }
}
