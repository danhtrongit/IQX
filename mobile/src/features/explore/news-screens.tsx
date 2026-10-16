import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Newspaper, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, View } from 'react-native';

import { Badge, Card, EmptyState, ErrorState, Icon, Screen, SkeletonList, Text, type BadgeTone } from '@/components/ui';
import { SymbolSearchSheet } from '@/features/market';
import { formatDateTime } from '@/lib/format';
import { useTheme } from '@/theme';
import { SENTIMENT_OPTIONS, sentimentLabel, type NewsItem, type NewsSentiment } from './api';
import { useNews, useNewsArticle } from './hooks';

export function sentimentTone(value: string | null): BadgeTone {
  switch (value?.toLowerCase()) {
    case 'positive':
      return 'success';
    case 'negative':
      return 'danger';
    default:
      return 'neutral';
  }
}

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: spacing.md,
        justifyContent: 'center',
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : 'transparent',
      }}>
      <Text variant="label" color={selected ? 'primaryForeground' : 'foreground'}>{label}</Text>
    </Pressable>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const router = useRouter();
  const { spacing, radius, colors } = useTheme();
  const label = sentimentLabel(item.sentiment);
  return (
    <Pressable
      testID={`news-card-${item.slug}`}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => router.push(`/trade/news/${encodeURIComponent(item.slug)}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card padded={false}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: 160, backgroundColor: colors.muted }} resizeMode="cover" />
        ) : null}
        <View style={{ padding: spacing.md, gap: spacing.xs }}>
          <Text variant="section" numberOfLines={3}>{item.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
            {item.ticker ? <Badge label={item.ticker} tone="primary" /> : null}
            {label ? <Badge label={label} tone={sentimentTone(item.sentiment)} /> : null}
            <Text variant="caption" color="mutedForeground" style={{ borderRadius: radius.control }}>
              {[item.sourceName, item.updatedAt ? formatDateTime(item.updatedAt) : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/** /trade/news: paged AI news with sentiment + ticker filters. */
export function NewsScreen() {
  const { spacing } = useTheme();
  const [sentiment, setSentiment] = useState<NewsSentiment>('all');
  const [ticker, setTicker] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const news = useNews(ticker, sentiment);
  const items = news.data?.pages.flatMap((p) => p.items) ?? [];

  const header = (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {SENTIMENT_OPTIONS.map((o) => (
          <Chip key={o.value} testID={`news-sentiment-${o.value}`} label={o.label} selected={sentiment === o.value} onPress={() => setSentiment(o.value)} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          testID="news-ticker-filter"
          accessibilityRole="button"
          accessibilityLabel={ticker ? `Mã: ${ticker}` : 'Lọc theo mã'}
          onPress={() => setPickerOpen(true)}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm }}>
          <Icon icon={Search} color="mutedForeground" />
          <Text variant="label">{ticker ? `Mã: ${ticker}` : 'Lọc theo mã'}</Text>
        </Pressable>
        {ticker ? (
          <Pressable testID="news-ticker-clear" accessibilityRole="button" accessibilityLabel="Bỏ lọc mã" onPress={() => setTicker('')} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon icon={X} color="mutedForeground" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <Screen testID="news-screen">
      <Stack.Screen options={{ title: 'Tin tức AI' }} />
      {news.isPending ? (
        <View style={{ gap: spacing.md }}>
          {header}
          <SkeletonList rows={5} testID="news-loading" />
        </View>
      ) : (
        <FlatList
          testID="news-list"
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <NewsCard item={item} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            news.isError ? (
              <ErrorState error={news.error} onRetry={() => news.refetch()} testID="news-error" />
            ) : (
              <EmptyState icon={Newspaper} title="Không có tin phù hợp" message="Thử đổi bộ lọc tín hiệu hoặc mã cổ phiếu." testID="news-empty" />
            )
          }
          ListFooterComponent={news.isFetchingNextPage ? <ActivityIndicator style={{ padding: spacing.lg }} /> : null}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (news.hasNextPage && !news.isFetchingNextPage) void news.fetchNextPage();
          }}
          refreshing={news.isRefetching && !news.isFetchingNextPage}
          onRefresh={() => news.refetch()}
        />
      )}
      <SymbolSearchSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => {
          setPickerOpen(false);
          setTicker(item.symbol);
        }}
        testID="news-ticker-sheet"
      />
    </Screen>
  );
}

/** /trade/news/[slug]: summary + full text. */
export function NewsDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { spacing, colors } = useTheme();
  const article = useNewsArticle(decodeURIComponent(String(slug ?? '')));
  const data = article.data;
  const label = data ? sentimentLabel(data.sentiment) : null;
  return (
    <Screen scroll testID="news-detail-screen">
      <Stack.Screen options={{ title: 'Tin tức' }} />
      {article.isPending ? (
        <SkeletonList rows={6} />
      ) : article.isError ? (
        <ErrorState error={article.error} onRetry={() => article.refetch()} />
      ) : !data ? (
        <EmptyState title="Không tìm thấy bài viết" testID="news-detail-empty" />
      ) : (
        <View style={{ gap: spacing.md }}>
          {data.imageUrl ? <Image source={{ uri: data.imageUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: 200, backgroundColor: colors.muted }} resizeMode="cover" /> : null}
          <Text variant="heading" testID="news-detail-title">{data.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
            {data.ticker ? <Badge label={data.ticker} tone="primary" /> : null}
            {label ? <Badge label={label} tone={sentimentTone(data.sentiment)} /> : null}
            <Text variant="caption" color="mutedForeground">{[data.sourceName, data.updatedAt ? formatDateTime(data.updatedAt) : null].filter(Boolean).join(' · ')}</Text>
          </View>
          {data.summary ? <Text weight="medium" testID="news-detail-summary">{data.summary}</Text> : null}
          {data.body && data.body !== data.summary ? <Text testID="news-detail-body">{data.body}</Text> : null}
        </View>
      )}
    </Screen>
  );
}
