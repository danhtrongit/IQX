import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ACADEMY_V5_CATALOG_VERSION,
  blockSchema,
  catalogFileSchema,
  chartModelSchema,
  examKeyOf,
  linkQuerySchema,
  linkResponseSchema,
  NGANH_CHAPTER,
  nganhOfChapter,
  parseNganh,
} from '../../src/modules/academy/content/v5/schema.js';
import type { CatalogFile } from '../../src/modules/academy/content/v5/schema.js';
import { outDir } from '../../scripts/academy-v5-import/paths.js';

const contentDir = outDir();
const catalog = (): CatalogFile =>
  JSON.parse(readFileSync(join(contentDir, 'catalog.json'), 'utf8')) as CatalogFile;
const issues = (c: CatalogFile): string[] => {
  const r = catalogFileSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};
const item = (c: CatalogFile, id: string) => {
  const it = c.chapters.flatMap((ch) => ch.items).find((x) => x.id === id);
  if (!it) throw new Error(id);
  return it;
};

describe('academy v5 schema: industries', () => {
  it('maps the 10 industry codes to chapters 8-17 (spec v5 §7)', () => {
    expect(Object.values(NGANH_CHAPTER)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(nganhOfChapter(8)).toBe('chung');
    expect(nganhOfChapter(13)).toBe('bds');
    expect(nganhOfChapter(7)).toBeNull();
  });

  it('reads nganh leniently: unknown codes are ignored, never an error', () => {
    expect(parseNganh('nh')).toBe('nh');
    expect(parseNganh(' DIEN ')).toBe('dien');
    expect(parseNganh('xx')).toBeNull();
    expect(parseNganh(undefined)).toBeNull();
    expect(linkQuerySchema.parse({ metric: 'roe' })).toEqual({ metric: 'roe' });
    expect(linkQuerySchema.parse({ metric: 'roe', nganh: 'xx' }).nganh).toBe('xx');
    expect(linkResponseSchema.shape.nganh).toBeDefined();
  });

  it('keys exams: ch1-7 v3.3, ch8-12 v4 (passes kept), ch13-17 v5', () => {
    expect(examKeyOf(7)).toBe('exam:ch07');
    expect(examKeyOf(10)).toBe('exam:ch10-v4');
    expect(examKeyOf(13)).toBe('exam:ch13-v5');
    expect(examKeyOf(17)).toBe('exam:ch17-v5');
  });
});

describe('academy v5 schema: catalog rules', () => {
  it('accepts the generated catalog', () => {
    const c = catalog();
    expect(c.catalog_version).toBe(ACADEMY_V5_CATALOG_VERSION);
    expect(issues(c)).toEqual([]);
  });

  it('rejects a nganh that is not the chapter industry', () => {
    const c = catalog();
    item(c, 'ch13-l01').nganh = 'dk';
    expect(issues(c).join('\n')).toMatch(/nganh must be bds/);
  });

  it('rejects a duplicate (metric_key, nganh) pair', () => {
    const c = catalog();
    const a = item(c, 'ch13-l02');
    a.metric_key = 'revenue_yoy';
    a.lesson_key = 'fundamental:revenue_yoy-bds-x';
    expect(issues(c).join('\n')).toMatch(/duplicate \(metric_key, nganh\) revenue_yoy\|bds/);
  });

  it('requires fundamental:<mk>-<nganh> for chapters 13-17 and fundamental:<mk> for chapter 8', () => {
    const c = catalog();
    item(c, 'ch13-l01').lesson_key = 'fundamental:revenue_yoy';
    item(c, 'ch08-l11').lesson_key = 'fundamental:roe-chung';
    const msg = issues(c).join('\n');
    expect(msg).toMatch(/ch13-l01: lesson_key/);
    expect(msg).toMatch(/ch08-l11: lesson_key/);
  });

  it('lets chapters 10-12 keep frozen ids out of position order, but only unique in-range ids', () => {
    const c = catalog();
    expect(c.chapters[9]!.items[0]!.id).toBe('ch10-l12');
    expect(c.chapters[9]!.items[1]!.id).toBe('ch10-l01');
    item(c, 'ch10-l12').id = 'ch10-l16';
    expect(issues(c).join('\n')).toMatch(/ch10-l16: lesson id must be a unique ch10-lNN/);
  });

  it('requires nganh exactly when there is a metric_key', () => {
    const c = catalog();
    item(c, 'ch01-l01').nganh = 'chung';
    expect(issues(c).join('\n')).toMatch(/ch01-l01: nganh exactly with a metric_key/);
  });
});

describe('academy v5 schema: figure charts and lesson links', () => {
  it('accepts the five FIG kinds', () => {
    const ok = [
      {
        kind: 'figure',
        fig: 'formula',
        items: [
          { t: 'A', v: '1', tone: 'p1', notes: ['Q2/26'] },
          { t: 'B', v: '2', tone: 'pos' },
        ],
        ops: ['÷'],
        height: 200,
      },
      {
        kind: 'figure',
        fig: 'hbar',
        title: 'T · số minh họa',
        items: [{ label: 'a', value: -1.5, tone: 'neg' }],
        decimals: 1,
        unit: '%',
      },
      {
        kind: 'figure',
        fig: 'stack',
        parts: [{ label: 'a', value: 3, tone: 'p1' }],
        decimals: 0,
        unit: ' tỷ',
      },
      {
        kind: 'figure',
        fig: 'wf',
        items: [
          { label: 'a', value: 100, step: 'base' },
          { label: 'b', value: 10, step: 'minus', tone: 'neg' },
        ],
        decimals: 0,
        unit: '',
      },
      {
        kind: 'figure',
        fig: 'lines',
        rows: [{ report: 'B02', line: 'Doanh thu', code: '10', tone: 'p1' }],
      },
    ];
    for (const m of ok) expect(chartModelSchema.safeParse(m).success, JSON.stringify(m)).toBe(true);
  });

  it('rejects dashes, arrows and unknown keys in figures', () => {
    const base = {
      kind: 'figure',
      fig: 'lines',
      rows: [{ report: 'B02', line: 'Doanh thu', tone: 'p1' }],
    };
    expect(chartModelSchema.safeParse({ ...base, title: 'A – B' }).success).toBe(false);
    expect(chartModelSchema.safeParse({ ...base, title: 'A → B' }).success).toBe(false);
    expect(chartModelSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(chartModelSchema.safeParse({ ...base, fig: 'pie' }).success).toBe(false);
  });

  it('validates lesson_links (1-8 links, known industry)', () => {
    const link = { label: 'ROE · ở ngân hàng', metric_key: 'roe', nganh: 'nh' };
    const block = { type: 'lesson_links', lead: '<b>Có bài riêng:</b>', links: [link], tail: '.' };
    expect(blockSchema.safeParse(block).success).toBe(true);
    expect(blockSchema.safeParse({ ...block, links: [] }).success).toBe(false);
    expect(blockSchema.safeParse({ ...block, links: Array(9).fill(link) }).success).toBe(false);
    expect(blockSchema.safeParse({ ...block, links: [{ ...link, nganh: 'xx' }] }).success).toBe(
      false,
    );
  });
});
