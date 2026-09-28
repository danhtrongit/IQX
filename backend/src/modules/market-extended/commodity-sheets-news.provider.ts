import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MarketHttpClient } from './market-http.client.js';
import { isRecord, type SourceResult } from './market-extended.types.js';

export const COMMODITIES: Record<string, { ticker: string; name: string }> = {
  gold_vn_buy: { ticker: 'GOLD:VN:BUY', name: 'Vàng VN (mua)' },
  gold_vn_sell: { ticker: 'GOLD:VN:SELL', name: 'Vàng VN (bán)' },
  gold_global: { ticker: 'GC=F', name: 'Vàng thế giới' },
  oil_crude: { ticker: 'CL=F', name: 'Dầu thô' },
  gas_natural: { ticker: 'NG=F', name: 'Khí thiên nhiên' },
  gas_ron92: { ticker: 'GAS:RON92:VN', name: 'Xăng RON92' },
  gas_ron95: { ticker: 'GAS:RON95:VN', name: 'Xăng RON95' },
  oil_do: { ticker: 'GAS:DO:VN', name: 'Dầu DO' },
  coke: { ticker: 'ICEEUR:NCF1!', name: 'Than cốc' },
  steel_d10: { ticker: 'STEEL:D10:VN', name: 'Thép D10 VN' },
  iron_ore: { ticker: 'COMEX:TIO1!', name: 'Quặng sắt' },
  steel_hrc: { ticker: 'COMEX:HRC1!', name: 'Thép HRC' },
  fertilizer_ure: { ticker: 'CBOT:UME1!', name: 'Phân ure' },
  soybean: { ticker: 'ZM=F', name: 'Đậu tương' },
  corn: { ticker: 'ZC=F', name: 'Ngô' },
  sugar: { ticker: 'SB=F', name: 'Đường' },
  pork_north_vn: { ticker: 'PIG:NORTH:VN', name: 'Heo hơi miền Bắc VN' },
  pork_china: { ticker: 'PIG:CHINA', name: 'Heo hơi Trung Quốc' },
};

export const RSS_FEEDS: Record<string, string[]> = {
  vnexpress: ['https://vnexpress.net/rss/tin-moi-nhat.rss'],
  tuoitre: ['https://tuoitre.vn/rss/tin-moi-nhat.rss', 'https://tuoitre.vn/rss/kinh-doanh.rss'],
  cafebiz: ['https://cafebiz.vn/rss/home.rss', 'https://cafebiz.vn/rss/vi-mo.rss'],
  vietstock: [
    'https://vietstock.vn/761/kinh-te/vi-mo.rss',
    'https://vietstock.vn/768/kinh-te/kinh-te-dau-tu.rss',
  ],
  thanhnien: ['https://thanhnien.vn/rss/home.rss'],
  dantri: ['https://dantri.com.vn/rss/tin-moi-nhat.rss'],
  vietnamnet: ['https://vietnamnet.vn/rss/tin-moi-nhat.rss'],
};

const SHEET_ID = '1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI';

function epoch(date: string, end = false): number {
  return Math.floor(new Date(`${date}T${end ? '23:59:59' : '00:00:00'}Z`).getTime() / 1000);
}
function parsePercent(value: string): number | null {
  if (!value || value.trim() === '-') return null;
  const n = Number(value.trim().replace(/%$/, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function parseThousands(value: string): number | null {
  if (!value || value.trim() === '-') return null;
  const n = Number(value.trim().replaceAll('.', ''));
  return Number.isFinite(n) ? n : null;
}
function parseCsv(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some(Boolean)) result.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some(Boolean)) result.push(row);
  return result;
}

@Injectable()
export class CommoditySheetsNewsProvider {
  constructor(private readonly http: MarketHttpClient) {}

  listCommodities() {
    return Object.entries(COMMODITIES).map(([code, value]) => ({ code, ...value }));
  }

  async commodity(
    code: string,
    start?: string,
    end?: string,
    interval = '1d',
  ): Promise<SourceResult<unknown>> {
    const item = COMMODITIES[code];
    if (!item)
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: `Unsupported commodity: ${code}`,
      });
    const sourceUrl = 'https://api.simplize.vn/api/historical/prices/ohlcv';
    const root = await this.http.json(sourceUrl, 'GET', {
      query: {
        ticker: item.ticker,
        interval,
        type: 'commodity',
        from: start ? epoch(start) : undefined,
        to: end ? epoch(end, true) : undefined,
      },
    });
    const raw =
      isRecord(root) && Array.isArray(root.data) ? root.data : Array.isArray(root) ? root : [];
    return {
      sourceUrl,
      data: raw
        .map((i) =>
          Array.isArray(i)
            ? { time: i[0], open: i[1], high: i[2], low: i[3], close: i[4], volume: i[5] }
            : isRecord(i)
              ? {
                  time: i.time,
                  open: i.open,
                  high: i.high,
                  low: i.low,
                  close: i.close,
                  volume: i.volume,
                }
              : null,
        )
        .filter(Boolean),
    };
  }

  async sheet(kind: 'VND' | 'TPCP' | 'TYGIA'): Promise<SourceResult<unknown>> {
    const sourceUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
    const response = await this.http.text(sourceUrl, {
      query: { tqx: 'out:csv', sheet: kind },
      timeoutMs: 15_000,
    });
    if (!response.contentType.toLowerCase().includes('text/csv'))
      throw new ServiceUnavailableException({
        code: 'SHEETS_UNAVAILABLE',
        message: 'Google Sheets public export did not return CSV',
      });
    const values = parseCsv(response.text.replace(/^\ufeff/, ''));
    const headers = values[0]?.map((h) => h.trim()) ?? [];
    const data = values
      .slice(1)
      .map((row) => Object.fromEntries(headers.map((h, index) => [h, row[index] ?? ''])))
      .map((r) => {
        if (kind === 'TYGIA') {
          const change = String(r['CHÊNH LỆCH'] ?? '');
          return {
            currency: String(r['NGOẠI TỆ'] ?? '').trim(),
            today: String(r.TODAY ?? '').trim(),
            yesterday: String(r.YESTERDAY ?? '').trim(),
            change: change.trim(),
            todayNumeric: parseThousands(String(r.TODAY ?? '')),
            yesterdayNumeric: parseThousands(String(r.YESTERDAY ?? '')),
            changeNumeric: parsePercent(change),
          };
        }
        const change = String(
          r['CHÊNH LỆNH %'] ??
            r['CHÊNH LỆCH %'] ??
            r['CHÊNH LỆNH POINTS'] ??
            r['CHÊNH LỆCH POINTS'] ??
            '',
        );
        return {
          tenor: String(r['KỲ HẠN'] ?? '').trim(),
          today: String(r.TODAY ?? '').trim(),
          yesterday: String(r.YESTERDAY ?? '').trim(),
          change: change.trim(),
          todayNumeric: parsePercent(String(r.TODAY ?? '')),
          yesterdayNumeric: parsePercent(String(r.YESTERDAY ?? '')),
          changeNumeric: parsePercent(change),
        };
      });
    return { sourceUrl: response.url, data };
  }

  async rss(sites: string[] | undefined, maxPerSite: number): Promise<SourceResult<unknown>> {
    const chosen = sites ?? Object.keys(RSS_FEEDS);
    const bad = chosen.filter((site) => !RSS_FEEDS[site]);
    if (bad.length)
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: `Unsupported news source: ${bad.join(', ')}`,
      });
    const results = await Promise.allSettled(
      chosen.flatMap((site) =>
        RSS_FEEDS[site]!.map(async (url) => ({
          site,
          url,
          response: await this.http.text(url, {
            headers: { accept: 'application/rss+xml, application/xml, text/xml' },
          }),
        })),
      ),
    );
    const records: Array<Record<string, string>> = [];
    const urls: string[] = [];
    for (const result of results)
      if (result.status === 'fulfilled') {
        const { site, url, response } = result.value;
        urls.push(url);
        const items = [...response.text.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(
          0,
          maxPerSite,
        );
        for (const match of items) {
          const xml = match[1] ?? '';
          const pick = (tag: string) =>
            (new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml)?.[1] ?? '')
              .replace(/^<!\[CDATA\[|\]\]>$/g, '')
              .replace(/<[^>]+>/g, '')
              .trim();
          const title = pick('title');
          const link = pick('link');
          if (title && link)
            records.push({
              title,
              link,
              description: pick('description').slice(0, 500),
              pub_date: pick('pubDate'),
              image_url: /<img[^>]+src=["']([^"']+)["']/i.exec(xml)?.[1] ?? '',
              site,
            });
        }
      }
    const seen = new Set<string>();
    const data = records.filter((r) => {
      const link = r.link ?? '';
      if (!link || seen.has(link)) return false;
      seen.add(link);
      return true;
    });
    return { data, sourceUrl: urls.join(',') };
  }
}
