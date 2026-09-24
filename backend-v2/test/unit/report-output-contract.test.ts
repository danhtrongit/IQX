import { describe, expect, it } from 'vitest';
import { validateMarketReport } from '../../src/modules/reports/report-validator.js';

const payload = { vnindex: { value: 1200 }, data_quality: { complete: true } };

describe('AI report output contract', () => {
  it.each([
    [
      'daily',
      {
        tagline: { direction: 'up', marker: '▲', text: 'Tăng' },
        paragraphs: {
          structure: 'Cấu trúc',
          smart_money: 'Dòng tiền',
          market_health:
            'Sức khỏe thị trường với dữ liệu xác nhận đủ dài để vượt ngưỡng kiểm tra nội dung tối thiểu và mô tả bối cảnh phiên hiện tại.',
        },
        scenarios: [
          {
            direction: 'up',
            condition_html: 'Nếu vượt cản',
            outcome_html: 'Đà tăng được xác nhận',
          },
        ],
        watchlist: [{ ticker: 'VCB', alert: false, reason_html: 'Theo dõi' }],
      },
    ],
    [
      'midday',
      {
        tagline: { text: 'Ổn định', color: 'neutral' },
        paragraphs: {
          session_structure: { status: 'published', content: 'Cấu trúc' },
          money_flow: { status: 'published', content: 'Dòng tiền' },
          market_health: {
            status: 'pending',
            pending_message: 'Chờ cuối phiên',
            pending_until: '2026-09-24T09:30:00Z',
          },
        },
        scenarios: [
          {
            type: 'up',
            condition: 'Nếu giữ hỗ trợ',
            outcome: 'Ổn định',
            scope: 'afternoon_session',
          },
        ],
        watchlist: [{ key: 'breadth', alert_level: 'normal', reason: 'Theo dõi' }],
      },
    ],
    [
      'premarket',
      {
        tagline: { text: 'Chuẩn bị trước phiên' },
        paragraphs: { world_paragraph: 'Thị trường quốc tế' },
        scenarios: [{ note: 'Dựa trên nguồn' }],
        watchlist: [{ level: 'normal', content: 'Theo dõi tin' }],
      },
    ],
  ])('accepts %s output', (type, body) => {
    const result = validateMarketReport(
      { headline: 'Bản tin', ...body },
      payload,
      type as 'daily' | 'midday' | 'premarket',
    );
    expect(result.errors).toEqual([]);
    expect(result.output).toBeTruthy();
  });

  it('rejects invalid nested semantic fields', () => {
    const result = validateMarketReport(
      {
        headline: 'Bản tin',
        tagline: { direction: 'sideways', marker: 'x', text: 'x' },
        paragraphs: { structure: 'x', smart_money: 'x', market_health: 'x'.repeat(40) },
        scenarios: [{ direction: 'up', condition_html: 'x' }],
        watchlist: null,
      },
      payload,
      'daily',
    );
    expect(result.output).toBeTruthy();
    expect(result.errors.some((error) => error.includes('tagline.direction'))).toBe(true);
    expect(result.errors.some((error) => error.includes('outcome_html'))).toBe(true);
  });
});
