import { render, screen } from '@testing-library/react-native';

import { PatternsScreen } from '../patterns-screen';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ isPremium: false }) }));

describe('PatternsScreen', () => {
  it('shows the Premium gate for free users', async () => {
    await render(<PatternsScreen />);
    expect(screen.getByText('Cần gói Premium')).toBeTruthy();
    expect(screen.queryByText('Mẫu hình giá')).toBeNull();
  });
});
