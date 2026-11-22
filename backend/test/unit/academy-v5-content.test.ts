import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CATALOG_ROWS } from '../../scripts/academy-v5-import/catalog-table.js';
import { findBackendRoot, outDir, v4Dir } from '../../scripts/academy-v5-import/paths.js';
import { verify } from '../../scripts/academy-v5-import/verify.js';
import type {
  BankFile,
  CatalogFile,
  ChartModel,
  LessonFile,
  RetiredLessonsFile,
} from '../../src/modules/academy/content/v5/schema.js';

const dir = outDir();
const read = <T>(...p: string[]): T => JSON.parse(readFileSync(join(...p), 'utf8')) as T;
const catalog = read<CatalogFile>(dir, 'catalog.json');
const v4Catalog = read<CatalogFile>(v4Dir(), 'catalog.json');
const items = catalog.chapters.flatMap((c) => c.items);
const lessonOf = (id: string) => read<LessonFile>(dir, 'lessons', `${id}.vi.json`);
const bankOf = (id: string) => read<BankFile>(dir, 'questions', `${id}.private.json`);
const chapter = (no: number) => catalog.chapters[no - 1]!;
const lessonNames = (no: number) =>
  chapter(no)
    .items.filter((i) => i.kind === 'lesson')
    .map((i) => i.name.split(' · ')[0]);
const newKeys = read<{ keys: Record<string, string[]> }>(
  findBackendRoot(),
  'test',
  'fixtures',
  'academy-v5',
  'new-metric-keys.json',
).keys;

describe('academy v5 content (spec v5 §1, §10)', () => {
  it('passes the importer verify (counts, frozen v4 files, sections, charts, banks, manifest hashes)', () => {
    expect(verify(dir, { reextract: false })).toEqual([]);
  });

  it('has 17 chapters, 203 required lessons, 1 practice, 17 exams of 30 questions from chapter 4', () => {
    expect(catalog.chapters.map((c) => c.lesson_count)).toEqual([
      10, 10, 9, 10, 4, 4, 7, 17, 16, 15, 14, 11, 19, 15, 13, 15, 14,
    ]);
    expect(catalog.chapters.reduce((s, c) => s + c.lesson_count, 0)).toBe(203);
    expect(items.filter((i) => i.kind === 'practice')).toHaveLength(1);
    const exams = items.filter((i) => i.kind === 'chapter_exam');
    expect(exams).toHaveLength(17);
    for (const e of exams.filter((x) => Number(x.id.slice(2, 4)) >= 4))
      expect(bankOf(e.id).questions, e.id).toHaveLength(30);
    expect(chapter(13).title).toBe('Phân tích công ty bất động sản');
    expect(chapter(17).title).toBe('Phân tích vật liệu cơ bản');
  });

  it('orders chapters 10-12 as spec §1.5-1.7, keeping the v4 lesson ids', () => {
    expect(lessonNames(10)).toEqual([
      'Tăng trưởng doanh thu',
      'NIM',
      'Lợi suất tài sản sinh lãi và chi phí vốn',
      'CIR',
      'Tỷ trọng thu nhập ngoài lãi',
      'Tăng trưởng lợi nhuận trước dự phòng',
      'ROE',
      'ROA',
      'Chi phí tín dụng',
      'Tỷ lệ dự phòng / Dư nợ',
      'Tăng trưởng tín dụng và huy động',
      'LDR',
      'Lãi dự thu / Dư nợ',
      'VCSH / Tổng tài sản',
      'P/B',
    ]);
    expect(lessonNames(11)).toEqual([
      'Tăng trưởng doanh thu',
      'Cơ cấu doanh thu hoạt động',
      'Biên lợi nhuận hoạt động',
      'Margin Stability',
      'Tăng trưởng dư nợ cho vay',
      'Dư nợ cho vay / VCSH',
      'Lợi suất cho vay',
      'Biên lợi nhuận môi giới',
      'Tỷ trọng tài sản tự doanh',
      'Hiệu suất tự doanh',
      'Chi phí hoạt động / Doanh thu hoạt động',
      'Nợ vay / VCSH',
      'ROE',
      'P/B',
    ]);
    expect(lessonNames(12)).toEqual([
      'Tăng trưởng doanh thu phí bảo hiểm gốc',
      'Tỷ lệ giữ lại',
      'Tỷ lệ bồi thường',
      'Tỷ lệ chi phí',
      'Combined ratio',
      'Lợi suất đầu tư',
      'Cơ cấu lợi nhuận',
      'Biên lợi nhuận ròng',
      'ROE',
      'Dự phòng nghiệp vụ / VCSH',
      'P/B',
    ]);
    // §10.9: NIM keeps id and key, now at position 2 of Chương 10.
    const nim = chapter(10).items[1]!;
    expect([nim.id, nim.lesson_key, nim.order]).toEqual(['ch10-l01', 'fundamental:nim', 2]);
    expect(lessonOf('ch10-l01').order).toBe(2);
  });

  it('keeps every v4 item (id, kind, lesson_key, metric_key) so progress and xu carry over', () => {
    const now = new Map(items.map((i) => [i.id, i] as const));
    const v4Items = v4Catalog.chapters.flatMap((c) => c.items);
    expect(v4Items).toHaveLength(129);
    for (const it of v4Items) {
      const v5 = now.get(it.id)!;
      expect([v5.kind, v5.lesson_key, v5.metric_key], it.id).toEqual([
        it.kind,
        it.lesson_key,
        it.metric_key,
      ]);
    }
  });

  it('gives the 87 added lessons fundamental:<metric_key>-<nganh> keys that never collide with retired keys', () => {
    const added = CATALOG_ROWS.filter((r) => r.added && r.kind === 'lesson');
    expect(added).toHaveLength(87);
    const retired = new Set(
      read<RetiredLessonsFile>(dir, 'retired-lessons.json').lessons.map((l) => l.lesson_key),
    );
    const v4Retired = read<RetiredLessonsFile>(v4Dir(), 'retired-lessons.json').lessons.map(
      (l) => l.lesson_key,
    );
    for (const r of added) {
      expect(r.lesson_key).toBe(`fundamental:${r.metric_key}-${r.nganh}`);
      expect(retired.has(r.lesson_key) || v4Retired.includes(r.lesson_key), r.lesson_key).toBe(
        false,
      );
    }
    for (const k of ['exam:ch13-v5', 'exam:ch17-v5']) expect(v4Retired).not.toContain(k);
  });

  it('uses exactly the 28 new metric keys of the Dashboard v3 catalog (§6.3), each for its industries', () => {
    const v4Keys = new Set(
      v4Catalog.chapters
        .flatMap((c) => c.items)
        .map((i) => i.metric_key)
        .filter(Boolean),
    );
    const fresh: Record<string, string[]> = {};
    for (const i of items)
      if (i.metric_key && !v4Keys.has(i.metric_key)) (fresh[i.metric_key] ??= []).push(i.nganh!);
    expect(fresh).toEqual(newKeys);
    expect(Object.keys(fresh)).toHaveLength(28);
    expect(Object.values(fresh).flat()).toHaveLength(41);
  });

  it('titles re-taught lessons "Tên chỉ tiêu · ở <ngành>" (§10.6) and gives ROE four lessons', () => {
    const roe = items.filter((i) => i.metric_key === 'roe').map((i) => [i.id, i.nganh, i.name]);
    expect(roe).toEqual([
      ['ch08-l11', 'chung', 'ROE · tỷ suất lợi nhuận trên vốn chủ'],
      ['ch10-l13', 'nh', 'ROE · ở ngân hàng'],
      ['ch11-l13', 'ck', 'ROE · ở công ty chứng khoán'],
      ['ch12-l10', 'bh', 'ROE · ở công ty bảo hiểm'],
    ]);
  });

  it('renames the Chương 8 industries section and links the re-taught lessons (§1.3, §10.2)', () => {
    const l = lessonOf('ch08-l01');
    const s = l.sections.at(-1)!;
    expect(s.title).toBe('Ở các ngành');
    const links = s.blocks.find((b) => b.type === 'lesson_links');
    expect(links?.type === 'lesson_links' && links.links.map((k) => k.nganh)).toEqual([
      'nh',
      'ck',
      'bds',
      'dk',
      'bl',
      'dien',
      'vl',
    ]);
    expect(
      links?.type === 'lesson_links' && links.links.every((k) => k.metric_key === 'revenue_yoy'),
    ).toBe(true);
    expect(JSON.stringify(lessonOf('ch08-l02'))).not.toContain(
      'Với ngân hàng, chứng khoán, bảo hiểm',
    );
  });

  it('adds "Ở các ngành" as the last section of 9 Chương 9 lessons (§1.4, §10.3)', () => {
    const withPart = chapter(9)
      .items.filter((i) => i.kind === 'lesson')
      .filter((i) => lessonOf(i.id).sections.at(-1)?.title === 'Ở các ngành')
      .map((i) => i.metric_key);
    expect(withPart).toEqual([
      'gross_margin',
      'roic',
      'ccc',
      'debt_equity',
      'interest_coverage',
      'net_debt_ebitda',
      'cfo_profit',
      'fcf_margin',
      'ev_ebitda',
    ]);
  });

  it('draws the representative charts like the Dashboard (§10.8)', () => {
    const rep = (id: string) =>
      Object.values(lessonOf(id).charts).find(
        (m): m is Extract<ChartModel, { kind: 'fundamental' }> => m.kind === 'fundamental',
      )!.chart;
    for (const id of ['ch10-l13', 'ch11-l13', 'ch12-l10'])
      expect(
        rep(id).main.map((m) => m.name.split(' ')[0]),
        id,
      ).toEqual(['ROE', 'ROA']);
    for (const id of ['ch14-l02', 'ch17-l02']) {
      expect(rep(id).main[0]!.name, id).toBe('Biên gộp quý');
      expect(rep(id).sub?.type, id).toBe('stacked');
    }
    expect(rep('ch13-l09').unit).toBe('năm');
    expect(rep('ch13-l14').ref).toBe(1);
  });

  it('asks one question about the representative chart in every added lesson', () => {
    for (const r of CATALOG_ROWS.filter((x) => x.added && x.kind === 'lesson')) {
      const about = bankOf(r.id).questions.filter((q) => q.chart_id);
      expect(
        about.map((q) => q.chart_id),
        r.id,
      ).toEqual([`c${Number(r.id.slice(2, 4))}l${Number(r.id.slice(6))}-rep`]);
    }
  });
});
