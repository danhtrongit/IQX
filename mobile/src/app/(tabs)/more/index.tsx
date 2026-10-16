import { useRouter } from 'expo-router';
import { View } from 'react-native';
import Constants from 'expo-constants';

import { Badge, Button, Card, confirmDialog, Divider, ListRow, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

export default function MoreScreen() {
  const { user, isPremium, logout } = useAuth();
  const { spacing } = useTheme();
  const router = useRouter();

  async function onLogout() {
    const ok = await confirmDialog({ title: 'Đăng xuất', message: 'Bạn có chắc muốn đăng xuất?', confirmLabel: 'Đăng xuất', destructive: true });
    if (ok) await logout();
  }

  return (
    <Screen scroll testID="more-screen">
      <Card testID="more-account" style={{ gap: spacing.xs }}>
        <Text variant="heading" testID="more-name">{user?.full_name || 'Tài khoản IQX'}</Text>
        <Text color="mutedForeground" testID="more-email">{user?.email}</Text>
        <View style={{ marginTop: spacing.xs }}>
          <Badge testID="more-premium-badge" label={isPremium ? 'Premium' : 'Miễn phí'} tone={isPremium ? 'accent' : 'neutral'} />
        </View>
      </Card>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow title="Cửa hàng" subtitle="Xu học tập và linh thú" chevron testID="more-shop" onPress={() => router.push('/more/shop')} />
        <Divider />
        <ListRow title="Phiên bản ứng dụng" testID="more-version" right={<Text variant="mono" color="mutedForeground">{Constants.expoConfig?.version ?? '—'}</Text>} />
      </Card>
      <Button testID="more-logout" title="Đăng xuất" variant="destructive" onPress={onLogout} />
    </Screen>
  );
}
