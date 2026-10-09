import type { BadgeTone } from '@/components/ui';

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ khớp',
  filled: 'Đã khớp',
  cancelled: 'Đã huỷ',
  expired: 'Hết hạn',
  rejected: 'Từ chối',
};

export const ORDER_STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'info',
  filled: 'success',
  cancelled: 'neutral',
  expired: 'warning',
  rejected: 'danger',
};

export const ORDER_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chờ khớp' },
  { value: 'filled', label: 'Đã khớp' },
  { value: 'cancelled', label: 'Đã huỷ' },
  { value: 'expired', label: 'Hết hạn' },
  { value: 'rejected', label: 'Từ chối' },
] as const;
