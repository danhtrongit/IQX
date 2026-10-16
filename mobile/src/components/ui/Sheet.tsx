import { X } from 'lucide-react-native';
import { Modal, Platform, View } from 'react-native';
import type { ReactNode } from 'react';

import { useReducedMotion, useTheme } from '@/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

/** Bottom sheet: pageSheet on iOS, overlay sheet on Android. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { colors, spacing, radius, layout } = useTheme();
  const reduced = useReducedMotion();
  const ios = Platform.OS === 'ios';
  return (
    <Modal
      testID={testID}
      visible={visible}
      onRequestClose={onClose}
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle={ios ? 'pageSheet' : undefined}
      transparent={!ios}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: ios ? colors.background : 'rgba(0,0,0,0.6)' }}>
        <View
          style={{
            backgroundColor: colors.background,
            padding: layout.pagePadding,
            gap: spacing.md,
            flex: ios ? 1 : undefined,
            maxHeight: ios ? undefined : '85%',
            borderTopLeftRadius: ios ? 0 : radius.card,
            borderTopRightRadius: ios ? 0 : radius.card,
            borderTopWidth: ios ? 0 : 1,
            borderColor: colors.border,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="heading">{title ?? ''}</Text>
            <IconButton icon={X} accessibilityLabel="Đóng" onPress={onClose} testID={testID ? `${testID}-close` : 'sheet-close'} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
