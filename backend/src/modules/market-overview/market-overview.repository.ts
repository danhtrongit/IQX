/**
 * PostgreSQL persistence for "Toàn cảnh thị trường" (market-overview):
 * custom user pages, last-active-page preferences, and intraday liquidity history.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import {
  isMarketOverviewWidgetSlug,
  sanitizeWidgetState,
  SYSTEM_TEMPLATE_PAGE_ID,
  type MarketOverviewPageItem,
} from './market-overview.catalog.js';
import { marketOverviewPageItemSchema } from './market-overview.schemas.js';

export interface StoredMarketOverviewPage {
  id: string;
  userId: string;
  name: string;
  sortOrder: number;
  schemaVersion: number;
  items: MarketOverviewPageItem[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredMarketOverviewPrefs {
  userId: string;
  lastActivePageId: string;
  updatedAt: string;
}

export interface LiquidityHistoryPoint {
  t: string;
  v: number;
}

export interface StoredLiquidityHistory {
  sessionDate: string;
  exchange: string;
  points: LiquidityHistoryPoint[];
  updatedAt: string;
}

export interface CreatePageAtomicRequest {
  userId: string;
  id: string;
  schemaVersion: number;
  maxPages: number;
  resolveCreate: (existingPages: StoredMarketOverviewPage[]) => {
    name: string;
    items: MarketOverviewPageItem[];
  };
}

export interface UpdatePagePatch {
  name?: string;
  items?: MarketOverviewPageItem[];
  schemaVersion?: number;
}

/** Persistence contract for market-overview pages & preferences (faked in unit tests). */
export interface MarketOverviewPagesStore {
  listPages(userId: string): Promise<StoredMarketOverviewPage[]>;
  findPage(userId: string, pageId: string): Promise<StoredMarketOverviewPage | null>;
  createPageAtomic(request: CreatePageAtomicRequest): Promise<StoredMarketOverviewPage>;
  updatePage(
    userId: string,
    pageId: string,
    patch: UpdatePagePatch,
  ): Promise<StoredMarketOverviewPage | null>;
  deletePage(
    userId: string,
    pageId: string,
    fallbackPageId: string,
  ): Promise<{ deleted: boolean; lastActivePageId: string }>;
  reorderPages(userId: string, pageIds: readonly string[]): Promise<StoredMarketOverviewPage[]>;
  getPrefs(userId: string): Promise<StoredMarketOverviewPrefs | null>;
  upsertPrefs(userId: string, lastActivePageId: string): Promise<StoredMarketOverviewPrefs>;
}

/** Persistence contract for intraday cumulative liquidity history snapshots. */
export interface MarketOverviewLiquidityStore {
  upsertLiquidityHistory(
    sessionDate: string,
    exchange: string,
    points: readonly LiquidityHistoryPoint[],
  ): Promise<StoredLiquidityHistory>;
  getLiquidityHistoryByDate(
    sessionDate: string,
    exchange: string,
  ): Promise<StoredLiquidityHistory | null>;
  getRecentLiquidityHistory(
    exchange: string,
    beforeSessionDate: string,
    limit?: number,
  ): Promise<StoredLiquidityHistory[]>;
}

type PageRow = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number | string;
  schema_version: number | string;
  items: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type PrefsRow = {
  user_id: string;
  last_active_page_id: string;
  updated_at: Date | string;
};

type LiquidityRow = {
  session_date: Date | string;
  exchange: string;
  points: unknown;
  updated_at: Date | string;
};

const PAGE_COLUMNS = 'id, user_id, name, sort_order, schema_version, items, created_at, updated_at';

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function parseStoredItems(raw: unknown): MarketOverviewPageItem[] {
  if (!Array.isArray(raw)) return [];
  const items: MarketOverviewPageItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (!isMarketOverviewWidgetSlug(record.widget)) continue;
    const sanitizedState = sanitizeWidgetState(record.widget, record.state) as Record<
      string,
      string
    >;
    const parsed = marketOverviewPageItemSchema.safeParse({
      uid: record.uid,
      widget: record.widget,
      x: record.x,
      y: record.y,
      w: record.w,
      h: record.h,
      state: sanitizedState,
    });
    if (parsed.success) {
      items.push(parsed.data);
    }
  }
  return items;
}

function mapPageRow(row: PageRow): StoredMarketOverviewPage {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sortOrder: Number(row.sort_order),
    schemaVersion: Number(row.schema_version),
    items: parseStoredItems(row.items),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function parseLiquidityPoints(raw: unknown): LiquidityHistoryPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: LiquidityHistoryPoint[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.t === 'string' && typeof record.v === 'number' && Number.isFinite(record.v)) {
      points.push({ t: record.t, v: record.v });
    }
  }
  return points;
}

function mapLiquidityRow(row: LiquidityRow): StoredLiquidityHistory {
  return {
    sessionDate: toDateString(row.session_date),
    exchange: row.exchange,
    points: parseLiquidityPoints(row.points),
    updatedAt: toIsoString(row.updated_at),
  };
}

@Injectable()
export class MarketOverviewRepository
  implements MarketOverviewPagesStore, MarketOverviewLiquidityStore
{
  constructor(private readonly database: DatabaseService) {}

  async listPages(userId: string): Promise<StoredMarketOverviewPage[]> {
    const rows = await this.database.query<PageRow>(
      `SELECT ${PAGE_COLUMNS}
         FROM market_overview_pages
        WHERE user_id = $1
        ORDER BY sort_order ASC, created_at ASC`,
      [userId],
    );
    return rows.map(mapPageRow);
  }

  async findPage(userId: string, pageId: string): Promise<StoredMarketOverviewPage | null> {
    const [row] = await this.database.query<PageRow>(
      `SELECT ${PAGE_COLUMNS}
         FROM market_overview_pages
        WHERE user_id = $1 AND id = $2`,
      [userId, pageId],
    );
    return row ? mapPageRow(row) : null;
  }

  async createPageAtomic(request: CreatePageAtomicRequest): Promise<StoredMarketOverviewPage> {
    return this.database.transaction(async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext('market_overview_pages:' || $1))`, [
        request.userId,
      ]);

      const existingRows = await tx.query<PageRow>(
        `SELECT ${PAGE_COLUMNS}
           FROM market_overview_pages
          WHERE user_id = $1
          ORDER BY sort_order ASC, created_at ASC`,
        [request.userId],
      );
      const existingPages = existingRows.map(mapPageRow);

      if (existingPages.length >= request.maxPages) {
        throw new BadRequestException({
          code: 'MAX_PAGES_EXCEEDED',
          message: `Tối đa ${request.maxPages} trang`,
        });
      }

      const { name, items } = request.resolveCreate(existingPages);
      const nextSortOrder =
        existingPages.length === 0
          ? 0
          : Math.max(...existingPages.map((page) => page.sortOrder)) + 1;

      const [inserted] = await tx.query<PageRow>(
        `INSERT INTO market_overview_pages
           (id, user_id, name, sort_order, schema_version, items, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
         RETURNING ${PAGE_COLUMNS}`,
        [
          request.id,
          request.userId,
          name,
          nextSortOrder,
          request.schemaVersion,
          JSON.stringify(items),
        ],
      );

      if (!inserted) {
        throw new Error('Failed to insert market_overview_pages row');
      }
      return mapPageRow(inserted);
    });
  }

  async updatePage(
    userId: string,
    pageId: string,
    patch: UpdatePagePatch,
  ): Promise<StoredMarketOverviewPage | null> {
    const sets: string[] = [];
    const values: unknown[] = [userId, pageId];

    if (patch.name !== undefined) {
      values.push(patch.name);
      sets.push(`name = $${values.length}`);
    }
    if (patch.items !== undefined) {
      values.push(JSON.stringify(patch.items));
      sets.push(`items = $${values.length}::jsonb`);
    }
    if (patch.schemaVersion !== undefined) {
      values.push(patch.schemaVersion);
      sets.push(`schema_version = $${values.length}`);
    }
    sets.push('updated_at = NOW()');

    const [row] = await this.database.query<PageRow>(
      `UPDATE market_overview_pages
          SET ${sets.join(', ')}
        WHERE user_id = $1 AND id = $2
        RETURNING ${PAGE_COLUMNS}`,
      values,
    );
    return row ? mapPageRow(row) : null;
  }

  async deletePage(
    userId: string,
    pageId: string,
    fallbackPageId: string = SYSTEM_TEMPLATE_PAGE_ID,
  ): Promise<{ deleted: boolean; lastActivePageId: string }> {
    return this.database.transaction(async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext('market_overview_pages:' || $1))`, [
        userId,
      ]);

      const deletedRows = await tx.query<{ id: string }>(
        `DELETE FROM market_overview_pages
          WHERE user_id = $1 AND id = $2
          RETURNING id`,
        [userId, pageId],
      );

      const [pref] = await tx.query<PrefsRow>(
        `SELECT user_id, last_active_page_id, updated_at
           FROM market_overview_prefs
          WHERE user_id = $1`,
        [userId],
      );

      if (deletedRows.length === 0) {
        return {
          deleted: false,
          lastActivePageId: pref?.last_active_page_id ?? fallbackPageId,
        };
      }

      if (pref && pref.last_active_page_id === pageId) {
        await tx.query(
          `UPDATE market_overview_prefs
              SET last_active_page_id = $2, updated_at = NOW()
            WHERE user_id = $1`,
          [userId, fallbackPageId],
        );
        return { deleted: true, lastActivePageId: fallbackPageId };
      }

      return {
        deleted: true,
        lastActivePageId: pref?.last_active_page_id ?? fallbackPageId,
      };
    });
  }

  async reorderPages(
    userId: string,
    pageIds: readonly string[],
  ): Promise<StoredMarketOverviewPage[]> {
    return this.database.transaction(async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext('market_overview_pages:' || $1))`, [
        userId,
      ]);

      const existingRows = await tx.query<{ id: string }>(
        `SELECT id FROM market_overview_pages WHERE user_id = $1`,
        [userId],
      );
      const existingIds = new Set(existingRows.map((row) => row.id));
      const uniqueInputIds = new Set(pageIds);

      if (
        uniqueInputIds.size !== pageIds.length ||
        existingIds.size !== pageIds.length ||
        pageIds.some((id) => !existingIds.has(id))
      ) {
        throw new BadRequestException({
          code: 'INVALID_PAGE_ORDER',
          message: 'Danh sách trang cần sắp xếp không khớp với các trang hiện có của tài khoản',
        });
      }

      if (pageIds.length > 0) {
        const orders = pageIds.map((_, index) => index);
        await tx.query(
          `UPDATE market_overview_pages AS p
              SET sort_order = v.ord,
                  updated_at = NOW()
             FROM unnest($2::text[], $3::int[]) AS v(id, ord)
            WHERE p.user_id = $1 AND p.id = v.id`,
          [userId, [...pageIds], orders],
        );
      }

      const updated = await tx.query<PageRow>(
        `SELECT ${PAGE_COLUMNS}
           FROM market_overview_pages
          WHERE user_id = $1
          ORDER BY sort_order ASC, created_at ASC`,
        [userId],
      );
      return updated.map(mapPageRow);
    });
  }

  async getPrefs(userId: string): Promise<StoredMarketOverviewPrefs | null> {
    const [row] = await this.database.query<PrefsRow>(
      `SELECT user_id, last_active_page_id, updated_at
         FROM market_overview_prefs
        WHERE user_id = $1`,
      [userId],
    );
    if (!row) return null;
    return {
      userId: row.user_id,
      lastActivePageId: row.last_active_page_id,
      updatedAt: toIsoString(row.updated_at),
    };
  }

  async upsertPrefs(userId: string, lastActivePageId: string): Promise<StoredMarketOverviewPrefs> {
    const [row] = await this.database.query<PrefsRow>(
      `INSERT INTO market_overview_prefs (user_id, last_active_page_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
          SET last_active_page_id = excluded.last_active_page_id,
              updated_at = NOW()
       RETURNING user_id, last_active_page_id, updated_at`,
      [userId, lastActivePageId],
    );
    return {
      userId: row?.user_id ?? userId,
      lastActivePageId: row?.last_active_page_id ?? lastActivePageId,
      updatedAt: toIsoString(row?.updated_at ?? new Date()),
    };
  }

  async upsertLiquidityHistory(
    sessionDate: string,
    exchange: string,
    points: readonly LiquidityHistoryPoint[],
  ): Promise<StoredLiquidityHistory> {
    const [row] = await this.database.query<LiquidityRow>(
      `INSERT INTO market_overview_liquidity_history (session_date, exchange, points, updated_at)
       VALUES ($1::date, $2, $3::jsonb, NOW())
       ON CONFLICT (session_date, exchange) DO UPDATE
          SET points = excluded.points,
              updated_at = NOW()
       RETURNING session_date, exchange, points, updated_at`,
      [sessionDate, exchange, JSON.stringify(points)],
    );
    if (!row) {
      return {
        sessionDate,
        exchange,
        points: [...points],
        updatedAt: new Date().toISOString(),
      };
    }
    return mapLiquidityRow(row);
  }

  async getLiquidityHistoryByDate(
    sessionDate: string,
    exchange: string,
  ): Promise<StoredLiquidityHistory | null> {
    const [row] = await this.database.query<LiquidityRow>(
      `SELECT session_date, exchange, points, updated_at
         FROM market_overview_liquidity_history
        WHERE session_date = $1::date AND exchange = $2`,
      [sessionDate, exchange],
    );
    return row ? mapLiquidityRow(row) : null;
  }

  async getRecentLiquidityHistory(
    exchange: string,
    beforeSessionDate: string,
    limit = 20,
  ): Promise<StoredLiquidityHistory[]> {
    const safeLimit = Math.max(1, Math.min(60, Math.trunc(limit)));
    const rows = await this.database.query<LiquidityRow>(
      `SELECT session_date, exchange, points, updated_at
         FROM market_overview_liquidity_history
        WHERE exchange = $1 AND session_date < $2::date
        ORDER BY session_date DESC
        LIMIT $3`,
      [exchange, beforeSessionDate, safeLimit],
    );
    return rows.map(mapLiquidityRow);
  }
}
