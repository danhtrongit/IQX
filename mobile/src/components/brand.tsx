import { useRouter } from 'expo-router';
import { UserRound } from 'lucide-react-native';
import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui';
import { useShopState } from '@/features/shop/hooks';
import { formatNumber } from '@/lib/format';
import { fontFamily, useTheme } from '@/theme';

/** Brand exception: the logo glyph keeps fixed favicon colours in every theme. */
const LOGO = { bg: '#0a1018', green: '#32d74b', blue: '#1a73c7' } as const;

export function LogoGlyph({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Rect width={64} height={64} rx={12} fill={LOGO.bg} />
      <Path d="M32 10 54 50H10Z" fill={LOGO.green} />
      <Path d="M32 22 43 43H21Z" fill={LOGO.blue} />
    </Svg>
  );
}

/** Logo glyph + "IQX" wordmark (decorative brand mark, read as "IQX"). */
export function BrandMark({ size = 22, fontSize = 20 }: { size?: number; fontSize?: number }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel="IQX" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <LogoGlyph size={size} />
      <Text
        importantForAccessibility="no"
        style={{ fontFamily: fontFamily.heading700, fontSize, lineHeight: fontSize + 4, color: colors.foreground }}
      >
        IQX
      </Text>
    </View>
  );
}

/** Bundled mascot art keyed by catalog id (underscore ids, e.g. `bach_ho`). */
export const MASCOT_IMAGES: Record<string, ImageSourcePropType> = {
  bach_ho: require('../../assets/images/brand/mascot-bach-ho.webp'),
  kim_quy: require('../../assets/images/brand/mascot-kim-quy.webp'),
  loc_huou: require('../../assets/images/brand/mascot-loc-huou.webp'),
  phung_hoang: require('../../assets/images/brand/mascot-phung-hoang.webp'),
  thanh_long: require('../../assets/images/brand/mascot-thanh-long.webp'),
};

export function mascotImage(id: string | null | undefined): ImageSourcePropType | null {
  if (!id) return null;
  return MASCOT_IMAGES[id.replace(/-/g, '_')] ?? null;
}

/** Circular mascot (or neutral user placeholder when unknown). Decorative. */
export function MascotCircle({ mascotId, size }: { mascotId?: string | null; size: number }) {
  const { colors } = useTheme();
  const source = mascotImage(mascotId);
  return (
    <View
      testID={source ? 'mascot-image' : 'mascot-fallback'}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}
    >
      {source ? (
        <Image source={source} accessible={false} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <UserRound size={Math.round(size * 0.6)} color={colors.mutedForeground} />
      )}
    </View>
  );
}

/** Header avatar: 30pt visual, >=44pt touch target; opens the More tab root. */
export function HeaderAvatar({ mascotId, onPress }: { mascotId?: string | null; onPress?: () => void }) {
  const router = useRouter();
  return (
    <Pressable
      testID="header-avatar"
      accessibilityRole="button"
      accessibilityLabel="Tài khoản và linh vật"
      hitSlop={8}
      onPress={onPress ?? (() => router.navigate('/more'))}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <MascotCircle mascotId={mascotId} size={30} />
    </Pressable>
  );
}

/** Compact xu balance chip. Missing balance shows "—", never 0. */
export function XuChip({ balance, onPress }: { balance?: number | null; onPress?: () => void }) {
  const { colors, radius } = useTheme();
  const router = useRouter();
  const text = typeof balance === 'number' ? `${formatNumber(balance, 0)} xu` : '—';
  return (
    <Pressable
      testID="header-xu-chip"
      accessibilityRole="button"
      accessibilityLabel={typeof balance === 'number' ? `Số dư ${text}, mở cửa hàng` : 'Mở cửa hàng'}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      onPress={onPress ?? (() => router.navigate('/more/shop'))}
      style={{
        height: 28,
        minWidth: 44,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="caption" weight="semibold" numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

/** Right side of a tab-root header, wired to the shop state query (no extra polling). */
export function HeaderRight({ showXu }: { showXu?: boolean }) {
  const { data } = useShopState();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {showXu ? <XuChip balance={data?.wallet.balance} /> : null}
      <HeaderAvatar mascotId={data?.active.mascot_id} />
    </View>
  );
}
