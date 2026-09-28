import { InternalServerErrorException } from '@nestjs/common';

import type { SymbolRow } from '../../../platform/database/index.js';
import type {
  InstrumentDetail,
  InstrumentSummary,
  LegacyInstrumentDetail,
  LegacyInstrumentSearchItem,
} from './instruments.schemas.js';

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/** Match Pydantic's datetime JSON precision for PostgreSQL timestamp strings. */
function normalizeFractionalSeconds(value: string): string {
  return value.replace(
    /(\d{2}:\d{2}:\d{2})\.(\d+)(?=Z|[+-]\d{2}(?::?\d{2})?$|$)/,
    (_match, seconds: string, fraction: string) => {
      if (/^0+$/.test(fraction)) {
        return seconds;
      }

      return `${seconds}.${fraction.padEnd(6, '0').slice(0, 6)}`;
    },
  );
}

/** Preserve PostgreSQL microseconds while converting its separator to ISO-8601. */
function serializeNaiveTimestamp(value: string): string {
  return normalizeFractionalSeconds(value.replace(' ', 'T'));
}

/** Preserve the stored instant and microseconds; normalize common PostgreSQL offsets. */
function serializeAwareTimestamp(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const iso = normalizeFractionalSeconds(value.replace(' ', 'T'));
  if (/(?:\+00(?::?00)?|-00(?::?00)?)$/.test(iso)) {
    return iso.replace(/(?:\+00(?::?00)?|-00(?::?00)?)$/, 'Z');
  }
  if (/[+-]\d{2}$/.test(iso)) {
    return `${iso}:00`;
  }
  if (/[+-]\d{4}$/.test(iso)) {
    return iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  }

  return iso;
}

function toLegacyInteger(value: bigint | null, field: string): number | null {
  if (value === null) {
    return null;
  }

  if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT) {
    throw new InternalServerErrorException({
      code: 'LEGACY_INTEGER_OUT_OF_RANGE',
      message: `Không thể biểu diễn chính xác ${field} trong API v1`,
    });
  }

  return Number(value);
}

export function toInstrumentSummary(row: SymbolRow): InstrumentSummary {
  return {
    symbol: row.symbol,
    name: row.name,
    shortName: row.shortName,
    exchange: row.exchange,
    assetType: row.assetType,
    isIndex: row.isIndex,
    logoUrl: row.logoUrl,
    currentPriceVnd: row.currentPriceVnd?.toString() ?? null,
    targetPriceVnd: row.targetPriceVnd?.toString() ?? null,
    upsidePct: row.upsidePct,
    icbLv1: row.icbLv1,
    icbLv2: row.icbLv2,
  };
}

export function toInstrumentDetail(row: SymbolRow): InstrumentDetail {
  return {
    id: row.id,
    ...toInstrumentSummary(row),
    logoSource: row.logoSource,
    source: row.source,
    lastSyncedAt: serializeAwareTimestamp(row.lastSyncedAt),
    isActive: row.isActive,
    createdAt: serializeNaiveTimestamp(row.createdAt),
    updatedAt: serializeNaiveTimestamp(row.updatedAt),
  };
}

export function toLegacyInstrumentSearchItem(row: SymbolRow): LegacyInstrumentSearchItem {
  return {
    symbol: row.symbol,
    name: row.name,
    short_name: row.shortName,
    exchange: row.exchange,
    asset_type: row.assetType,
    is_index: row.isIndex,
    logo_url: row.logoUrl,
    current_price_vnd: toLegacyInteger(row.currentPriceVnd, 'current_price_vnd'),
    target_price_vnd: toLegacyInteger(row.targetPriceVnd, 'target_price_vnd'),
    upside_pct: row.upsidePct,
    icb_lv1: row.icbLv1,
    icb_lv2: row.icbLv2,
  };
}

export function toLegacyInstrumentDetail(row: SymbolRow): LegacyInstrumentDetail {
  return {
    id: row.id,
    ...toLegacyInstrumentSearchItem(row),
    logo_source: row.logoSource,
    source: row.source,
    source_url: row.sourceUrl,
    last_synced_at: serializeAwareTimestamp(row.lastSyncedAt),
    is_active: row.isActive,
    created_at: serializeNaiveTimestamp(row.createdAt),
    updated_at: serializeNaiveTimestamp(row.updatedAt),
  };
}
