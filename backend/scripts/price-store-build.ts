/**
 * Initial full load / manual refresh of the daily price store (migration 0058, PLAN-bot-strategy
 * D2–D4, deploy step "before swap"). Fetches the full DNSE series of VN100 ∪ VN30 ∪ open Bot
 * positions (≈ 110 calls) and VNINDEX, then writes them; VNINDEX is written last.
 *
 *   node dist/scripts/price-store-build.js              # refresh what is not current (default)
 *   node dist/scripts/price-store-build.js --force      # re-fetch every symbol of the set
 *   node dist/scripts/price-store-build.js --json       # JSON report
 *   node dist/scripts/price-store-build.js --symbols FPT,HPG   # extra symbols
 *
 * Environment: `DATABASE_URL` (database name must match `iqx_v2_*`).
 * Exit codes: 0 = refreshed / up to date, 1 = failed or partial (data_as_of not advanced),
 * 2 = configuration error (e.g. migration 0058 missing).
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConfigService } from '@nestjs/config';

import {
  DnseMarketProvider,
  KbsMarketProvider,
  MarketDataService,
  MarketHttpTransport,
  VciMarketProvider,
  VndMarketProvider,
} from '../src/modules/market-data/index.js';
import { IndexMembershipProvider } from '../src/modules/market-integration/index-membership.provider.js';
import { PgPriceStoreRepository } from '../src/modules/price-store/price-store.repository.js';
import {
  PriceStoreService,
  type RefreshResult,
} from '../src/modules/price-store/price-store.service.js';
import { DnsePriceStoreSource } from '../src/modules/price-store/price-store.source.js';
import type { Environment } from '../src/platform/config/environment.js';
import { DatabaseService } from '../src/platform/database/database.service.js';

export interface PriceStoreBuildOptions {
  readonly force: boolean;
  readonly json: boolean;
  readonly concurrency: number;
  readonly symbols: string[];
}

export function parseArgs(argv: readonly string[]): PriceStoreBuildOptions {
  let force = false;
  let json = false;
  let concurrency = 4;
  let symbols: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') force = true;
    else if (arg === '--json') json = true;
    else if (arg === '--concurrency') {
      concurrency = Number(argv[(index += 1)]);
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
        throw new Error('--concurrency requires an integer from 1 to 8');
    } else if (arg === '--symbols') {
      symbols = String(argv[(index += 1)] ?? '')
        .split(',')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => /^[A-Z0-9]{2,10}$/.test(symbol));
    } else {
      throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }
  return { force, json, concurrency, symbols };
}

export function requireSafeTarget(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Refusing to run: DATABASE_URL is required');
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Refusing to run: DATABASE_URL must use PostgreSQL');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^iqx_v2_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error('Refusing to run: database name must match iqx_v2_*');
  }
  return databaseUrl;
}

const configLike = (values: Record<string, unknown>): ConfigService<Environment, true> =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService<Environment, true>;

export function formatReport(result: RefreshResult): string {
  const lines = [
    `kết quả: ${result.status}`,
    `phiên mới nhất (VNINDEX): ${result.latest_session ?? '-'}   data_as_of: ${result.data_as_of_before ?? '-'} → ${result.data_as_of ?? '-'}`,
    `tập mã: ${result.set_size}   đã làm mới: ${result.refreshed}   điều chỉnh giá: ${result.adjusted.join(', ') || '-'}   thời gian: ${(result.duration_ms / 1000).toFixed(1)}s`,
  ];
  const counts = new Map<string, number>();
  for (const outcome of result.outcomes)
    counts.set(outcome.status, (counts.get(outcome.status) ?? 0) + 1);
  lines.push(`trạng thái: ${JSON.stringify(Object.fromEntries(counts))}`);
  if (result.failed.length > 0) {
    lines.push('', 'mã lỗi:');
    for (const item of result.failed) lines.push(`  ${item.symbol}\t${item.error}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const database = new DatabaseService(
    configLike({
      DATABASE_URL: requireSafeTarget(),
      DB_READ_ONLY: false,
      DB_POOL_MAX: 6,
      DB_CONNECT_TIMEOUT_MS: 5_000,
      DB_STATEMENT_TIMEOUT_MS: 60_000,
    }),
  );
  try {
    const http = new MarketHttpTransport();
    const market = new MarketDataService(
      new VciMarketProvider(http),
      new VndMarketProvider(http),
      new KbsMarketProvider(http),
    );
    const service = new PriceStoreService(
      new PgPriceStoreRepository(database),
      new DnsePriceStoreSource(new DnseMarketProvider(http), new IndexMembershipProvider(market)),
    );
    const result = await service.refresh({
      force: options.force,
      extraSymbols: options.symbols,
      concurrency: options.concurrency,
      onProgress: (done, total) => {
        if (done % 10 === 0 || done === total) process.stderr.write(`[mã] ${done}/${total}\n`);
      },
    });
    process.stdout.write(
      options.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatReport(result)}\n`,
    );
    if (result.status === 'failed' || result.data_as_of !== result.latest_session)
      process.exitCode = 1;
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') {
      process.stderr.write(
        'Thiếu bảng strategy_price_* (chạy migration 0058_strategy_price_store.sql trước).\n',
      );
      process.exitCode = 2;
    } else {
      throw error;
    }
  } finally {
    await database.close();
  }
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await main();
}
