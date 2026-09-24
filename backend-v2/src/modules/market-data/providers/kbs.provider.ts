import { Injectable } from '@nestjs/common';
import { MarketHttpTransport } from './http.transport.js';
import { asObjects, isObject, type JsonObject, type ProviderResult } from './provider.types.js';

const BASE = 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo';
const PROFILE_MAP: Record<string, string> = {
  SM: 'business_model',
  SB: 'symbol',
  FD: 'founded_date',
  HM: 'number_of_employees',
  LD: 'listing_date',
  FV: 'par_value',
  EX: 'exchange',
  LP: 'listing_price',
  KLCPNY: 'charter_capital',
  KLCPLH: 'outstanding_shares',
  CTP: 'ceo_name',
  CTPP: 'ceo_position',
  IS: 'inspector_name',
  ISP: 'inspector_position',
  FP: 'establishment_license',
  BP: 'business_code',
  TC: 'tax_id',
  KT: 'auditor',
  TY: 'company_type',
  ADD: 'address',
  PHONE: 'phone',
  FAX: 'fax',
  EMAIL: 'email',
  URL: 'website',
  BRANCH: 'branches',
  HS: 'history',
  AD: 'as_of_date',
};
const SHAREHOLDER_MAP: Record<string, string> = {
  NM: 'name',
  D: 'date',
  V: 'shares_owned',
  OR: 'ownership_percentage',
};
const OFFICER_MAP: Record<string, string> = {
  FD: 'from_date',
  PN: 'position',
  NM: 'name',
  PO: 'position_en',
  PI: 'owner_code',
};
const SUBSIDIARY_MAP: Record<string, string> = {
  D: 'date',
  NM: 'name',
  CC: 'charter_capital',
  OR: 'ownership_percent',
  CR: 'currency',
};

@Injectable()
export class KbsMarketProvider {
  constructor(private readonly http: MarketHttpTransport) {}

  async fetchProfile(symbol: string): Promise<ProviderResult<JsonObject>> {
    const url = new URL(`${BASE}/profile/${symbol}`);
    url.searchParams.set('l', '1');
    const raw = await this.http.requestJson<unknown>(url.toString(), this.headers(), {
      cacheTtlMs: 300_000,
    });
    return { data: isObject(raw) ? raw : {}, rawEndpoint: `${BASE}/profile/${symbol}` };
  }
  normalizeOverview(raw: JsonObject): JsonObject {
    const result = this.map(raw, PROFILE_MAP);
    if (typeof result.exchange === 'string')
      result.exchange =
        ({ HSX: 'HOSE', XHNF: 'HNX' } as Record<string, string>)[result.exchange] ??
        result.exchange;
    const labor = asObjects(raw.LaborStructure);
    const total = labor.reduce((sum, item) => sum + (Number(item.Value) || 0), 0);
    if (total > 0) result.number_of_employees = total;
    return result;
  }
  normalizeShareholders(raw: JsonObject): JsonObject[] {
    return asObjects(raw.Shareholders).map((row) => this.map(row, SHAREHOLDER_MAP));
  }
  normalizeOfficers(raw: JsonObject): JsonObject[] {
    return asObjects(raw.Leaders).map((row) => this.map(row, OFFICER_MAP));
  }
  normalizeSubsidiaries(raw: JsonObject): JsonObject[] {
    return asObjects(raw.Subsidiaries).map((row) => {
      const item = this.map(row, SUBSIDIARY_MAP);
      const pct = Number(item.ownership_percent);
      item.type = Number.isFinite(pct) ? (pct > 50 ? 'subsidiary' : 'affiliate') : 'unknown';
      return item;
    });
  }
  async fetchNews(symbol: string, page = 1, pageSize = 20): Promise<ProviderResult<JsonObject[]>> {
    const url = new URL(`${BASE}/news/${symbol}`);
    url.searchParams.set('l', '1');
    url.searchParams.set('p', String(page));
    url.searchParams.set('s', String(pageSize));
    const raw = await this.http.requestJson<unknown>(url.toString(), this.headers(), {
      cacheTtlMs: 60_000,
    });
    return {
      data: asObjects(raw).map((item) => ({
        article_id: item.ArticleID,
        title: item.Title ?? '',
        summary: this.strip(String(item.Head ?? '')),
        url: item.URL ?? '',
        published_at: item.PublishTime ?? '',
      })),
      rawEndpoint: `${BASE}/news/${symbol}`,
    };
  }
  private map(raw: JsonObject, mapping: Record<string, string>): JsonObject {
    return Object.fromEntries(
      Object.entries(mapping)
        .filter(([key]) => key in raw)
        .map(([key, value]) => [
          value,
          typeof raw[key] === 'string' ? this.strip(raw[key]) : raw[key],
        ]),
    );
  }
  private strip(value: string): string {
    return value
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }
  private headers(): RequestInit {
    return {
      headers: {
        Accept: 'application/json',
        Origin: 'https://kbbuddywts.kbsec.com.vn',
        Referer: 'https://kbbuddywts.kbsec.com.vn/',
      },
    };
  }
}
