import { Platform } from 'react-native';

export const DEFAULT_API_URL = 'https://iqx.vn/api/v2';

/** Rewrite loopback hosts so the Android emulator can reach the host machine. */
export function resolveApiBase(raw: string | undefined, os: string = Platform.OS): string {
  let base = (raw && raw.trim() ? raw.trim() : DEFAULT_API_URL).replace(/\/+$/, '');
  if (os === 'android') {
    base = base.replace(/^(https?:\/\/)(127\.0\.0\.1|localhost)(?=[:/]|$)/i, '$110.0.2.2');
  }
  return base;
}

export const API_BASE = resolveApiBase(process.env.EXPO_PUBLIC_API_URL);
