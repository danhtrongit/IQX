import { mkdirSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  PAGE_SIZES,
  demoTradingUrl,
} from '../../src/modules/market-bulletins/bulletin.constants.js';
import type { SlotNumber } from '../../src/modules/market-bulletins/bulletin.constants.js';
import {
  renderBulletin,
  renderBulletinPdf,
  renderBulletinSvgs,
  type BulletinRenderInput,
} from '../../src/modules/market-bulletins/render/index.js';
import { measure, wrapText } from '../../src/modules/market-bulletins/render/fonts.js';
import { renderPdf } from '../../src/modules/market-bulletins/render/pdf.js';
import {
  FIXTURE_DATE,
  fixtureContent,
  fixtureModel,
  fixtureSlot,
} from './market-bulletin-fixture.js';

function input(overrides: Partial<BulletinRenderInput> = {}): BulletinRenderInput {
  const model = fixtureModel();
  return {
    date: FIXTURE_DATE,
    model,
    content: fixtureContent(model),
    slots: { 1: fixtureSlot(1, { passed: 12 }), 2: fixtureSlot(2, { passed: 0 }), 3: null },
    ...overrides,
  };
}

const texts = (svg: string): string =>
  [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' | ');

describe('bản tin: dựng trang', () => {
  it('bản máy tính có 2 trang, bản điện thoại 5 trang, đúng khổ giấy', () => {
    const desktop = renderBulletin(input(), 'desktop');
    const mobile = renderBulletin(input(), 'mobile');
    expect(desktop.pages).toHaveLength(2);
    expect(mobile.pages).toHaveLength(5);
    for (const page of desktop.pages)
      expect([page.width, page.height]).toEqual([
        PAGE_SIZES.desktop.width,
        PAGE_SIZES.desktop.height,
      ]);
    for (const page of mobile.pages)
      expect([page.width, page.height]).toEqual([
        PAGE_SIZES.mobile.width,
        PAGE_SIZES.mobile.height,
      ]);
  });

  it('dựng lặp lại cho cùng đầu vào cho ra cùng SVG (tất định)', () => {
    const a = renderBulletinSvgs(input(), 'desktop').svgs;
    const b = renderBulletinSvgs(input(), 'desktop').svgs;
    expect(a).toEqual(b);
  });

  it('trang 1 có số liệu VN-Index, ba nhận định và khung kịch bản', () => {
    const svg = renderBulletinSvgs(input(), 'desktop').svgs[0]!;
    const all = texts(svg);
    expect(all).toContain('BẢN TIN THỊ TRƯỜNG');
    expect(all).toContain('XU HƯỚNG');
    expect(all).toContain('ĐỘNG LƯỢNG');
    expect(all).toContain('THANH KHOẢN');
    expect(all).toContain('KỊCH BẢN THAM KHẢO');
    expect(all).toContain('GIÁ TRỊ GIAO DỊCH');
    expect(all).toContain('212 tăng');
    expect(all).toContain('143 giảm');
  });

  it('không có khối giá trị giao dịch và độ rộng khi chưa có số liệu thị trường', () => {
    const model = fixtureModel(null);
    const svg = renderBulletinSvgs(input({ model, content: fixtureContent(model) }), 'desktop')
      .svgs[0]!;
    expect(texts(svg)).not.toContain('GIÁ TRỊ GIAO DỊCH');
    expect(texts(svg)).not.toContain('ĐỘ RỘNG');
  });

  it('bỏ khung kịch bản khi không nhập mức nào', () => {
    const model = fixtureModel();
    const content = fixtureContent(model);
    content.levels = {
      r1: null,
      r2: null,
      s1: null,
      s2: null,
      pa: null,
      pt: null,
      na: null,
      nt: null,
    };
    const svg = renderBulletinSvgs(input({ model, content }), 'desktop').svgs[0]!;
    expect(texts(svg)).not.toContain('KỊCH BẢN THAM KHẢO');
  });

  it('trang bộ lọc: bảng có mã, ô không có mã đạt và ô chưa đẩy hiển thị đúng chữ', () => {
    const svg = renderBulletinSvgs(input(), 'desktop').svgs[1]!;
    const all = texts(svg);
    expect(all).toContain('BỘ LỌC CỔ PHIẾU');
    expect(all).toContain('KẾT QUẢ PHIÊN 06/11');
    expect(all).toContain('FPT');
    expect(all).toContain('Phiên này không có mã đạt.');
    expect(all).toContain('Không có mã đạt nên không có biểu đồ minh hoạ.');
    expect(all).toContain('Chưa đẩy kết quả');
    expect(all).toContain('Chưa đẩy kết quả phiên này từ Bộ lọc.');
  });

  it('bảng chỉ lấy tối đa 10 mã, xếp theo GTGD giảm dần', () => {
    const view = renderBulletin(input(), 'desktop');
    const symbols = view.pages[1]!.prims.filter((p) => p.k === 'link');
    expect(symbols).toHaveLength(10);
    const svg = renderBulletinSvgs(input(), 'desktop').svgs[1]!;
    expect(texts(svg)).toContain('KẾT QUẢ PHIÊN 06/11 · 10 MÃ');
  });

  it('mã trong bảng là liên kết Demo trading đúng mẫu đường dẫn', () => {
    const rendered = renderBulletin(input(), 'desktop');
    const urls = rendered.pages[1]!.prims.flatMap((p) => (p.k === 'link' ? [p.url] : []));
    expect(urls[0]).toBe(demoTradingUrl('FPT'));
    expect(demoTradingUrl('FPT')).toBe('https://iqx.vn/demo-trading?view=trading&symbol=FPT');
  });

  it('kết quả của phiên cũ hơn ngày bản tin bị coi là chưa đẩy', () => {
    const stale = fixtureSlot(1, { date: '2026-11-05' });
    const svg = renderBulletinSvgs(input({ slots: { 1: stale, 2: null, 3: null } }), 'desktop')
      .svgs[1]!;
    expect(texts(svg)).toContain('Chưa đẩy kết quả phiên này từ Bộ lọc.');
    expect(texts(svg)).not.toContain('FPT');
  });

  it('ô nhận định quá dài được báo tràn khung', () => {
    const model = fixtureModel();
    const content = fixtureContent(model);
    content.trend = 'Đây là một câu rất dài để thử khung nhận định. '.repeat(40);
    expect(renderBulletin(input({ model, content }), 'desktop').overflow).toEqual(['trend']);
    expect(renderBulletin(input(), 'desktop').overflow).toEqual([]);
  });

  it('chữ xuống dòng không vượt bề rộng cho phép', () => {
    const lines = wrapText(
      'Dòng chữ tiếng Việt khá dài cần phải được ngắt thành nhiều dòng gọn gàng.',
      160,
      12.6,
      400,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line, 12.6, 400)).toBeLessThanOrEqual(160 + 0.01);
  });

  it('SVG là tài liệu hợp lệ cơ bản và có liên kết bảo vệ rel noopener', () => {
    const svg = renderBulletinSvgs(input(), 'desktop').svgs[1]!;
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('rel="noopener noreferrer"');
  });
});

describe('bản tin: PDF', () => {
  it('xuất PDF hợp lệ với số trang đúng và liên kết mã dạng chú thích', async () => {
    const createdAt = new Date('2026-11-06T09:30:00.000Z');
    const desktop = await renderBulletinPdf(input(), 'desktop', createdAt);
    const mobile = await renderBulletinPdf(input(), 'mobile', createdAt);
    for (const { pdf } of [desktop, mobile]) {
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(5_000);
    }
    const count = (buffer: Buffer, pattern: RegExp) =>
      (buffer.toString('latin1').match(pattern) ?? []).length;
    expect(count(desktop.pdf, /\/Type \/Page\b/g)).toBe(2);
    expect(count(mobile.pdf, /\/Type \/Page\b/g)).toBe(5);
    expect(count(desktop.pdf, /\/Subtype \/Link/g)).toBe(10);
    expect(desktop.pdf.toString('latin1')).toContain(demoTradingUrl('FPT'));
  });

  it('có nhúng font (chữ tiếng Việt chọn và sao chép được)', async () => {
    const { pdf } = await renderBulletinPdf(
      input(),
      'desktop',
      new Date('2026-11-06T09:30:00.000Z'),
    );
    const body = pdf.toString('latin1');
    expect(body).toContain('/FontFile2');
    expect(body).toMatch(/BeVietnamPro/);
  });

  it('ghi file mẫu để xem bằng mắt khi đặt BULLETIN_PROBE_DIR', async () => {
    const dir = process.env.BULLETIN_PROBE_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    const slots: Record<SlotNumber, ReturnType<typeof fixtureSlot> | null> = {
      1: fixtureSlot(1, { passed: 12 }),
      2: fixtureSlot(2, { passed: 0 }),
      3: null,
    };
    for (const variant of ['desktop', 'mobile'] as const) {
      const { pdf } = await renderBulletinPdf(
        input({ slots }),
        variant,
        new Date('2026-11-06T09:30:00.000Z'),
      );
      writeFileSync(`${dir}/${variant}.pdf`, pdf);
      const pages = renderBulletin(input({ slots }), variant).pages;
      for (const [i, page] of pages.entries())
        writeFileSync(
          `${dir}/${variant}-p${i + 1}.pdf`,
          await renderPdf([page], { title: 'probe', createdAt: new Date(0) }),
        );
    }
  });
});
