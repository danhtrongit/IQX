import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PdfTextError, extractPdfText } from '../../src/modules/research/pdf-text.js';
import { SourceHttp, SourceHttpError } from '../../src/modules/research/sources/source-http.js';
import {
  VietstockSource,
  parseVietstockFragment,
  toVietstockListing,
} from '../../src/modules/research/sources/vietstock.source.js';
import {
  VndirectSource,
  toVndirectListing,
} from '../../src/modules/research/sources/vndirect.source.js';

const fragment = readFileSync(
  new URL('../fixtures/research/vietstock-company-page.html', import.meta.url),
  'utf8',
);
const noSleep = async () => undefined;

function http(fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) {
  return new SourceHttp({ fetchImpl, minIntervalMs: 0, sleep: noSleep, ...extra });
}

const pdfBytes = new TextEncoder().encode('%PDF-1.7\nhello');

describe('Vietstock fragment parsing', () => {
  const items = parseVietstockFragment(fragment);

  it('reads id, broker, date, title and summary of every card', () => {
    expect(items.length).toBeGreaterThanOrEqual(10);
    const vnm = items.find((i) => i.id === '22473');
    expect(vnm).toMatchObject({
      brokerRaw: 'GTJA (Vietnam)',
      date: '2026-10-13',
      title: 'VNM: Khuyến nghị TÍCH LŨY với giá mục tiêu 59,000 đồng/cổ phiếu',
    });
    expect(vnm?.summary).toContain('Guotai Haitong');
    const dcm = items.find((i) => i.id === '22472');
    expect(dcm).toMatchObject({ brokerRaw: 'VDS', date: '2026-10-13', summary: '' });
  });

  it('maps company reports with symbol, canonical broker, direct file url and target', () => {
    const listings = items.map((i) => toVietstockListing(i, 'company')).filter((l) => l !== null);
    const vnm = listings.find((l) => l.sourceReportId === '22473');
    expect(vnm).toMatchObject({
      source: 'vietstock',
      symbol: 'VNM',
      broker: 'GTJA',
      reportType: 'company',
      reportDate: '2026-10-13',
      language: 'vi',
      targetPriceVnd: 59000,
      fileUrl: 'https://finance.vietstock.vn/downloadedoc/22473',
      sourceUrl:
        'https://finance.vietstock.vn/bao-cao-phan-tich/22473/vnm-khuyen-nghi-tich-luy-voi-gia-muc-tieu-59000-dongco-phieu.htm',
    });
    expect(listings.find((l) => l.sourceReportId === '22472')).toMatchObject({
      symbol: 'DCM',
      broker: 'VDSC',
      targetPriceVnd: 46800,
    });
    expect(listings.find((l) => l.sourceReportId === '22474')).toMatchObject({
      symbol: 'PNJ',
      broker: 'VIETCAP',
      targetPriceVnd: null,
    });
  });

  it('classifies technical analysis titles and keeps them out of company', () => {
    const pvs = items.find((i) => i.id === '22457');
    expect(toVietstockListing(pvs!, 'company')).toMatchObject({
      symbol: 'PVS',
      reportType: 'technical',
    });
  });

  it('stores industry / macro reports without a symbol and without a target', () => {
    const base = {
      id: '1',
      slug: 'x',
      brokerRaw: 'SSI',
      date: '2026-10-01',
      summary: 'giá mục tiêu 50,000',
    };
    expect(toVietstockListing({ ...base, title: 'Báo cáo ngành Thép' }, 'industry')).toMatchObject({
      symbol: null,
      reportType: 'industry',
      targetPriceVnd: null,
    });
    expect(
      toVietstockListing({ ...base, title: 'Báo cáo Vĩ mô: Tăng trưởng' }, 'macro_strategy'),
    ).toMatchObject({ symbol: null, reportType: 'macro' });
    expect(
      toVietstockListing({ ...base, title: 'Chiến lược thị trường Q4' }, 'macro_strategy'),
    ).toMatchObject({ reportType: 'strategy' });
  });

  it('multi-symbol company titles get a null symbol; unknown symbols are skipped', () => {
    const base = { id: '2', slug: 'x', brokerRaw: 'SSI', date: '2026-10-01', summary: '' };
    expect(toVietstockListing({ ...base, title: 'HPG, HSG: Thép quý 3' }, 'company')).toMatchObject(
      { symbol: null, reportType: 'other' },
    );
    expect(toVietstockListing({ ...base, title: 'Cập nhật thị trường' }, 'company')).toBeNull();
    expect(toVietstockListing({ ...base, title: 'abcd: Khác' }, 'company')).toBeNull();
  });
});

describe('VietstockSource.list', () => {
  it('opens a session, posts the form with token + cookies and pages until a short page', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      if (url.endsWith('/phan-tich-doanh-nghiep')) {
        const headers = new Headers({ 'content-type': 'text/html' });
        headers.append('set-cookie', 'ASP.NET_SessionId=abc; path=/; HttpOnly');
        headers.append('set-cookie', '__RequestVerificationToken=ck; path=/');
        return new Response(
          '<form><input name=__RequestVerificationToken type=hidden value=TOKEN123 /></form>',
          { headers },
        );
      }
      const body = new URLSearchParams(String(init?.body));
      return new Response(body.get('reportTypeID') === '58' ? fragment : '');
    }) as unknown as typeof fetch;

    const listings = await new VietstockSource(undefined, http(fetchImpl)).list(
      '2026-10-09',
      '2026-10-13',
    );
    expect(listings.map((l) => l.sourceReportId)).toContain('22473');
    expect(listings.every((l) => l.reportDate >= '2026-10-09')).toBe(true);

    const posts = calls.filter((c) => c.init.method === 'POST');
    expect(posts.map((p) => new URLSearchParams(String(p.init.body)).get('reportTypeID'))).toEqual([
      '58',
      '57',
      '51',
    ]);
    const first = posts[0]!;
    const form = new URLSearchParams(String(first.init.body));
    expect(form.get('__RequestVerificationToken')).toBe('TOKEN123');
    expect(form.get('fromdate')).toBe('2026-10-09');
    expect(form.get('pageSize')).toBe('20');
    const headers = first.init.headers as Record<string, string>;
    expect(headers.cookie).toBe('ASP.NET_SessionId=abc; __RequestVerificationToken=ck');
    expect(headers['x-requested-with']).toBe('XMLHttpRequest');
  });

  it('resolves the direct download url', async () => {
    const source = new VietstockSource(undefined, http(vi.fn() as unknown as typeof fetch));
    const listing = toVietstockListing(parseVietstockFragment(fragment)[0]!, 'company')!;
    await expect(source.resolveFileUrl(listing)).resolves.toBe(
      `https://finance.vietstock.vn/downloadedoc/${listing.sourceReportId}`,
    );
  });
});

describe('VNDirect', () => {
  const item = {
    newsId: '10969335',
    tagCodes: 'DGW',
    newsTitle: 'DGW - Strong profit growth might cool in 2027  - Update report',
    newsContent: '<ul><li>We recommend HOLD with a 12M TP of VND54,600/share.</li></ul>',
    newsDate: '2026-10-08',
    newsSource: 'VNDIRECT',
    newsUrl: 'https://www.vndirect.com.vn/?p=101863',
    locale: 'EN_GB',
    attachments: [
      {
        name: 'DGW.pdf',
        url: 'https://www.vndirect.com.vn/vndirect-resource/nextcom/attachment/2026-10-08/DGW_Update_20261007.pdf',
      },
    ],
  };

  it('maps an item: symbol, VNDIRECT broker, english, pdf url, target from content', () => {
    expect(toVndirectListing(item)).toMatchObject({
      source: 'vndirect',
      sourceReportId: '10969335',
      symbol: 'DGW',
      broker: 'VNDIRECT',
      reportType: 'company',
      reportDate: '2026-10-08',
      language: 'en',
      targetPriceVnd: 54600,
      fileUrl:
        'https://www.vndirect.com.vn/vndirect-resource/nextcom/attachment/2026-10-08/DGW_Update_20261007.pdf',
    });
  });

  it('multi-tag → null symbol / other; no ticker anywhere → skipped; title prefix fallback', () => {
    expect(toVndirectListing({ ...item, tagCodes: 'HPG,HSG' })).toMatchObject({
      symbol: null,
      reportType: 'other',
    });
    expect(
      toVndirectListing({ ...item, tagCodes: '', newsTitle: 'Key takeaways from a conference' }),
    ).toBeNull();
    expect(
      toVndirectListing({ ...item, tagCodes: '', newsTitle: 'VIC - Site visit note' }),
    ).toMatchObject({ symbol: 'VIC' });
  });

  it('lists with the documented query, Origin header and pagination', async () => {
    const urls: string[] = [];
    const origins: (string | undefined)[] = [];
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      urls.push(String(input));
      origins.push((init?.headers as Record<string, string>).origin);
      const page = Number(new URL(String(input)).searchParams.get('page'));
      return new Response(
        JSON.stringify({
          data: page === 1 ? [item] : [{ ...item, newsId: '2', tagCodes: 'VNM' }],
          totalPages: 2,
          currentPage: page,
        }),
      );
    }) as unknown as typeof fetch;
    const out = await new VndirectSource(undefined, http(fetchImpl)).list(
      '2026-10-01',
      '2026-10-13',
    );
    expect(out.map((l) => l.symbol)).toEqual(['DGW', 'VNM']);
    expect(urls).toHaveLength(2);
    expect(decodeURIComponent(urls[0]!)).toContain(
      'q=newsType:company_report~newsDate:gte:2026-10-01~newsDate:lte:2026-10-13&size=100&sort=newsDate:desc&page=1',
    );
    expect(origins[0]).toBe('https://dstock.vndirect.com.vn');
  });
});

describe('SourceHttp', () => {
  it('rejects non-https and hosts outside the allowlist without calling fetch', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = http(fetchImpl);
    await expect(client.text('http://finance.vietstock.vn/x')).rejects.toBeInstanceOf(
      SourceHttpError,
    );
    await expect(client.text('https://evil.example.com/x.pdf')).rejects.toThrow(/not allowed/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses redirects that leave the allowlist', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example.com/a.pdf' },
        }),
    ) as unknown as typeof fetch;
    await expect(
      http(fetchImpl).binary('https://finance.vietstock.vn/downloadedoc/1'),
    ).rejects.toThrow(/not allowed/);
  });

  it('retries 429 / 5xx with backoff, up to 3 retries, and not on 404', async () => {
    const sleep = vi.fn(async () => undefined);
    let n = 0;
    const flaky = vi.fn(async () =>
      ++n < 3 ? new Response('', { status: n === 1 ? 429 : 503 }) : new Response('ok'),
    ) as unknown as typeof fetch;
    const res = await new SourceHttp({ fetchImpl: flaky, minIntervalMs: 0, sleep }).text(
      'https://finance.vietstock.vn/a',
    );
    expect(res.text).toBe('ok');
    expect(flaky).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);

    const down = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(
      new SourceHttp({ fetchImpl: down, minIntervalMs: 0, sleep }).text(
        'https://finance.vietstock.vn/a',
      ),
    ).rejects.toThrow(/HTTP 500/);
    expect(down).toHaveBeenCalledTimes(4);

    const missing = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(http(missing).text('https://finance.vietstock.vn/a')).rejects.toThrow(/HTTP 404/);
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it('spaces requests to the same host by the minimum interval', async () => {
    let clock = 1_000_000;
    const slept: number[] = [];
    const client = new SourceHttp({
      fetchImpl: vi.fn(async () => new Response('x')) as unknown as typeof fetch,
      minIntervalMs: 2000,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    await client.text('https://finance.vietstock.vn/a');
    await client.text('https://finance.vietstock.vn/b');
    await client.text('https://api-finfo.vndirect.com.vn/c');
    expect(slept).toEqual([2000]);
  });

  it('downloads a PDF, and rejects non-PDF bodies and files over the size cap', async () => {
    const ok = vi.fn(
      async () => new Response(pdfBytes, { headers: { 'content-type': 'application/pdf' } }),
    ) as unknown as typeof fetch;
    expect(await http(ok).binary('https://finance.vietstock.vn/downloadedoc/1')).toEqual(pdfBytes);

    const html = vi.fn(async () => new Response('<html>login</html>')) as unknown as typeof fetch;
    await expect(http(html).binary('https://finance.vietstock.vn/downloadedoc/1')).rejects.toThrow(
      /not a PDF/,
    );

    const big = vi.fn(
      async () => new Response(new Uint8Array(2 * 1024 * 1024 + 10)),
    ) as unknown as typeof fetch;
    await expect(
      http(big, { maxPdfMb: 1 }).binary('https://finance.vietstock.vn/downloadedoc/1'),
    ).rejects.toThrow(/too large/);
  });
});

describe('extractPdfText', () => {
  it('throws a typed error for unreadable PDFs', async () => {
    await expect(
      extractPdfText(new TextEncoder().encode('%PDF-1.4 not really')),
    ).rejects.toMatchObject({ code: 'unreadable' });
    await expect(extractPdfText(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(PdfTextError);
  });
});
