import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api, createIdempotencyKey } from './api';

export async function registerForPushNotifications(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const current = await Notifications.getPermissionsAsync();
  const permissions = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (permissions.status !== 'granted') return false;
  const token = await Notifications.getDevicePushTokenAsync();
  await api('mobile/devices', {
    method: 'POST',
    idempotencyKey: createIdempotencyKey(`device:${token.data}`),
    body: {
      device_id: token.data,
      platform: Platform.OS === 'ios' ? 'ios' as const : 'android' as const,
      push_token: token.data,
      app_version: Constants.expoConfig?.version,
      locale: 'vi-VN',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
  return true;
}

export async function unregisterPushDevice(deviceId: string): Promise<void> {
  await api(`mobile/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
}
