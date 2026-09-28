import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { TradingFeature } from '../../features/trading';
import { Button, Heading, Muted, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { api, createIdempotencyKey } from '../../lib/api';
import type { PaperPortfolio, Position } from '../../features/trading';

type RawPortfolio = {
  nav_vnd?: number;
  total_unrealized_pnl_vnd?: number;
  account?: { cash_available_vnd?: number; total_cash_vnd?: number };
  positions?: Array<Record<string, unknown>>;
};

function adaptPortfolio(value: RawPortfolio): { portfolio: PaperPortfolio; positions: Position[] } {
  const numberValue = (input: unknown): number | undefined => {
    const parsed = typeof input === 'number' ? input : typeof input === 'string' ? Number(input) : NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    portfolio: {
      currency: 'VND',
      equity: value.nav_vnd,
      buyingPower: numberValue(value.account?.cash_available_vnd),
      dayChange: numberValue(value.total_unrealized_pnl_vnd),
    },
    positions: (value.positions ?? []).map((position) => ({
      symbol: String(position.symbol ?? ''),
      quantity: numberValue(position.quantity_total) ?? '',
      averagePrice: numberValue(position.avg_cost_vnd),
      marketValue: numberValue(position.market_value_vnd),
      unrealizedChange: numberValue(position.unrealized_pnl_vnd),
    })).filter((position) => position.symbol.length > 0),
  };
}

export default function TradingScreen() {
  const { user } = useAuth();
  const account = useQuery({ queryKey: ['virtual-trading', 'account'], enabled: !!user, queryFn: () => api('virtual-trading/account') });
  const portfolio = useQuery({ queryKey: ['virtual-trading', 'portfolio'], enabled: !!user && account.isSuccess, queryFn: () => api<RawPortfolio>('virtual-trading/portfolio') });
  const activate = useMutation({ mutationFn: () => api('virtual-trading/account/activate', { method: 'POST', idempotencyKey: createIdempotencyKey('virtual-account-activate') }), onSuccess: () => void account.refetch() });
  const adapted = portfolio.data ? adaptPortfolio(portfolio.data) : undefined;
  const status = !user ? 'error' : account.isPending || portfolio.isPending ? 'loading' : adapted ? 'ready' : 'empty';
  return <Screen><ScrollView contentContainerStyle={styles.content}><Heading>Mô phỏng giao dịch</Heading><Muted style={styles.subtitle}>Thực hành quy trình với dữ liệu mô phỏng. Không có lệnh hoặc tiền thật.</Muted><TradingFeature status={status} portfolio={adapted?.portfolio} positions={adapted?.positions} onRetry={() => { void account.refetch(); void portfolio.refetch(); }} />{!user && <Button onPress={() => router.push('/auth/sign-in')}>Đăng nhập để bắt đầu</Button>}{user && !account.isPending && account.isError && <Button disabled={activate.isPending} onPress={() => activate.mutate()}>{activate.isPending ? 'Đang kích hoạt…' : 'Kích hoạt tài khoản mô phỏng'}</Button>}</ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingVertical: 24, paddingBottom: 32 }, subtitle: { marginTop: 6, marginBottom: 16 } });
