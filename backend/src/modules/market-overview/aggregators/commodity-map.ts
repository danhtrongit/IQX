/**
 * Canonical catalog and fixed Vietnam ICB Level 4 sector mapping for the
 * `commodities_fx` ("Hàng hoá và tỷ giá") widget across all 3 tabs:
 *   - `energy_metals` ("Năng lượng, kim loại")
 *   - `agri`          ("Nông sản")
 *   - `gold_fx`       ("Vàng, tỷ giá")
 *
 * Fixed 8-commodity -> Vietnamese ICB Level 4 sector mapping per SPEC WIDGET.md:
 *   - `oil_brent`, `oil_wti` (`oil_crude`), `gas_natural` -> `Dầu khí`
 *   - `steel_hrc`, `iron_ore`                              -> `Thép`
 *   - `rubber`                                             -> `Cao su tự nhiên`
 *   - `fertilizer_ure`                                     -> `Phân bón`
 *   - `sugar`                                              -> `Đường`
 */

import type { CommoditiesFxTab } from '../market-overview.catalog.js';

export type CommodityDataSource =
  | {
      readonly provider: 'simplize';
      /** Key in `COMMODITIES` from `commodity-sheets-news.provider.ts`. */
      readonly code: string;
      readonly ticker: string;
    }
  | {
      readonly provider: 'simplize_ticker';
      /** Direct Simplize historical commodity ticker (e.g. `NYMEX:BB1!`, `COMEX:HG1!`). */
      readonly ticker: string;
    }
  | {
      readonly provider: 'msn_forex';
      readonly symbol: string;
    }
  | {
      readonly provider: 'msn_index';
      readonly symbol: string;
    }
  | {
      readonly provider: 'sjc';
    }
  | {
      readonly provider: 'vcb_fx';
      readonly currencyCode: string;
      readonly field: 'sell' | 'buy_cash' | 'buy_transfer';
    };

export interface CommodityCatalogEntry {
  readonly code: string;
  readonly aliases?: readonly string[];
  readonly tab: CommoditiesFxTab;
  readonly name: string;
  readonly unit: string;
  readonly mappedSectorName: MappedCommoditySectorName | null;
  readonly source: CommodityDataSource;
  readonly fallbackSource?: CommodityDataSource;
}

export type MappedCommoditySectorName =
  'Dầu khí' | 'Thép' | 'Cao su tự nhiên' | 'Phân bón' | 'Đường';

export interface CommoditySectorIcb4Metadata {
  readonly sectorName: MappedCommoditySectorName;
  /** Authoritative VCI ICB Level 4 codes for this sector group. */
  readonly icbLv4Codes: readonly string[];
  /** Fallback ICB Level 2 code if Level 4 snapshot is unavailable. */
  readonly fallbackIcbLv2Code: string;
  /** Representative HOSE/HNX/UPCoM equities for narrow sub-sectors (rubber/fertilizer/sugar). */
  readonly representativeSymbols: readonly string[];
}

/**
 * Exact fixed 8-commodity -> Vietnamese ICB Level 4 sector name mapping
 * mandated by SPEC WIDGET.md.
 */
export const COMMODITY_SECTOR_MAP: Readonly<Record<string, MappedCommoditySectorName>> = {
  oil_brent: 'Dầu khí',
  oil_wti: 'Dầu khí',
  gas_natural: 'Dầu khí',
  steel_hrc: 'Thép',
  iron_ore: 'Thép',
  rubber: 'Cao su tự nhiên',
  fertilizer_ure: 'Phân bón',
  sugar: 'Đường',
};

/** Alias normalization (e.g. Simplize `oil_crude` -> canonical `oil_wti`). */
export const COMMODITY_CODE_ALIASES: Readonly<Record<string, string>> = {
  oil_crude: 'oil_wti',
  brent: 'oil_brent',
  wti: 'oil_wti',
  natgas: 'gas_natural',
  ure: 'fertilizer_ure',
  urea: 'fertilizer_ure',
  gold: 'gold_global',
  xauusd: 'gold_global',
  sjc: 'gold_sjc',
  usdvnd: 'usd_vnd',
};

/**
 * Mapping from the 5 spec-mandated Vietnamese commodity sector labels to
 * VCI ICB Level 4 codes and core constituents for cap-weighted sector % calculation.
 */
export const COMMODITY_SECTOR_ICB4_METADATA: Readonly<
  Record<MappedCommoditySectorName, CommoditySectorIcb4Metadata>
> = {
  'Dầu khí': {
    sectorName: 'Dầu khí',
    icbLv4Codes: ['0533', '0573'],
    fallbackIcbLv2Code: '0500',
    representativeSymbols: ['PLX', 'BSR', 'PVS', 'PVD', 'OIL', 'PVB', 'PVC'],
  },
  Thép: {
    sectorName: 'Thép',
    icbLv4Codes: ['1757'],
    fallbackIcbLv2Code: '1700',
    representativeSymbols: ['HPG', 'HSG', 'NKG', 'TVN', 'VGS', 'SMC', 'TLH'],
  },
  'Cao su tự nhiên': {
    sectorName: 'Cao su tự nhiên',
    icbLv4Codes: ['1353'],
    fallbackIcbLv2Code: '1300',
    representativeSymbols: ['GVR', 'DPR', 'PHR', 'TRC', 'DRI', 'BRR', 'HRC'],
  },
  'Phân bón': {
    sectorName: 'Phân bón',
    icbLv4Codes: ['1357'],
    fallbackIcbLv2Code: '1300',
    representativeSymbols: ['DPM', 'DCM', 'BFC', 'LAS', 'DDV', 'SFG'],
  },
  Đường: {
    sectorName: 'Đường',
    icbLv4Codes: ['3577'],
    fallbackIcbLv2Code: '3500',
    representativeSymbols: ['SBT', 'QNS', 'SLS', 'LSS', 'KTS', 'CBS'],
  },
};

export const COMMODITY_FX_CATALOG: readonly CommodityCatalogEntry[] = [
  // ---- Tab 1: Năng lượng, kim loại (`energy_metals`) ----
  {
    code: 'oil_brent',
    tab: 'energy_metals',
    name: 'Dầu Brent',
    unit: 'USD/thùng',
    mappedSectorName: 'Dầu khí',
    source: { provider: 'simplize_ticker', ticker: 'NYMEX:BB1!' },
    fallbackSource: { provider: 'simplize', code: 'oil_crude', ticker: 'CL=F' },
  },
  {
    code: 'oil_wti',
    aliases: ['oil_crude'],
    tab: 'energy_metals',
    name: 'Dầu WTI',
    unit: 'USD/thùng',
    mappedSectorName: 'Dầu khí',
    source: { provider: 'simplize', code: 'oil_crude', ticker: 'CL=F' },
  },
  {
    code: 'gas_natural',
    tab: 'energy_metals',
    name: 'Khí tự nhiên',
    unit: 'USD/MMBtu',
    mappedSectorName: 'Dầu khí',
    source: { provider: 'simplize', code: 'gas_natural', ticker: 'NG=F' },
  },
  {
    code: 'steel_hrc',
    tab: 'energy_metals',
    name: 'Thép HRC',
    unit: 'USD/tấn',
    mappedSectorName: 'Thép',
    source: { provider: 'simplize', code: 'steel_hrc', ticker: 'COMEX:HRC1!' },
  },
  {
    code: 'iron_ore',
    tab: 'energy_metals',
    name: 'Quặng sắt',
    unit: 'USD/tấn',
    mappedSectorName: 'Thép',
    source: { provider: 'simplize', code: 'iron_ore', ticker: 'COMEX:TIO1!' },
  },
  {
    code: 'copper',
    tab: 'energy_metals',
    name: 'Đồng',
    unit: 'USD/pound',
    mappedSectorName: null,
    source: { provider: 'simplize_ticker', ticker: 'COMEX:HG1!' },
  },
  {
    code: 'steel_d10',
    tab: 'energy_metals',
    name: 'Thép D10 VN',
    unit: 'VND/kg',
    mappedSectorName: null,
    source: { provider: 'simplize', code: 'steel_d10', ticker: 'STEEL:D10:VN' },
  },

  // ---- Tab 2: Nông sản (`agri`) ----
  {
    code: 'fertilizer_ure',
    tab: 'agri',
    name: 'Urê',
    unit: 'USD/tấn',
    mappedSectorName: 'Phân bón',
    source: { provider: 'simplize', code: 'fertilizer_ure', ticker: 'CBOT:UME1!' },
  },
  {
    code: 'rubber',
    tab: 'agri',
    name: 'Cao su',
    unit: 'US cent/kg',
    mappedSectorName: 'Cao su tự nhiên',
    source: { provider: 'simplize_ticker', ticker: 'SGX:TF1!' },
  },
  {
    code: 'sugar',
    tab: 'agri',
    name: 'Đường',
    unit: 'US cent/pound',
    mappedSectorName: 'Đường',
    source: { provider: 'simplize', code: 'sugar', ticker: 'SB=F' },
  },
  {
    code: 'coffee_robusta',
    tab: 'agri',
    name: 'Cà phê Robusta',
    unit: 'USD/tấn',
    mappedSectorName: null,
    source: { provider: 'simplize_ticker', ticker: 'ICEEUR:RC1!' },
  },
  {
    code: 'soybean',
    tab: 'agri',
    name: 'Đậu tương',
    unit: 'USD/tấn',
    mappedSectorName: null,
    source: { provider: 'simplize', code: 'soybean', ticker: 'ZM=F' },
  },
  {
    code: 'corn',
    tab: 'agri',
    name: 'Ngô',
    unit: 'US cent/giạ',
    mappedSectorName: null,
    source: { provider: 'simplize', code: 'corn', ticker: 'ZC=F' },
  },
  {
    code: 'pork_north_vn',
    tab: 'agri',
    name: 'Heo hơi',
    unit: 'nghìn đồng/kg',
    mappedSectorName: null,
    source: { provider: 'simplize', code: 'pork_north_vn', ticker: 'PIG:NORTH:VN' },
  },

  // ---- Tab 3: Vàng, tỷ giá (`gold_fx`) ----
  {
    code: 'gold_global',
    tab: 'gold_fx',
    name: 'Vàng thế giới',
    unit: 'USD/ounce',
    mappedSectorName: null,
    source: { provider: 'msn_forex', symbol: 'XAUUSD' },
    fallbackSource: { provider: 'simplize', code: 'gold_global', ticker: 'GC=F' },
  },
  {
    code: 'gold_sjc',
    tab: 'gold_fx',
    name: 'Vàng SJC',
    unit: 'triệu đồng/lượng',
    mappedSectorName: null,
    source: { provider: 'sjc' },
    fallbackSource: { provider: 'simplize', code: 'gold_vn_sell', ticker: 'GOLD:VN:SELL' },
  },
  {
    code: 'usd_vnd',
    tab: 'gold_fx',
    name: 'USD/VND',
    unit: 'Vietcombank bán ra',
    mappedSectorName: null,
    source: { provider: 'vcb_fx', currencyCode: 'USD', field: 'sell' },
    fallbackSource: { provider: 'msn_forex', symbol: 'USDVND' },
  },
  {
    code: 'dxy',
    tab: 'gold_fx',
    name: 'Chỉ số USD (DXY)',
    unit: 'điểm',
    mappedSectorName: null,
    source: { provider: 'msn_index', symbol: 'DXY' },
    fallbackSource: { provider: 'simplize_ticker', ticker: 'TVC:DXY' },
  },
];

const ENTRY_BY_CODE = new Map<string, CommodityCatalogEntry>();
for (const entry of COMMODITY_FX_CATALOG) {
  ENTRY_BY_CODE.set(entry.code, entry);
  for (const alias of entry.aliases ?? []) {
    ENTRY_BY_CODE.set(alias, entry);
  }
}

/** Normalizes any commodity alias (e.g. `oil_crude`) to its canonical catalog code. */
export function normalizeCommodityCode(code: string): string {
  const lower = code.trim().toLowerCase();
  return COMMODITY_CODE_ALIASES[lower] ?? lower;
}

/** Returns all canonical `commodities_fx` items belonging to the requested tab. */
export function getCommoditiesByTab(tab: CommoditiesFxTab): readonly CommodityCatalogEntry[] {
  return COMMODITY_FX_CATALOG.filter((item) => item.tab === tab);
}

/** Finds a catalog entry by canonical code or alias. */
export function findCommodityEntry(code: string): CommodityCatalogEntry | undefined {
  const normalized = normalizeCommodityCode(code);
  return ENTRY_BY_CODE.get(normalized);
}

/**
 * Returns the mapped Vietnamese ICB Level 4 sector name for a commodity code
 * (or alias such as `oil_crude`), or `null` if unmapped.
 */
export function getMappedCommoditySector(code: string): MappedCommoditySectorName | null {
  const normalized = normalizeCommodityCode(code);
  return COMMODITY_SECTOR_MAP[normalized] ?? null;
}
