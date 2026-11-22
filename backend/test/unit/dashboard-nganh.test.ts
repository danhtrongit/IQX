import { afterEach, describe, expect, it, vi } from 'vitest';

import { DASHBOARD_INDUSTRY_CHARTS } from '../../src/modules/dashboard/dashboard.catalog.js';
import { ICB_RETRY_MS, ICB_TTL_MS, IcbDirectory } from '../../src/modules/dashboard/dashboard.icb.js';
import { NGANH, nganhOf, type Nganh } from '../../src/modules/dashboard/dashboard.nganh.js';
import type { DashboardSettingsStore } from '../../src/modules/dashboard/dashboard.repository.js';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service.js';
import type { Industry } from '../../src/modules/financials/financials.industry.js';
import type { VciMarketProvider } from '../../src/modules/market-data/index.js';
import type { MarketDataService } from '../../src/modules/market-data/market-data.service.js';

type IcbRow = { symbol: string; lv2: string | null; lv4: string | null };

/**
 * ICB codes of the 21 test symbols as VCI returned them on 2026-11-22 (`v2/company/search-bar`),
 * with the statement template of each one and the industry the spec expects (S §0, PLAN §4).
 */
const SYMBOLS: readonly [symbol: string, template: Industry, lv2: string, lv4: string, nganh: Nganh][] = [
  ['FPT', 'thuong', '9500', '9537', 'thuong'],
  ['CTD', 'thuong', '2300', '2357', 'thuong'],
  ['VCB', 'nh', '8300', '8355', 'nh'],
  ['MBB', 'nh', '8300', '8355', 'nh'],
  ['SSI', 'ck', '8700', '8777', 'ck'],
  ['VND', 'ck', '8700', '8777', 'ck'],
  ['BVH', 'bh', '8500', '8575', 'bh'],
  ['PVI', 'bh', '8500', '8536', 'bh'],
  ['VHM', 'thuong', '8600', '8633', 'bds'],
  ['NLG', 'thuong', '8600', '8633', 'bds'],
  ['KBC', 'thuong', '8600', '8633', 'bds'],
  ['GAS', 'thuong', '7500', '7573', 'dk'],
  ['PVS', 'thuong', '0500', '0573', 'dk'],
  ['PLX', 'thuong', '0500', '0533', 'dk'],
  ['MWG', 'thuong', '5300', '5379', 'bl'],
  ['PNJ', 'thuong', '3700', '3767', 'bl'],
  ['VNM', 'thuong', '3500', '3577', 'bl'],
  ['POW', 'thuong', '7500', '7535', 'dien'],
  ['REE', 'thuong', '7500', '7535', 'dien'],
  ['HPG', 'thuong', '1700', '1757', 'vl'],
  ['DPM', 'thuong', '1300', '1357', 'vl'],
];

const DIRECTORY: IcbRow[] = SYMBOLS.map(([symbol, , lv2, lv4]) => ({ symbol, lv2, lv4 }));

/** Fake VCI: the ICB endpoints with call counters, and a statement source by template. */
function fakeVci(
  options: {
    directory?: () => Promise<IcbRow[]>;
    company?: (symbol: string) => Promise<{ lv2: string | null; lv4: string | null }>;
    template?: Industry;
  } = {},
) {
  const calls = { directory: 0, company: [] as string[] };
  const income =
    options.template === 'nh' ? [{ year_report: 2024, length_report: 1, isb27: 200, isb38: 400 }] : [];
  const vci = {
    fetchIcbDirectory: async () => {
      calls.directory += 1;
      return { data: await (options.directory ?? (async () => DIRECTORY))(), rawEndpoint: 'fake' };
    },
    fetchCompanyIcb: async (symbol: string) => {
      calls.company.push(symbol);
      return {
        data: await (options.company ?? (async () => ({ lv2: null, lv4: null })))(symbol),
        rawEndpoint: 'fake',
      };
    },
    fetchFinancialRaw: async () => ({
      data: { years: [], quarters: income },
      rawEndpoint: 'fake',
    }),
    fetchShareEvents: async () => ({ data: [], rawEndpoint: 'fake' }),
    fetchFinancialReport: async () => ({ data: [], rawEndpoint: 'fake' }),
  } as unknown as VciMarketProvider;
  return { vci, calls };
}

const store: DashboardSettingsStore = {
  findAll: async () => ({}),
  save: async () => {
    throw new Error('not used');
  },
};

const market = {
  ohlcv: async () => ({ data: [], meta: { source: 'fake' } }),
} as unknown as MarketDataService;

afterEach(() => {
  vi.useRealTimers();
});

describe('nganhOf (spec v3 §1.3, PLAN §4)', () => {
  it.each(SYMBOLS)('%s (%s, ICB %s/%s) is %s', (_symbol, template, lv2, lv4, nganh) => {
    expect(nganhOf(template, { lv2, lv4 })).toBe(nganh);
  });

  it('keeps the statement template first: a finance company on the bank template is a bank (§13.2)', () => {
    // EVF: ICB 8700/8773 (financial services) but the credit-institution template.
    expect(nganhOf('nh', { lv2: '8700', lv4: '8773' })).toBe('nh');
    expect(nganhOf('ck', null)).toBe('ck');
  });

  it('checks level 4 before level 2 and falls back to thuong (§13.1)', () => {
    expect(nganhOf('thuong', { lv2: '7500', lv4: '7573' })).toBe('dk');
    expect(nganhOf('thuong', { lv2: '7500', lv4: '7577' })).toBe('dien');
    expect(nganhOf('thuong', { lv2: '2300', lv4: '2353' })).toBe('vl');
    expect(nganhOf('thuong', { lv2: '2300', lv4: '2357' })).toBe('thuong');
    expect(nganhOf('thuong', { lv2: '8700', lv4: '8777' })).toBe('thuong');
    expect(nganhOf('thuong', { lv2: null, lv4: null })).toBe('thuong');
    expect(nganhOf('thuong', null)).toBe('thuong');
  });

  it('lists the 9 industry codes', () => {
    expect(NGANH).toEqual(['thuong', 'nh', 'ck', 'bh', 'bds', 'dk', 'bl', 'dien', 'vl']);
  });
});

describe('IcbDirectory (cache of the VCI ICB codes)', () => {
  it('loads the whole directory once and serves every symbol from it', async () => {
    const { vci, calls } = fakeVci();
    const icb = new IcbDirectory(vci);
    const results = await Promise.all(['VHM', 'GAS', 'hpg', 'VHM'].map((s) => icb.lookup(s)));
    expect(results).toEqual([
      { lv2: '8600', lv4: '8633' },
      { lv2: '7500', lv4: '7573' },
      { lv2: '1700', lv4: '1757' },
      { lv2: '8600', lv4: '8633' },
    ]);
    expect(calls.directory).toBe(1);
    expect(calls.company).toEqual([]);
  });

  it('refreshes after 12 hours', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-22T00:00:00Z') });
    const { vci, calls } = fakeVci();
    const icb = new IcbDirectory(vci);
    await icb.lookup('VHM');
    vi.setSystemTime(Date.now() + ICB_TTL_MS - 1);
    await icb.lookup('VHM');
    expect(calls.directory).toBe(1);
    vi.setSystemTime(Date.now() + 2);
    await icb.lookup('VHM');
    expect(calls.directory).toBe(2);
  });

  it('falls back to the company endpoint for a symbol the directory lacks, and caches it', async () => {
    const { vci, calls } = fakeVci({ company: async () => ({ lv2: '8600', lv4: '8633' }) });
    const icb = new IcbDirectory(vci);
    expect(await icb.lookup('XYZ')).toEqual({ lv2: '8600', lv4: '8633' });
    expect(await icb.lookup('XYZ')).toEqual({ lv2: '8600', lv4: '8633' });
    expect(calls.company).toEqual(['XYZ']);
  });

  it('never throws: a failing source gives null, and it is not hammered', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-22T00:00:00Z') });
    const { vci, calls } = fakeVci({
      directory: async () => {
        throw new Error('HTTP 403');
      },
      company: async () => {
        throw new Error('HTTP 403');
      },
    });
    const icb = new IcbDirectory(vci);
    await expect(icb.lookup('VHM')).resolves.toBeNull();
    await expect(icb.lookup('VHM')).resolves.toBeNull();
    await expect(icb.lookup('GAS')).resolves.toBeNull();
    expect(calls.directory).toBe(1);
    expect(calls.company).toEqual(['VHM', 'GAS']);
    vi.setSystemTime(Date.now() + ICB_RETRY_MS + 1);
    await icb.lookup('VHM');
    expect(calls.directory).toBe(2);
    expect(calls.company).toEqual(['VHM', 'GAS', 'VHM']);
  });

  it('keeps the stale directory when a refresh fails', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-22T00:00:00Z') });
    let fail = false;
    const { vci, calls } = fakeVci({
      directory: async () => {
        if (fail) throw new Error('timeout');
        return DIRECTORY;
      },
    });
    const icb = new IcbDirectory(vci);
    await icb.lookup('GAS');
    fail = true;
    vi.setSystemTime(Date.now() + ICB_TTL_MS + 1);
    expect(await icb.lookup('GAS')).toEqual({ lv2: '7500', lv4: '7573' });
    expect(await icb.lookup('NLG')).toEqual({ lv2: '8600', lv4: '8633' });
    expect(calls.directory).toBe(2);
    expect(calls.company).toEqual([]);
  });

  it('shares one in-flight request between concurrent lookups', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { vci, calls } = fakeVci({
      directory: async () => {
        await gate;
        return DIRECTORY;
      },
    });
    const icb = new IcbDirectory(vci);
    const pending = Promise.all([icb.lookup('VHM'), icb.lookup('GAS'), icb.lookup('MWG')]);
    release();
    expect((await pending).map((codes) => codes?.lv2)).toEqual(['8600', '7500', '5300']);
    expect(calls.directory).toBe(1);
  });
});

describe('DashboardService.industry (spec v3 §1.3, §12.4 backend)', () => {
  it('gives VHM and NLG the same industry (bds) and GAS dk', async () => {
    const { vci } = fakeVci();
    const dashboard = new DashboardService(vci, market, store);
    const [vhm, nlg, gas] = await Promise.all(['VHM', 'NLG', 'GAS'].map((s) => dashboard.industry(s)));
    expect(vhm).toEqual({ symbol: 'VHM', nganh: 'bds', label: 'Bất động sản', template: 'thuong' });
    expect(nlg!.nganh).toBe(vhm!.nganh);
    expect(gas).toEqual({ symbol: 'GAS', nganh: 'dk', label: 'Dầu khí', template: 'thuong' });
  });

  it('maps the enterprise-template test symbols to their industry', async () => {
    const { vci } = fakeVci();
    const dashboard = new DashboardService(vci, market, store);
    for (const [symbol, template, , , nganh] of SYMBOLS.filter(([, t]) => t === 'thuong'))
      expect((await dashboard.industry(symbol)).nganh, `${symbol} ${template}`).toBe(nganh);
  });

  it('does not ask VCI for the ICB of a bank-template symbol', async () => {
    const { vci, calls } = fakeVci({ template: 'nh' });
    const dashboard = new DashboardService(vci, market, store);
    expect(await dashboard.industry('VCB')).toMatchObject({ nganh: 'nh', template: 'nh' });
    expect(calls.directory).toBe(0);
  });

  it('degrades to thuong when VCI ICB is down', async () => {
    const { vci } = fakeVci({
      directory: async () => {
        throw new Error('blocked');
      },
      company: async () => {
        throw new Error('blocked');
      },
    });
    const dashboard = new DashboardService(vci, market, store);
    expect(await dashboard.industry('VHM')).toMatchObject({ nganh: 'thuong', template: 'thuong' });
  });

  it('serves the charts of the symbol industry: a new metric is empty and pending, foreign charts 400', async () => {
    const { vci } = fakeVci();
    const dashboard = new DashboardService(vci, market, store);
    const response = await dashboard.fundamental('VHM', {
      charts: 'Số năm bán hết tồn kho,Tiền / Nợ vay ngắn hạn,D/E',
      per: 'q',
    });
    expect(response.nganh).toBe('bds');
    expect(response.charts['Số năm bán hết tồn kho']).toMatchObject({
      kind: 'B',
      unit: 'năm',
      decimals: 1,
      status: 'definition_pending',
    });
    expect(response.charts['Tiền / Nợ vay ngắn hạn']).toMatchObject({
      unit: 'lần',
      decimals: 2,
      ref: 1,
      status: 'definition_pending',
    });
    expect(response.charts['D/E']!.status).not.toBe('definition_pending');
    await expect(
      dashboard.fundamental('VHM', { charts: 'Asset Turnover', per: 'q' }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'CHART_NOT_IN_INDUSTRY' } });
    await expect(dashboard.fundamental('VHM', { charts: 'RSI', per: 'q' })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('returns every chart of a new industry without throwing', async () => {
    const { vci } = fakeVci();
    const dashboard = new DashboardService(vci, market, store);
    for (const symbol of ['VHM', 'GAS', 'MWG', 'REE', 'HPG']) {
      const response = await dashboard.fundamental(symbol, { per: 'q' });
      expect(Object.keys(response.charts), symbol).toEqual(
        DASHBOARD_INDUSTRY_CHARTS[response.nganh].map((chart) => chart.name),
      );
    }
  });
});
