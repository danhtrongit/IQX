import * as Haptics from 'expo-haptics';

import { haptics, setHapticsEnabled } from '../haptics';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

describe('haptics', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => setHapticsEnabled(true));

  it('fires when enabled', () => {
    haptics.selection();
    haptics.success();
    haptics.error();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
  });

  it('no-ops when disabled', () => {
    setHapticsEnabled(false);
    haptics.selection();
    haptics.success();
    haptics.error();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});
