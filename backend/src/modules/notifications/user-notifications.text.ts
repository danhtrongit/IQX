/**
 * Nội dung thông báo (update 22-11 §8.1, §8.4): tiêu đề, một dòng nội dung, link trên web và
 * email. Thuần, không I/O, để test chính xác từng chữ.
 */
import { dm, nf, sg } from '../market-bulletins/bulletin.format.js';
import type {
  BotTradeExecution,
  BotTradesNotificationInput,
  BulletinPublishedInput,
} from './notification-writer.port.js';

export const OFFICE_NOTIFICATION_TYPES = [
  'office_task_assigned',
  'office_task_approved',
  'office_task_returned',
  'office_task_submitted',
  'office_proposal_sent',
  'office_proposal_replied',
] as const;
export type OfficeNotificationType = (typeof OFFICE_NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPES = ['bulletin', 'bot_trades', ...OFFICE_NOTIFICATION_TYPES] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  bulletin: 'Bản tin cuối phiên',
  bot_trades: 'Bot giao dịch',
  office_task_assigned: 'Văn phòng · Nhiệm vụ mới',
  office_task_approved: 'Văn phòng · Duyệt nhiệm vụ',
  office_task_returned: 'Văn phòng · Trả lại nhiệm vụ',
  office_task_submitted: 'Văn phòng · Chờ xác nhận',
  office_proposal_sent: 'Văn phòng · Đề xuất mới',
  office_proposal_replied: 'Văn phòng · Trả lời đề xuất',
};

/** Chỗ đặt link "Tắt thông báo này"; dispatcher thay bằng URL có token khi gửi. */
export const UNSUBSCRIBE_PLACEHOLDER = '{{UNSUBSCRIBE_URL}}';

/** Trang kết quả tắt thông báo ở frontend (gọi `POST /api/v2/notifications/unsubscribe`). */
export const UNSUBSCRIBE_PATH = '/thong-bao/tat';

/** Bot › tab Lịch sử (frontend đọc `bot_tab`). */
export const BOT_HISTORY_LINK = '/luyen-tap?tool=bot&bot_tab=lich-su';

/** Phân tích thị trường › tab Bản tin của ngày đó (`/thi-truong` chuyển tiếp, giữ tham số). */
export const bulletinLink = (tradeDate: string): string =>
  `/thi-truong?bt=ban-tin&date=${tradeDate}`;

export type NotificationText = { title: string; body: string; link: string };
export type EmailContent = { subject: string; html: string };

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const percent = (value: number): string => `${sg(value, 2)}%`;

// ───────────── Bản tin cuối phiên ─────────────

export function bulletinText(input: BulletinPublishedInput): NotificationText {
  return {
    title: `Bản tin cuối phiên ${dm(input.tradeDate)}`,
    body: `VN-Index ${nf(input.close, 2)} (${percent(input.changePct)}) · ${input.pickCount} mã trong 3 bộ lọc`,
    link: bulletinLink(input.tradeDate),
  };
}

export function bulletinEmail(input: BulletinPublishedInput, appUrl: string): EmailContent {
  const subject = `Bản tin cuối phiên ${dm(input.tradeDate)}: VN-Index ${nf(input.close, 2)} (${percent(input.changePct)})`;
  const rows: Array<[string, string]> = [
    ['VN-Index đóng cửa', nf(input.close, 2)],
    ['Thay đổi', `${sg(input.change, 2)} (${percent(input.changePct)})`],
    ['Khối lượng', input.volume === null ? '—' : `${nf(input.volume, 0)} cp`],
    ['Số mã trong 3 bộ lọc', String(input.pickCount)],
  ];
  const html = layout({
    heading: `Bản tin cuối phiên ${dm(input.tradeDate)}`,
    content: table(['', ''], rows, false),
    button: { label: 'Đọc bản tin', href: absolute(appUrl, bulletinLink(input.tradeDate)) },
    type: 'bulletin',
  });
  return { subject, html };
}

// ───────────── Bot giao dịch ─────────────

const TIME_EXIT = '(hết thời gian giữ)';

/** `Mua HPG, FPT · Bán VNM (hết thời gian giữ)` (T01). */
export function botTradesSummary(executions: readonly BotTradeExecution[]): string {
  const buys = unique(executions.filter((item) => item.side === 'buy').map((item) => item.symbol));
  const sells = executions.filter((item) => item.side === 'sell');
  const parts: string[] = [];
  if (buys.length) parts.push(`Mua ${buys.join(', ')}`);
  if (sells.length) {
    const timeExit = new Set(
      sells.filter((item) => item.reason === 'max_holding').map((item) => item.symbol),
    );
    const symbols = unique(sells.map((item) => item.symbol));
    const allTimeExit = symbols.every((symbol) => timeExit.has(symbol));
    const label = allTimeExit
      ? `${symbols.join(', ')} ${TIME_EXIT}`
      : symbols
          .map((symbol) => (timeExit.has(symbol) ? `${symbol} ${TIME_EXIT}` : symbol))
          .join(', ');
    parts.push(`Bán ${label}`);
  }
  return parts.join(' · ');
}

export function botTradesText(input: BotTradesNotificationInput): NotificationText {
  return {
    title: `Bot giao dịch · phiên ${dm(input.tradeDate)}`,
    body: botTradesSummary(input.executions).slice(0, 1000),
    link: BOT_HISTORY_LINK,
  };
}

const reasonLabel = (execution: BotTradeExecution): string =>
  execution.side === 'buy'
    ? 'Điều kiện Mua'
    : execution.reason === 'max_holding'
      ? 'Hết thời gian giữ'
      : 'Điều kiện Bán';

export function botTradesEmail(input: BotTradesNotificationInput, appUrl: string): EmailContent {
  const buys = unique(
    input.executions.filter((item) => item.side === 'buy').map((item) => item.symbol),
  );
  const sells = unique(
    input.executions.filter((item) => item.side === 'sell').map((item) => item.symbol),
  );
  const parts: string[] = [];
  if (buys.length) parts.push(`mua ${buys.join(', ')}`);
  if (sells.length) parts.push(`bán ${sells.join(', ')}`);
  const subject = `Bot giao dịch phiên ${dm(input.tradeDate)}: ${parts.join(', ')}`.slice(0, 300);
  const rows = input.executions.map((item): string[] => [
    item.side === 'buy' ? 'Mua' : 'Bán',
    item.symbol,
    nf(item.price, 0),
    nf(item.quantity, 0),
    reasonLabel(item),
  ]);
  const extra: string[] = [];
  if (input.strategyLabel)
    extra.push(
      `<p style="margin:12px 0 0">Chiến lược đang chạy: <b>${escapeHtml(input.strategyLabel)}</b></p>`,
    );
  if (input.navVnd !== undefined && input.navVnd !== null)
    extra.push(`<p style="margin:4px 0 0">Tài sản Bot: <b>${nf(input.navVnd, 0)} đ</b></p>`);
  const html = layout({
    heading: `Bot giao dịch phiên ${dm(input.tradeDate)}`,
    content: table(['Lệnh', 'Mã', 'Giá khớp', 'Khối lượng', 'Lý do'], rows, true) + extra.join(''),
    button: { label: 'Xem Bot', href: absolute(appUrl, BOT_HISTORY_LINK) },
    type: 'bot_trades',
  });
  return { subject, html };
}

// ───────────── khung email ─────────────

export function absolute(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/$/, '')}${path}`;
}

export function unsubscribeUrl(appUrl: string, token: string): string {
  return absolute(appUrl, `${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`);
}

function table(
  header: string[],
  rows: readonly (readonly string[])[],
  showHeader: boolean,
): string {
  const cell = 'padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:left';
  const head = showHeader
    ? `<tr>${header.map((item) => `<th style="${cell};font-weight:600">${escapeHtml(item)}</th>`).join('')}</tr>`
    : '';
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((item) => `<td style="${cell}">${escapeHtml(item)}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:14px">${head}${body}</table>`;
}

function layout(input: {
  heading: string;
  content: string;
  button: { label: string; href: string };
  type: NotificationType;
}): string {
  const disclaimer =
    input.type === 'bot_trades'
      ? 'Không phải khuyến nghị đầu tư. Giao dịch mô phỏng.'
      : 'Không phải khuyến nghị đầu tư.';
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:560px">',
    `<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(input.heading)}</h2>`,
    input.content,
    `<p style="margin:20px 0"><a href="${escapeHtml(input.button.href)}" style="background:#111827;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(input.button.label)}</a></p>`,
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />',
    `<p style="font-size:12px;color:#6b7280;margin:0">Bạn nhận email này vì đã bật thông báo ${escapeHtml(NOTIFICATION_TYPE_LABEL[input.type])}. <a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#6b7280">Tắt thông báo này</a></p>`,
    `<p style="font-size:12px;color:#6b7280;margin:4px 0 0">${disclaimer}</p>`,
    '</div>',
  ].join('');
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}
