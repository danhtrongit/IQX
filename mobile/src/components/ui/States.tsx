import { CircleAlert, Inbox, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, View, type DimensionValue } from 'react-native';

import { ApiError, errorMessage } from '@/lib/api';
import { useTheme } from '@/theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

/** Equivalent of the web PanelState: icon, title, message and an optional next action. */
export function PanelState({
  icon,
  tone = 'mutedForeground',
  title,
  message,
  detail,
  actionLabel,
  onAction,
  role,
  testID,
}: {
  icon?: LucideIcon;
  tone?: 'mutedForeground' | 'statusError';
  title: string;
  message?: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  role?: 'alert';
  testID?: string;
}) {
  const { spacing } = useTheme();
  return (
    <View testID={testID} accessibilityRole={role} style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}>
      {icon ? <Icon icon={icon} size={24} color={tone} /> : null}
      <Text variant="section" align="center">{title}</Text>
      {message ? <Text color="mutedForeground" align="center">{message}</Text> : null}
      {detail ? <Text variant="caption" color="mutedForeground" align="center">{detail}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="outline" fullWidth={false} testID={testID ? `${testID}-action` : undefined} />
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon = Inbox,
  testID,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  testID?: string;
}) {
  return <PanelState icon={icon} title={title} message={message} actionLabel={actionLabel} onAction={onAction} testID={testID} />;
}

export function ErrorState({
  error,
  title = 'Đã có lỗi xảy ra',
  onRetry,
  testID,
}: {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  testID?: string;
}) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <PanelState
      icon={CircleAlert}
      tone="statusError"
      role="alert"
      title={title}
      message={errorMessage(error)}
      detail={requestId ? `Mã yêu cầu: ${requestId}` : undefined}
      actionLabel={onRetry ? 'Thử lại' : undefined}
      onAction={onRetry}
      testID={testID}
    />
  );
}

export function LoadingState({ label = 'Đang tải…', testID }: { label?: string; testID?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View testID={testID} accessibilityLabel={label} accessibilityRole="progressbar" style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}>
      <ActivityIndicator color={colors.primary} />
      <Text variant="caption" color="mutedForeground">{label}</Text>
    </View>
  );
}

/** Static content-shaped placeholder block (no decorative animation). Compose to match the final layout. */
export function Skeleton({ width = '100%', height = 16, testID }: { width?: DimensionValue; height?: number; testID?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: radius.control, backgroundColor: colors.muted }}
    />
  );
}

/** Skeleton shaped like a list of two-line rows with a right-aligned number. */
export function SkeletonList({ rows = 5, testID }: { rows?: number; testID?: string }) {
  const { spacing } = useTheme();
  return (
    <View testID={testID} accessibilityRole="progressbar" accessibilityLabel="Đang tải" style={{ gap: spacing.md }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ gap: spacing.xs }}>
            <Skeleton width={96} height={14} />
            <Skeleton width={160} height={12} />
          </View>
          <Skeleton width={64} height={14} />
        </View>
      ))}
    </View>
  );
}
