import { describe, expect, it } from 'vitest';

import {
  auditExportQuerySchema,
  cashAdjustSchema,
  resetAccountSchema,
  resetAllSchema,
  tradingConfigUpdateSchema,
} from '../../src/modules/admin/admin.schemas.js';

describe('admin API contracts', () => {
  it('rejects unknown mutation fields and zero cash adjustments', () => {
    expect(cashAdjustSchema.safeParse({ amount_vnd: 0, reason: 'x' }).success).toBe(false);
    expect(
      cashAdjustSchema.safeParse({ amount_vnd: 10, reason: 'x', status: 'active' }).success,
    ).toBe(false);
    expect(tradingConfigUpdateSchema.safeParse({ unknown: true }).success).toBe(false);
    expect(
      cashAdjustSchema.safeParse({ amount_vnd: Number.MAX_SAFE_INTEGER, reason: 'upper bound' })
        .success,
    ).toBe(true);
    expect(
      cashAdjustSchema.safeParse({ amount_vnd: Number.MAX_SAFE_INTEGER + 1, reason: 'overflow' })
        .success,
    ).toBe(false);
    expect(
      cashAdjustSchema.safeParse({ amount_vnd: Number.MIN_SAFE_INTEGER, reason: 'lower bound' })
        .success,
    ).toBe(true);
    expect(
      cashAdjustSchema.safeParse({ amount_vnd: Number.MIN_SAFE_INTEGER - 1, reason: 'underflow' })
        .success,
    ).toBe(false);
  });

  it('requires an explicit confirmation token for reset-all', () => {
    expect(resetAllSchema.safeParse({ dry_run: true }).success).toBe(false);
    expect(resetAllSchema.safeParse({ confirm: 'RESET_ALL', dry_run: true }).success).toBe(true);
    expect(resetAccountSchema.parse(undefined)).toEqual({ dry_run: false, reason: 'Admin reset' });
  });

  it('bounds audit CSV exports and validates date ranges', () => {
    expect(auditExportQuerySchema.safeParse({ limit: 10_001 }).success).toBe(false);
    expect(
      auditExportQuerySchema.safeParse({
        date_from: '2026-02-01T00:00:00Z',
        date_to: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });
});
