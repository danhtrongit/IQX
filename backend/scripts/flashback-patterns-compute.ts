/**
 * Tính sẵn mẫu nến của kho Flashback từ dòng lệnh (Candle Dojo v1.3 §4): bước 2b chạy bù trên phiên bản
 * kho ĐANG DÙNG (kho dựng trước khi có tính năng này), hoặc chạy lại sau khi đổi bộ nhận diện. Không tạo
 * phiên bản kho mới, không đổi dữ liệu giá; chạy lại nhiều lần vẫn cho đúng kết quả, không dòng trùng.
 *
 * Mặc định là chạy thử: tải giá gốc, tính mẫu và in báo cáo (số mẫu theo thẻ, mã lỗi, phiên thiếu giá
 * gốc), KHÔNG ghi gì vào CSDL.
 *
 *   node dist/scripts/flashback-patterns-compute.js            # chạy thử trên kho đang dùng
 *   node dist/scripts/flashback-patterns-compute.js --apply    # tính thật và ghi
 *
 * Tuỳ chọn: `--version N` (mặc định: phiên bản đang dùng), `--json`, `--concurrency N` (1-8, mặc định 4).
 * Môi trường: `DATABASE_URL` (tên CSDL phải khớp `iqx_v2_*`).
 *
 * Trong lúc chạy, ván chơi vẫn chạy bình thường (chưa có thẻ); lần chạy `done` xong thì ván tra mẫu mới
 * trong vòng một phút. Mã thoát: 0 = xong (hoặc chạy thử xong), 1 = thất bại, 2 = lỗi cấu hình, 3 = đang
 * có một lần tính khác của phiên bản này.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CD_CARDS } from '../src/modules/candle-dojo/shared/cards.js';
import { CANDLE_DETECTOR_VERSION } from '../src/modules/candle-dojo/shared/detector.js';
import { PgFlashbackDatasetRepository } from '../src/modules/flashback/flashback-dataset.repository.js';
import { MarketFlashbackDatasetSource } from '../src/modules/flashback/flashback-dataset.source.js';
import {
  FlashbackPatternsCompute,
  type PatternRunResult,
} from '../src/modules/flashback/flashback-patterns.compute.js';
import { PgFlashbackPatternsRepository } from '../src/modules/flashback/flashback-patterns.repository.js';
import {
  DnseMarketProvider,
  KbsMarketProvider,
  MarketDataService,
  MarketHttpTransport,
  VciMarketProvider,
  VndMarketProvider,
} from '../src/modules/market-data/index.js';
import { IndexMembershipProvider } from '../src/modules/market-integration/index-membership.provider.js';
import { DatabaseService } from '../src/platform/database/database.service.js';
import { configLike, requireSafeTarget } from './flashback-dataset-build.js';

export interface PatternsComputeCliOptions {
  readonly apply: boolean;
  readonly json: boolean;
  readonly concurrency: number;
  readonly version: number | null;
}

export function parseArgs(argv: readonly string[]): PatternsComputeCliOptions {
  let apply = false;
  let json = false;
  let concurrency = 4;
  let version: number | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') apply = true;
    else if (arg === '--dry-run') apply = false;
    else if (arg === '--json') json = true;
    else if (arg === '--concurrency') {
      concurrency = Number(argv[(index += 1)]);
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
        throw new Error('--concurrency requires an integer from 1 to 8');
    } else if (arg === '--version') {
      version = Number(argv[(index += 1)]);
      if (!Number.isInteger(version) || version < 1)
        throw new Error('--version requires a positive integer');
    } else {
      throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }
  return { apply, json, concurrency, version };
}

export function formatReport(result: PatternRunResult, apply: boolean): string {
  const lines = [apply ? 'MODE: APPLY (writes)' : 'MODE: DRY RUN (no writes)'];
  if (result.status === 'already_running') {
    lines.push(`Phiên bản kho ${result.version} đang có một lần tính mẫu nến khác; không chạy thêm.`);
    return lines.join('\n');
  }
  const log = result.log;
  lines.push(
    `kết quả: ${result.status === 'done' ? (apply ? 'XONG' : 'ĐẠT (chạy thử, không ghi)') : `THẤT BẠI - ${result.reason ?? ''}`}`,
    `phiên bản kho: ${result.version}   bộ nhận diện: ${result.detectorVersion}   mã: ${result.symbolsDone}/${result.symbolsTotal}   mẫu: ${result.patternsCount}   thời gian: ${(result.durationMs / 1000).toFixed(1)}s`,
    `số phiên: ${log.sessions ?? 0}   mã lỗi: ${result.failed.length}   giá gốc: ${log.raw?.symbols_with_raw ?? 0} mã có, ${log.raw?.symbols_without_raw ?? 0} mã không   phiên thiếu giá gốc: ${log.missing_raw_sessions ?? 0}`,
  );
  const counts = log.cards ?? {};
  lines.push(
    '',
    'số mẫu theo thẻ (bậc, thẻ, số lần):',
    ...CD_CARDS.map((card) => {
      const count = counts[card.id] ?? 0;
      return `  ${card.tier}  ${card.id.padEnd(22)} ${String(count).padStart(7)}${count === 0 ? '   <- 0 lần' : ''}`;
    }),
  );
  if (result.failed.length > 0) {
    lines.push('', 'mã tính lỗi (vẫn dùng cho ván nhưng không có thẻ):');
    for (const item of result.failed) lines.push(`  ${item.symbol}\t${item.reason}`);
  }
  const rawErrors = log.raw?.errors ?? [];
  if (rawErrors.length > 0) {
    lines.push('', 'mã không lấy được giá gốc (4 thẻ Việt Nam không xét ở mã đó):');
    for (const item of rawErrors) lines.push(`  ${item.symbol}\t${item.reason}`);
  }
  return lines.join('\n');
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
    const datasets = new PgFlashbackDatasetRepository(database);
    const version = options.version ?? (await datasets.activeVersion())?.version ?? null;
    if (version === null) {
      process.stderr.write('Chưa có phiên bản kho đang dùng để tính mẫu nến (dựng kho trước).\n');
      process.exitCode = 2;
      return;
    }
    const http = new MarketHttpTransport();
    const market = new MarketDataService(
      new VciMarketProvider(http),
      new VndMarketProvider(http),
      new KbsMarketProvider(http),
    );
    // Chỉ dùng phần lấy giá gốc của nguồn (VCI price-history); rổ và lịch phiên không được gọi.
    const source = new MarketFlashbackDatasetSource(
      new DnseMarketProvider(http),
      market,
      new IndexMembershipProvider(market),
    );
    const compute = new FlashbackPatternsCompute(new PgFlashbackPatternsRepository(database), source);
    let lastReported = 0;
    const result = await compute.run({
      version,
      trigger: options.version === null ? 'backfill' : 'admin',
      requestedBy: 'cli',
      dryRun: !options.apply,
      concurrency: options.concurrency,
      onProgress: (progress) => {
        if (progress.done - lastReported < 10 && progress.done < progress.total) return;
        lastReported = progress.done;
        process.stderr.write(`[symbols] ${progress.done}/${progress.total} (mẫu ${progress.patterns})\n`);
      },
    });
    process.stdout.write(
      options.json
        ? `${JSON.stringify({ apply: options.apply, detector_version: CANDLE_DETECTOR_VERSION, result }, null, 2)}\n`
        : `${formatReport(result, options.apply)}\n`,
    );
    if (result.status === 'failed') process.exitCode = 1;
    else if (result.status === 'already_running') process.exitCode = 3;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01') {
      process.stderr.write(
        'Thiếu các bảng mẫu nến (chạy migration 0046_candle_dojo_flashback_patterns.sql trước).\n',
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
