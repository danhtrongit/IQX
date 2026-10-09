import { Fragment } from 'react';
import { useRouter } from 'expo-router';
import { Bell, Bot, FlaskConical, Library } from 'lucide-react-native';

import { Card, Divider, Icon, ListRow, Screen, Text } from '@/components/ui';

const ENTRIES = [
  { id: 'alerts', title: 'Cảnh báo', subtitle: 'Theo dõi tín hiệu kỹ thuật theo mã cổ phiếu.', href: '/strategy/alerts', icon: Bell },
  { id: 'backtest', title: 'Backtest', subtitle: 'Kiểm thử chiến lược trên dữ liệu lịch sử.', href: '/strategy/backtest', icon: FlaskConical },
  { id: 'library', title: 'Thư viện chỉ báo', subtitle: 'Bật, tắt và chỉnh tham số chỉ báo dùng chung cho Bot và Backtest.', href: '/strategy/library', icon: Library },
  { id: 'bot', title: 'Bot', subtitle: 'Theo dõi danh mục, giao dịch và nhật ký của Bot.', href: '/strategy/bot', icon: Bot },
] as const;

export default function StrategyHub() {
  const router = useRouter();
  return (
    <Screen scroll testID="strategy-screen">
      <Text color="mutedForeground">Theo dõi tín hiệu, kiểm thử chiến lược và sàng lọc doanh nghiệp.</Text>
      <Card>
        {ENTRIES.map((e, i) => (
          <Fragment key={e.id}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              title={e.title}
              subtitle={e.subtitle}
              left={<Icon icon={e.icon} color="primary" />}
              chevron
              testID={`strategy-hub-${e.id}`}
              onPress={() => router.push(e.href as never)}
            />
          </Fragment>
        ))}
      </Card>
    </Screen>
  );
}
