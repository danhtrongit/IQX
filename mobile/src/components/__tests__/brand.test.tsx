import { render, screen } from '@testing-library/react-native';

import { BrandMark, HeaderAvatar, XuChip } from '../brand';

jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }) }));
jest.mock('@/features/shop/hooks', () => ({ useShopState: () => ({ data: undefined }) }));

describe('brand components', () => {
  it('renders the IQX wordmark', async () => {
    await render(<BrandMark />);
    expect(screen.getByText('IQX')).toBeTruthy();
  });

  it('falls back to a neutral avatar when no mascot is known', async () => {
    await render(<HeaderAvatar mascotId={null} />);
    expect(screen.getByLabelText('Tài khoản và linh vật')).toBeTruthy();
    expect(screen.getByTestId('mascot-fallback')).toBeTruthy();
  });

  it('shows the mascot image for a known id', async () => {
    await render(<HeaderAvatar mascotId="bach_ho" />);
    expect(screen.getByTestId('mascot-image')).toBeTruthy();
  });

  it('shows an em dash (never 0) when the balance is missing', async () => {
    await render(<XuChip balance={undefined} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('formats a known balance', async () => {
    await render(<XuChip balance={1500} />);
    expect(screen.getByText('1.500 xu')).toBeTruthy();
  });
});
