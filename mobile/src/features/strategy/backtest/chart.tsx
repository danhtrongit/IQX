import { useMemo, useRef, useState } from 'react';
import { PanResponder, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme';
import { fmtSignedPercent } from '../shared/format';
import { buildChartModel, indexAtX, linePath, makeScale } from './chart-math';
import type { BacktestResult } from './types';

const HEIGHT = 240;
const PAD = { l: 44, r: 8, t: 8, b: 20 };

function Legend({ color, label, dash }: { color: string; label: string; dash?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Svg width={22} height={6}>
        <Line x1={0} y1={3} x2={22} y2={3} stroke={color} strokeWidth={2} strokeDasharray={dash} />
      </Svg>
      <Text variant="caption" color="mutedForeground">{label}</Text>
    </View>
  );
}

/** Return-% chart: strategy solid, buy&hold dashed, VN-Index dotted; scrub with pan or long-press. */
export function BacktestChart({ result, symbol }: { result: BacktestResult; symbol: string }) {
  const { colors, spacing } = useTheme();
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const model = useMemo(() => buildChartModel(result), [result]);
  const count = model.points.length;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: (e) => setCursor(indexAtX(e.nativeEvent.locationX, count, width, PAD.l, PAD.r)),
        onPanResponderMove: (e) => setCursor(indexAtX(e.nativeEvent.locationX, count, width, PAD.l, PAD.r)),
        onPanResponderRelease: () => setCursor(null),
        onPanResponderTerminate: () => setCursor(null),
        onPanResponderTerminationRequest: () => false,
      }),
    [count, width],
  );
  const onTouchStart = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    timer.current = setTimeout(() => setCursor(indexAtX(x, count, width, PAD.l, PAD.r)), 350);
  };
  const onTouchEnd = () => {
    if (timer.current) clearTimeout(timer.current);
    setCursor(null);
  };

  const scale = makeScale(model, width, HEIGHT, PAD);
  const zeroY = scale.y(0);
  const pt = cursor !== null ? model.points[cursor] : null;
  const ticks = [model.max, (model.max + model.min) / 2, model.min];

  return (
    <View style={{ gap: spacing.sm }} testID="strategy-backtest-chart">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <Legend color={colors.chart1} label={`Chiến lược ${symbol}`} />
        <Legend color={colors.mutedForeground} label={`Mua và giữ ${symbol}`} dash="6 4" />
        {model.hasMarket ? <Legend color={colors.chart3} label="VN-Index" dash="2 3" /> : null}
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        {...pan.panHandlers}
        accessibilityLabel="Biểu đồ lợi nhuận chiến lược"
        style={{ minHeight: HEIGHT, height: HEIGHT }}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {ticks.map((t, i) => (
              <SvgText key={i} x={PAD.l - 4} y={scale.y(t) + 4} fontSize={10} fill={colors.mutedForeground} textAnchor="end">
                {`${Math.round(t)}%`}
              </SvgText>
            ))}
            <Line x1={PAD.l} y1={zeroY} x2={width - PAD.r} y2={zeroY} stroke={colors.border} strokeWidth={1} />
            <Path d={linePath(model.points, 'buy_hold_pct', scale)} stroke={colors.mutedForeground} strokeWidth={1.5} strokeDasharray="6 4" fill="none" />
            {model.hasMarket ? (
              <Path d={linePath(model.points, 'market_pct', scale)} stroke={colors.chart3} strokeWidth={1.5} strokeDasharray="2 3" fill="none" />
            ) : null}
            <Path d={linePath(model.points, 'return_pct', scale)} stroke={colors.chart1} strokeWidth={2} fill="none" />
            {cursor !== null ? (
              <Line x1={scale.x(cursor)} y1={PAD.t} x2={scale.x(cursor)} y2={HEIGHT - PAD.b} stroke={colors.foreground} strokeWidth={1} />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View style={{ minHeight: 36 }} testID="strategy-backtest-chart-readout">
        {pt ? (
          <Text variant="mono">
            {formatDate(pt.date)} · Chiến lược {fmtSignedPercent(pt.return_pct)} · Mua và giữ {fmtSignedPercent(pt.buy_hold_pct)}
            {model.hasMarket ? ` · VN-Index ${fmtSignedPercent(pt.market_pct)}` : ''}
          </Text>
        ) : (
          <Text variant="caption" color="mutedForeground">Chạm giữ hoặc kéo ngang trên biểu đồ để xem từng ngày.</Text>
        )}
      </View>
    </View>
  );
}
