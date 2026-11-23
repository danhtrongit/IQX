import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { MarketOverviewCache } from '../../src/modules/market-overview/market-overview.cache.js';
import {
  isWidgetEnabled,
  MARKET_OVERVIEW_SCHEMA_VERSION,
  MARKET_OVERVIEW_WIDGET_SLUGS,
  MARKET_OVERVIEW_WIDGETS,
  MARKET_TEMPLATE_ITEMS,
  sanitizeWidgetState,
  SYSTEM_TEMPLATE_PAGE_ID,
} from '../../src/modules/market-overview/market-overview.catalog.js';
import {
  MarketOverviewPagesService,
  resolveMarketOverviewNewsEnabled,
} from '../../src/modules/market-overview/market-overview.pages.service.js';
import type {
  CreatePageAtomicRequest,
  MarketOverviewPagesStore,
  StoredMarketOverviewPage,
  StoredMarketOverviewPrefs,
  UpdatePagePatch,
} from '../../src/modules/market-overview/market-overview.repository.js';
import {
  createMarketOverviewPageSchema,
  deleteMarketOverviewPageResponseSchema,
  marketOverviewPagesListResponseSchema,
  marketOverviewPageSchema,
  marketOverviewPreferencesResponseSchema,
  marketOverviewTemplateResponseSchema,
  marketOverviewWidgetResponseSchema,
  reorderMarketOverviewPagesResponseSchema,
  reorderMarketOverviewPagesSchema,
  updateMarketOverviewPageSchema,
  updateMarketOverviewPreferencesSchema,
  widgetDataParamSchema,
  widgetDataQuerySchema,
} from '../../src/modules/market-overview/market-overview.schemas.js';
import {
  buildDuplicatePageName,
  GRID_COLS,
  MAX_PAGE_NAME_LEN,
  MAX_PAGES_PER_USER,
  MAX_WIDGET_HEIGHT,
  MAX_WIDGETS_PER_PAGE,
  rectsOverlap,
  validateLayoutItems,
  validatePageName,
} from '../../src/modules/market-overview/market-overview.validation.js';

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';

class InMemoryMarketOverviewStore implements MarketOverviewPagesStore {
  readonly pages = new Map<string, StoredMarketOverviewPage>();
  readonly prefs = new Map<string, StoredMarketOverviewPrefs>();
  private tick = 0;

  private nextTimestamp(): string {
    this.tick += 1;
    return new Date(Date.UTC(2026, 10, 23, 9, 0, this.tick)).toISOString();
  }

  async listPages(userId: string): Promise<StoredMarketOverviewPage[]> {
    return [...this.pages.values()]
      .filter((page) => page.userId === userId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
      .map((page) => structuredClone(page));
  }

  async findPage(userId: string, pageId: string): Promise<StoredMarketOverviewPage | null> {
    const page = this.pages.get(pageId);
    if (!page || page.userId !== userId) return null;
    return structuredClone(page);
  }

  async createPageAtomic(request: CreatePageAtomicRequest): Promise<StoredMarketOverviewPage> {
    const existing = await this.listPages(request.userId);
    if (existing.length >= request.maxPages) {
      throw new BadRequestException({
        code: 'MAX_PAGES_EXCEEDED',
        message: `Tối đa ${request.maxPages} trang`,
      });
    }
    const { name, items } = request.resolveCreate(existing);
    const nextOrder =
      existing.length === 0 ? 0 : Math.max(...existing.map((page) => page.sortOrder)) + 1;
    const now = this.nextTimestamp();
    const record: StoredMarketOverviewPage = {
      id: request.id,
      userId: request.userId,
      name,
      sortOrder: nextOrder,
      schemaVersion: request.schemaVersion,
      items: structuredClone(items),
      createdAt: now,
      updatedAt: now,
    };
    this.pages.set(record.id, record);
    return structuredClone(record);
  }

  async updatePage(
    userId: string,
    pageId: string,
    patch: UpdatePagePatch,
  ): Promise<StoredMarketOverviewPage | null> {
    const existing = this.pages.get(pageId);
    if (!existing || existing.userId !== userId) return null;
    const updated: StoredMarketOverviewPage = {
      ...existing,
      name: patch.name ?? existing.name,
      items: patch.items ? structuredClone(patch.items) : existing.items,
      schemaVersion: patch.schemaVersion ?? existing.schemaVersion,
      updatedAt: this.nextTimestamp(),
    };
    this.pages.set(pageId, updated);
    return structuredClone(updated);
  }

  async deletePage(
    userId: string,
    pageId: string,
    fallbackPageId: string,
  ): Promise<{ deleted: boolean; lastActivePageId: string }> {
    const existing = this.pages.get(pageId);
    const currentPref = this.prefs.get(userId);
    if (!existing || existing.userId !== userId) {
      return {
        deleted: false,
        lastActivePageId: currentPref?.lastActivePageId ?? fallbackPageId,
      };
    }
    this.pages.delete(pageId);
    if (currentPref && currentPref.lastActivePageId === pageId) {
      this.prefs.set(userId, {
        userId,
        lastActivePageId: fallbackPageId,
        updatedAt: this.nextTimestamp(),
      });
      return { deleted: true, lastActivePageId: fallbackPageId };
    }
    return {
      deleted: true,
      lastActivePageId: currentPref?.lastActivePageId ?? fallbackPageId,
    };
  }

  async reorderPages(
    userId: string,
    pageIds: readonly string[],
  ): Promise<StoredMarketOverviewPage[]> {
    const existing = await this.listPages(userId);
    const existingIds = new Set(existing.map((page) => page.id));
    if (
      new Set(pageIds).size !== pageIds.length ||
      existingIds.size !== pageIds.length ||
      pageIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException({
        code: 'INVALID_PAGE_ORDER',
        message: 'Danh sách trang cần sắp xếp không khớp',
      });
    }
    const now = this.nextTimestamp();
    pageIds.forEach((id, index) => {
      const page = this.pages.get(id)!;
      this.pages.set(id, { ...page, sortOrder: index, updatedAt: now });
    });
    return this.listPages(userId);
  }

  async getPrefs(userId: string): Promise<StoredMarketOverviewPrefs | null> {
    const pref = this.prefs.get(userId);
    return pref ? structuredClone(pref) : null;
  }

  async upsertPrefs(userId: string, lastActivePageId: string): Promise<StoredMarketOverviewPrefs> {
    const record: StoredMarketOverviewPrefs = {
      userId,
      lastActivePageId,
      updatedAt: this.nextTimestamp(),
    };
    this.prefs.set(userId, record);
    return structuredClone(record);
  }
}

describe('market-overview schemas OpenAPI 3.0 serialization', () => {
  it('converts marketOverviewWidgetResponseSchema and all endpoint schemas with z.toJSONSchema', () => {
    const widgetSchema = z.toJSONSchema(marketOverviewWidgetResponseSchema, {
      target: 'openapi-3.0',
    }) as Record<string, unknown>;

    expect(widgetSchema).toBeDefined();
    const branches = (widgetSchema.oneOf ?? widgetSchema.anyOf) as unknown[];
    expect(Array.isArray(branches)).toBe(true);
    expect(branches).toHaveLength(16);

    const allSchemas = [
      marketOverviewPageSchema,
      marketOverviewTemplateResponseSchema,
      marketOverviewPagesListResponseSchema,
      createMarketOverviewPageSchema,
      updateMarketOverviewPageSchema,
      reorderMarketOverviewPagesSchema,
      reorderMarketOverviewPagesResponseSchema,
      updateMarketOverviewPreferencesSchema,
      marketOverviewPreferencesResponseSchema,
      deleteMarketOverviewPageResponseSchema,
      widgetDataParamSchema,
      widgetDataQuerySchema,
    ];
    for (const schema of allSchemas) {
      const jsonSchema = z.toJSONSchema(schema, { target: 'openapi-3.0' });
      expect(jsonSchema).toBeTypeOf('object');
    }
  });
});

describe('market-overview catalog & Thị trường template', () => {
  it('defines all 16 canonical widgets and exact 13-widget 12x38 template with 0 overlaps & 0 holes', () => {
    expect(MARKET_OVERVIEW_WIDGETS).toHaveLength(16);
    expect(MARKET_OVERVIEW_WIDGET_SLUGS).toHaveLength(16);
    expect(MARKET_TEMPLATE_ITEMS).toHaveLength(13);

    const validated = validateLayoutItems(MARKET_TEMPLATE_ITEMS);
    expect(validated).toHaveLength(13);

    const expectedRows = 38;
    const grid = Array.from({ length: expectedRows }, () => Array<number>(GRID_COLS).fill(0));
    let totalArea = 0;

    for (const item of validated) {
      totalArea += item.w * item.h;
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.x + item.w).toBeLessThanOrEqual(GRID_COLS);
      expect(item.y + item.h).toBeLessThanOrEqual(expectedRows);

      for (let row = item.y; row < item.y + item.h; row += 1) {
        for (let col = item.x; col < item.x + item.w; col += 1) {
          grid[row]![col] = (grid[row]![col] ?? 0) + 1;
        }
      }
    }

    expect(totalArea).toBe(GRID_COLS * expectedRows);
    for (let row = 0; row < expectedRows; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        expect(grid[row]![col]).toBe(1);
      }
    }
  });

  it('sanitizes widget state enums and falls back invalid values to defaults', () => {
    expect(
      sanitizeWidgetState('index_chart', { index: 'INVALID', range: '99y', extra: 1 }),
    ).toEqual({
      index: 'VNINDEX',
      range: 'intraday',
    });
    expect(sanitizeWidgetState('index_chart', { index: 'VN30F1M', range: '3m' })).toEqual({
      index: 'VN30F1M',
      range: '3m',
    });
    expect(sanitizeWidgetState('foreign_flow', { exchange: 'BAD', tab: 'prop' })).toEqual({
      exchange: 'HOSE',
      tab: 'prop',
    });
    expect(sanitizeWidgetState('market_heatmap', { mode: 'sector', sizeBy: 'nope' })).toEqual({
      mode: 'sector',
      sizeBy: 'market_cap',
    });
    expect(sanitizeWidgetState('featured_stocks', { tab: 'vol_spike' })).toEqual({
      tab: 'vol_spike',
    });
    expect(sanitizeWidgetState('featured_stocks', { tab: 'invalid' })).toEqual({
      tab: 'gainers',
    });
    expect(sanitizeWidgetState('sector_performance', { period: 'ytd', tab: 'flow' })).toEqual({
      period: 'ytd',
      tab: 'flow',
    });
    expect(sanitizeWidgetState('vn30f_vs_vn30', { range: '1y' })).toEqual({
      range: 'intraday',
    });
    expect(sanitizeWidgetState('commodities_fx', { tab: 'gold_fx' })).toEqual({
      tab: 'gold_fx',
    });
    expect(sanitizeWidgetState('events_calendar', { filter: 'cash' })).toEqual({
      filter: 'cash',
    });
    expect(sanitizeWidgetState('market_breadth', { foo: 'bar' })).toEqual({});
  });

  it('respects newsEnabled feature flag in isWidgetEnabled and resolveMarketOverviewNewsEnabled', () => {
    expect(isWidgetEnabled('market_news')).toBe(false);
    expect(isWidgetEnabled('market_news', true)).toBe(true);
    expect(isWidgetEnabled('market_news', false)).toBe(false);
    expect(isWidgetEnabled('index_chart', false)).toBe(true);

    expect(resolveMarketOverviewNewsEnabled({})).toBe(false);
    expect(resolveMarketOverviewNewsEnabled({ MARKET_OVERVIEW_NEWS_ENABLED: 'false' })).toBe(false);
    expect(resolveMarketOverviewNewsEnabled({ MARKET_OVERVIEW_NEWS_ENABLED: '1' })).toBe(false);
    expect(resolveMarketOverviewNewsEnabled({ MARKET_OVERVIEW_NEWS_ENABLED: 'true' })).toBe(true);
  });
});

describe('market-overview validation', () => {
  it('validates page names and truncates 30-char duplicate names safely to <= 30 chars', () => {
    expect(validatePageName('  Theo dõi ngân hàng  ')).toBe('Theo dõi ngân hàng');
    expect(() => validatePageName('   ')).toThrow(BadRequestException);
    expect(() => validatePageName('a'.repeat(MAX_PAGE_NAME_LEN + 1))).toThrow(BadRequestException);

    const thirtyCharName = 'Danh mục cổ phiếu ngân hàng VN';
    expect(Array.from(thirtyCharName)).toHaveLength(30);
    const duplicated = buildDuplicatePageName(thirtyCharName);
    expect(Array.from(duplicated).length).toBeLessThanOrEqual(MAX_PAGE_NAME_LEN);
    expect(duplicated.length).toBeLessThanOrEqual(MAX_PAGE_NAME_LEN);
    expect(duplicated.endsWith(' (bản sao)')).toBe(true);
    expect(validatePageName(duplicated)).toBe(duplicated);
  });

  it('rejects >40 widgets, overlaps, out-of-bounds width/height, and below-min sizes', () => {
    // >40 widgets
    const tooMany = Array.from({ length: MAX_WIDGETS_PER_PAGE + 1 }, (_, i) => ({
      uid: `w_${i}`,
      widget: 'market_breadth',
      x: (i % 4) * 3,
      y: Math.floor(i / 4) * 3,
      w: 3,
      h: 3,
    }));
    expect(() => validateLayoutItems(tooMany)).toThrow(BadRequestException);

    // Overlapping rectangles
    expect(rectsOverlap({ x: 0, y: 0, w: 6, h: 4 }, { x: 5, y: 3, w: 4, h: 4 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 6, h: 4 }, { x: 6, y: 0, w: 6, h: 4 })).toBe(false);
    expect(() =>
      validateLayoutItems([
        { uid: 'w_1', widget: 'index_chart', x: 0, y: 0, w: 8, h: 9 },
        { uid: 'w_2', widget: 'market_breadth', x: 7, y: 0, w: 4, h: 3 },
      ]),
    ).toThrow(BadRequestException);

    // x + w > 12
    expect(() =>
      validateLayoutItems([{ uid: 'w_1', widget: 'index_chart', x: 6, y: 0, w: 7, h: 6 }]),
    ).toThrow(BadRequestException);

    // w < minW (index_chart minW = 5)
    expect(() =>
      validateLayoutItems([{ uid: 'w_1', widget: 'index_chart', x: 0, y: 0, w: 4, h: 6 }]),
    ).toThrow(BadRequestException);

    // h < minH (index_chart minH = 5)
    expect(() =>
      validateLayoutItems([{ uid: 'w_1', widget: 'index_chart', x: 0, y: 0, w: 6, h: 4 }]),
    ).toThrow(BadRequestException);

    // h > 18
    expect(() =>
      validateLayoutItems([
        { uid: 'w_1', widget: 'index_chart', x: 0, y: 0, w: 6, h: MAX_WIDGET_HEIGHT + 1 },
      ]),
    ).toThrow(BadRequestException);

    // Duplicate uid
    expect(() =>
      validateLayoutItems([
        { uid: 'dup', widget: 'market_breadth', x: 0, y: 0, w: 4, h: 3 },
        { uid: 'dup', widget: 'market_liquidity', x: 4, y: 0, w: 4, h: 6 },
      ]),
    ).toThrow(BadRequestException);
  });
});

describe('MarketOverviewPagesService', () => {
  it('enforces the 8-page limit and generates sequential Trang N names', async () => {
    const store = new InMemoryMarketOverviewStore();
    const service = new MarketOverviewPagesService(store);

    const createdIds: string[] = [];
    for (let i = 1; i <= MAX_PAGES_PER_USER; i += 1) {
      const page = await service.createPage(USER_A, {});
      expect(page.name).toBe(`Trang ${i}`);
      expect(page.version).toBe(MARKET_OVERVIEW_SCHEMA_VERSION);
      createdIds.push(page.id);
    }

    await expect(service.createPage(USER_A, {})).rejects.toThrow(BadRequestException);

    // Deleting Trang 2 frees "Trang 2" for the next blank page
    await service.deletePage(USER_A, createdIds[1]!);
    const recreated = await service.createPage(USER_A, {});
    expect(recreated.name).toBe('Trang 2');
  });

  it('duplicates a page with deep-cloned items and brand-new uids', async () => {
    const store = new InMemoryMarketOverviewStore();
    const service = new MarketOverviewPagesService(store);

    const source = await service.createPage(USER_A, {
      name: 'Danh mục cổ phiếu ngân hàng VN',
      items: [
        {
          uid: 'w_orig_1',
          widget: 'index_chart',
          x: 0,
          y: 0,
          w: 8,
          h: 9,
          state: { index: 'VN30', range: '3m' },
        },
      ],
    });

    const copy = await service.createPage(USER_A, {
      duplicateFromPageId: source.id,
    });

    expect(copy.id).not.toBe(source.id);
    expect(copy.name.length).toBeLessThanOrEqual(MAX_PAGE_NAME_LEN);
    expect(copy.name.endsWith(' (bản sao)')).toBe(true);
    expect(copy.items).toHaveLength(1);
    expect(copy.items[0]!.uid).not.toBe('w_orig_1');
    expect(copy.items[0]!.widget).toBe('index_chart');
    expect(copy.items[0]!.state).toEqual({ index: 'VN30', range: '3m' });
  });

  it('validates ownership on reorder and falls back lastActivePageId to thi-truong on delete', async () => {
    const store = new InMemoryMarketOverviewStore();
    const service = new MarketOverviewPagesService(store);

    const p1 = await service.createPage(USER_A, { name: 'Trang A' });
    const p2 = await service.createPage(USER_A, { name: 'Trang B' });
    const otherUserPage = await service.createPage(USER_B, { name: 'Trang User B' });

    // Rejects another user's page ID or missing IDs
    await expect(service.reorderPages(USER_A, [p1.id, otherUserPage.id])).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.reorderPages(USER_A, [p1.id])).rejects.toThrow(BadRequestException);

    // Valid reorder updates sequence
    const reordered = await service.reorderPages(USER_A, [p2.id, p1.id]);
    expect(reordered.map((p) => p.id)).toEqual([p2.id, p1.id]);
    expect(reordered.map((p) => p.order)).toEqual([0, 1]);

    // Preferences & fallback on delete
    await service.updatePreferences(USER_A, p2.id);
    await expect(service.updatePreferences(USER_A, otherUserPage.id)).rejects.toThrow(
      NotFoundException,
    );

    const del = await service.deletePage(USER_A, p2.id);
    expect(del.deleted).toBe(true);
    expect(del.lastActivePageId).toBe(SYSTEM_TEMPLATE_PAGE_ID);

    const listed = await service.listPages(USER_A);
    expect(listed.lastActivePageId).toBe(SYSTEM_TEMPLATE_PAGE_ID);
    expect(listed.pages.map((p) => p.id)).toEqual([p1.id]);
  });

  it('defaults newsEnabled to false (15-widget catalog), supports newsEnabled=true (16 widgets), and omits disabled widgets without deleting stored items', async () => {
    const store = new InMemoryMarketOverviewStore();
    const enabledService = new MarketOverviewPagesService(store, { newsEnabled: true });

    const enabledTemplate = enabledService.getTemplate();
    expect(enabledTemplate.catalog.some((entry) => entry.slug === 'market_news')).toBe(true);
    expect(enabledTemplate.catalog).toHaveLength(16);

    const page = await enabledService.createPage(USER_A, {
      name: 'Tin và chỉ số',
      items: [
        { uid: 'w_idx', widget: 'index_chart', x: 0, y: 0, w: 8, h: 9 },
        { uid: 'w_news', widget: 'market_news', x: 8, y: 0, w: 4, h: 7 },
      ],
    });

    // Default service (no options) must disable market_news per Spec Section 6
    const defaultService = new MarketOverviewPagesService(store);

    const template = defaultService.getTemplate();
    expect(template.catalog.some((entry) => entry.slug === 'market_news')).toBe(false);
    expect(template.catalog).toHaveLength(15);

    const listed = await defaultService.listPages(USER_A);
    expect(listed.pages[0]!.items.map((item) => item.widget)).toEqual(['index_chart']);

    // Stored row must still retain market_news untouched
    const rawStoredAfterRead = await store.findPage(USER_A, page.id);
    expect(rawStoredAfterRead!.items.map((item) => item.widget)).toEqual([
      'index_chart',
      'market_news',
    ]);

    // Updating visible layout while news is disabled must also preserve stored market_news
    const updated = await defaultService.updatePage(USER_A, page.id, {
      items: [{ uid: 'w_idx', widget: 'index_chart', x: 0, y: 0, w: 12, h: 9 }],
    });
    expect(updated.items.map((item) => item.widget)).toEqual(['index_chart']);

    const rawStoredAfterUpdate = await store.findPage(USER_A, page.id);
    expect(rawStoredAfterUpdate!.items.map((item) => item.widget)).toEqual([
      'index_chart',
      'market_news',
    ]);
    // Hidden item pushed below colliding incoming widget to keep zero-overlap invariant
    expect(rawStoredAfterUpdate!.items[1]!.y).toBe(9);
  });
});

describe('MarketOverviewCache', () => {
  it('deduplicates concurrent fetches and serves stale value on upstream error', async () => {
    let clock = 1_000;
    const cache = new MarketOverviewCache({
      maxEntries: 2,
      defaultMaxStaleMs: 60_000,
      now: () => clock,
    });

    const fetcher = vi.fn(async () => 'v1');
    const [r1, r2] = await Promise.all([
      cache.getOrFetch('k1', fetcher, { ttlMs: 5_000 }),
      cache.getOrFetch('k1', fetcher, { ttlMs: 5_000 }),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r1).toMatchObject({ value: 'v1', stale: false });
    expect(r2).toMatchObject({ value: 'v1', stale: false });

    // Expire TTL, keep inside maxStaleMs, upstream fails -> stale fallback
    clock += 10_000;
    const staleResult = await cache.getOrFetch(
      'k1',
      async () => {
        throw new Error('upstream down');
      },
      { ttlMs: 5_000 },
    );
    expect(staleResult).toMatchObject({ value: 'v1', stale: true });

    // Bounded LRU eviction
    cache.set('k2', 'v2', 5_000);
    cache.set('k3', 'v3', 5_000);
    expect(cache.size()).toBe(2);
    expect(cache.peek('k1')).toBeUndefined();
  });
});
