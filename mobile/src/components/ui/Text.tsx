import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { NUMERIC_FONT_SCALE_CAP, sansByWeight, typography, useTheme, type FontWeight, type Palette, type TypographyVariant } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  /** Palette key (default foreground) or raw colour string. */
  color?: keyof Palette | (string & {});
  /** Override the variant's weight (sans variants only). */
  weight?: FontWeight;
  align?: 'left' | 'center' | 'right';
  /** Cap system font scaling at 1.4x. Only for numeric table cells and chart axes; all other text scales freely. */
  capFontScale?: boolean;
};

export function Text({ variant = 'body', color = 'foreground', weight, align, capFontScale = false, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const resolved = (colors as Record<string, string>)[color] ?? color;
  const isHeading = variant === 'title' || variant === 'heading';
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={capFontScale ? NUMERIC_FONT_SCALE_CAP : undefined}
      {...rest}
      style={[
        typography[variant],
        weight && !isHeading ? { fontFamily: sansByWeight[weight] } : null,
        { color: resolved },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
