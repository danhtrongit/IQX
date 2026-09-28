import { describe, expect, it } from 'vitest';
import { cap2AlertPriority } from '../../src/modules/journey/cap2/cap2.alerts.service.js';

describe('Cấp 2 alert wire semantics', () => {
  it('marks averaging-down alerts as immediate', () => {
    expect(cap2AlertPriority('nhoi_lenh')).toBe('immediate');
  });

  it('marks stop-loss alerts as next-session', () => {
    expect(cap2AlertPriority('cham_cat_lo')).toBe('next_session');
  });
});
