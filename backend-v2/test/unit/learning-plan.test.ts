import { describe, expect, it, vi } from 'vitest';

import { CoreJourneyService } from '../../src/modules/journey/core/journey-core.service.js';
import { LearningPlanService } from '../../src/modules/journey/core/learning-plan.service.js';
import type { SqlClient } from '../../src/platform/database/index.js';

const level2Plan = {
  lyDo: 'ky_thuat' as const,
  trangThai_luc_dat: 'ung_ho' as const,
  vung_mua: 90_000,
  phuong_phap_sl_tp: 'ho_tro_khang_cu' as const,
  cat_lo: 80_000,
  chot_loi: 110_000,
};

function buyOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'order-1',
    account_id: 'account-1',
    user_id: 'user-1',
    symbol: 'VCB',
    mode: 'thuc_chien',
    side: 'buy',
    order_type: 'market',
    status: 'filled',
    quantity: 100,
    filled_price_vnd: '90000',
    limit_price_vnd: null,
    created_at: new Date('2026-09-23T01:00:00.000Z'),
    ...overrides,
  };
}

function sqlClient(
  implementation: (text: string, values: readonly unknown[]) => Promise<Record<string, unknown>[]>,
): SqlClient & { query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async (text: string, values: readonly unknown[] = []) =>
    implementation(text, values),
  );
  return { query } as unknown as SqlClient & { query: ReturnType<typeof vi.fn> };
}

describe('LearningPlanService atomic plan workflow', () => {
  it('materializes placement Cap1/2 before rechecking the active level on the supplied client', async () => {
    const events: string[] = [];
    const journey = {
      getActiveLevel: vi.fn(async () => {
        events.push('resolve-level');
        return 2;
      }),
    } as unknown as CoreJourneyService;
    const tx = sqlClient(async (text) => {
      if (text.includes('insert into cap1_progress')) events.push('materialize-cap1');
      if (text.includes('insert into cap2_progress')) events.push('materialize-cap2');
      if (text.includes('from virtual_orders')) return [buyOrder()];
      if (text.includes('select * from order_kehoach')) {
        return [
          {
            lyDo: level2Plan.lyDo,
            trangThai_luc_dat: level2Plan.trangThai_luc_dat,
            vung_mua: String(level2Plan.vung_mua),
            co_bam_doc_chi_tiet: false,
            snapshot_lop_du_lieu: null,
            phuong_phap_sl_tp: level2Plan.phuong_phap_sl_tp,
            cat_lo: String(level2Plan.cat_lo),
            chot_loi: String(level2Plan.chot_loi),
            khau_vi: null,
            muc_tu_tin: null,
            cach_khoi_luong: null,
            doc_5_lop: null,
            conflict_level: null,
          },
        ];
      }
      return [];
    });
    const service = new LearningPlanService(journey);

    await expect(
      service.validateAndPersistBuyPlan({
        tx,
        userId: 'user-1',
        orderId: 'order-1',
        symbol: 'VCB',
        quantity: 100,
        referencePriceVnd: 90_000n,
        level: 2,
        plan: level2Plan,
      }),
    ).resolves.toEqual({ savedLevels: [1, 2], nhoiLenhAlertLinked: false });
    expect(events.slice(0, 3)).toEqual(['materialize-cap1', 'materialize-cap2', 'resolve-level']);
    expect(journey.getActiveLevel).toHaveBeenCalledWith(tx, 'user-1');
  });

  it('activates immutable stop/take values on the filled BUY position', async () => {
    const tx = sqlClient(async (text, values) => {
      if (text.includes('from virtual_orders')) return [buyOrder()];
      if (text.includes('select cat_lo::text')) return [{ cat_lo: '80000', chot_loi: '110000' }];
      if (text.includes('update virtual_positions')) {
        expect(values).toEqual(['order-1', '80000', '110000', 'account-1', 'VCB']);
        return [{ id: 'position-1' }];
      }
      if (text.includes('from cap2_alert_events e')) return [];
      return [];
    });
    const service = new LearningPlanService({} as CoreJourneyService);

    await expect(
      service.onBuyOrderFilled({
        tx,
        userId: 'user-1',
        orderId: 'order-1',
        symbol: 'VCB',
      }),
    ).resolves.toBeUndefined();
    const activationSql = tx.query.mock.calls.find(([text]) =>
      String(text).includes('update virtual_positions'),
    )?.[0];
    expect(activationSql).toContain('active_dynamic_stop_vnd=null');
    expect(activationSql).toContain('returning id');
  });

  it('fails the fill transaction when a committed plan has no position to activate', async () => {
    const tx = sqlClient(async (text) => {
      if (text.includes('from virtual_orders')) return [buyOrder()];
      if (text.includes('select cat_lo::text')) return [{ cat_lo: '80000', chot_loi: '110000' }];
      return [];
    });
    const service = new LearningPlanService({} as CoreJourneyService);

    await expect(
      service.onBuyOrderFilled({
        tx,
        userId: 'user-1',
        orderId: 'order-1',
        symbol: 'VCB',
      }),
    ).rejects.toMatchObject({ response: { code: 'BUY_PLAN_POSITION_MISSING' } });
  });

  it('rejects an acted averaging-down alert when its order draft changed', async () => {
    const journey = {
      getActiveLevel: vi.fn().mockResolvedValue(2),
    } as unknown as CoreJourneyService;
    const todayInVietnam = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const tx = sqlClient(async (text) => {
      if (text.includes('from virtual_orders')) return [buyOrder()];
      if (text.includes('from cap2_alert_events where')) {
        return [
          {
            id: '11111111-1111-4111-8111-111111111111',
            user_id: 'user-1',
            alert_type: 'nhoi_lenh',
            symbol: 'VCB',
            session_date: todayInVietnam,
            intended_quantity: 200,
            intended_order_type: 'market',
            intended_limit_price_vnd: null,
            action: 'proceed_buy',
            source_order_id: null,
            violation_confirmed_at: null,
          },
        ];
      }
      return [];
    });
    const service = new LearningPlanService(journey);

    await expect(
      service.validateAndPersistBuyPlan({
        tx,
        userId: 'user-1',
        orderId: 'order-1',
        symbol: 'VCB',
        quantity: 100,
        referencePriceVnd: 90_000n,
        level: 2,
        plan: {
          ...level2Plan,
          nhoi_lenh_alert_id: '11111111-1111-4111-8111-111111111111',
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'NHOI_ALERT_ORDER_MISMATCH' } });
    expect(
      tx.query.mock.calls.some(([text]) => String(text).includes('insert into order_kehoach')),
    ).toBe(false);
  });
});
