import { AlertCircle, CheckCircle2, X } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion, useTheme } from '@/theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Text } from './Text';

export const SNACKBAR_SUCCESS_MS = 4000;

export type SnackbarTone = 'success' | 'error' | 'info';

export type SnackbarOptions = {
  message: string;
  /** Default 'info'. */
  tone?: SnackbarTone;
  actionLabel?: string;
  onAction?: () => void;
};

type Item = SnackbarOptions & { id: number };

type SnackbarApi = {
  show: (options: SnackbarOptions) => void;
  success: (message: string) => void;
  error: (message: string, action?: { label: string; onPress: () => void }) => void;
  dismiss: () => void;
};

const SnackbarContext = createContext<SnackbarApi | null>(null);

/** Errors and messages with an action persist until dismissed; the rest hide after 4s. */
export function isPersistent(o: SnackbarOptions): boolean {
  return o.tone === 'error' || !!o.actionLabel;
}

export function useSnackbar(): SnackbarApi {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used inside <SnackbarProvider>');
  return ctx;
}

/**
 * Mount once near the root. The bar floats above bottom chrome: safe-area inset + tab bar height
 * (`bottomOffset` overrides it for screens without a tab bar) + 12.
 */
export function SnackbarProvider({ children, bottomOffset }: { children: ReactNode; bottomOffset?: number }) {
  const [item, setItem] = useState<Item | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const dismiss = useCallback(() => {
    clear();
    setItem(null);
  }, [clear]);
  const show = useCallback(
    (o: SnackbarOptions) => {
      clear();
      seq.current += 1;
      setItem({ ...o, id: seq.current });
      AccessibilityInfo.announceForAccessibility?.(o.message);
      if (!isPersistent(o)) timer.current = setTimeout(() => setItem(null), SNACKBAR_SUCCESS_MS);
    },
    [clear],
  );
  useEffect(() => clear, [clear]);

  const api = useMemo<SnackbarApi>(
    () => ({
      show,
      dismiss,
      success: (message) => show({ message, tone: 'success' }),
      error: (message, action) => show({ message, tone: 'error', actionLabel: action?.label, onAction: action?.onPress }),
    }),
    [show, dismiss],
  );

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      {item ? <SnackbarView key={item.id} item={item} onDismiss={dismiss} bottomOffset={bottomOffset} /> : null}
    </SnackbarContext.Provider>
  );
}

function SnackbarView({ item, onDismiss, bottomOffset }: { item: Item; onDismiss: () => void; bottomOffset?: number }) {
  const { colors, radius, spacing, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: reduced ? 150 : 200, useNativeDriver: true }).start();
  }, [opacity, reduced]);

  const tone = item.tone ?? 'info';
  const accent = tone === 'success' ? colors.statusSuccess : tone === 'error' ? colors.statusError : colors.statusInfo;
  const glyph = tone === 'success' ? CheckCircle2 : AlertCircle;
  const bottom = (bottomOffset ?? insets.bottom + layout.tabBarHeight) + spacing.md;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: layout.pagePadding, right: layout.pagePadding, bottom, opacity }}>
      <View
        testID="snackbar"
        accessibilityRole={tone === 'error' ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingLeft: spacing.md,
          minHeight: layout.rowMin,
          backgroundColor: colors.card,
          borderColor: accent,
          borderWidth: 1,
          borderRadius: radius.card,
        }}>
        <Icon icon={glyph} color={accent} />
        <Text variant="dense" style={{ flex: 1 }} testID="snackbar-message">
          {item.message}
        </Text>
        {item.actionLabel ? (
          <Button
            testID="snackbar-action"
            title={item.actionLabel}
            size="sm"
            variant="ghost"
            fullWidth={false}
            onPress={() => {
              item.onAction?.();
              onDismiss();
            }}
          />
        ) : null}
        <IconButton testID="snackbar-close" icon={X} accessibilityLabel="Đóng thông báo" onPress={onDismiss} />
      </View>
    </Animated.View>
  );
}
