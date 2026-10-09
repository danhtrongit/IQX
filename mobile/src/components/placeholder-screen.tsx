import { View } from 'react-native';

import { Card, Divider, EmptyState, ListRow, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

/** Temporary body for tab roots; feature teams replace the route files that use it. */
export function PlaceholderScreen({
  title,
  testID,
  sections = [],
}: {
  title: string;
  testID?: string;
  /** Planned sections of this tab (mobile/DESIGN.md §1), shown as "Đang phát triển" rows. */
  sections?: string[];
}) {
  const { spacing } = useTheme();
  return (
    <Screen scroll testID={testID}>
      <EmptyState title={title} message="Đang phát triển" />
      {sections.length ? (
        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          {sections.map((label, i) => (
            <View key={label}>
              {i > 0 ? <Divider /> : null}
              <ListRow title={label} subtitle="Đang phát triển" chevron testID={`${testID ?? 'placeholder'}-section-${i}`} />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
