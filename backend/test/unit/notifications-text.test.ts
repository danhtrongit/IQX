import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  disableType,
  normalizeSettings,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../../src/modules/notifications/user-notifications.rules.js';
import {
  BOT_HISTORY_LINK,
  UNSUBSCRIBE_PLACEHOLDER,
  botTradesEmail,
  botTradesSummary,
  botTradesText,
  bulletinEmail,
  bulletinText,
  unsubscribeUrl,
} from '../../src/modules/notifications/user-notifications.text.js';
import type { BotTradesNotificationInput } from '../../src/modules/notifications/notification-writer.port.js';

const T01: BotTradesNotificationInput = {
  userId: '00000000-0000-4000-8000-000000000001',
  tradeDate: '2026-11-24',
  executions: [
    { side: 'sell', symbol: 'VNM', price: 61_200, quantity: 300, reason: 'max_holding' },
    { side: 'buy', symbol: 'HPG', price: 25_300, quantity: 500 },
    { side: 'buy', symbol: 'FPT', price: 118_000, quantity: 100 },
  ],
  strategyLabel: 'Chiến lược của tôi · bản 3',
  navVnd: 101_234_567,
};

describe('notifications: web text (spec §8.1)', () => {
  it('T01: bot trades title, body and link', () => {
    expect(botTradesText(T01)).toEqual({
      title: 'Bot giao dịch · phiên 24/11',
      body: 'Mua HPG, FPT · Bán VNM (hết thời gian giữ)',
      link: BOT_HISTORY_LINK,
    });
  });

  it('marks only the time-exit sells when sell reasons are mixed', () => {
    expect(
      botTradesSummary([
        { side: 'sell', symbol: 'SSI', price: 1, quantity: 1, reason: 'indicator' },
        { side: 'sell', symbol: 'VNM', price: 1, quantity: 1, reason: 'max_holding' },
      ]),
    ).toBe('Bán SSI, VNM (hết thời gian giữ)');
    expect(
      botTradesSummary([
        { side: 'sell', symbol: 'VNM', price: 1, quantity: 1, reason: 'max_holding' },
        { side: 'sell', symbol: 'SSI', price: 1, quantity: 1, reason: 'indicator' },
      ]),
    ).toBe('Bán VNM (hết thời gian giữ), SSI');
    expect(
      botTradesSummary([
        { side: 'sell', symbol: 'SSI', price: 1, quantity: 1 },
        { side: 'buy', symbol: 'HPG', price: 1, quantity: 1 },
        { side: 'buy', symbol: 'HPG', price: 1, quantity: 1 },
      ]),
    ).toBe('Mua HPG · Bán SSI');
  });

  it('bulletin title, body and link to the day of the bulletin', () => {
    expect(
      bulletinText({
        tradeDate: '2026-11-21',
        close: 1284.567,
        change: 10.8,
        changePct: 0.8478,
        volume: 812_000_000,
        pickCount: 12,
      }),
    ).toEqual({
      title: 'Bản tin cuối phiên 21/11',
      body: 'VN-Index 1.284,57 (+0,85%) · 12 mã trong 3 bộ lọc',
      link: '/thi-truong?bt=ban-tin&date=2026-11-21',
    });
    expect(
      bulletinText({
        tradeDate: '2026-11-21',
        close: 1200,
        change: -6,
        changePct: -0.5,
        volume: null,
        pickCount: 0,
      }).body,
    ).toBe('VN-Index 1.200,00 (−0,50%) · 0 mã trong 3 bộ lọc');
  });
});

describe('notifications: email content (spec §8.4)', () => {
  it('bot email: subject, order table, strategy, NAV, footer and unsubscribe placeholder', () => {
    const email = botTradesEmail(T01, 'https://iqx.vn/');
    expect(email.subject).toBe('Bot giao dịch phiên 24/11: mua HPG, FPT, bán VNM');
    for (const text of [
      'Lệnh',
      'Giá khớp',
      'Khối lượng',
      'Lý do',
      'Hết thời gian giữ',
      'Điều kiện Mua',
      '25.300',
      'Chiến lược của tôi · bản 3',
      '101.234.567 đ',
      'Xem Bot',
      'https://iqx.vn/luyen-tap?tool=bot&amp;bot_tab=lich-su',
      'Bạn nhận email này vì đã bật thông báo Bot giao dịch.',
      'Tắt thông báo này',
      'Không phải khuyến nghị đầu tư. Giao dịch mô phỏng.',
      UNSUBSCRIBE_PLACEHOLDER,
    ])
      expect(email.html).toContain(text);
  });

  it('bulletin email: subject and body without the simulated-trading line', () => {
    const email = bulletinEmail(
      {
        tradeDate: '2026-11-21',
        close: 1284.56,
        change: 10.8,
        changePct: 0.85,
        volume: 812_000_000,
        pickCount: 12,
      },
      'https://iqx.vn',
    );
    expect(email.subject).toBe('Bản tin cuối phiên 21/11: VN-Index 1.284,56 (+0,85%)');
    expect(email.html).toContain('Đọc bản tin');
    expect(email.html).toContain('812.000.000 cp');
    expect(email.html).toContain('Bạn nhận email này vì đã bật thông báo Bản tin cuối phiên.');
    expect(email.html).not.toContain('Giao dịch mô phỏng');
  });

  it('escapes user-visible values', () => {
    const email = botTradesEmail({ ...T01, strategyLabel: '<script>x</script>' }, 'https://iqx.vn');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});

describe('notifications: settings rules (spec §8.2)', () => {
  const on = { ...DEFAULT_NOTIFICATION_SETTINGS };

  it('turning both types off switches the master off', () => {
    expect(normalizeSettings(on, { ...on, bulletin: false, bot_trades: false })).toMatchObject({
      enabled: false,
    });
  });

  it('turning the master back on while both types are off turns both on', () => {
    const off = { enabled: false, bulletin: false, bot_trades: false, email: true };
    expect(normalizeSettings(off, { ...off, enabled: true })).toEqual({
      enabled: true,
      bulletin: true,
      bot_trades: true,
      email: true,
    });
  });

  it('keeps types as they are when only the master changes', () => {
    expect(normalizeSettings(on, { ...on, enabled: false })).toEqual({ ...on, enabled: false });
  });

  it('disableType turns one type off, and the master too when the other is off', () => {
    expect(disableType(on, 'bot_trades')).toEqual({ ...on, bot_trades: false });
    expect(disableType({ ...on, bulletin: false }, 'bot_trades')).toMatchObject({
      enabled: false,
      bulletin: false,
      bot_trades: false,
    });
  });
});

describe('notifications: unsubscribe token (PLAN D21)', () => {
  const secret = 'x'.repeat(40);
  const id = '5a0e7a1e-3b5c-4d6e-8f90-1234567890ab';

  it('round-trips and rejects tampering, other secrets and garbage', () => {
    const token = signUnsubscribeToken(secret, id);
    expect(verifyUnsubscribeToken(secret, token)).toBe(id);
    expect(verifyUnsubscribeToken('y'.repeat(40), token)).toBeNull();
    expect(verifyUnsubscribeToken(secret, `${token}x`)).toBeNull();
    expect(
      verifyUnsubscribeToken(secret, token.replace(id, '5a0e7a1e-3b5c-4d6e-8f90-1234567890ac')),
    ).toBeNull();
    expect(verifyUnsubscribeToken(secret, 'invalid-token')).toBeNull();
    expect(verifyUnsubscribeToken(secret, '')).toBeNull();
    expect(verifyUnsubscribeToken(secret, 'a'.repeat(300))).toBeNull();
  });

  it('unsubscribe URL points at the frontend result page', () => {
    expect(unsubscribeUrl('https://iqx.vn/', 'a.b')).toBe('https://iqx.vn/thong-bao/tat?token=a.b');
  });
});
