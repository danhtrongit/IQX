import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SnackbarProvider, useSnackbar } from '../Snackbar';

function Trigger() {
  const s = useSnackbar();
  return (
    <>
      <Button title="ok" onPress={() => s.success('Đã lưu')} />
      <Button title="bad" onPress={() => s.error('Lỗi mạng')} />
    </>
  );
}

async function setup() {
  return await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <SnackbarProvider>
        <Trigger />
      </SnackbarProvider>
    </SafeAreaProvider>,
  );
}

describe('Snackbar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('auto-hides success after 4s', async () => {
    await setup();
    await fireEvent.press(screen.getByText('ok'));
    expect(screen.getByText('Đã lưu')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(3900);
    });
    expect(screen.queryByText('Đã lưu')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Đã lưu')).toBeNull();
  });

  it('keeps errors until dismissed', async () => {
    await setup();
    await fireEvent.press(screen.getByText('bad'));
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(screen.getByText('Lỗi mạng')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('snackbar-close'));
    expect(screen.queryByText('Lỗi mạng')).toBeNull();
  });
});
