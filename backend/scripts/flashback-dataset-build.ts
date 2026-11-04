/**
 * Dựng một phiên bản kho dữ liệu Flashback v2.2 từ dòng lệnh (IQX-Flashback-SPEC-DuLieu.md §2.2).
 * Dùng để dựng phiên bản ĐẦU TIÊN khi triển khai (sau migration 0039) mà không cần chờ tác vụ định
 * kỳ hay bấm nút trên trang Quản trị; chạy lại bất cứ lúc nào để làm mới kho bằng tay.
 *
 * Mặc định là chạy thử: tải dữ liệu, tính toán và in báo cáo, KHÔNG ghi gì vào CSDL.
 *
 *   node dist/scripts/flashback-dataset-build.js              # chạy thử
 *   node dist/scripts/flashback-dataset-build.js --apply      # dựng thật và kích hoạt nếu đủ mã
 *
 * Tuỳ chọn: `--json` in báo cáo dạng JSON, `--concurrency N` (1-8, mặc định 4).
 * Môi trường: `DATABASE_URL` (tên CSDL phải khớp `iqx_v2_*`); `TELEGRAM_BOT_TOKEN` và
 * `OPS_ALERT_TELEGRAM_CHAT_ID` (không bắt buộc) để cảnh báo kênh kỹ thuật khi dựng thất bại.
 *
 * Mã thoát: 0 = xong (hoặc chạy thử xong), 1 = dựng thất bại, 2 = lỗi cấu hình, 3 = đang có một
 * lần dựng khác.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConfigService } from '@nestjs/config';

import {
  FlashbackDatasetBuilder,
  type DatasetBuildResult,
} from '../src/modules/flashback/flashback-dataset.builder.js';
import { PgFlashbackDatasetRepository } from '../src/modules/flashback/flashback-dataset.repository.js';
import { MarketFlashbackDatasetSource } from '../src/modules/flashback/flashback-dataset.source.js';
import { TelegramFlashbackOpsAlerts } from '../src/modules/flashback/flashback.alerts.js';
import {
  DnseMarketProvider,
  KbsMarketProvider,
  MarketDataService,
  MarketHttpTransport,
  VciMarketProvider,
  VndMarketProvider,
} from '../src/modules/market-data/index.js';
import { IndexMembershipProvider } from '../src/modules/market-integration/index-membership.provider.js';
import type { Environment } from '../src/platform/config/environment.js';
import { DatabaseService } from '../src/platform/database/database.service.js';

export interface DatasetBuildCliOptions {
  readonly apply: boolean;
  readonly json: boolean;
  readonly concurrency: number;
}

export function parseArgs(argv: readonly string[]): DatasetBuildCliOptions {
  let apply = false;
  let json = false;
  let concurrency = 4;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') apply = true;
    else if (arg === '--dry-run') apply = false;
    else if (arg === '--json') json = true;
    else if (arg === '--concurrency') {
      concurrency = Number(argv[(index += 1)]);
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
        throw new Error('--concurrency requires an integer from 1 to 8');
    } else {
      throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }
  return { apply, json, concurrency };
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

function configLike(values: Record<string, unknown>): ConfigService<Environment, true> {
  return { get: (key: string) => values[key] } as unknown as ConfigService<Environment, true>;
}

export function formatReport(result: DatasetBuildResult, apply: boolean): string {
  const lines = [apply ? 'MODE: APPLY (writes)' : 'MODE: DRY RUN (no writes)'];
  if (result.status === 'already_running') {
    lines.push(`Đang có một lần dựng kho khác (phiên bản ${result.version}); không chạy thêm.`);
    return lines.join('\n');
  }
  const log = result.log;
  lines.push(
    `kết quả: ${result.status === 'active' ? (apply ? 'ĐÃ KÍCH HOẠT' : 'ĐẠT (chạy thử, không ghi)') : `THẤT BẠI - ${result.reason}`}`,
    `phiên bản: ${result.version ?? '-'}   mã hợp lệ: ${result.okCount}   mã bị loại: ${result.excludedCount}   thời gian: ${(result.durationMs / 1000).toFixed(1)}s`,
    `rổ: ${log.basket.index} (${log.basket.count} mã, ${log.basket.source})`,
    `lịch phiên: ${log.calendar.sessions} phiên ${log.calendar.first ?? '-'} .. ${log.calendar.last ?? '-'} (${log.calendar.source})`,
    `nguồn giá: ${JSON.stringify(log.sources)}   giá trị giao dịch: ${JSON.stringify(log.value_basis)}`,
    log.cuts
      ? `điểm cắt phòng ${log.cuts.view_bars}/${log.cuts.play_bars}: ${log.cuts.symbols_with_cut} mã có điểm cắt, ${log.cuts.total_cuts} điểm cắt`
      : '',
  );
  if (log.excluded.length > 0) {
    lines.push('', 'mã bị loại:');
    for (const item of log.excluded) lines.push(`  ${item.symbol}\t${item.reason}`);
  }
  return lines.filter((line) => line !== '').join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = requireSafeTarget();
  const database = new DatabaseService(
    configLike({
      DATABASE_URL: databaseUrl,
      DB_READ_ONLY: !options.apply,
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
    const source = new MarketFlashbackDatasetSource(
      new DnseMarketProvider(http),
      market,
      new IndexMembershipProvider(market),
    );
    const alerts = new TelegramFlashbackOpsAlerts(
      configLike({
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        OPS_ALERT_TELEGRAM_CHAT_ID: process.env.OPS_ALERT_TELEGRAM_CHAT_ID,
      }),
    );
    const builder = new FlashbackDatasetBuilder(
      new PgFlashbackDatasetRepository(database),
      source,
      alerts,
    );
    let lastReported = 0;
    const result = await builder.build({
      trigger: 'cli',
      dryRun: !options.apply,
      concurrency: options.concurrency,
      onProgress: (progress) => {
        if (progress.phase === 'symbols' && progress.done - lastReported < 10) return;
        lastReported = progress.done;
        process.stderr.write(
          `[${progress.phase}] ${progress.done}/${progress.total} (ok ${progress.ok}, loại ${progress.excluded})\n`,
        );
      },
    });
    process.stdout.write(
      options.json
        ? `${JSON.stringify({ apply: options.apply, result }, null, 2)}\n`
        : `${formatReport(result, options.apply)}\n`,
    );
    if (result.status === 'failed') process.exitCode = 1;
    else if (result.status === 'already_running') process.exitCode = 3;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01') {
      process.stderr.write('Thiếu các bảng fb_dataset_* (chạy migration 0039_flashback_dataset.sql trước).\n');
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
