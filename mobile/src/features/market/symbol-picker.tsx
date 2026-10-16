import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { Badge, ErrorState, Icon, Input, Sheet, SkeletonList, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { SymbolSearchResult } from './api';
import { useSymbolSearch } from './hooks';

/** Field that shows the selected ticker and opens a search sheet (HOSE/HNX/UPCOM stocks only). */
export function SymbolPicker({
  value,
  onChange,
  label = 'Mã cổ phiếu',
  testID = 'symbol-picker',
}: {
  value: string;
  onChange: (symbol: string, item?: SymbolSearchResult) => void;
  label?: string;
  testID?: string;
}) {
  const { colors, radius, spacing, layout } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text variant="label" color="mutedForeground">{label}</Text> : null}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'chưa chọn'}`}
        onPress={() => setOpen(true)}
        style={{
          minHeight: layout.inputHeight,
          borderWidth: 1,
          borderColor: colors.input,
          borderRadius: radius.control,
          paddingHorizontal: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.card,
        }}>
        <Icon icon={Search} color="mutedForeground" />
        <Text weight="semibold" color={value ? 'foreground' : 'mutedForeground'}>{value || 'Chọn mã'}</Text>
      </Pressable>
      <SymbolSearchSheet
        visible={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          setOpen(false);
          onChange(item.symbol, item);
        }}
        testID={`${testID}-sheet`}
      />
    </View>
  );
}

export function SymbolSearchSheet({
  visible,
  onClose,
  onSelect,
  testID = 'symbol-search',
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: SymbolSearchResult) => void;
  testID?: string;
}) {
  const { spacing, colors } = useTheme();
  const [query, setQuery] = useState('');
  const search = useSymbolSearch(query);
  return (
    <Sheet visible={visible} onClose={onClose} title="Tìm mã cổ phiếu" testID={testID}>
      <View style={{ gap: spacing.md, flex: 1 }}>
        <Input
          testID={`${testID}-input`}
          placeholder="Nhập mã hoặc tên, ví dụ FPT"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="characters"
          autoFocus
          accessibilityLabel="Tìm mã cổ phiếu"
        />
        {query.trim() === '' ? (
          <Text variant="caption" color="mutedForeground">Chỉ hiển thị cổ phiếu niêm yết trên HOSE, HNX, UPCOM.</Text>
        ) : search.isPending ? (
          <SkeletonList rows={5} />
        ) : search.isError ? (
          <ErrorState error={search.error} onRetry={() => search.refetch()} />
        ) : (
          <FlatList
            data={search.data ?? []}
            keyExtractor={(item) => item.symbol}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
            ListEmptyComponent={<Text color="mutedForeground">Không tìm thấy mã phù hợp.</Text>}
            renderItem={({ item }) => (
              <Pressable
                testID={`${testID}-item-${item.symbol}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.symbol} ${item.name ?? ''}`}
                onPress={() => {
                  setQuery('');
                  onSelect(item);
                }}
                style={({ pressed }) => ({ minHeight: 56, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md })}>
                <View style={{ flex: 1 }}>
                  <Text weight="semibold">{item.symbol}</Text>
                  <Text variant="caption" color="mutedForeground" numberOfLines={1}>{item.name ?? '—'}</Text>
                </View>
                {item.exchange ? <Badge label={item.exchange} /> : null}
              </Pressable>
            )}
          />
        )}
      </View>
    </Sheet>
  );
}
