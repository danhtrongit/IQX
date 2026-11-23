/**
 * Application service for "Toàn cảnh thị trường" (market-overview) pages,
 * server-driven "Thị trường" template, and user preferences.
 */
import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import {
  defaultWidgetState,
  getEnabledWidgets,
  isWidgetEnabled,
  MARKET_OVERVIEW_SCHEMA_VERSION,
  MARKET_OVERVIEW_WIDGET_GROUP_LABELS,
  MARKET_OVERVIEW_WIDGET_GROUPS,
  MARKET_TEMPLATE_ITEMS,
  sanitizeWidgetState,
  SYSTEM_TEMPLATE_PAGE_ID,
  SYSTEM_TEMPLATE_PAGE_NAME,
  type MarketOverviewPageItem,
} from './market-overview.catalog.js';
import {
  MarketOverviewRepository,
  type MarketOverviewPagesStore,
  type StoredMarketOverviewPage,
} from './market-overview.repository.js';
import type {
  CreateMarketOverviewPageInput,
  DeleteMarketOverviewPageResponse,
  MarketOverviewPageDto,
  MarketOverviewPagesListResponse,
  MarketOverviewPreferencesResponse,
  MarketOverviewTemplateResponse,
  UpdateMarketOverviewPageInput,
} from './market-overview.schemas.js';
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
} from './market-overview.validation.js';

export const MARKET_OVERVIEW_PAGES_OPTIONS = Symbol('MARKET_OVERVIEW_PAGES_OPTIONS');

export interface MarketOverviewPagesOptions {
  newsEnabled?: boolean;
}

/**
 * Resolves whether the `market_news` widget is enabled.
 * Defaults to `false` per Spec Section 6 ("ẩn widget khỏi kho ở bản đầu") until
 * explicitly opted in via `MARKET_OVERVIEW_NEWS_ENABLED=true`.
 */
export function resolveMarketOverviewNewsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MARKET_OVERVIEW_NEWS_ENABLED === 'true';
}

const TEMPLATE_UPDATED_AT = '2026-11-23T00:00:00.000Z';

function generatePageId(): string {
  return `pg_${randomBytes(6).toString('hex')}`;
}

function generateWidgetUid(): string {
  return `w_${randomBytes(6).toString('hex')}`;
}

function nextDefaultPageName(existingPages: readonly StoredMarketOverviewPage[]): string {
  const usedNames = new Set(existingPages.map((page) => page.name.trim().toLowerCase()));
  let index = 1;
  while (usedNames.has(`trang ${index}`)) {
    index += 1;
  }
  return `Trang ${index}`;
}

function cloneItemsWithFreshUids(
  items: readonly MarketOverviewPageItem[],
): MarketOverviewPageItem[] {
  const usedUids = new Set<string>();
  return items.map((item) => {
    let uid = generateWidgetUid();
    while (usedUids.has(uid)) {
      uid = generateWidgetUid();
    }
    usedUids.add(uid);
    return {
      uid,
      widget: item.widget,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      state: {
        ...(sanitizeWidgetState(item.widget, item.state) as Record<string, string>),
      },
    };
  });
}

/**
 * Re-attaches any disabled widgets that existed in the stored page row so editing a page
 * while a widget is feature-disabled never deletes those stored items from DB.
 */
function mergePreservedDisabledItems(
  incoming: readonly MarketOverviewPageItem[],
  existing: readonly MarketOverviewPageItem[],
  newsEnabled: boolean,
): MarketOverviewPageItem[] {
  const incomingUids = new Set(incoming.map((item) => item.uid));
  const preserved = existing.filter(
    (item) => !isWidgetEnabled(item.widget, newsEnabled) && !incomingUids.has(item.uid),
  );
  if (preserved.length === 0) {
    return [...incoming];
  }

  const merged: MarketOverviewPageItem[] = [...incoming];
  for (const hidden of preserved) {
    if (merged.length >= MAX_WIDGETS_PER_PAGE) break;
    const candidate: MarketOverviewPageItem = {
      ...hidden,
      state: { ...hidden.state },
    };
    const collides = merged.some((placed) => rectsOverlap(placed, candidate));
    if (collides) {
      const maxY = merged.reduce((acc, placed) => Math.max(acc, placed.y + placed.h), 0);
      candidate.y = maxY;
    }
    merged.push(candidate);
  }
  return merged;
}

@Injectable()
export class MarketOverviewPagesService {
  private readonly newsEnabled: boolean;

  constructor(
    @Inject(MarketOverviewRepository)
    private readonly store: MarketOverviewPagesStore,
    @Optional()
    @Inject(MARKET_OVERVIEW_PAGES_OPTIONS)
    options?: MarketOverviewPagesOptions,
  ) {
    this.newsEnabled = options?.newsEnabled ?? false;
  }

  getTemplate(): MarketOverviewTemplateResponse {
    const enabledWidgets = getEnabledWidgets(this.newsEnabled);
    const items = MARKET_TEMPLATE_ITEMS.filter((item) =>
      isWidgetEnabled(item.widget, this.newsEnabled),
    ).map((item) => ({
      ...item,
      state: { ...item.state },
    }));

    return {
      version: MARKET_OVERVIEW_SCHEMA_VERSION,
      id: SYSTEM_TEMPLATE_PAGE_ID,
      name: SYSTEM_TEMPLATE_PAGE_NAME,
      readonly: true,
      items,
      catalog: enabledWidgets.map((spec) => ({
        slug: spec.slug,
        name: spec.name,
        group: spec.group,
        groupLabel: MARKET_OVERVIEW_WIDGET_GROUP_LABELS[spec.group],
        defaultW: spec.defaultW,
        defaultH: spec.defaultH,
        minW: spec.minW,
        minH: spec.minH,
        inTemplate: spec.inTemplate,
        keywords: spec.keywords,
        defaultState: { ...(defaultWidgetState(spec.slug) as Record<string, string>) },
      })),
      groups: MARKET_OVERVIEW_WIDGET_GROUPS.map((group) => ({
        id: group,
        label: MARKET_OVERVIEW_WIDGET_GROUP_LABELS[group],
      })),
      limits: {
        cols: GRID_COLS,
        maxHeight: MAX_WIDGET_HEIGHT,
        maxPages: MAX_PAGES_PER_USER,
        maxWidgetsPerPage: MAX_WIDGETS_PER_PAGE,
        maxPageNameLength: MAX_PAGE_NAME_LEN,
      },
      updatedAt: TEMPLATE_UPDATED_AT,
    };
  }

  async listPages(userId: string): Promise<MarketOverviewPagesListResponse> {
    const [storedPages, prefs] = await Promise.all([
      this.store.listPages(userId),
      this.store.getPrefs(userId),
    ]);

    const pages = storedPages.map((page, index) => this.toPageDto(page, index));
    const validIds = new Set<string>([SYSTEM_TEMPLATE_PAGE_ID, ...pages.map((p) => p.id)]);
    const lastActivePageId =
      prefs && validIds.has(prefs.lastActivePageId)
        ? prefs.lastActivePageId
        : SYSTEM_TEMPLATE_PAGE_ID;

    return {
      pages,
      lastActivePageId,
      maxPages: MAX_PAGES_PER_USER,
    };
  }

  async createPage(
    userId: string,
    input: CreateMarketOverviewPageInput,
  ): Promise<MarketOverviewPageDto> {
    if (input.duplicateFromPageId === SYSTEM_TEMPLATE_PAGE_ID) {
      throw new BadRequestException({
        code: 'CANNOT_DUPLICATE_TEMPLATE',
        message: 'Không thể nhân bản trang Thị trường',
      });
    }

    const validatedItems =
      input.duplicateFromPageId === undefined && input.items !== undefined
        ? validateLayoutItems(input.items)
        : undefined;

    const validatedName = input.name !== undefined ? validatePageName(input.name) : undefined;

    const created = await this.store.createPageAtomic({
      userId,
      id: generatePageId(),
      schemaVersion: MARKET_OVERVIEW_SCHEMA_VERSION,
      maxPages: MAX_PAGES_PER_USER,
      resolveCreate: (existingPages) => {
        if (input.duplicateFromPageId !== undefined) {
          const source = existingPages.find((page) => page.id === input.duplicateFromPageId);
          if (!source) {
            throw new NotFoundException({
              code: 'PAGE_NOT_FOUND',
              message: 'Không tìm thấy trang nguồn để nhân bản',
            });
          }
          return {
            name: validatedName ?? buildDuplicatePageName(source.name),
            items: cloneItemsWithFreshUids(source.items),
          };
        }

        return {
          name: validatedName ?? nextDefaultPageName(existingPages),
          items: validatedItems ?? [],
        };
      },
    });

    return this.toPageDto(created);
  }

  async updatePage(
    userId: string,
    pageId: string,
    input: UpdateMarketOverviewPageInput,
  ): Promise<MarketOverviewPageDto> {
    if (pageId === SYSTEM_TEMPLATE_PAGE_ID) {
      throw new BadRequestException({
        code: 'TEMPLATE_READONLY',
        message: 'Trang Thị trường chỉ đọc',
      });
    }

    const existing = await this.store.findPage(userId, pageId);
    if (!existing) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Không tìm thấy trang',
      });
    }

    const nextName = input.name !== undefined ? validatePageName(input.name) : undefined;
    const nextItems =
      input.items !== undefined
        ? mergePreservedDisabledItems(
            validateLayoutItems(input.items),
            existing.items,
            this.newsEnabled,
          )
        : undefined;

    if (nextName === undefined && nextItems === undefined) {
      return this.toPageDto(existing);
    }

    const updated = await this.store.updatePage(userId, pageId, {
      name: nextName,
      items: nextItems,
      schemaVersion: MARKET_OVERVIEW_SCHEMA_VERSION,
    });
    if (!updated) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Không tìm thấy trang',
      });
    }

    return this.toPageDto(updated);
  }

  async deletePage(userId: string, pageId: string): Promise<DeleteMarketOverviewPageResponse> {
    if (pageId === SYSTEM_TEMPLATE_PAGE_ID) {
      throw new BadRequestException({
        code: 'CANNOT_DELETE_TEMPLATE',
        message: 'Không thể xoá trang Thị trường',
      });
    }

    const result = await this.store.deletePage(userId, pageId, SYSTEM_TEMPLATE_PAGE_ID);
    if (!result.deleted) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Không tìm thấy trang',
      });
    }

    return {
      deleted: true,
      id: pageId,
      lastActivePageId: result.lastActivePageId,
    };
  }

  async reorderPages(userId: string, pageIds: readonly string[]): Promise<MarketOverviewPageDto[]> {
    const unique = new Set(pageIds);
    if (unique.size !== pageIds.length) {
      throw new BadRequestException({
        code: 'INVALID_PAGE_ORDER',
        message: 'Danh sách trang bị trùng mã định danh',
      });
    }

    const reordered = await this.store.reorderPages(userId, pageIds);
    return reordered.map((page, index) => this.toPageDto(page, index));
  }

  async updatePreferences(
    userId: string,
    lastActivePageId: string,
  ): Promise<MarketOverviewPreferencesResponse> {
    if (lastActivePageId !== SYSTEM_TEMPLATE_PAGE_ID) {
      const page = await this.store.findPage(userId, lastActivePageId);
      if (!page) {
        throw new NotFoundException({
          code: 'PAGE_NOT_FOUND',
          message: 'Không tìm thấy trang đang chọn',
        });
      }
    }

    const saved = await this.store.upsertPrefs(userId, lastActivePageId);
    return {
      lastActivePageId: saved.lastActivePageId,
      updatedAt: saved.updatedAt,
    };
  }

  private toPageDto(page: StoredMarketOverviewPage, orderOverride?: number): MarketOverviewPageDto {
    const visibleItems = page.items
      .filter((item) => isWidgetEnabled(item.widget, this.newsEnabled))
      .map((item) => ({
        uid: item.uid,
        widget: item.widget,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        state: { ...item.state },
      }));

    return {
      version: page.schemaVersion,
      id: page.id,
      name: page.name,
      order: orderOverride ?? page.sortOrder,
      items: visibleItems,
      updatedAt: page.updatedAt,
    };
  }
}
