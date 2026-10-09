import { ChevronDown, ChevronUp, Lock } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Badge, Button, Card, Divider, Icon, Input, SwitchRow, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import {
  crossFieldErrors,
  fieldFor,
  LOCKED_MESSAGE,
  paramError,
  parseParamText,
  ruleLine,
  withOp,
  withSideEnabled,
} from './model';
import type { IndicatorConfig, RegistryIndicator, Side } from './types';

const SIDE_LABEL: Record<Side, string> = { buy: 'Mua', sell: 'Bán' };

type Props = {
  indicator: RegistryIndicator;
  value: IndicatorConfig;
  learned: boolean;
  expanded: boolean;
  dirty: boolean;
  /** Raw text of params being edited (key `${side}.${param}`). */
  texts: Record<string, string>;
  serverErrors?: Record<string, string>;
  onToggleExpanded: () => void;
  onChange: (next: IndicatorConfig) => void;
  onText: (side: Side, key: string, text: string, parsed: number | null) => void;
};

/** Validation messages for one indicator (used for display and to block save). */
export function indicatorErrors(ind: RegistryIndicator, value: IndicatorConfig, texts: Record<string, string>): string[] {
  const errs: string[] = [];
  for (const side of ['buy', 'sell'] as Side[]) {
    if (!value[side].enabled) continue;
    const params: Record<string, number | null> = {};
    for (const f of ind.fields) {
      const text = texts[`${side}.${f.key}`];
      const v = text !== undefined ? parseParamText(text) : (value[side].params[f.key] ?? null);
      params[f.key] = v;
      const e = paramError(fieldFor(ind, side, f), v);
      if (e) errs.push(`${SIDE_LABEL[side]} · ${e}`);
    }
    for (const e of crossFieldErrors(ind, params)) errs.push(`${SIDE_LABEL[side]} · ${e}`);
  }
  return errs;
}

export function IndicatorCard({ indicator: ind, value, learned, expanded, dirty, texts, serverErrors, onToggleExpanded, onChange, onText }: Props) {
  const { spacing } = useTheme();
  const locked = !learned;
  const errors = indicatorErrors(ind, value, texts);
  const anyOn = value.buy.enabled || value.sell.enabled;
  return (
    <Card padded>
      <View style={{ gap: spacing.sm }}>
        <Pressable
          testID={`strategy-library-row-${ind.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${ind.name}${locked ? ', chưa mở khóa' : ''}`}
          accessibilityState={{ expanded }}
          onPress={onToggleExpanded}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="section">{ind.name}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
              {locked ? <Badge label="Chưa mở khóa" tone="warning" testID={`strategy-library-locked-${ind.id}`} /> : null}
              {value.master_enabled && value.buy.enabled ? <Badge label="Mua" tone="success" /> : null}
              {value.master_enabled && value.sell.enabled ? <Badge label="Bán" tone="danger" /> : null}
              {dirty ? <Badge label="Chưa lưu" tone="info" /> : null}
            </View>
          </View>
          {locked ? <Icon icon={Lock} color="mutedForeground" /> : null}
          <Icon icon={expanded ? ChevronUp : ChevronDown} color="mutedForeground" />
        </Pressable>
        {locked ? <Text variant="caption" color="mutedForeground">{LOCKED_MESSAGE} Mở khóa qua Academy trên web.</Text> : null}
        <SwitchRow
          label="Dùng chỉ báo này"
          value={value.master_enabled && anyOn}
          disabled={locked && !anyOn}
          testID={`strategy-library-master-${ind.id}`}
          onValueChange={(on) => {
            if (!on) onChange({ ...value, master_enabled: false });
            else if (anyOn) onChange({ ...value, master_enabled: true });
            else onToggleExpanded();
          }}
        />
        {expanded ? (
          <View style={{ gap: spacing.md }}>
            {(['buy', 'sell'] as Side[]).map((side) => {
              const s = value[side];
              return (
                <View key={side} style={{ gap: spacing.sm }}>
                  <Divider />
                  <SwitchRow
                    label={`Điều kiện ${SIDE_LABEL[side]}`}
                    value={s.enabled}
                    disabled={locked && !s.enabled}
                    testID={`strategy-library-side-${ind.id}-${side}`}
                    onValueChange={(on) => onChange(withSideEnabled(value, side, on))}
                  />
                  {s.enabled ? (
                    <View style={{ gap: spacing.sm }}>
                      {ind.fields.map((f0) => {
                        const f = fieldFor(ind, side, f0);
                        const key = `${side}.${f.key}`;
                        const text = texts[key] ?? String(s.params[f.key] ?? '');
                        const err = paramError(f, parseParamText(text)) ?? serverErrors?.[`${ind.id}.${side}.${f.key}`] ?? null;
                        return (
                          <Input
                            key={key}
                            label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`}
                            value={text}
                            keyboardType="decimal-pad"
                            error={err}
                            testID={`strategy-library-param-${ind.id}-${side}-${f.key}`}
                            onChangeText={(t) => onText(side, f.key, t, parseParamText(t))}
                          />
                        );
                      })}
                      {s.rules.map((r) => (
                        <View key={r.id} style={{ gap: spacing.xs }}>
                          <Text variant="caption" color="mutedForeground">{ruleLine(r, ind, side)}</Text>
                          {r.allowed_ops && r.allowed_ops.length > 1 ? (
                            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                              {r.allowed_ops.map((op) => (
                                <Button
                                  key={op}
                                  title={op}
                                  size="sm"
                                  variant={r.op === op ? 'primary' : 'outline'}
                                  fullWidth={false}
                                  testID={`strategy-library-op-${ind.id}-${side}-${r.id}-${op === '>' ? 'gt' : op === '<' ? 'lt' : op === '>=' ? 'gte' : 'lte'}`}
                                  onPress={() => onChange(withOp(value, side, r.id, op))}
                                />
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {errors.map((e) => (
              <Text key={e} variant="caption" color="statusError">{e}</Text>
            ))}
            {ind.formula ? <Text variant="caption" color="mutedForeground">{ind.formula}</Text> : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
