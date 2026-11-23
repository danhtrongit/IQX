/**
 * Server-side validation for "Toàn cảnh thị trường" (market-overview) pages:
 * grid bounds, zero-overlap invariant, widget count cap, page name constraints,
 * and safe duplicate page naming.
 */
import { BadRequestException } from '@nestjs/common';

import {
  getWidgetSpec,
  isMarketOverviewWidgetSlug,
  sanitizeWidgetState,
  type MarketOverviewPageItem,
} from './market-overview.catalog.js';

export const GRID_COLS = 12;
export const MAX_WIDGET_HEIGHT = 18;
export const MAX_PAGES_PER_USER = 8;
export const MAX_WIDGETS_PER_PAGE = 40;
export const MAX_PAGE_NAME_LEN = 30;
export const DUPLICATE_SUFFIX = ' (bản sao)';

const MAX_UID_LEN = 64;

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MarketOverviewLayoutItemInput {
  uid: string;
  widget: string;
  x: number;
  y: number;
  w: number;
  h: number;
  state?: unknown;
}

export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function charCount(value: string): number {
  return Array.from(value).length;
}

export function validatePageName(rawName: string): string {
  const trimmed = rawName.trim();
  const len = charCount(trimmed);
  if (len < 1 || len > MAX_PAGE_NAME_LEN || trimmed.length > MAX_PAGE_NAME_LEN) {
    throw new BadRequestException({
      code: 'INVALID_PAGE_NAME',
      message: `Tên trang phải có từ 1 đến ${MAX_PAGE_NAME_LEN} ký tự`,
    });
  }
  return trimmed;
}

export function buildDuplicatePageName(sourceName: string): string {
  const maxBaseLen = MAX_PAGE_NAME_LEN - charCount(DUPLICATE_SUFFIX);
  const trimmed = sourceName.trim();
  const chars = Array.from(trimmed);
  let base = '';
  for (const ch of chars) {
    const candidate = base + ch;
    if (charCount(candidate) > maxBaseLen || candidate.length > maxBaseLen) {
      break;
    }
    base = candidate;
  }
  base = base.trimEnd();
  if (!base) {
    base = 'Trang';
  }
  return `${base}${DUPLICATE_SUFFIX}`;
}

export function validateLayoutItems(
  rawItems: readonly MarketOverviewLayoutItemInput[],
): MarketOverviewPageItem[] {
  if (rawItems.length > MAX_WIDGETS_PER_PAGE) {
    throw new BadRequestException({
      code: 'MAX_WIDGETS_EXCEEDED',
      message: `Tối đa ${MAX_WIDGETS_PER_PAGE} widget mỗi trang`,
      details: { count: rawItems.length, max: MAX_WIDGETS_PER_PAGE },
    });
  }

  const seenUids = new Set<string>();
  const sanitized: MarketOverviewPageItem[] = [];

  for (let index = 0; index < rawItems.length; index += 1) {
    const raw = rawItems[index]!;
    const uid = typeof raw.uid === 'string' ? raw.uid.trim() : '';
    if (!uid || uid.length > MAX_UID_LEN) {
      throw new BadRequestException({
        code: 'INVALID_WIDGET_UID',
        message: 'Mỗi widget phải có uid hợp lệ',
        details: { index },
      });
    }
    if (seenUids.has(uid)) {
      throw new BadRequestException({
        code: 'DUPLICATE_WIDGET_UID',
        message: `Widget uid '${uid}' bị trùng trong cùng một trang`,
        details: { index, uid },
      });
    }
    seenUids.add(uid);

    if (!isMarketOverviewWidgetSlug(raw.widget)) {
      throw new BadRequestException({
        code: 'UNKNOWN_WIDGET',
        message: `Widget '${String(raw.widget)}' không hợp lệ`,
        details: { index, uid, widget: raw.widget },
      });
    }

    const spec = getWidgetSpec(raw.widget);
    const { x, y, w, h } = raw;

    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(w) ||
      !Number.isInteger(h)
    ) {
      throw new BadRequestException({
        code: 'INVALID_LAYOUT_COORDINATES',
        message: 'Toạ độ và kích thước widget phải là số nguyên',
        details: { index, uid, widget: raw.widget },
      });
    }

    if (
      x < 0 ||
      y < 0 ||
      w < spec.minW ||
      h < spec.minH ||
      h > MAX_WIDGET_HEIGHT ||
      x + w > GRID_COLS
    ) {
      throw new BadRequestException({
        code: 'INVALID_LAYOUT_BOUNDS',
        message: `Kích thước hoặc vị trí của widget '${spec.name}' vượt giới hạn lưới`,
        details: {
          index,
          uid,
          widget: raw.widget,
          x,
          y,
          w,
          h,
          minW: spec.minW,
          minH: spec.minH,
          maxCols: GRID_COLS,
          maxHeight: MAX_WIDGET_HEIGHT,
        },
      });
    }

    sanitized.push({
      uid,
      widget: raw.widget,
      x,
      y,
      w,
      h,
      state: sanitizeWidgetState(raw.widget, raw.state) as Record<string, string>,
    });
  }

  for (let i = 0; i < sanitized.length; i += 1) {
    const first = sanitized[i]!;
    for (let j = i + 1; j < sanitized.length; j += 1) {
      const second = sanitized[j]!;
      if (rectsOverlap(first, second)) {
        throw new BadRequestException({
          code: 'LAYOUT_OVERLAP',
          message: 'Các widget trên trang không được chồng lấn lên nhau',
          details: { firstUid: first.uid, secondUid: second.uid },
        });
      }
    }
  }

  return sanitized;
}
