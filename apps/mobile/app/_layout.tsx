import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../theme';
import { AppProviders } from '../lib/providers';

function Navigation() { const { mode } = useTheme(); return <><StatusBar style={mode === 'dark' ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /><Stack.Screen name="auth/sign-in" options={{ presentation: 'modal' }} /><Stack.Screen name="auth/register" options={{ presentation: 'modal' }} /><Stack.Screen name="auth/forgot-password" options={{ presentation: 'modal' }} /><Stack.Screen name="auth/reset-password" options={{ presentation: 'modal' }} /><Stack.Screen name="stock/[symbol]" /><Stack.Screen name="course/[id]" /><Stack.Screen name="course/[id]/[episodeId]" /><Stack.Screen name="premium" options={{ presentation: 'modal' }} /><Stack.Screen name="settings" /></Stack></>; }
export default function RootLayout() {
  return <SafeAreaProvider><ThemeProvider><AppProviders><Navigation /></AppProviders></ThemeProvider></SafeAreaProvider>;
}
