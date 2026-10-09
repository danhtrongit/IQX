import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
} from '@expo-google-fonts/be-vietnam-pro';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorState, LoadingState, Screen, SnackbarProvider } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { QueryProvider } from '@/lib/query';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { status, error, retry } = useAuth();
  const authed = status === 'authenticated';
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontsReady && status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsReady, status]);

  if (!fontsReady) return null;
  if (status === 'loading') {
    return (
      <Screen edges={['top', 'bottom']} testID="auth-loading">
        <LoadingState label="Đang kiểm tra phiên đăng nhập…" />
      </Screen>
    );
  }
  if (status === 'error') {
    return (
      <Screen edges={['top', 'bottom']} testID="auth-error">
        <ErrorState title="Không xác minh được phiên đăng nhập" error={error} onRetry={retry} />
      </Screen>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!authed}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={authed}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const { isDark, colors } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.card,
      text: colors.foreground,
      border: colors.border,
      primary: colors.primary,
    },
  };
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider value={navTheme}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <SnackbarProvider>
              <RootNavigator />
            </SnackbarProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
