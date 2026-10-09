import type { LucideIcon } from 'lucide-react-native';

import { useTheme, type Palette } from '@/theme';

/** Decorative Lucide icon (hidden from assistive tech). Use IconButton when it acts alone. */
export function Icon({
  icon: Glyph,
  size = 20,
  color = 'foreground',
  strokeWidth = 2,
}: {
  icon: LucideIcon;
  size?: number;
  color?: keyof Palette | (string & {});
  strokeWidth?: number;
}) {
  const { colors } = useTheme();
  const resolved = (colors as Record<string, string>)[color] ?? color;
  return (
    <Glyph
      size={size}
      color={resolved}
      strokeWidth={strokeWidth}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
