import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatReport, parseArgs } from '../../scripts/flashback-patterns-compute.js';
import { requireSafeTarget } from '../../scripts/flashback-dataset-build.js';
import type { PatternRunResult } from '../../src/modules/flashback/flashback-patterns.compute.js';

afterEach(() => vi.unstubAllEnvs());

describe('flashback-patterns-compute · tham số dòng lệnh', () => {
  it('mặc định là chạy thử (không ghi), kho đang dùng, 4 luồng', () => {
    expect(parseArgs([])).toEqual({ apply: false, json: false, concurrency: 4, version: null });
    expect(parseArgs(['--dry-run'])).toEqual({ apply: false, json: false, concurrency: 4, version: null });
  });

  it('--apply mới ghi thật; --version, --json và --concurrency đọc đúng', () => {
    expect(parseArgs(['--apply'])).toEqual({ apply: true, json: false, concurrency: 4, version: null });
    expect(parseArgs(['--apply', '--json', '--concurrency', '8', '--version', '2'])).toEqual({
      apply: true,
      json: true,
      concurrency: 8,
      version: 2,
    });
    // --dry-run đứng sau --apply thì thắng (an toàn hơn).
    expect(parseArgs(['--apply', '--dry-run']).apply).toBe(false);
  });

  it('từ chối tham số lạ, số luồng ngoài 1-8 và phiên bản không phải số nguyên dương', () => {
    expect(() => parseArgs(['--force'])).toThrow('Unknown argument: --force');
    expect(() => parseArgs(['--concurrency', '0'])).toThrow('1 to 8');
    expect(() => parseArgs(['--concurrency', '9'])).toThrow('1 to 8');
    expect(() => parseArgs(['--version'])).toThrow('positive integer');
    expect(() => parseArgs(['--version', '0'])).toThrow('positive integer');
    expect(() => parseArgs(['--version', '1.5'])).toThrow('positive integer');
  });
});

describe('flashback-patterns-compute · chỉ chạy trên CSDL iqx_v2_* (dùng chung với lệnh dựng kho)', () => {
  it('từ chối CSDL lạ, nhận CSDL iqx_v2_*', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost/production');
    expect(() => requireSafeTarget()).toThrow('iqx_v2_*');
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/iqx_v2_prod');
    expect(requireSafeTarget()).toBe('postgresql://u:p@localhost:5432/iqx_v2_prod');
  });
});

const done = (over: Partial<Extract<PatternRunResult, { status: 'done' | 'failed' }>> = {}): PatternRunResult => ({
  status: 'done',
  runId: 4,
  version: 7,
  detectorVersion: 1,
  symbolsDone: 96,
  symbolsTotal: 97,
  patternsCount: 41_250,
  failed: [{ symbol: 'AAA', reason: 'lỗi đọc nến' }],
  reason: null,
  durationMs: 23_400,
  log: {
    sessions: 480_000,
    cards: { doji: 5_000, bua: 800 },
    raw: {
      source: 'VCI:price-history:dong:raw',
      symbols_with_raw: 90,
      symbols_without_raw: 6,
      errors: [{ symbol: 'BBB', reason: 'VCI 403' }],
      reused: [],
    },
    missing_raw_sessions: 1_200,
  },
  ...over,
});

describe('flashback-patterns-compute · báo cáo', () => {
  it('chạy thật: chế độ APPLY, phiên bản kho, bộ nhận diện, số mẫu, mã lỗi, giá gốc và số mẫu của đủ 47 thẻ', () => {
    const report = formatReport(done(), true);
    expect(report).toContain('MODE: APPLY (writes)');
    expect(report).toContain('XONG');
    expect(report).toContain('phiên bản kho: 7   bộ nhận diện: 1   mã: 96/97   mẫu: 41250   thời gian: 23.4s');
    expect(report).toContain('mã lỗi: 1');
    expect(report).toContain('90 mã có, 6 mã không');
    expect(report).toContain('phiên thiếu giá gốc: 1200');
    expect(report).toMatch(/doji\s+5000/);
    // Thẻ không có mẫu nào được đánh dấu để người chạy thấy ngay.
    expect(report).toMatch(/tran_trang\s+0\s+<- 0 lần/);
    expect(report.match(/\n {2}\d {2}\S+ +\d+/g)).toHaveLength(47);
    expect(report).toContain('AAA\tlỗi đọc nến');
    expect(report).toContain('BBB\tVCI 403');
  });

  it('chạy thử nói rõ không ghi gì; thất bại nêu lý do; đang chạy thì báo đang có lần tính khác', () => {
    expect(formatReport(done(), false)).toContain('MODE: DRY RUN (no writes)');
    expect(formatReport(done(), false)).toContain('chạy thử, không ghi');
    expect(formatReport(done({ status: 'failed', reason: 'Không tính được mẫu nến cho mã nào' }), true)).toContain(
      'THẤT BẠI - Không tính được mẫu nến cho mã nào',
    );
    expect(formatReport({ status: 'already_running', version: 7 }, true)).toContain('Phiên bản kho 7 đang có một lần tính');
  });
});
