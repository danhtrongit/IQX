import { Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, ErrorState, IconButton, Input, KeyValueRow, LoadingState, PanelState, Text, useSnackbar } from '@/components/ui';
import { SymbolPicker, useQuote } from '@/features/market';
import { errorMessage } from '@/lib/api';
import { formatNumber, formatVnd } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { sideLabel } from './api';
import { useActivateAccount, usePlaceOrder, useTradingAccount, useTradingPortfolio } from './hooks';
import { BOARD_LOT, QUICK_PERCENTS, checkOrderInput, estimateOrder, parseIntInput, quantityForPercent } from './order-math';
import type { OrderSide, OrderType } from './types';

function Segmented<T extends string>({
  items,
  value,
  onChange,
  testIDPrefix,
  label,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix: string;
  label: string;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        backgroundColor: colors.muted,
        borderRadius: radius.control,
        padding: 2,
      }}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <Pressable
            key={item.value}
            testID={`${testIDPrefix}-${item.value}`}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) haptics.selection();
              onChange(item.value);
            }}
            style={{
              flex: 1,
              minHeight: layout.inputHeight - 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.control,
              backgroundColor: selected ? colors.card : 'transparent',
            }}
          >
            <Text weight={selected ? 'semibold' : 'medium'} color={selected ? 'foreground' : 'mutedForeground'}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two-step order ticket: form → review → POST. Closes through `onDone`. */
export function OrderTicket({ initialSymbol, initialSide, onDone }: { initialSymbol: string; initialSide: OrderSide; onDone: () => void }) {
  const { spacing, colors } = useTheme();
  const snackbar = useSnackbar();
  const [symbol, setSymbol] = useState(initialSymbol);
  const [side, setSide] = useState<OrderSide>(initialSide);
  const [method, setMethod] = useState<OrderType>('market');
  const [qtyText, setQtyText] = useState('');
  const [limitText, setLimitText] = useState('');
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [formError, setFormError] = useState<string | null>(null);

  const quoteQuery = useQuote(symbol);
  const account = useTradingAccount();
  const portfolio = useTradingPortfolio();
  const activate = useActivateAccount();
  const place = usePlaceOrder();

  const quote = quoteQuery.data ?? null;
  const quantity = parseIntInput(qtyText) ?? 0;
  const limitPrice = parseIntInput(limitText);
  const sellable = portfolio.data?.positions.find((p) => p.symbol === symbol)?.quantity_sellable ?? 0;
  const refPrice = method === 'limit' ? limitPrice : (quote?.price ?? null);
  const estimate = estimateOrder({ side, quantity, price: refPrice });

  if (account.isPending) return <LoadingState testID="order-loading" />;
  if (account.isError) return <ErrorState error={account.error} onRetry={() => account.refetch()} />;
  if (!account.data) {
    return (
      <PanelState
        testID="order-no-account"
        title="Chưa có tài khoản Sân tập"
        message="Kích hoạt tài khoản để đặt lệnh giao dịch giả lập với vốn ảo."
        actionLabel={activate.isPending ? 'Đang kích hoạt…' : 'Kích hoạt tài khoản'}
        onAction={() =>
          activate.mutate(undefined, {
            onError: (e) => snackbar.error(errorMessage(e)),
          })
        }
      />
    );
  }

  const setQty = (n: number) => setQtyText(n > 0 ? String(n) : '');
  const step100 = (delta: number) => {
    setFormError(null);
    setQty(Math.max(0, Math.round(quantity / BOARD_LOT) * BOARD_LOT + delta));
  };

  const review = () => {
    const check = checkOrderInput({
      hasQuote: quote !== null,
      quantity,
      method,
      limitPrice,
    });
    if (!check.ok) {
      setFormError(check.message);
      return;
    }
    setFormError(null);
    setStep('review');
  };

  const confirm = async () => {
    try {
      const order = await place.mutateAsync({
        symbol,
        side,
        order_type: method,
        quantity,
        ...(method === 'limit' && limitPrice ? { limit_price_vnd: limitPrice } : {}),
      });
      if (order.status === 'rejected') {
        haptics.error();
        snackbar.error(order.rejection_reason ?? 'Lệnh bị từ chối');
      } else {
        haptics.success();
        snackbar.success(`Đã đặt lệnh ${sideLabel(side).toLowerCase()} ${formatNumber(quantity, 0)} ${symbol}`);
      }
      onDone();
    } catch (error) {
      haptics.error();
      snackbar.error(errorMessage(error));
    }
  };

  if (step === 'review') {
    const verb = side === 'buy' ? 'mua' : 'bán';
    return (
      <View style={{ gap: spacing.md }} testID="order-review">
        <Text variant="heading">{`Xem lại lệnh ${verb}`}</Text>
        <Card style={{ gap: spacing.xs }}>
          <KeyValueRow label="Mã" value={symbol} />
          <KeyValueRow label="Loại lệnh" value={method === 'market' ? 'Thị trường' : 'Giới hạn (LO)'} />
          <KeyValueRow label="Khối lượng" value={`${formatNumber(quantity, 0)} CP`} />
          <KeyValueRow label={method === 'limit' ? 'Giá đặt' : 'Giá ước tính'} value={formatVnd(refPrice)} />
          <KeyValueRow testID="order-review-gross" label="Giá trị ước tính" value={formatVnd(estimate?.gross)} />
          <KeyValueRow testID="order-review-fee" label="Phí (0,15%)" value={formatVnd(estimate?.fee)} />
          <KeyValueRow
            testID="order-review-total"
            label={side === 'buy' ? 'Tổng thanh toán' : 'Tổng nhận (chưa gồm thuế)'}
            value={formatVnd(estimate?.total)}
          />
        </Card>
        <Text variant="caption" color="mutedForeground">
          Giá trị chỉ mang tính ước tính; phí, thuế và giá khớp thực tế do hệ thống tính.
        </Text>
        <Button
          testID="order-confirm"
          title={`Xác nhận ${verb}`}
          variant={side === 'buy' ? 'primary' : 'destructive'}
          loading={place.isPending}
          onPress={confirm}
        />
        <Button testID="order-back" title="Chỉnh sửa" variant="outline" disabled={place.isPending} onPress={() => setStep('form')} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <SymbolPicker
        testID="order-symbol"
        value={symbol}
        onChange={(s) => {
          setSymbol(s);
          setFormError(null);
        }}
      />
      <Segmented
        label="Chiều lệnh"
        testIDPrefix="order-side"
        value={side}
        onChange={(v) => {
          setSide(v);
          setFormError(null);
        }}
        items={[
          { value: 'buy', label: 'MUA' },
          { value: 'sell', label: 'BÁN' },
        ]}
      />
      <Segmented
        label="Loại lệnh"
        testIDPrefix="order-type"
        value={method}
        onChange={(v) => {
          setMethod(v);
          setFormError(null);
        }}
        items={[
          { value: 'market', label: 'Thị trường' },
          { value: 'limit', label: 'Giới hạn' },
        ]}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="mutedForeground">
          {side === 'buy' ? `Sức mua: ${formatVnd(account.data.cash_available_vnd)}` : `Có thể bán: ${formatNumber(sellable, 0)} CP`}
        </Text>
        <Text variant="caption" color="mutedForeground">
          {quote ? `Giá: ${formatVnd(quote.price)}` : quoteQuery.isPending ? 'Đang tải giá…' : 'Không có giá'}
        </Text>
      </View>
      {method === 'limit' ? (
        <Input
          testID="order-limit-price"
          label="Giá đặt (VND)"
          keyboardType="number-pad"
          value={limitText}
          onChangeText={(t) => {
            setLimitText(t.replace(/[^\d]/g, ''));
            setFormError(null);
          }}
          placeholder={quote?.price ? String(quote.price) : '0'}
        />
      ) : null}
      <View style={{ gap: spacing.xs }}>
        <Text variant="label" color="mutedForeground">
          Khối lượng (bội số của 100)
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
          }}
        >
          <IconButton
            testID="order-qty-dec"
            icon={Minus}
            accessibilityLabel="Giảm 100 cổ phiếu"
            variant="outline"
            onPress={() => step100(-BOARD_LOT)}
          />
          <View style={{ flex: 1 }}>
            <Input
              testID="order-quantity"
              accessibilityLabel="Khối lượng"
              keyboardType="number-pad"
              value={qtyText}
              onChangeText={(t) => {
                setQtyText(t.replace(/[^\d]/g, ''));
                setFormError(null);
              }}
              placeholder="100"
              style={{ textAlign: 'center' }}
            />
          </View>
          <IconButton
            testID="order-qty-inc"
            icon={Plus}
            accessibilityLabel="Tăng 100 cổ phiếu"
            variant="outline"
            onPress={() => step100(BOARD_LOT)}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {QUICK_PERCENTS.map((percent) => (
            <Button
              key={percent}
              testID={`order-quick-${percent}`}
              title={`${percent}%`}
              size="sm"
              variant="outline"
              fullWidth
              style={{ flex: 1 }}
              onPress={() => {
                const q = quantityForPercent({
                  side,
                  percent,
                  price: method === 'limit' ? limitPrice : (quote?.price ?? null),
                  cashAvailable: account.data!.cash_available_vnd,
                  sellable,
                });
                if (q !== null) {
                  setQty(q);
                  setFormError(null);
                }
              }}
            />
          ))}
        </View>
      </View>
      {formError ? (
        <Text testID="order-error" variant="caption" color="statusError" accessibilityRole="alert">
          {formError}
        </Text>
      ) : null}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: spacing.md,
        }}
      >
        <Button testID="order-review-button" title="Xem lại lệnh" variant={side === 'buy' ? 'primary' : 'destructive'} onPress={review} />
      </View>
    </View>
  );
}
