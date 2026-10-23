import { describe, expect, it } from 'vitest';

import { AUTH_PUBLIC_KEY } from '../../src/modules/auth/auth.decorators.js';
import {
  DashboardSettingsController,
  DashboardDataController,
} from '../../src/modules/dashboard/dashboard.controller.js';

describe('dashboard routes', () => {
  it('serves catalog, fundamental and valuation to guests (spec cập nhật 22-10 §3.7)', () => {
    expect(Reflect.getMetadata(AUTH_PUBLIC_KEY, DashboardDataController)).toBe(true);
  });

  it('keeps settings behind login', () => {
    expect(Reflect.getMetadata(AUTH_PUBLIC_KEY, DashboardSettingsController)).toBeUndefined();
  });
});
