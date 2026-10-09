import type { BotConditions, BotSession } from './types';

export const ACTION_LABEL: Record<string, string> = { buy: 'Mua', sell: 'Bán', hold: 'Giữ', skip: 'Bỏ qua' };

export const CONFIG_STATE_LABEL: Record<string, string> = {
  waiting_for_conditions: 'Chờ thiết lập điều kiện',
  buy_only: 'Đã bật điều kiện Mua',
  sell_only: 'Chỉ xét điều kiện Bán',
  buy_and_sell: 'Đã bật Mua và Bán',
  error: 'Lỗi cấu hình hoặc quyền',
};

export const NEW_BUYS_OFF_NOTE = 'Bot đang tạm dừng mua mới.';
export const NOT_READY_COPY = 'Tài khoản Bot chưa sẵn sàng. Mở màn này không tạo Bot hoặc cấp vốn; hãy làm mới sau ít phút.';

export function configStateLabel(c: BotConditions | null | undefined): string {
  if (!c) return '—';
  return (c.state && CONFIG_STATE_LABEL[c.state]) || c.state_label || '—';
}

export function sourceText(kind?: string | null, name?: string | null, revision?: number | null): string {
  if (kind === 'vn30') return 'VN30';
  if (kind === 'custom') return name ? `${name}${revision != null ? ` · bản ${revision}` : ''}` : 'Danh mục riêng';
  return '—';
}

/** "Mua 1 · Bán 0 · reason ×n" style summary of one journal session. */
export function sessionSummary(s: BotSession): string {
  const c = s.counts ?? {};
  const parts = [`Mua ${c.buy ?? 0}`, `Bán ${c.sell ?? 0}`];
  if (c.hold) parts.push(`Giữ ${c.hold}`);
  if (c.skip) parts.push(`Bỏ qua ${c.skip}`);
  return parts.join(' · ');
}

export function runStatusNote(status?: string | null): string | null {
  if (status === 'running') return 'Đang xử lý';
  if (status === 'failed') return 'Lỗi xử lý';
  return null;
}
