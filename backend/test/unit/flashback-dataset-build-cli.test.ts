import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatasetBuildResult } from '../../src/modules/flashback/flashback-dataset.builder.js';
import type { DatasetBuildLog } from '../../src/modules/flashback/flashback-dataset.repository.js';
import {
  formatReport,
  parseArgs,
  requireSafeTarget,
} from '../../scripts/flashback-dataset-build.js';

afterEach(() => vi.unstubAllEnvs());

describe('flashback-dataset-build · tham số dòng lệnh', () => {
  it('mặc định là chạy thử (không ghi), 4 luồng', () => {
    expect(parseArgs([])).toEqual({ apply: false, json: false, concurrency: 4 });
    expect(parseArgs(['--dry-run'])).toEqual({ apply: false, json: false, concurrency: 4 });
  });

  it('--apply mới ghi thật; --json và --concurrency đọc đúng', () => {
    expect(parseArgs(['--apply'])).toEqual({ apply: true, json: false, concurrency: 4 });
    expect(parseArgs(['--apply', '--json', '--concurrency', '8'])).toEqual({
      apply: true,
      json: true,
      concurrency: 8,
    });
    // --dry-run đứng sau --apply thì thắng (an toàn hơn).
    expect(parseArgs(['--apply', '--dry-run']).apply).toBe(false);
  });

  it('từ chối tham số lạ và số luồng ngoài 1-8', () => {
    expect(() => parseArgs(['--force'])).toThrow('Unknown argument: --force');
    expect(() => parseArgs(['--concurrency'])).toThrow('1 to 8');
    expect(() => parseArgs(['--concurrency', '0'])).toThrow('1 to 8');
    expect(() => parseArgs(['--concurrency', '9'])).toThrow('1 to 8');
    expect(() => parseArgs(['--concurrency', '2.5'])).toThrow('1 to 8');
  });
});

describe('flashback-dataset-build · chỉ chạy trên CSDL iqx_v2_*', () => {
  it('từ chối khi thiếu DATABASE_URL, không phải PostgreSQL hoặc tên CSDL lạ', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(() => requireSafeTarget()).toThrow('DATABASE_URL is required');
    vi.stubEnv('DATABASE_URL', 'mysql://u:p@localhost/iqx_v2_prod');
    expect(() => requireSafeTarget()).toThrow('must use PostgreSQL');
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost/production');
    expect(() => requireSafeTarget()).toThrow('iqx_v2_*');
  });

  it('nhận CSDL iqx_v2_*', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/iqx_v2_prod');
    expect(requireSafeTarget()).toBe('postgresql://u:p@localhost:5432/iqx_v2_prod');
  });
});

const log = (over: Partial<DatasetBuildLog> = {}): DatasetBuildLog => ({
  started_at: '2026-11-04T03:00:00.000Z',
  finished_at: '2026-11-04T03:01:00.000Z',
  duration_ms: 60_000,
  outcome: 'active',
  basket: { index: 'VN100', count: 100, source: 'VCI:VN100' },
  calendar: { sessions: 3_400, first: '2012-03-20', last: '2026-11-03', source: 'DNSE:VNINDEX' },
  symbols: { ok: 97, excluded: 3 },
  excluded: [
    { symbol: 'AAA', reason: 'Chưa đủ lịch sử (200/312 phiên)' },
    { symbol: 'BBB', reason: 'Lỗi tải dữ liệu: timeout' },
  ],
  value_basis: { matched: 97, mixed: 0, approx: 0 },
  sources: { 'DNSE:x1000:adjusted': 97 },
  parameters: { min_symbols: 80, min_bars: 312, warmup_sessions: 252, max_gap_sessions: 5 },
  cuts: { view_bars: 60, play_bars: 30, symbols_with_cut: 90, total_cuts: 120_000 },
  ...over,
});

describe('flashback-dataset-build · báo cáo', () => {
  it('chạy thật: ghi rõ chế độ APPLY, phiên bản, số mã, nguồn, điểm cắt và danh sách mã bị loại', () => {
    const result: DatasetBuildResult = {
      status: 'active',
      version: 3,
      okCount: 97,
      excludedCount: 3,
      durationMs: 60_000,
      log: log(),
    };
    const report = formatReport(result, true);
    expect(report).toContain('MODE: APPLY (writes)');
    expect(report).toContain('ĐÃ KÍCH HOẠT');
    expect(report).toContain('phiên bản: 3');
    expect(report).toContain('mã hợp lệ: 97');
    expect(report).toContain('rổ: VN100 (100 mã, VCI:VN100)');
    expect(report).toContain('lịch phiên: 3400 phiên 2012-03-20 .. 2026-11-03 (DNSE:VNINDEX)');
    expect(report).toContain('90 mã có điểm cắt, 120000 điểm cắt');
    expect(report).toContain('AAA\tChưa đủ lịch sử (200/312 phiên)');
    expect(report).toContain('BBB\tLỗi tải dữ liệu: timeout');
  });

  it('chạy thử: nói rõ không ghi gì; thất bại nêu lý do; đang chạy thì báo đang có lần dựng khác', () => {
    const base = { okCount: 97, excludedCount: 3, durationMs: 1_000, log: log() };
    expect(formatReport({ status: 'active', version: 0, ...base }, false)).toContain('MODE: DRY RUN (no writes)');
    expect(formatReport({ status: 'active', version: 0, ...base }, false)).toContain('chạy thử, không ghi');
    expect(
      formatReport({ ...base, status: 'failed', version: 4, reason: 'Kho mới chỉ có 79 mã hợp lệ' }, true),
    ).toContain('THẤT BẠI - Kho mới chỉ có 79 mã hợp lệ');
    expect(formatReport({ status: 'already_running', version: 5 }, true)).toContain('phiên bản 5');
  });
});
