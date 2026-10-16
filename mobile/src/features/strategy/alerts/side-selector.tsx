import { View } from 'react-native';

import { Checkbox, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { resolveSides, sideValid, SIDES } from './form-logic';
import { SIDE_LABEL } from './labels';
import type { AlertSide, SidesDetail } from './types';

const SIDE_TEXT: Record<AlertSide, string> = { buy: 'Điều kiện Mua', sell: 'Điều kiện Bán' };

/** Mua/Bán checkboxes: enabled only when the previewed source has a valid condition for that side. */
export function SideSelector({
  detail,
  choice,
  currentSides,
  onChange,
  nameOf = (id) => id.toUpperCase(),
}: {
  detail: SidesDetail | undefined | null;
  choice: Partial<Record<AlertSide, boolean>>;
  currentSides?: readonly AlertSide[];
  onChange: (side: AlertSide, checked: boolean) => void;
  nameOf?: (id: string) => string;
}) {
  const { spacing } = useTheme();
  const checked = resolveSides(detail, choice, currentSides);
  return (
    <View style={{ gap: spacing.xs }}>
      {SIDES.map((side) => {
        const valid = sideValid(detail, side);
        return (
          <View key={side}>
            <Checkbox
              testID={`strategy-alerts-side-${side}`}
              label={SIDE_TEXT[side]}
              checked={checked.includes(side)}
              disabled={!valid}
              onChange={(v) => onChange(side, v)}
            />
            {detail ? (
              <Text variant="caption" color="mutedForeground" testID={`strategy-alerts-side-${side}-hint`}>
                {valid
                  ? `${SIDE_LABEL[side]}: ${detail[side].indicator_ids.map(nameOf).join(' + ')}`
                  : `Cấu hình đã chọn chưa có điều kiện ${SIDE_LABEL[side]} hợp lệ.`}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
