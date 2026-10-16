import { formatDate } from '@/lib/format';
import type { AlertSide, AlertStatus, AlertVersion, StrategyAlert } from './types';

export const STATUS_LABEL: Record<AlertStatus, string> = {
  watching: 'Đang theo dõi',
  paused: 'Tạm dừng',
  unchecked: 'Chưa kiểm tra',
  waiting_data: 'Chờ dữ liệu',
  config_error: 'Lỗi cấu hình/quyền',
};

export const STATUS_HINT: Record<AlertStatus, string> = {
  watching: 'Đã có ít nhất một lần kiểm tra cuối phiên hợp lệ.',
  paused: 'Không phát tín hiệu mới cho tới khi bật lại.',
  unchecked: 'Đã bật, chưa có lần kiểm tra cuối phiên nào.',
  waiting_data: 'Lần kiểm tra gần nhất chưa đánh giá được một số mã vì thiếu dữ liệu.',
  config_error: 'Có tổ hợp bị chặn do chưa mở chỉ báo hoặc cấu hình đã ghim không hợp lệ.',
};

export const SIDE_LABEL: Record<AlertSide, string> = { buy: 'Mua', sell: 'Bán' };

export type StatusTone = 'success' | 'neutral' | 'info' | 'warning' | 'danger';
export const STATUS_TONE: Record<AlertStatus, StatusTone> = {
  watching: 'success',
  paused: 'neutral',
  unchecked: 'info',
  waiting_data: 'warning',
  config_error: 'danger',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status as AlertStatus] ?? status;
}

export function sourceCaption(version: AlertVersion): string {
  const s = version.source;
  if (s.kind === 'shared_config') return `Cấu hình chung · bản ${s.revision}`;
  return `Kết quả backtest ${s.symbol} · ${formatDate(s.start)} đến ${formatDate(s.end)} · cấu hình bản ${s.shared_revision}`;
}

export function scopeTitle(version: AlertVersion): string {
  if (version.scope.kind === 'saved_list') return `Danh mục: ${version.scope.list_name}`;
  return version.symbols.length === 1 ? 'Một mã' : `${version.symbols.length} mã`;
}

export function pinnedRevision(version: AlertVersion): number {
  return version.source.kind === 'shared_config' ? version.source.revision : version.source.shared_revision;
}

export function lastCheckText(alert: StrategyAlert): string {
  const { session, pairs_expected: expected, pairs_checked: checked } = alert.last_check;
  if (!session) return 'Chưa có lần kiểm tra';
  return `Đã kiểm tra ${formatDate(session)} · ${checked}/${expected} tổ hợp`;
}

export function symbolSummary(symbols: readonly string[], max = 8): string {
  const head = symbols.slice(0, max).join(' · ');
  return symbols.length > max ? `${head} · +${symbols.length - max} mã` : head;
}
