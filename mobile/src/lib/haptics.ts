import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Optional haptics (mobile/DESIGN.md §7): selection changes and confirmed outcomes only,
 * never per price tick. Every call is a no-op while disabled or on web.
 */
let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

function run(fn: () => Promise<void>): void {
  if (!enabled || Platform.OS === 'web') return;
  fn().catch(() => undefined);
}

export const haptics = {
  /** A selection changed (picker, segmented control). */
  selection: () => run(() => Haptics.selectionAsync()),
  /** A confirmed success (e.g. order accepted by the server). */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A confirmed failure (e.g. order rejected). */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
