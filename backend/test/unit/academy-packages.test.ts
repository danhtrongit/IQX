import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  chartsFileSchema,
  packageLessonsFileSchema,
  privateQuestionsFileSchema,
  toPublicQuestion,
} from '../../src/modules/academy/content/packages/package.schema.js';
import type {
  Block,
  ChartModel,
  PackageLesson,
  PrivateQuestion,
} from '../../src/modules/academy/content/packages/package.schema.js';
import {
  blocksText,
  convertSection,
  sourceSectionText,
} from '../../scripts/academy-import/blocks.js';
import type { ConvertContext } from '../../scripts/academy-import/blocks.js';
import {
  RawNumber,
  canonicalHash,
  canonicalRaw,
  opaqueOptionId,
  parseRawJson,
  pyFloatRepr,
  sha256Hex,
  stableStringify,
} from '../../scripts/academy-import/canonical.js';
import {
  avgPrevious,
  bb,
  buildHooks,
  buildLessonCharts,
  ema,
  fmt,
  formatVi,
  macd,
  rsi,
  sma,
} from '../../scripts/academy-import/ch1-math.js';
import type { Ch1Data } from '../../scripts/academy-import/ch1-math.js';
import { evaluateProof, loadSource, runExtraction } from '../../scripts/academy-import/extract.js';
import {
  C1_CHART_WINDOWS,
  C3_LESSON_CHART_IDS,
  CHAPTER_GATES,
} from '../../scripts/academy-import/gates.js';
import { chapterDirName, defaultLocations } from '../../scripts/academy-import/paths.js';
import type { Locations } from '../../scripts/academy-import/paths.js';
import {
  FORBIDDEN_TEXT,
  sanitizeHtml,
  scanForbidden,
} from '../../scripts/academy-import/sanitize-allow.js';
import { verifyPackages } from '../../scripts/academy-import/verify.js';
import { readWebpInfo } from '../../scripts/academy-import/webp.js';

const locations = defaultLocations();
const readPackage = <T>(chapter: number, file: string): T =>
  JSON.parse(readFileSync(join(locations.packagesDir, chapterDirName(chapter), file), 'utf8')) as T;

const tempDirs: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'academy-packages-'));
  tempDirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('academy packages: committed outputs verify without the source HTML', () => {
  const report = verifyPackages({ locations });

  it('passes every inventory, hash, schema, reference and do-not-copy check', () => {
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.chapters.map((c) => c.chapter)).toEqual([1, 2, 3, 4]);
  });

  it('matches the inventory of the specs', () => {
    const [c1, c2, c3, c4] = report.chapters.map((c) => c.counts);
    expect(c1).toMatchObject({
      lessons: 6,
      sections: 24,
      chart_blocks: 16,
      computed_tables: 6,
      questions: 48,
      chart_questions: 10,
      table_questions: 2,
      hints: 9,
      explanations: 192,
      chart_models: 26,
    });
    expect(c2).toMatchObject({
      images: 22,
      tables: 17,
      details: 4,
      steps_blocks: 6,
      step_items: 21,
      callouts: 3,
    });
    expect(c3).toMatchObject({
      chart_blocks: 13,
      chart_models: 14,
      questions: 48,
      chart_questions: 10,
      table_questions: 8,
      hints: 1,
      filter_examples: 6,
      tables: 25,
    });
    expect(c4).toMatchObject({ images: 27, tables: 17 });
    expect(c2?.image_bytes).toBe(720_260);
    expect(c4?.image_bytes).toBe(1_064_936);
  });

  it('keeps the per-lesson image and table counts of the guide chapters', () => {
    const per = (chapter: number, key: 'images' | 'tables'): number[] =>
      readPackage<PackageLesson[]>(chapter, 'lessons.vi.json').map((l) => {
        let n = 0;
        const walk = (blocks: Block[]): void => {
          for (const b of blocks) {
            if (key === 'images' && b.type === 'image') n += 1;
            if (key === 'tables' && b.type === 'table') n += 1;
            if (b.type === 'callout' || b.type === 'details') walk(b.blocks);
          }
        };
        walk(l.sections.flatMap((s) => s.blocks));
        return n;
      });
    expect(per(2, 'images')).toEqual([3, 5, 3, 1, 6, 4]);
    expect(per(4, 'images')).toEqual([3, 5, 2, 4, 5, 8]);
    expect(per(4, 'tables')).toEqual([4, 3, 3, 2, 1, 4]);
  });

  it('detects tampering with committed files', () => {
    const copy = tempDir();
    cpSync(locations.packagesDir, copy, { recursive: true });
    const lessonsPath = join(copy, 'ch01', 'lessons.vi.json');
    writeFileSync(
      lessonsPath,
      readFileSync(lessonsPath, 'utf8').replace('Khái niệm', 'Khái niệm!'),
    );
    const tampered: Locations = { ...locations, packagesDir: copy };
    const result = verifyPackages({ locations: tampered, chapters: [1] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('lessons.vi.json sha256'))).toBe(true);
  });

  it('detects a missing image file', () => {
    const emptyPublic = tempDir();
    const result = verifyPackages({
      locations: { ...locations, publicDir: emptyPublic },
      chapters: [2],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('image file missing'))).toBe(true);
  });

  it('writes image src urls that exist under frontend/public with the manifest hash', () => {
    for (const chapter of [2, 4]) {
      const lessons = readPackage<PackageLesson[]>(chapter, 'lessons.vi.json');
      const assets = readPackage<
        Record<
          string,
          { file: string; sha256: string; bytes: number; width: number; height: number }
        >
      >(chapter, 'assets.manifest.json');
      let seen = 0;
      const walk = (blocks: Block[]): void => {
        for (const b of blocks) {
          if (b.type === 'image') {
            seen += 1;
            const path = join(locations.publicDir, b.src);
            expect(existsSync(path)).toBe(true);
            const data = readFileSync(path);
            expect(sha256Hex(data)).toBe(assets[b.asset_id]?.sha256);
            const info = readWebpInfo(data);
            expect([info.width, info.height]).toEqual([b.width, b.height]);
            expect(b.src).toMatch(
              new RegExp(`^/assets/academy/ch0${chapter}/${b.asset_id}\\.[0-9a-f]{8}\\.webp$`),
            );
            expect(b.src.endsWith(`${assets[b.asset_id]?.sha256.slice(0, 8)}.webp`)).toBe(true);
          }
          if (b.type === 'callout' || b.type === 'details') walk(b.blocks);
        }
      };
      for (const l of lessons) walk(l.sections.flatMap((s) => s.blocks));
      expect(seen).toBe(chapter === 2 ? 22 : 27);
    }
  });
});

describe('academy packages: question banks', () => {
  for (const chapter of [1, 3]) {
    describe(`chapter ${chapter}`, () => {
      const questions = privateQuestionsFileSchema.parse(
        readPackage<unknown>(chapter, 'questions.vi.private.json'),
      );

      it('has 48 questions, 8 per lesson, ids chNN-lMM-qKK', () => {
        expect(questions).toHaveLength(48);
        const lessons = CHAPTER_GATES[chapter as 1 | 3].lessons;
        for (const lesson of lessons) {
          const own = questions.filter((q) => q.lesson_id === lesson.id);
          expect(own.map((q) => q.id)).toEqual(
            Array.from({ length: 8 }, (_, i) => `${lesson.id}-q0${i + 1}`),
          );
        }
      });

      it('re-keys options to opaque ids derived from sha256(question|source option)', () => {
        for (const q of questions) {
          expect(q.options).toHaveLength(4);
          for (const o of q.options) {
            expect(o.id).toMatch(/^[0-9a-f]{10}$/);
            expect(o.id).toBe(sha256Hex(`${q.id}|${o.source_id}`).slice(0, 10));
            expect(o.id).toBe(opaqueOptionId(q.id, o.source_id));
          }
          expect(q.options.some((o) => o.id === q.correct_option_id)).toBe(true);
        }
        expect(new Set(questions.map((q) => q.correct_option_id)).size).toBe(48);
      });

      it('keeps the key out of the position as well and gives every option an explanation', () => {
        const positions = new Set(
          questions.map((q) => q.options.findIndex((o) => o.id === q.correct_option_id)),
        );
        expect(positions.size).toBeGreaterThanOrEqual(3);
        expect(questions.flatMap((q) => q.options).every((o) => o.explanation.length > 0)).toBe(
          true,
        );
      });

      it('projects no answer data before submit', () => {
        for (const q of questions) {
          const pub = toPublicQuestion(q);
          const json = JSON.stringify(pub);
          expect(json).not.toContain('correct_option_id');
          expect(json).not.toContain('explanation');
          expect(pub.options.map((o) => Object.keys(o))).toEqual(
            q.options.map(() => ['id', 'text']),
          );
        }
      });

      it('does not leak answers into the public files', () => {
        const lessons = readPackage<unknown>(chapter, 'lessons.vi.json');
        const charts = readPackage<unknown>(chapter, 'charts.vi.json');
        const answerKeys = new Set(['correct', 'correct_option_id', 'explanation', 'proof']);
        expect(scanForbidden(lessons, { keys: answerKeys })).toEqual([]);
        expect(scanForbidden(charts, { keys: answerKeys })).toEqual([]);
        const publicText = JSON.stringify([lessons, charts]);
        for (const q of questions) {
          for (const o of q.options) expect(publicText).not.toContain(o.id);
        }
      });
    });
  }

  it('chapter 1 questions: 10 chart figures, 2 matrix tables, 9 hints, windows as in the spec', () => {
    const questions = readPackage<PrivateQuestion[]>(1, 'questions.vi.private.json');
    const charts = chartsFileSchema.parse(readPackage<unknown>(1, 'charts.vi.json'));
    expect(questions.filter((q) => q.figure?.type === 'chart')).toHaveLength(10);
    expect(questions.filter((q) => q.figure?.type === 'table')).toHaveLength(2);
    expect(questions.filter((q) => q.hint !== undefined)).toHaveLength(9);
    const rsiQ4 = charts['ch01-l01-q04'];
    expect(rsiQ4?.kind).toBe('series_panels');
    if (rsiQ4?.kind === 'series_panels') expect(rsiQ4.marks).toEqual([{ i: 115, label: 'B' }]);
    const q6 = questions.find((q) => q.source_id === 'hopluu-q6');
    expect(q6?.correct_option_id).toBe(opaqueOptionId(q6?.id ?? '', 'o3'));
    const q8 = questions.find((q) => q.source_id === 'hopluu-q8');
    expect(q8?.correct_option_id).toBe(opaqueOptionId(q8?.id ?? '', 'o2'));
  });

  it('chapter 3 questions: 10 chart and 8 table figures, 1 hint, keys re-keyed from the constant o1', () => {
    const questions = readPackage<PrivateQuestion[]>(3, 'questions.vi.private.json');
    expect(questions.filter((q) => q.figure?.type === 'chart')).toHaveLength(10);
    expect(questions.filter((q) => q.figure?.type === 'table')).toHaveLength(8);
    expect(questions.filter((q) => q.hint !== undefined)).toHaveLength(1);
    for (const q of questions) expect(q.correct_option_id).toBe(opaqueOptionId(q.id, 'o1'));
  });
});

describe('academy packages: chapter 1 maths (golden values from the spec)', () => {
  it('RSI: Wilder seed and update (C1-023) and edge cases (C1-024)', () => {
    const r = rsi([100, 101, 100, 102, 101, 104], 5);
    expect(r.g[5]).toBeCloseTo(1.2, 12);
    expect(r.loss[5]).toBeCloseTo(0.4, 12);
    expect(r.value[5]).toBeCloseTo(75, 10);
    const next = rsi([100, 101, 100, 102, 101, 104, 103], 5);
    expect(next.g[6]).toBeCloseTo(0.96, 12);
    expect(next.loss[6]).toBeCloseTo(0.52, 12);
    expect(next.value[6]).toBeCloseTo(64.8648648649, 9);
    expect(rsi([5, 5, 5, 5, 5, 5, 5], 5).value.every((v) => v === null)).toBe(true);
    expect(rsi([1, 2, 3, 4, 5, 6, 7], 5).value[6]).toBe(100);
    expect(rsi([7, 6, 5, 4, 3, 2, 1], 5).value[6]).toBe(0);
    expect(rsi([1, 2, 3], 5).value).toEqual([null, null, null]);
  });

  it('SMA (C1-031) and EMA alpha = 2/(N+1) (C1-032)', () => {
    const s = sma([10, 11, 12, 11, 13, 12], 5);
    expect(s[4]).toBeCloseTo(11.4, 12);
    expect(s[5]).toBeCloseTo(11.8, 12);
    expect(s[3]).toBeNull();
    const e9 = ema([...Array<number>(9).fill(100), 110], 9);
    expect(e9[9]).toBeCloseTo(102, 12);
    const e19 = ema([...Array<number>(19).fill(100), 110], 19);
    expect(e19[19]).toBeCloseTo(101, 12);
    // A non-finite input resets the seed instead of inventing a value.
    expect(ema([1, 2, 3, null, 4, 5, 6], 3)).toEqual([null, null, 2, null, null, null, 5]);
  });

  it('MACD 12/26/9 on 26 prices of 100 then 8 of 110 (C1-029): MACD at index 25, signal at 33', () => {
    const prices = [...Array<number>(26).fill(100), ...Array<number>(8).fill(110)];
    const m = macd(prices);
    expect(m.value.findIndex((v) => v !== null)).toBe(25);
    expect(m.signal.findIndex((v) => v !== null)).toBe(33);
    expect(m.value[25]).toBeCloseTo(0, 12);
    expect(m.value[33]).toBeCloseTo(2.7749, 4);
    expect(m.signal[33]).toBeCloseTo(1.8799, 4);
    expect(m.hist[33]).toBeCloseTo(0.8949, 4);
    expect(m.signal[32]).toBeNull();
  });

  it('Bollinger N5 k2 uses the population sigma (C1-034)', () => {
    const b = bb([10, 12, 14, 12, 12], 5, 2);
    expect(b.mid[4]).toBeCloseTo(12, 12);
    expect(b.sd[4]).toBeCloseTo(Math.sqrt(1.6), 12);
    expect(b.upper[4]).toBeCloseTo(14.5298221281, 10);
    expect(b.lower[4]).toBeCloseTo(9.4701778719, 10);
  });

  it('volume average excludes the current session (C1-038)', () => {
    const a = avgPrevious([2, 3, 4, 5, 6, 7], 5);
    expect(a.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(a[5]).toBe(4);
    expect(1.5 * (a[5] as number)).toBe(6);
  });

  it('rsiApplyIndex = 117 in the committed rsi-application model (RSI 27.7511 -> 31.3680)', () => {
    const charts = chartsFileSchema.parse(readPackage<unknown>(1, 'charts.vi.json'));
    const m = charts['rsi-application'];
    if (m?.kind !== 'series_panels')
      throw new Error('rsi-application must be a series_panels model');
    expect(m.x).toEqual({ start: 107, end: 123 });
    expect(m.marks).toEqual([
      { i: 116, label: 'A' },
      { i: 117, label: 'B' },
    ]);
    const rsiValues = m.panels[1]?.series[0]?.values ?? [];
    expect(rsiValues[116 - 107]).toBeCloseTo(27.7511, 4);
    expect(rsiValues[117 - 107]).toBeCloseTo(31.368, 4);
  });

  it('committed hook tables carry the MACD seed (sessions 26-34) and the Phiên 34 sentence', () => {
    const lessons = readPackage<PackageLesson[]>(1, 'lessons.vi.json');
    const blocks: Block[] = [];
    const walk = (list: Block[]): void => {
      for (const b of list) {
        blocks.push(b);
        if (b.type === 'callout' || b.type === 'details') walk(b.blocks);
      }
    };
    for (const l of lessons) walk(l.sections.flatMap((s) => s.blocks));
    const seed = blocks.find((b) => b.type === 'table' && b.source?.hook === 'macd-seed');
    if (seed?.type !== 'table') throw new Error('macd seed table missing');
    expect(seed.rows.map((r) => r[0])).toEqual([
      '26',
      '27',
      '28',
      '29',
      '30',
      '31',
      '32',
      '33',
      '34',
    ]);
    expect(seed.rows[0]).toEqual(['26', '100', '100,0000', '100,0000', '0,0000', '—', '—']);
    expect(seed.rows[8]?.slice(4)).toEqual(['2,7749', '1,8799', '0,8949']);
    const sentence = blocks.find((b) => b.type === 'html' && b.html.includes('Phiên 34'));
    expect(sentence?.type === 'html' && sentence.html).toContain('<strong>2,7749</strong>');
    expect(
      blocks.filter((b) => b.type === 'table' && b.source?.hook === 'application'),
    ).toHaveLength(5);
  });

  it('every chart model keeps its window, marks and aligned panels', () => {
    const charts = chartsFileSchema.parse(readPackage<unknown>(1, 'charts.vi.json'));
    expect(Object.keys(charts)).toEqual(Object.keys(C1_CHART_WINDOWS));
    for (const [id, expect_] of Object.entries(C1_CHART_WINDOWS)) {
      const m = charts[id];
      if (m?.kind !== 'series_panels') throw new Error(`${id} must be a series_panels model`);
      expect([m.x.start, m.x.end]).toEqual([expect_.start, expect_.end]);
      expect(m.marks.map((k) => [k.i, k.label])).toEqual(expect_.marks);
      for (const p of m.panels) expect(p.series[0]?.values).toHaveLength(m.x.end - m.x.start + 1);
    }
  });

  it('formats like Intl vi-VN (rounding on the shortest decimal)', () => {
    if (Intl.NumberFormat.supportedLocalesOf('vi-VN').length === 0) return;
    const values = [
      0, 0.5, 1.005, 2.675, 1.045, 64.8648648649, -0.001, 1234.5678, 100, 99.995, 0.00049, 1e-7,
      123456.789, -2.5,
    ];
    for (const digits of [0, 1, 2, 4]) {
      const intl = new Intl.NumberFormat('vi-VN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      for (const v of values) expect(formatVi(v, digits)).toBe(intl.format(v));
    }
    expect(fmt(null)).toBe('—');
    expect(fmt(Number.NaN, 4)).toBe('—');
  });
});

/** A deterministic stand-in for the (uncommitted) price series, enough to exercise the builders. */
function syntheticData(): Ch1Data {
  const series = (n: number): number[] =>
    Array.from({ length: n }, (_, i) =>
      i < 60 ? 100 - i * 0.5 : 70 + (i - 60) * 0.3 + Math.sin(i / 3),
    );
  return {
    prices: series(177),
    volumes: Array.from({ length: 177 }, (_, i) => 5 + (i % 7)),
    examPrices: series(126),
    examVolumes: Array.from({ length: 126 }, (_, i) => 5 + ((i * 3) % 11)),
    datasets: { bbBuy: series(22), bbSell: series(22) },
  };
}

describe('academy packages: pure transforms are deterministic', () => {
  it('chart and hook builders return identical output on repeated runs', () => {
    const data = syntheticData();
    const first = JSON.stringify([buildLessonCharts(data), buildHooks(data)]);
    const second = JSON.stringify([
      buildLessonCharts(syntheticData()),
      buildHooks(syntheticData()),
    ]);
    expect(second).toBe(first);
    expect(buildLessonCharts(data).map((c) => c.id)).toEqual(
      Object.keys(C1_CHART_WINDOWS).slice(0, 16),
    );
  });

  const fixtureHtml = `
<p>Giá &lt; 30 và &gt; 70; ∈ ∉; H<sub>2</sub>O và x<sup>2</sup>.</p>
<div class="formula-group"><div class="math-eq">RS = <span class="frac"><span>G</span><span>D</span></span></div></div>
<figure class="chart-card"><div class="chart-heading"><h3>Tiêu đề</h3><span class="data-tag">Dữ liệu minh họa</span></div><div class="chart-legend"><span>RSI 14</span></div><div class="chart-mount" id="demo-chart"></div><figcaption>Chú thích</figcaption></figure>
<div class="table-scroll" role="region" tabindex="0" aria-label="Bảng thử"><table><thead><tr><th scope="col">A</th><th scope="col" style="text-align:right">B</th></tr></thead><tbody><tr><td>x &lt; y</td><td style="text-align:right"><strong>1</strong></td></tr></tbody></table></div>
<figure class="guide-figure" style="max-width:720px"><div class="guide-figure-head"><h3>Ảnh thử</h3><button aria-label="Phóng to: Ảnh thử" class="image-link" data-image="img-1">Phóng to ↗</button></div><button aria-label="Phóng to: Ảnh thử" class="guide-image" data-image="img-1"><img alt="Ảnh thử" data-image-src="img-1" loading="lazy"></button><figcaption>Mô tả ảnh</figcaption></figure>
<ol class="guide-steps"><li><span class="step-no">01</span><div><h3>Bước một</h3><p>Làm <strong>điều này</strong>.</p></div></li></ol>
<details class="guide-extra"><summary>Thêm</summary><div><p>Chi tiết ∈</p></div></details>
<div class="guide-notice"><b>Lưu ý</b><p>Nội dung</p></div>
<div class="worked"><h3>Ví dụ</h3><p>Tính</p></div>
<div class="signal-pair"><div class="signal-box buy"><h3>Mua</h3><p>a &gt; b</p></div><div class="signal-box sell"><h3>Bán</h3><p>a &lt; b</p></div></div>
<div class="filter-example" aria-label="Ví dụ"><span class="filter-name">Tên</span><span class="filter-period">Kỳ</span><b class="filter-expression">&gt; 15%</b></div>`;

  const context = (): ConvertContext => ({
    where: 'fixture/s1',
    chartIds: new Set(['demo-chart']),
    images: {
      'img-1': {
        src: '/assets/academy/ch02/img-1.0123abcd.webp',
        width: 10,
        height: 5,
        caption: 'Tiêu đề phóng to',
      },
    },
    usedCharts: [],
    usedImages: [],
    generated: new Set<Block>(),
    droppedLegends: 0,
  });

  it('splits a section into typed blocks without losing text', () => {
    const ctx = context();
    const blocks = convertSection(fixtureHtml, ctx);
    expect(blocks.map((b) => (b.type === 'callout' ? `callout:${b.variant}` : b.type))).toEqual([
      'html',
      'chart',
      'table',
      'image',
      'steps',
      'details',
      'callout:notice',
      'callout:worked',
      'callout:signal-buy',
      'callout:signal-sell',
      'callout:filter-example',
    ]);
    const table = blocks.find((b) => b.type === 'table');
    expect(table).toMatchObject({ align: ['l', 'r'], aria_label: 'Bảng thử', head: ['A', 'B'] });
    expect(table?.type === 'table' && table.rows).toEqual([['x &lt; y', '<strong>1</strong>']]);
    const image = blocks.find((b) => b.type === 'image');
    expect(image).toMatchObject({
      asset_id: 'img-1',
      max_width: 720,
      zoom_title: 'Tiêu đề phóng to',
      title: 'Ảnh thử',
    });
    expect(blocks[1]).toEqual({
      type: 'chart',
      chart_id: 'demo-chart',
      title: 'Tiêu đề',
      caption: 'Chú thích',
      illustrative: true,
      table_toggle: true,
    });
    expect(ctx.droppedLegends).toBe(1);
    expect(blocksText(blocks, ctx.generated)).toBe(sourceSectionText(fixtureHtml));
    const html = blocks[0]?.type === 'html' ? blocks[0].html : '';
    expect(html).toContain('&lt; 30');
    expect(html).toContain('∈ ∉');
    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<span class="frac">');
  });

  it('is byte-identical on a second run', () => {
    const run = (): string => stableStringify(convertSection(fixtureHtml, context()));
    expect(run()).toBe(run());
  });

  it('fails loudly on content it cannot represent', () => {
    for (const bad of [
      '<p onclick="x()">a</p>',
      '<p>a</p><script>alert(1)</script>',
      '<p style="color:red">a</p>',
      '<p class="mystery">a</p>',
      'stray text',
      '<div class="table-scroll"><table><tbody><tr><td>no head</td></tr></tbody></table></div>',
      '<p><img src="x"></p>',
    ]) {
      expect(() => convertSection(bad, context()), bad).toThrow();
    }
  });
});

describe('academy packages: sanitiser allowlist', () => {
  it('preserves text exactly: comparison signs, set signs, sub/sup, fractions', () => {
    const html =
      '<p>RSI &lt; 30 &amp; &gt; 70; x ∈ [a, b]; y ∉ (c, d)</p><p>H<sub>2</sub>O x<sup>2</sup> &nbsp;</p><div class="math-eq">1 − <span class="frac"><span>a</span><span>b</span></span></div>';
    expect(sanitizeHtml(html, { strict: true })).toBe(html);
  });

  it('removes scripts, handlers, styles, unknown classes and active elements (lenient)', () => {
    const dirty =
      '<p onclick="alert(1)" style="color:red">a &lt; b<script>alert(1)</script><iframe src="x"></iframe><img src=x onerror=y><span class="frac evil" id="i">∈</span><a href="javascript:x()">link</a></p>';
    expect(sanitizeHtml(dirty)).toBe('<p>a &lt; b<span class="frac">∈</span>link</p>');
  });

  it('flags every forbidden token class of the do-not-copy list', () => {
    const samples = [
      'preview',
      'xem HTML',
      'localStorage',
      'Thông tin mẫu',
      'https://example.com',
      'shopTransaction',
      'CH1.grade',
      'IQX_CH3_PREVIEW',
      'mascotAsset',
      'data:image/webp;base64,AAAA',
    ];
    for (const s of samples)
      expect(
        FORBIDDEN_TEXT.some(({ re }) => re.test(s)),
        s,
      ).toBe(true);
    expect(scanForbidden({ proof: 1, nested: [{ basis: 'x' }] }).length).toBe(2);
    expect(scanForbidden({ title: 'RSI 14: đọc vị trí và chiều thay đổi' })).toEqual([]);
  });
});

describe('academy packages: canonical hashing and source gates', () => {
  it('reproduces Python repr for floats and keeps 25.0 distinct from 25', () => {
    expect(pyFloatRepr(25)).toBe('25.0');
    expect(pyFloatRepr(19.999999999999996)).toBe('19.999999999999996');
    expect(pyFloatRepr(0.00001)).toBe('1e-05');
    expect(pyFloatRepr(1e16)).toBe('1e+16');
    expect(pyFloatRepr(-0.5)).toBe('-0.5');
    const raw = parseRawJson('{"b":25.0,"a":[1,"é",null,true],"c":{"z":1e2,"y":-3}}');
    expect(canonicalRaw(raw)).toBe('{"a":[1,"é",null,true],"b":25.0,"c":{"y":-3,"z":100.0}}');
    expect(canonicalHash(raw)).toBe(
      sha256Hex('{"a":[1,"é",null,true],"b":25.0,"c":{"y":-3,"z":100.0}}'),
    );
    expect(canonicalRaw(parseRawJson('{"v":25}'))).toBe('{"v":25}');
    expect((parseRawJson('[1.5]') as RawNumber[])[0]?.isFloat).toBe(true);
  });

  it('fails loudly when the source file is not the approved one', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'IQX-Hoc-Vien-Chuong-1-MAU-v2.0.html'), '<html></html>');
    expect(() => loadSource(1, dir)).toThrow(/GATE FAILED: C1 html size/);
    expect(() => loadSource(2, dir)).toThrow(/none of/);
  });

  it('pins the spec hashes of every chapter', () => {
    expect(CHAPTER_GATES[1].html_sha256).toBe(
      'af4da733c6065cad6f381916395a3a2fe3cf737fa0d9bf6f8596a6f7ef5eaff0',
    );
    expect(CHAPTER_GATES[2].html_sha256).toBe(
      '81e155f0eb06542c9de984c1ac9a288d0fe62415345535edb6a31c05972a24e1',
    );
    expect(CHAPTER_GATES[3].html_sha256).toBe(
      '61ad365c039425c06a6f86ff74f230821ff9d1f8370b259e233d25a9093dbbc9',
    );
    expect(CHAPTER_GATES[4].html_sha256).toBe(
      '65f30d146bd77f8b22a3ee2b0b6b0a216e9b0fdd3d524fc64722ec34ce32b722',
    );
    expect(Object.keys(CHAPTER_GATES[2].images)).toHaveLength(22);
    expect(Object.keys(CHAPTER_GATES[4].images)).toHaveLength(27);
    expect(C3_LESSON_CHART_IDS).toHaveLength(13);
    for (const chapter of [1, 2, 3, 4] as const) {
      expect(CHAPTER_GATES[chapter].content_version.length).toBeLessThanOrEqual(32);
    }
  });

  it('recomputes the chapter 3 proof oracles', () => {
    expect(evaluateProof({ op: 'growth', args: [1500, 1200], expected: 25 }, 't')).toBeCloseTo(
      25,
      12,
    );
    expect(evaluateProof({ op: 'roe', args: [360, 1800, 2200], expected: 18 }, 't')).toBeCloseTo(
      18,
      12,
    );
    expect(
      evaluateProof({ op: 'eps_growth', args: [120, 150, 100, 100], expected: -20 }, 't'),
    ).toBeCloseTo(-20, 12);
    expect(() => evaluateProof({ op: 'nope', args: [], expected: 0 }, 't')).toThrow(
      /unknown proof op/,
    );
  });
});

describe('academy packages: schema', () => {
  it('rejects unknown properties and bad shapes', () => {
    const lessons = readPackage<PackageLesson[]>(1, 'lessons.vi.json');
    expect(packageLessonsFileSchema.safeParse(lessons).success).toBe(true);
    const extra = structuredClone(lessons);
    (extra[0] as unknown as Record<string, unknown>).correct = 'o1';
    expect(packageLessonsFileSchema.safeParse(extra).success).toBe(false);
    const longVersion = structuredClone(lessons);
    (longVersion[0] as PackageLesson).content_version = 'x'.repeat(33);
    expect(packageLessonsFileSchema.safeParse(longVersion).success).toBe(false);
    const fewSections = structuredClone(lessons);
    (fewSections[0] as PackageLesson).sections.pop();
    expect(packageLessonsFileSchema.safeParse(fewSections).success).toBe(false);
  });

  it('rejects a chart whose series length differs from the window', () => {
    const charts = readPackage<Record<string, ChartModel>>(1, 'charts.vi.json');
    const bad = structuredClone(charts);
    const m = bad['concept-chart'];
    if (m?.kind === 'series_panels') m.panels[0]?.series[0]?.values.pop();
    expect(chartsFileSchema.safeParse(bad).success).toBe(false);
  });
});

describe('academy packages: full re-extraction (needs the approved source HTML)', () => {
  const sourceDir = process.env.ACADEMY_IMPORT_SOURCE_DIR;
  it.skipIf(!sourceDir)(
    'reproduces every committed file byte for byte',
    () => {
      const scratch = tempDir();
      const out: Locations = {
        ...locations,
        packagesDir: join(scratch, 'packages'),
        publicDir: join(scratch, 'public'),
      };
      mkdirSync(out.packagesDir, { recursive: true });
      const first = runExtraction({ sourceDir: sourceDir ?? '', locations: out });
      const committed = runExtraction({ sourceDir: sourceDir ?? '', locations, check: true });
      expect(committed.flatMap((r) => r.files.filter((f) => f.changed))).toEqual([]);
      const second = runExtraction({ sourceDir: sourceDir ?? '', locations: out, check: true });
      expect(second.flatMap((r) => r.files.filter((f) => f.changed))).toEqual([]);
      expect(first.flatMap((r) => r.files).length).toBe(committed.flatMap((r) => r.files).length);
    },
    120_000,
  );
});
