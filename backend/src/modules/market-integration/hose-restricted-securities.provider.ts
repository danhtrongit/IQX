import { Injectable, Logger } from '@nestjs/common';

import { MarketExtendedService } from '../market-extended/market-extended.service.js';
import { isObject } from './integration.utils.js';

const HOSE = 'https://api.hsx.vn/l/api/v1';
const RESTRICTED_NAMES = ['canh bao', 'kiem soat', 'han che giao dich'];

function unaccent(value: string): string {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('đ', 'd');
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** Official HOSE restricted-security feed used by the market integration facade. */
@Injectable()
export class HoseRestrictedSecuritiesProvider {
  private readonly logger = new Logger(HoseRestrictedSecuritiesProvider.name);
  private cache: { expiresAt: number; value: Set<string> } | undefined;

  constructor(private readonly marketExtended: MarketExtendedService) {}

  async current(): Promise<Set<string> | null> {
    if (this.cache && this.cache.expiresAt > Date.now()) return new Set(this.cache.value);
    try {
      // Keep this provider attached to MarketExtendedService so all extended-market
      // integrations share one Nest lifecycle. HOSE is not a Vietcap endpoint and
      // therefore intentionally has its own strict parser below.
      void this.marketExtended;
      const statusRoot = await this.json(`${HOSE}/securities/status-list`);
      if (statusRoot.success !== true) throw new Error('HOSE status-list unsuccessful');
      const ids = rows(statusRoot.data)
        .filter((row) => {
          const name = typeof row.name === 'string' ? unaccent(row.name) : '';
          return RESTRICTED_NAMES.some((part) => name.includes(part));
        })
        .map((row) => Number(row.id))
        .filter((id) => Number.isSafeInteger(id) && id > 0);
      if (!ids.length) throw new Error('HOSE status-list contains no restricted groups');

      const pages = await Promise.all(ids.map((id) => this.page(id)));
      const value = new Set(
        pages
          .flat()
          .map((row) =>
            String(row.securitiesCode ?? '')
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      );
      this.cache = { value, expiresAt: Date.now() + 30 * 60_000 };
      return new Set(value);
    } catch (error) {
      this.logger.warn(`HOSE restricted-security feed unavailable: ${String(error)}`);
      return null;
    }
  }

  private async page(statusId: number): Promise<Record<string, unknown>[]> {
    const url = new URL(`${HOSE}/1/securities/stock-status`);
    url.searchParams.set('pageIndex', '1');
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('statusListId', String(statusId));
    const root = await this.json(url.toString());
    const data = isObject(root.data) ? root.data : null;
    const list = data ? rows(data.list) : [];
    const paging = data && isObject(data.paging) ? data.paging : null;
    const total = Number(paging?.totalCount);
    if (root.success !== true || !Number.isSafeInteger(total) || total !== list.length) {
      throw new Error(`HOSE stock-status ${statusId} is truncated or invalid`);
    }
    return list;
  }

  private async json(url: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'accept-language': 'vi-VN,vi;q=0.9' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HOSE HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!isObject(value)) throw new Error('HOSE response is not an object');
    return value;
  }
}
