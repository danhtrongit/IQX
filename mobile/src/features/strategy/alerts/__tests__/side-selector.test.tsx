import { fireEvent, render, screen } from '@testing-library/react-native';

import { SideSelector } from '../side-selector';
import type { SidesDetail } from '../types';

const detail: SidesDetail = {
  buy: { valid: true, indicator_ids: ['rsi'] },
  sell: { valid: false, indicator_ids: [] },
};

describe('SideSelector', () => {
  it('enables only valid sides and shows indicator ids', async () => {
    const onChange = jest.fn();
    await render(<SideSelector detail={detail} choice={{}} onChange={onChange} />);
    const buy = screen.getByTestId('strategy-alerts-side-buy');
    const sell = screen.getByTestId('strategy-alerts-side-sell');
    expect(buy.props.accessibilityState).toMatchObject({ checked: true, disabled: false });
    expect(sell.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    expect(screen.getByText('Mua: RSI')).toBeTruthy();
    expect(screen.getByText('Cấu hình đã chọn chưa có điều kiện Bán hợp lệ.')).toBeTruthy();
    await fireEvent.press(buy);
    expect(onChange).toHaveBeenCalledWith('buy', false);
    await fireEvent.press(sell);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('everything is disabled before a preview exists', async () => {
    await render(<SideSelector detail={undefined} choice={{}} onChange={jest.fn()} />);
    expect(screen.getByTestId('strategy-alerts-side-buy').props.accessibilityState.disabled).toBe(true);
  });
});
