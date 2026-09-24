import { BadGatewayException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AnalysisService } from '../../src/modules/analysis/analysis.service.js';
import {
  buildInsightResponse,
  parseInsightFragments,
} from '../../src/modules/analysis/insight-response.js';

const raw = {
  L1: {
    xu_huong: 'Tăng',
    statusLabel: 'Mạnh',
    ho_tro: '18,000',
    khang_cu: '20,000',
    da_gia: 'Đều',
    diff: 'Ổn định',
  },
  L2: {
    thanh_khoan: 'Bình thường',
    statusLabel: 'Bình thường',
    cung_cau: 'Cân bằng',
    tac_dong: 'Chờ',
    diff: '[num]10%[/num] tăng',
  },
  L3: { khoi_ngoai: 'Mua', tu_doanh: 'Bán', statusLabel: 'Hỗ trợ nhẹ', diff: 'Ổn định' },
  L4: { noi_bo: 'Không có', khoi_luong_tong: 'Thấp', statusLabel: 'Trung tính', diff: 'Ổn định' },
  L5: {
    tong_quan: 'Tích cực',
    statusLabel: 'Tích cực',
    tin_material: [{ tieu_de: 'KQKD', tag: 'KQKD', tac_dong_ngan: 'Tốt' }],
    tin_filler: [],
    tac_dong: 'Hỗ trợ',
    diff: 'Ổn định',
  },
  L6: {
    trend: 'Tăng',
    status: 'Mạnh',
    timeframe: 'Ngắn hạn',
    narrative: '[bull]Tăng [num]10%[/num][/bull] và [hl]tích cực[/hl]',
    diff: 'Lần đầu phân tích',
    observations: {
      liquidity: '[warn]Thận trọng[/warn]',
      moneyFlow: 'Không đổi',
      insider: 'Không đổi',
      news: 'Không đổi',
      supportResistance: '[gold]18,000[/gold]',
    },
    watchLevels: [
      { tag: 'Hỗ trợ', description: '18,000' },
      { tag: 'Kháng cự', description: '20,000' },
    ],
    recommendation: 'Quan sát thêm',
  },
};
const payload = { symbol: 'FPT', rawInput: { trend: { ohlcv: [] } } };
const service = Object.create(AnalysisService.prototype) as AnalysisService;
type PrivateService = {
  normalizeCachedInsight(
    cached: Record<string, unknown>,
    symbol: string,
    payload: Record<string, unknown>,
    previous: Record<string, unknown> | null,
  ): Record<string, unknown>;
  validateInsight(value: Record<string, unknown>): Record<string, unknown>;
};

describe('AI insight response projection', () => {
  it('parses supported markup, nested tags and malformed residual tags safely', () => {
    expect(
      parseInsightFragments(
        '[bull]Up [num]10[/num][/bull] [bear]Down[/bear] [warn]Risk[/warn] [info]Note[/info] [gold]Gold[/gold] [hl]Hi[/hl]',
      ),
    ).toEqual([
      { type: 'emphasis', content: 'Up 10', variant: 'bull' },
      { type: 'text', content: ' ' },
      { type: 'emphasis', content: 'Down', variant: 'bear' },
      { type: 'text', content: ' ' },
      { type: 'emphasis', content: 'Risk', variant: 'warn' },
      { type: 'text', content: ' ' },
      { type: 'emphasis', content: 'Note', variant: 'info' },
      { type: 'text', content: ' ' },
      { type: 'highlight', content: 'Gold' },
      { type: 'text', content: ' ' },
      { type: 'highlight', content: 'Hi' },
    ]);
    expect(parseInsightFragments('[bull]unclosed')).toEqual([
      { type: 'text', content: 'unclosed' },
    ]);
    expect(parseInsightFragments(null)).toEqual([]);
  });

  it('builds array fields, observations, diffs, levels and structured news', () => {
    const result = buildInsightResponse(
      raw,
      payload,
      { symbol: 'FPT' },
      '2026-09-24T00:00:00Z',
      true,
    );
    expect(result.briefing).toMatchObject({
      statusVariant: 'bull',
      recommendation: 'Quan sát thêm',
      diff: { hasChange: false, isFirstAnalysis: true },
    });
    expect((result.briefing as Record<string, unknown>).narrative).toEqual([
      { type: 'emphasis', content: 'Tăng 10%', variant: 'bull' },
      { type: 'text', content: ' và ' },
      { type: 'highlight', content: 'tích cực' },
    ]);
    const layers = result.layers as Record<string, Record<string, unknown>>;
    expect(layers.L1).toMatchObject({ layerNum: 'L1', statusLevel: 4 });
    expect((layers.L1?.fields as unknown[])[0]).toEqual({
      label: 'Xu hướng',
      value: [{ type: 'text', content: 'Tăng' }],
    });
    expect(layers.L2?.diff).toMatchObject({
      hasChange: false,
      text: [
        { type: 'number', content: '10%' },
        { type: 'text', content: ' tăng' },
      ],
    });
    expect(layers.L5?.news).toEqual({
      material: [{ title: 'KQKD', tag: 'KQKD', subtitle: 'Tốt' }],
      filler: [],
    });
    expect(result.rawInput).toEqual(payload.rawInput);
  });

  it('rejects unknown status labels rather than fabricating a neutral level', () => {
    expect(() =>
      (service as unknown as PrivateService).validateInsight({
        ...raw,
        L3: { ...raw.L3, statusLabel: 'Unknown' },
      }),
    ).toThrow(BadGatewayException);
  });

  it('migrates an old cached projection on read without an AI call', () => {
    const old = {
      symbol: 'FPT',
      updatedAt: '2026-09-23T10:00:00Z',
      briefing: raw.L6,
      layers: { L1: raw.L1, L2: raw.L2, L3: raw.L3, L4: raw.L4, L5: raw.L5 },
      dataSummary: { model: 'cached' },
    };
    const result = (service as unknown as PrivateService).normalizeCachedInsight(
      old,
      'FPT',
      payload,
      raw,
    );
    expect(result.updatedAt).toBe(old.updatedAt);
    expect((result.briefing as Record<string, unknown>).narrative).toBeInstanceOf(Array);
    expect((result.layers as Record<string, Record<string, unknown>>).L1?.fields).toBeInstanceOf(
      Array,
    );
    expect(result.dataSummary).toEqual({ model: 'cached' });
  });
});
