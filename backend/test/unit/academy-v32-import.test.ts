import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { optionId } from '../../scripts/academy-v32-import/banks.js';
import { CATALOG_ROWS, examIntro } from '../../scripts/academy-v32-import/catalog-table.js';
import { CHART_BUILDERS, TEXT_FIGURES } from '../../scripts/academy-v32-import/charts/index.js';
import {
  bands,
  emaFirstSeeded,
  fmtVi,
  rsiWilder,
  sma,
} from '../../scripts/academy-v32-import/charts/math.js';
import { TextNormalizer } from '../../scripts/academy-v32-import/inline.js';
import {
  bankFileName,
  importerDir,
  lessonFileName,
  OUTPUT_FILES,
  outDir,
  SOURCE_SHA256,
} from '../../scripts/academy-v32-import/paths.js';
import { EXPECTED, interactiveKeyList, verify } from '../../scripts/academy-v32-import/verify.js';
import { sha256, stableJson } from '../../scripts/academy-v32-import/write.js';
import { canonicalHash } from '../../src/modules/academy/academy.hash.js';
import {
  bankFileSchema,
  catalogFileSchema,
  chartModelSchema,
  lessonFileSchema,
} from '../../src/modules/academy/content/v3/schema.js';
import type {
  BankFile,
  CatalogFile,
  LessonFile,
} from '../../src/modules/academy/content/v3/schema.js';

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const catalog = (): CatalogFile =>
  catalogFileSchema.parse(readJson(join(outDir(), OUTPUT_FILES.catalog)));
const lesson = (id: string): LessonFile =>
  lessonFileSchema.parse(readJson(join(outDir(), OUTPUT_FILES.lessonsDir, lessonFileName(id))));
const bank = (id: string): BankFile =>
  bankFileSchema.parse(readJson(join(outDir(), OUTPUT_FILES.questionsDir, bankFileName(id))));
const publishedItems = () =>
  catalog().chapters.flatMap((c) =>
    c.published ? c.items.map((i) => ({ ...i, chapter: c.no })) : [],
  );

describe('academy v3.2 importer output', () => {
  it('passes every no-source gate (schema, counts, chart recompute, goldens, salts)', () => {
    expect(verify()).toEqual([]);
  });

  it('has 114 chart builders that all parse, and 12 text figures', () => {
    expect(Object.keys(CHART_BUILDERS)).toHaveLength(EXPECTED.charts);
    expect(Object.keys(TEXT_FIGURES)).toHaveLength(12);
    for (const [id, build] of Object.entries(CHART_BUILDERS)) {
      const r = chartModelSchema.safeParse(build());
      expect(r.success, id).toBe(true);
    }
  });

  it('builds identical charts on every call (no hidden state)', () => {
    for (const [id, build] of Object.entries(CHART_BUILDERS))
      expect(stableJson(build()), id).toBe(stableJson(build()));
  });
});

describe('academy v3.2 catalog (design §0.1)', () => {
  it('publishes chapters 1-5 with 43 required lessons, 1 optional practice and 5 exams', () => {
    const c = catalog();
    expect(c.chapters).toHaveLength(14);
    expect(c.chapters.reduce((s, ch) => s + ch.lesson_count, 0)).toBe(94);
    expect(c.chapters.filter((ch) => ch.published).map((ch) => [ch.no, ch.title])).toEqual([
      [1, 'Nền tảng'],
      [2, 'Kỹ năng Sale SACO'],
      [3, 'Thương hiệu cá nhân'],
      [4, 'Phương pháp kỹ thuật'],
      [5, 'Phương pháp cơ bản'],
    ]);
    const items = publishedItems();
    expect(items).toHaveLength(CATALOG_ROWS.length);
    expect(items.filter((i) => i.kind === 'lesson')).toHaveLength(43);
    const practice = items.filter((i) => i.optional);
    expect(practice.map((i) => [i.id, i.kind, i.order, i.question_count, i.name])).toEqual([
      ['ch03-practice', 'practice', 11, 3, 'Phòng tập thực chiến'],
    ]);
  });

  it('unlocks exactly the five indicators on ch04-l04..l08', () => {
    const unlocks = publishedItems()
      .filter((i) => i.unlock)
      .map((i) => [i.id, i.lesson_key, i.unlock?.label]);
    expect(unlocks).toEqual([
      ['ch04-l04', 'technical:volume', 'Khối lượng'],
      ['ch04-l05', 'technical:ma', 'MA'],
      ['ch04-l06', 'technical:rsi', 'RSI'],
      ['ch04-l07', 'technical:macd', 'MACD'],
      ['ch04-l08', 'technical:bollinger', 'Bollinger Bands'],
    ]);
  });

  it('carries the exam intros of spec §3.3 and the 20/30 question counts', () => {
    const exams = publishedItems().filter((i) => i.kind === 'chapter_exam');
    expect(exams.map((e) => [e.id, e.lesson_key, e.question_count, e.intro])).toEqual([
      ['ch01-exam', 'exam:ch01', 20, 'Bài thi gồm 20 câu hỏi về toàn bộ kiến thức Chương 1.'],
      [
        'ch02-exam',
        'exam:ch02',
        20,
        'Bài thi gồm 20 câu hỏi về toàn bộ kỹ năng sale của SACO trong Chương 2.',
      ],
      [
        'ch03-exam',
        'exam:ch03',
        20,
        'Bài thi gồm 20 câu hỏi về toàn bộ kiến thức thương hiệu cá nhân trong Chương 3.',
      ],
      ['ch04-exam', 'exam:ch04', 30, 'Bài thi gồm 30 câu hỏi về toàn bộ kiến thức Chương 4.'],
      ['ch05-exam', 'exam:ch05', 30, 'Bài thi gồm 30 câu hỏi về toàn bộ kiến thức Chương 5.'],
    ]);
    expect(examIntro(4)).toBe(exams[3]?.intro);
  });

  it('never reuses retired keys (concept:hop_luu, guide:*)', () => {
    const keys = publishedItems().map((i) => i.lesson_key);
    expect(keys).not.toContain('concept:hop_luu');
    expect(keys.filter((k) => k.startsWith('guide:'))).toEqual([]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('academy v3.2 lesson content', () => {
  it('keeps the notes keys that saved work is stored under', () => {
    const lessons = publishedItems()
      .filter((i) => i.kind !== 'chapter_exam')
      .map((i) => lesson(i.id));
    const keys = interactiveKeyList(lessons);
    expect(keys).toHaveLength(EXPECTED.interactive_keys.count);
    expect(keys.filter((k) => k.includes(' texts '))).toHaveLength(
      EXPECTED.blocks.workpad + EXPECTED.blocks.practice_case,
    );
    expect(keys.filter((k) => k.includes(' scores '))).toEqual(['ch03-practice scores sc6']);
  });

  it('ports the chapter 2/3 interactive blocks with the page script numbers', () => {
    const blocks = (id: string) => lesson(id).sections.flatMap((s) => s.blocks);
    const calc = blocks('ch02-l01').find((b) => b.type === 'income_calculator');
    expect(calc).toMatchObject({ fee_rate: 0.0015, share_rate: 0.7 });
    const score = blocks('ch03-practice').find((b) => b.type === 'roleplay_score');
    expect(score).toMatchObject({ id: 'sc6', max: 10, default: 5 });
    expect(score?.type === 'roleplay_score' && score.criteria).toHaveLength(6);
    expect(score?.type === 'roleplay_score' && score.bands.map((b) => b.min)).toEqual([48, 36, 0]);
    const cases = blocks('ch03-practice').filter((b) => b.type === 'practice_case');
    expect(cases).toHaveLength(4);
    for (const c of cases) expect(c.type === 'practice_case' && c.prompts).toHaveLength(4);
    expect(
      blocks('ch03-l02').filter((b) => b.type === 'checklist' && b.mode === 'self_check'),
    ).toHaveLength(1);
  });

  it('keeps the chapter 2 source notes and drops the browser-storage copy', () => {
    const notes = ['ch02-l01', 'ch02-l06', 'ch02-l10'].flatMap((id) =>
      lesson(id)
        .sections.flatMap((s) => s.blocks)
        .flatMap((b) =>
          b.type === 'note' ? [b.text] : 'note' in b && typeof b.note === 'string' ? [b.note] : [],
        ),
    );
    expect(notes).toEqual(
      expect.arrayContaining([
        'Số liệu giả định để minh họa',
        'Tỷ lệ giả định để minh họa',
        'Mục tiêu tham khảo, điều chỉnh theo trưởng nhóm',
      ]),
    );
    for (const it of publishedItems().filter((i) => i.kind !== 'chapter_exam'))
      expect(JSON.stringify(lesson(it.id)), it.id).not.toContain('trình duyệt');
  });
});

describe('academy v3.2 question banks', () => {
  it('uses the committed salts and keeps the bank version unguessable without them', () => {
    const salts = readJson<Record<string, string>>(join(importerDir(), 'overrides', 'salts.json'));
    for (const it of publishedItems()) {
      const b = bank(it.id);
      expect(b.salt, it.id).toBe(salts[it.id]);
      const { salt: _salt, ...withoutSalt } = b;
      expect(canonicalHash(withoutSalt), it.id).not.toBe(canonicalHash(b));
      for (const q of b.questions)
        q.options.forEach((o, j) => expect(o.id).toBe(optionId(b.salt, q.id, j)));
    }
  });

  it('sizes every bank to its question_count (3/5 lessons, 20/30 exams)', () => {
    for (const it of publishedItems())
      expect(bank(it.id).questions, it.id).toHaveLength(it.question_count);
  });
});

describe('academy v3.2 verify catches tampering', () => {
  let dir: string | undefined;
  const copy = () => {
    dir = mkdtempSync(join(tmpdir(), 'academy-v32-'));
    cpSync(outDir(), dir, { recursive: true });
    return dir;
  };
  const edit = <T>(path: string, f: (v: T) => void) => {
    const v = readJson<T>(path);
    f(v);
    writeFileSync(path, stableJson(v));
  };
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('a hand-edited chart value', () => {
    const d = copy();
    edit<LessonFile>(join(d, OUTPUT_FILES.lessonsDir, lessonFileName('ch04-l06')), (l) => {
      const m = l.charts['c4l6-g5'];
      if (m?.kind !== 'series_panels') throw new Error('fixture');
      const s = m.panels[0]?.series[0];
      if (s) s.values[0] = (s.values[0] ?? 0) + 1;
    });
    const errors = verify(d);
    expect(errors).toContain('ch04-l06: chart c4l6-g5 differs from its builder');
    expect(errors).toContain('manifest: lessons/ch04-l06.vi.json changed after import');
  });

  it('a hand-edited catalog name', () => {
    const d = copy();
    edit<CatalogFile>(join(d, OUTPUT_FILES.catalog), (c) => {
      const ch = c.chapters[0];
      if (ch?.published && ch.items[0]) ch.items[0].name = 'Đầu tư cổ phiếu';
    });
    expect(verify(d)).toEqual(
      expect.arrayContaining([
        'catalog: differs from catalog-table.ts (never edit catalog.json by hand)',
        'lesson ch01-l01: title differs from catalog name',
      ]),
    );
  });

  it('a renamed notes key', () => {
    const d = copy();
    edit<LessonFile>(join(d, OUTPUT_FILES.lessonsDir, lessonFileName('ch02-l02')), (l) => {
      const pad = l.sections.flatMap((s) => s.blocks).find((b) => b.type === 'workpad');
      if (pad?.type === 'workpad') pad.id = `${pad.id}x`;
    });
    expect(verify(d).some((e) => e.startsWith('interactive keys changed'))).toBe(true);
  });

  it('a missing bank and a dropped question', () => {
    const d = copy();
    rmSync(join(d, OUTPUT_FILES.questionsDir, bankFileName('ch05-exam')));
    edit<BankFile>(join(d, OUTPUT_FILES.questionsDir, bankFileName('ch04-l01')), (b) => {
      b.questions.pop();
    });
    expect(verify(d)).toEqual(
      expect.arrayContaining([
        'banks: 48 files, expected 49',
        'bank missing: ch05-exam',
        'bank ch04-l01: 4 questions, expected 5',
      ]),
    );
  });
});

describe('academy v3.2 importer helpers', () => {
  it('normalises text per design §6.3', () => {
    const n = new TextNormalizer({ 'vài tuần – vài tháng': 'vài tuần đến vài tháng' });
    expect(n.text('2015–2025 và 36 — 47%')).toBe('2015-2025 và 36-47%');
    expect(n.text('✓ Đã xong')).toBe('Đã xong');
    expect(n.text('vài tuần – vài tháng')).toBe('vài tuần đến vài tháng');
    expect(n.text('Ghi chú. Phần bạn viết được lưu trên trình duyệt này.')).toBe('Ghi chú.');
    expect(n.missing).toEqual([]);
    n.text('Đúng – Đủ');
    expect(n.missing).toHaveLength(1);
    expect(n.unusedOverrides()).toEqual([]);
  });

  it('warns about question marks only where the normaliser is told to', () => {
    const n = new TextNormalizer({});
    n.context = 'ch02-l01';
    n.text('Bạn sẽ chọn cách nào?');
    expect(n.warnings).toEqual([]);
    n.context = 'ch04-l01';
    n.warnQuestions = true;
    n.text('Giá sẽ đi đâu?');
    expect(n.warnings).toEqual(['ch04-l01: question mark in "Giá sẽ đi đâu?"']);
  });

  it('salts option ids so they cannot be derived from the question id', () => {
    const salt = 'ab'.repeat(32);
    const id = optionId(salt, 'ch01-l01-q01', 0);
    expect(id).toMatch(/^[0-9a-f]{10}$/);
    expect(id).not.toBe(sha256('ch01-l01-q01|0').slice(0, 10));
    expect(optionId('cd'.repeat(32), 'ch01-l01-q01', 0)).not.toBe(id);
  });

  it('writes stable JSON (sorted keys, trailing newline)', () => {
    expect(stableJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(
      '{\n  "a": [\n    {\n      "c": 2,\n      "d": 1\n    }\n  ],\n  "b": 1\n}\n',
    );
  });

  it('ports the mockup indicator math (SMA, first-seeded EMA, Wilder RSI, population sigma)', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(emaFirstSeeded([10, 20, 30], 3)).toEqual([10, 15, 22.5]);
    expect(rsiWilder([1, 2, 1, 2, 3], 2)).toEqual([null, null, 50, 75, 87.5]);
    expect(rsiWilder([1, 2, 3], 2)[2]).toBeCloseTo(100, 6);
    expect(bands([1, 3], 2, 2)).toEqual({ mid: [null, 2], up: [null, 4], lo: [null, 0] });
    expect(fmtVi(1234.5, 1)).toBe('1.234,5');
    expect(fmtVi(-12000)).toBe('-12.000');
  });
});

const source = process.env.ACADEMY_V32_SOURCE;
const haveSource = !!source && existsSync(source);

describe.skipIf(!haveSource)('academy v3.2 re-extract from the mockup', () => {
  it('reproduces the committed content byte for byte', async () => {
    const { extract } = await import('../../scripts/academy-v32-import/extract.js');
    const { files, manifest } = extract(source as string, undefined, { write: false });
    expect(manifest.source.sha256).toBe(SOURCE_SHA256);
    expect(manifest.warnings).toEqual([]);
    for (const [rel, text] of Object.entries(files))
      expect(text, rel).toBe(readFileSync(join(outDir(), rel), 'utf8'));
  }, 60_000);
});
