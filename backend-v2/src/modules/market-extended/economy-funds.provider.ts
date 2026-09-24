import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MarketHttpClient } from './market-http.client.js';
import {
  asRecord,
  isRecord,
  snakeCase,
  type JsonObject,
  type SourceResult,
} from './market-extended.types.js';

export const MACRO_INDICATORS: Record<string, string> = {
  gdp: '43',
  cpi: '52',
  industrial_production: '46',
  export_import: '48',
  retail: '47',
  fdi: '50',
  money_supply: '51',
  exchange_rate: '53',
  population_labor: '55',
  interest_rate: '66',
};
export const MACRO_PERIODS: Record<string, string> = {
  day: '1',
  month: '2',
  quarter: '3',
  year: '4',
};
export const DEFAULT_MACRO_PERIOD: Record<string, string> = {
  gdp: 'quarter',
  cpi: 'month',
  industrial_production: 'month',
  export_import: 'month',
  retail: 'month',
  fdi: 'month',
  money_supply: 'month',
  exchange_rate: 'day',
  population_labor: 'year',
  interest_rate: 'day',
};

@Injectable()
export class EconomyFundsProvider {
  constructor(private readonly http: MarketHttpClient) {}

  async macro(
    indicator: string,
    startYear: number,
    endYear: number,
    period: string,
  ): Promise<SourceResult<unknown>> {
    const sourceUrl = 'https://data.maybanktrade.com.vn/data/reportdatatopbynormtype';
    const form = new URLSearchParams({
      type: MACRO_PERIODS[period]!,
      fromYear: String(startYear),
      toYear: String(endYear),
      from: '0',
      to: '0',
      normTypeID: MACRO_INDICATORS[indicator]!,
    });
    const raw = await this.http.json(sourceUrl, 'POST', { form });
    const data = Array.isArray(raw)
      ? raw.filter(isRecord).map((item) =>
          Object.fromEntries(
            Object.entries(item).map(([key, value]) => [
              snakeCase(key)
                .replace(/^(tern_|norm_|term_|from_)/, '')
                .replace(/_code$/, ''),
              value,
            ]),
          ),
        )
      : [];
    return { data, sourceUrl };
  }

  async funds(fundType: string): Promise<SourceResult<unknown>> {
    const sourceUrl = 'https://api.fmarket.vn/res/products/filter';
    const body = {
      types: ['NEW_FUND', 'TRADING_FUND'],
      issuerIds: [],
      sortOrder: 'DESC',
      sortField: 'navTo6Months',
      page: 1,
      pageSize: 100,
      isIpo: false,
      fundAssetTypes: fundType ? [fundType] : [],
      bondRemainPeriods: [],
      searchField: '',
      isBuyByReward: false,
      thirdAppIds: [],
    };
    const root = asRecord(await this.http.json(sourceUrl, 'POST', { body }), 'fund listing');
    const nested = isRecord(root.data) ? root.data : {};
    const data = Array.isArray(nested.rows)
      ? nested.rows.filter(isRecord).map((i) => {
          const nav = isRecord(i.productNavChange) ? i.productNavChange : {};
          return {
            fund_id: i.id ?? null,
            short_name: i.shortName ?? '',
            name: i.name ?? '',
            fund_type: isRecord(i.dataFundAssetType) ? (i.dataFundAssetType.name ?? '') : '',
            fund_owner: isRecord(i.owner) ? (i.owner.name ?? '') : '',
            management_fee: i.managementFee ?? null,
            inception_date: i.firstIssueAt ?? null,
            nav: i.nav ?? null,
            code: i.code ?? '',
            nav_change_1m: nav.navTo1Months ?? null,
            nav_change_3m: nav.navTo3Months ?? null,
            nav_change_6m: nav.navTo6Months ?? null,
            nav_change_12m: nav.navTo12Months ?? null,
            nav_change_36m: nav.navTo36Months ?? null,
            nav_update_at: nav.updateAt ?? null,
          };
        })
      : [];
    return { data, sourceUrl };
  }

  async fundDetails(fundId: number): Promise<SourceResult<unknown>> {
    const sourceUrl = `https://api.fmarket.vn/res/products/${fundId}`;
    let root: JsonObject;
    try {
      root = asRecord(await this.http.json(sourceUrl), 'fund details');
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new NotFoundException({
        code: 'FUND_NOT_FOUND',
        message: `Không tìm thấy quỹ ${fundId}`,
      });
    }
    const fund = isRecord(root.data) ? root.data : {};
    const holdings = [
      ...(Array.isArray(fund.productTopHoldingList) ? fund.productTopHoldingList : []),
      ...(Array.isArray(fund.productTopHoldingBondList) ? fund.productTopHoldingBondList : []),
    ].filter(isRecord);
    return {
      sourceUrl,
      data: {
        top_holdings: holdings.map((h) => ({
          stock_code: h.stockCode ?? '',
          industry: h.industry ?? '',
          net_asset_percent: h.netAssetPercent ?? null,
          type: h.type ?? '',
        })),
        industry_holdings: (Array.isArray(fund.productIndustriesHoldingList)
          ? fund.productIndustriesHoldingList
          : []
        )
          .filter(isRecord)
          .map((h) => ({ industry: h.industry ?? '', net_asset_percent: h.assetPercent ?? null })),
        asset_holdings: (Array.isArray(fund.productAssetHoldingList)
          ? fund.productAssetHoldingList
          : []
        )
          .filter(isRecord)
          .map((h) => ({
            asset_type: isRecord(h.assetType) ? (h.assetType.name ?? '') : '',
            asset_percent: h.assetPercent ?? null,
          })),
      },
    };
  }

  async fundNav(fundId: number): Promise<SourceResult<unknown>> {
    const sourceUrl = 'https://api.fmarket.vn/res/product/get-nav-history';
    const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const root = asRecord(
      await this.http.json(sourceUrl, 'POST', {
        body: { isAllData: 1, productId: fundId, fromDate: null, toDate: today },
      }),
      'fund nav',
    );
    return {
      sourceUrl,
      data: (Array.isArray(root.data) ? root.data : [])
        .filter(isRecord)
        .map((i) => ({ date: i.navDate ?? null, nav_per_unit: i.nav ?? null })),
    };
  }
}
