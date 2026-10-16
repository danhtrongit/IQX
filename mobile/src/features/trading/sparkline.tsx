import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { useTheme } from '@/theme';

/** Minimal polyline sparkline; flat content, no axes. */
export function Sparkline({ values, color, height = 56, testID }: { values: number[]; color?: string; height?: number; testID?: string }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const stroke = color ?? colors.primary;
  let points = '';
  if (width > 0 && values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 2;
    points = values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = pad + (1 - (v - min) / span) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
  return (
    <View
      testID={testID}
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel="Biểu đồ giá 3 tháng"
      accessibilityRole="image"
    >
      {points ? (
        <Svg width={width} height={height}>
          <Polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
}
