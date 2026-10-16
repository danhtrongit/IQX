import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';

import { LoadingState, PanelState } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export const FEATURE_DISABLED_COPY = {
  title: 'Tính năng chưa được bật',
  message: 'Trang Chiến lược mới chưa được bật trên máy chủ này. Dữ liệu của bạn vẫn được giữ nguyên; vui lòng quay lại sau.',
};

export function FeatureDisabledState() {
  return <PanelState testID="alerts-feature-disabled" title={FEATURE_DISABLED_COPY.title} message={FEATURE_DISABLED_COPY.message} />;
}

/** Login / Premium gate for the alerts screens. Premium content is never rendered otherwise. */
export function AlertsGate({ children }: { children: ReactNode }) {
  const { status, isPremium } = useAuth();
  const router = useRouter();
  if (status === 'loading') return <LoadingState testID="alerts-gate-loading" />;
  if (status !== 'authenticated') {
    return (
      <PanelState
        testID="alerts-gate-login"
        title="Cần đăng nhập"
        message="Cảnh báo, Backtest và Bộ lọc dành cho tài khoản IQX. Đăng nhập để tiếp tục: tiến độ học của bạn không bị ảnh hưởng."
        actionLabel="Đăng nhập"
        onAction={() => router.push('/login' as never)}
      />
    );
  }
  if (!isPremium) {
    return (
      <PanelState
        testID="alerts-gate-premium"
        title="Cần gói Premium"
        message="Cảnh báo tín hiệu kỹ thuật, Backtest chiến lược và Bộ lọc doanh nghiệp chỉ dành cho tài khoản Premium."
      />
    );
  }
  return <>{children}</>;
}
