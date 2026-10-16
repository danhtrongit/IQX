import { Stack } from 'expo-router';
import { Coins } from 'lucide-react-native';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { Badge, Button, Card, confirmDialog, Divider, ErrorState, Icon, LoadingState, Text, useSnackbar, Screen } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { formatDateTime } from '@/lib/format';
import { useTheme } from '@/theme';
import type { CatalogEntry, LedgerItem, ShopState } from './api';
import { useActivateMascot, usePurchase, useShopLedger, useShopState, type PurchasePhase } from './hooks';
import { deriveCardState, formatSignedXu, formatXu, ledgerRowLabel, RETRY_MESSAGE, SHOP_COPY, sortedCatalog, UNVERIFIED_MESSAGE, type CardState } from './model';

/** Mascot art is a web-only asset (/assets/mascots-2d), so the app shows a placeholder avatar. */
function MascotAvatar({ name }: { name: string }) {
  const { colors, radius } = useTheme();
  return (
    <View accessibilityElementsHidden style={{ width: 56, height: 56, borderRadius: radius.card, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="heading" color="mutedForeground">{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function stateBadge(state: CardState): { label: string; tone: 'accent' | 'success' | 'neutral' | 'warning' } | null {
  switch (state) {
    case 'active':
      return { label: SHOP_COPY.wearing, tone: 'primary' };
    case 'owned':
      return { label: SHOP_COPY.owned, tone: 'success' };
    case 'unavailable':
      return { label: SHOP_COPY.unavailable, tone: 'warning' };
    default:
      return null;
  }
}

function MascotCard({
  entry,
  state,
  busy,
  onBuy,
  onUse,
  activating,
}: {
  entry: CatalogEntry;
  state: ShopState;
  busy: boolean;
  onBuy: () => void;
  onUse: () => void;
  activating: boolean;
}) {
  const { spacing } = useTheme();
  const cs = deriveCardState(entry, state);
  const badge = stateBadge(cs);
  return (
    <Card testID={`shop-mascot-${entry.mascot_id}`} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <MascotAvatar name={entry.name} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="section">{entry.name}</Text>
          {badge ? <Badge label={badge.label} tone={badge.tone} testID={`shop-mascot-${entry.mascot_id}-state`} /> : <Text variant="mono" color="mutedForeground">{`${formatXu(entry.price_xu)} xu`}</Text>}
        </View>
        {cs === 'buy' || cs === 'short' ? (
          <Button
            testID={`shop-buy-${entry.mascot_id}`}
            title={cs === 'buy' ? `${SHOP_COPY.buy} · ${formatXu(entry.price_xu)} xu` : SHOP_COPY.short}
            variant={cs === 'buy' ? 'default' : 'secondary'}
            disabled={cs === 'short' || busy}
            fullWidth={false}
            size="sm"
            onPress={onBuy}
          />
        ) : cs === 'owned' ? (
          <Button testID={`shop-use-${entry.mascot_id}`} title={SHOP_COPY.use} variant="outline" size="sm" fullWidth={false} loading={activating} disabled={busy} onPress={onUse} />
        ) : null}
      </View>
    </Card>
  );
}

function phaseMessage(phase: PurchasePhase): { text: string; tone: 'info' | 'error' | 'success' } | null {
  switch (phase.kind) {
    case 'pending':
      return { text: 'Đang xử lý giao dịch…', tone: 'info' };
    case 'verifying':
      return { text: 'Chưa nhận được phản hồi. Đang kiểm tra xem giao dịch đã được ghi nhận chưa…', tone: 'info' };
    case 'unverified':
      return { text: UNVERIFIED_MESSAGE, tone: 'error' };
    case 'retry':
      return { text: RETRY_MESSAGE, tone: 'error' };
    case 'notice':
    case 'blocked':
      return { text: phase.message, tone: 'error' };
    case 'done':
      return { text: phase.status === 'already_owned' ? SHOP_COPY.alreadyOwnedNoCharge : `Đã thêm vào bộ sưu tập. Xu còn lại: ${formatXu(phase.balanceAfter)} xu.`, tone: 'success' };
    default:
      return null;
  }
}

function LedgerRow({ item }: { item: LedgerItem }) {
  const { spacing, colors } = useTheme();
  return (
    <View testID={`shop-ledger-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flex: 1 }}>
        <Text>{ledgerRowLabel(item)}</Text>
        <Text variant="caption" color="mutedForeground">{formatDateTime(item.created_at)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text variant="mono" color={item.delta >= 0 ? 'statusSuccess' : 'statusError'} style={{ textAlign: 'right' }}>{`${formatSignedXu(item.delta)} xu`}</Text>
        <Text variant="caption" color="mutedForeground" style={{ textAlign: 'right' }}>{`Còn ${formatXu(item.balance_after)}`}</Text>
      </View>
    </View>
  );
}

/** /more/shop: xu balance, mascot catalog, purchase + activate flows and the coin ledger. */
export function ShopScreen() {
  const { spacing } = useTheme();
  const snackbar = useSnackbar();
  const shop = useShopState();
  const ledger = useShopLedger(!!shop.data);
  const purchase = usePurchase();
  const { activate, pendingId } = useActivateMascot();
  const state = shop.data;
  const items = ledger.data?.pages.flatMap((p) => p.items) ?? [];

  async function onBuy(entry: CatalogEntry) {
    if (!state) return;
    const ok = await confirmDialog({
      title: `Mua ${entry.name}`,
      message: `Giá ${formatXu(entry.price_xu)} xu. Số dư sau khi mua: ${formatXu(state.wallet.balance - entry.price_xu)} xu.\nMua một lần, đổi sử dụng miễn phí.`,
      confirmLabel: `Mua · ${formatXu(entry.price_xu)} xu`,
    });
    if (!ok) return;
    const outcome = await purchase.buy(entry, state);
    if (outcome?.kind === 'done') haptics.success();
    else if (outcome) haptics.error();
  }

  async function onUse(entry: CatalogEntry) {
    const result = await activate(entry);
    if (result.ok) {
      haptics.success();
      snackbar.success(`Đang sử dụng ${entry.name}`);
    } else {
      haptics.error();
      snackbar.error(result.message);
    }
  }

  const msg = phaseMessage(purchase.phase);
  const header = state ? (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <Card testID="shop-balance-card" style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon icon={Coins} color="chart2" />
          <Text variant="caption" color="mutedForeground">Số dư xu</Text>
        </View>
        <Text variant="title" testID="shop-balance">{`${formatXu(state.wallet.balance)} xu`}</Text>
        <Text variant="caption" color="mutedForeground">{`Đã sở hữu ${state.owned_count}/${state.total_count} linh thú`}</Text>
      </Card>
      {msg ? (
        <View testID="shop-purchase-status" accessibilityRole={msg.tone === 'error' ? 'alert' : undefined} style={{ gap: spacing.sm }}>
          <Text variant="dense" color={msg.tone === 'error' ? 'statusError' : msg.tone === 'success' ? 'statusSuccess' : 'mutedForeground'}>{msg.text}</Text>
          {purchase.phase.kind === 'unverified' ? <Button testID="shop-recheck" title="Kiểm tra lại" variant="outline" size="sm" fullWidth={false} onPress={() => void purchase.recheck()} /> : null}
        </View>
      ) : null}
      <View style={{ gap: spacing.sm }} testID="shop-catalog">
        <Text variant="heading">Linh thú</Text>
        {sortedCatalog(state).map((entry) => (
          <MascotCard key={entry.mascot_id} entry={entry} state={state} busy={purchase.busy || pendingId !== null} activating={pendingId === entry.mascot_id} onBuy={() => void onBuy(entry)} onUse={() => void onUse(entry)} />
        ))}
      </View>
      <Divider />
      <Text variant="heading">{SHOP_COPY.history}</Text>
    </View>
  ) : null;

  return (
    <Screen testID="shop-screen" padded={false}>
      <Stack.Screen options={{ title: SHOP_COPY.title }} />
      {shop.isPending ? (
        <LoadingState testID="shop-loading" />
      ) : shop.isError || !state ? (
        <ErrorState title={SHOP_COPY.loadFailed} error={shop.error} onRetry={() => shop.refetch()} testID="shop-error" />
      ) : (
        <FlatList
          testID="shop-list"
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <LedgerRow item={item} />}
          contentContainerStyle={{ padding: spacing.md }}
          ListHeaderComponent={header}
          ListEmptyComponent={ledger.isPending ? <ActivityIndicator /> : <Text color="mutedForeground" testID="shop-ledger-empty">Chưa có giao dịch xu nào.</Text>}
          ListFooterComponent={ledger.isFetchingNextPage ? <ActivityIndicator style={{ padding: spacing.lg }} /> : null}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (ledger.hasNextPage && !ledger.isFetchingNextPage) void ledger.fetchNextPage();
          }}
          refreshing={shop.isRefetching}
          onRefresh={() => {
            void shop.refetch();
            void ledger.refetch();
          }}
        />
      )}
    </Screen>
  );
}
