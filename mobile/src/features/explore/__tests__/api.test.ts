import { ApiError } from '@/lib/api';
import { mockFetch } from '@/test-utils/fetch';
import {
  adaptHuntFilters,
  adaptHuntResult,
  adaptNewsPage,
  adaptPatterns,
  fetchHuntResult,
  fetchNews,
  nextNewsPage,
  watchlistErrorMessage,
} from '../api';

describe('hunt adapters', () => {
  it('maps filters and marks unavailable ones', () => {
    const f = adaptHuntFilters({ bo_loc: [{ ma: 'ngoai', icon: 'x', ten: 'Khối ngoại gom', mo_ta: 'm', kha_dung: false, ly_do_chua_kha_dung: 'Rổ rỗng' }, { ma: 'kl', ten: 'KL', kha_dung: true }, { ten: 'no code' }] });
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ ma: 'ngoai', available: false, reason: 'Rổ rỗng' });
    expect(f[1].available).toBe(true);
  });

  it('maps results, keeps unknown change null and parses warnings', () => {
    const r = adaptHuntResult(
      { items: [{ hang: 1, symbol: 'fpt', gia_vnd: 57600, pct_thay_doi: null, tin_hieu: 'Mua ròng', gia_tri_xep_hang: 12.5 }, { hang: 2 }], tong_so_ma: 1, canh_bao_thieu_du_lieu: 'Thiếu 3 mã', xep_hang_theo: 'Tổng mua ròng' },
      'ngoai',
    );
    expect(r.items).toEqual([{ rank: 1, symbol: 'FPT', price: 57600, changePct: null, signal: 'Mua ròng', rankValue: 12.5 }]);
    expect(r.warnings).toEqual(['Thiếu 3 mã']);
    expect(r.rankBy).toBe('Tổng mua ròng');
  });

  it('treats a 404 as no data', async () => {
    mockFetch(() => ({ status: 404, body: { error: { message: 'none' } } }));
    expect(await fetchHuntResult('ngoai')).toBeNull();
  });

  it('rethrows other errors', async () => {
    mockFetch(() => ({ status: 400, body: { error: { message: 'bad' } } }));
    await expect(fetchHuntResult('ngoai')).rejects.toBeInstanceOf(ApiError);
  });

  it('maps watchlist errors to friendly messages', () => {
    expect(watchlistErrorMessage(new ApiError('dup', 409), 'FPT')).toContain('đã có');
    expect(watchlistErrorMessage(new ApiError('Mã ZZZ không tồn tại', 400), 'ZZZ')).toBe('Mã ZZZ không tồn tại');
  });
});

describe('news paging', () => {
  const row = (n: number) => ({ id: `i${n}`, slug: `s${n}`, title: `T${n}`, image_url: 'https://x/y.jpg', sentiment: 'Positive', update_date: '2026-10-09 14:31:00' });

  it('adapts rows and drops entries without slug/title', () => {
    const page = adaptNewsPage({ data: [row(1), { id: 'x' }], total_records: 30 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(30);
    expect(page.items[0].imageUrl).toBe('https://x/y.jpg');
  });

  it('requests page_size 12, language vi and filters', async () => {
    const { calls } = mockFetch(() => ({ body: { data: [], total_records: 0 } }));
    await fetchNews({ page: 2, ticker: 'fpt', sentiment: 'Negative' });
    expect(calls[0].url).toContain('page=2');
    expect(calls[0].url).toContain('page_size=12');
    expect(calls[0].url).toContain('language=vi');
    expect(calls[0].url).toContain('ticker=FPT');
    expect(calls[0].url).toContain('sentiment=Negative');
  });

  it('omits sentiment for "all"', async () => {
    const { calls } = mockFetch(() => ({ body: { data: [], total_records: 0 } }));
    await fetchNews({ page: 1, sentiment: 'all' });
    expect(calls[0].url).not.toContain('sentiment');
  });

  it('computes the next page until total is reached', () => {
    const p1 = adaptNewsPage({ data: [row(1), row(2)], total_records: 3 });
    const p2 = adaptNewsPage({ data: [row(3)], total_records: 3 });
    expect(nextNewsPage(p1, [p1])).toBe(2);
    expect(nextNewsPage(p2, [p1, p2])).toBeUndefined();
    expect(nextNewsPage(adaptNewsPage({ data: [], total_records: 99 }), [p1])).toBeUndefined();
  });
});

describe('patterns', () => {
  it('maps rows and defaults unknown signals to neutral', () => {
    const items = adaptPatterns({ items: [{ name: 'Doji', signal: 'BULLISH', signalLabel: 'Tăng', state: 's', meaning: 'm', action: 'a' }, { name: 'X', signal: 'weird' }, { signal: 'bullish' }] });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'Doji', signal: 'bullish', signalLabel: 'Tăng', action: 'a' });
    expect(items[1]).toMatchObject({ signal: 'neutral', state: null });
  });
});
