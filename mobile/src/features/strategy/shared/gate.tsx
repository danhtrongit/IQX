import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { FEATURE_DISABLED_COPY, isFeatureDisabled } from './errors';

type GateProps = {
  children: ReactNode;
  /** An error from the feature's queries; FEATURE_DISABLED switches to the disabled state. */
  error?: unknown;
  testID?: string;
};

/** Strategy features are for signed-in Premium accounts (web strategy-premium-gate.tsx). */
export function StrategyGate({ children, error, testID = 'strategy-gate' }: GateProps) {
  const { status, isPremium } = useAuth();
  const router = useRouter();
  if (status === 'loading') return <LoadingState testID={`${testID}-loading`} />;
  if (status !== 'authenticated') {
    return (
      <EmptyState
        testID={`${testID}-login`}
        title="Cần đăng nhập"
        message="Cảnh báo, Backtest và Bộ lọc dành cho tài khoản IQX. Đăng nhập để tiếp tục: tiến độ học của bạn không bị ảnh hưởng."
        actionLabel="Đăng nhập"
        onAction={() => router.push('/login' as never)}
      />
    );
  }
  if (!isPremium) {
    return (
      <EmptyState
        testID={`${testID}-premium`}
        title="Cần gói Premium"
        message="Cảnh báo tín hiệu kỹ thuật, Backtest chiến lược và Bộ lọc doanh nghiệp chỉ dành cho tài khoản Premium."
      />
    );
  }
  if (isFeatureDisabled(error)) {
    return <EmptyState testID={`${testID}-disabled`} title={FEATURE_DISABLED_COPY.title} message={FEATURE_DISABLED_COPY.description} />;
  }
  return <>{children}</>;
}

export { Button, ErrorState };
