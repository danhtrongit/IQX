import { describe, expect, it } from 'vitest';

import {
  buildAcademyContent,
  readAcademyContentFiles,
} from '../../src/modules/academy/academy.content.js';
import {
  bankFileSchema,
  catalogFileSchema,
  inlineHtml,
  lessonFileSchema,
  notesSaveRequestSchema,
  plainText,
  type BankFile,
  type CatalogFile,
  type LessonFile,
} from '../../src/modules/academy/content/v3/schema.js';

const files = readAcademyContentFiles();
const clone = <T>(value: T): T => structuredClone(value);
const catalog = () => clone(files.catalog) as CatalogFile;
const lessonOf = (id: string) =>
  clone((files.lessons as LessonFile[]).find((lesson) => lesson.id === id)!);
const bankOf = (id: string) =>
  clone((files.banks as BankFile[]).find((bank) => bank.item_id === id)!);

const issues = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.success ? [] : result.error!.issues.map((issue) => issue.message);

describe('content/v3 schema rejections', () => {
  it('bans en/em dashes, check glyphs and the browser-storage phrase in visible text', () => {
    expect(plainText.safeParse('Giá 10-20 nghìn').success).toBe(true);
    for (const bad of ['vài tuần – vài tháng', 'A — B', '✓ Đạt', 'Phần này lưu trên trình duyệt'])
      expect(plainText.safeParse(bad).success, bad).toBe(false);
  });

  it('allows only the inline tag allowlist and escaped text in inline HTML', () => {
    expect(
      inlineHtml.safeParse('<b>Lãi</b> &amp; <span class="tone-pos">tăng</span><br>').success,
    ).toBe(true);
    for (const bad of [
      '<script>x</script>',
      '<span class="tone-red">x</span>',
      '<a href="x">x</a>',
      'a < b',
      '<span style="color:red">x</span>',
    ])
      expect(inlineHtml.safeParse(bad).success, bad).toBe(false);
  });

  it('requires exactly one scenario in every ch2/ch3 lesson and none elsewhere', () => {
    const lesson = lessonOf('ch02-l01');
    for (const section of lesson.sections)
      section.blocks = section.blocks.filter((block) => block.type !== 'scenario');
    expect(issues(lessonFileSchema.safeParse(lesson)).join()).toMatch(/expected 1 scenario/);

    const ch1 = lessonOf('ch01-l01');
    const scenario = lessonOf('ch02-l01')
      .sections.flatMap((section) => section.blocks)
      .find((block) => block.type === 'scenario')!;
    ch1.sections[0]!.blocks.push(scenario);
    expect(issues(lessonFileSchema.safeParse(ch1)).join()).toMatch(/scenario|interactive/);
  });

  it('requires every referenced chart and refuses unreferenced ones', () => {
    const lesson = lessonOf('ch04-l06');
    const [first] = Object.keys(lesson.charts);
    expect(first).toBeDefined();
    const missing = clone(lesson);
    delete missing.charts[first!];
    expect(issues(lessonFileSchema.safeParse(missing)).join()).toMatch(/referenced but missing/);
    const stray = clone(lesson);
    stray.charts['c4l6-stray'] = lesson.charts[first!]!;
    expect(issues(lessonFileSchema.safeParse(stray)).join()).toMatch(/never referenced/);
  });

  it('checks the catalog totals, question counts, order and exam placement', () => {
    expect(catalogFileSchema.safeParse(files.catalog).success).toBe(true);
    const wrongTotal = catalog();
    const stub = wrongTotal.chapters[13]!;
    stub.lesson_count += 1;
    expect(issues(catalogFileSchema.safeParse(wrongTotal)).join()).toMatch(/sum of lesson_count/);

    const wrongCount = catalog();
    const chapter1 = wrongCount.chapters[0]!;
    if (chapter1.published) chapter1.items[0]!.question_count = 8;
    expect(issues(catalogFileSchema.safeParse(wrongCount)).join()).toMatch(/question_count/);

    const optional = catalog();
    const chapter2 = optional.chapters[1]!;
    if (chapter2.published) chapter2.items[0]!.optional = true;
    expect(issues(catalogFileSchema.safeParse(optional)).join()).toMatch(
      /only practice is optional/,
    );
  });

  it('checks bank question ids, option counts and the correct option', () => {
    expect(bankFileSchema.safeParse(files.banks[0]).success).toBe(true);
    const renamed = bankOf('ch01-l01');
    renamed.questions[0]!.id = 'ch01-l01-q09';
    expect(issues(bankFileSchema.safeParse(renamed)).join()).toMatch(/must be ch01-l01-q01/);
    const foreign = bankOf('ch01-l01');
    foreign.questions[0]!.correct_option_id = '0000000000';
    expect(issues(bankFileSchema.safeParse(foreign)).join()).toMatch(/correct option/);
    const short = bankOf('ch01-l01');
    short.questions[0]!.options.pop();
    expect(bankFileSchema.safeParse(short).success).toBe(false);
    const unsalted = bankOf('ch01-l01') as Partial<BankFile>;
    delete unsalted.salt;
    expect(bankFileSchema.safeParse(unsalted).success).toBe(false);
  });

  it('bounds notes keys to 97 characters and scores to six values 0..10', () => {
    expect(notesSaveRequestSchema.safeParse({ checks: { ['a'.repeat(97)]: true } }).success).toBe(
      true,
    );
    expect(notesSaveRequestSchema.safeParse({ checks: { ['a'.repeat(98)]: true } }).success).toBe(
      false,
    );
    expect(notesSaveRequestSchema.safeParse({ scores: { sc6: [1, 2, 3, 4, 5] } }).success).toBe(
      false,
    );
    expect(notesSaveRequestSchema.safeParse({ scores: { sc6: [1, 2, 3, 4, 5, 11] } }).success).toBe(
      false,
    );
    expect(notesSaveRequestSchema.safeParse({ texts: { a: 'x'.repeat(4001) } }).success).toBe(
      false,
    );
  });

  it('refuses notes text that Postgres jsonb cannot store (NUL, lone surrogates)', () => {
    expect(notesSaveRequestSchema.safeParse({ texts: { a: 'a\u0000b' } }).success).toBe(false);
    expect(notesSaveRequestSchema.safeParse({ texts: { a: 'a\ud800' } }).success).toBe(false);
    expect(notesSaveRequestSchema.safeParse({ texts: { a: '\udc00b' } }).success).toBe(false);
    expect(notesSaveRequestSchema.safeParse({ texts: { a: 'Cổ phiếu 📈 tăng' } }).success).toBe(
      true,
    );
  });
});

describe('buildAcademyContent cross-checks', () => {
  it('joins the real content: 49 items, 43 required lessons, retired names', () => {
    const content = buildAcademyContent(files);
    expect(content.items.size).toBe(49);
    expect(content.itemsByKey.size).toBe(49);
    expect(content.requiredTotal).toBe(43);
    expect(content.sequence).toHaveLength(49);
    expect(content.retired.get('concept:hop_luu')).toBe('Hợp lưu');
    const exam = content.items.get('ch04-exam')!;
    expect(exam).toMatchObject({ lesson: null, position: null, capabilities: [] });
    expect(exam.bank.questions).toHaveLength(30);
    expect(content.items.get('ch04-l05')).toMatchObject({
      position: 5,
      capabilities: ['indicator:ma'],
      chapter_title: 'Phương pháp kỹ thuật',
    });
    expect(content.items.get('ch01-l01')!.lesson!.content_version).toMatch(/^[0-9a-f]{16}$/);
    expect(Object.isFrozen(content.items.get('ch01-l01')!.bank.questions)).toBe(true);
  });

  const broken = (
    mutate: (copy: typeof files & { lessons: unknown[]; banks: unknown[] }) => void,
  ) => {
    const copy = clone({ ...files, lessons: [...files.lessons], banks: [...files.banks] });
    mutate(copy);
    return () => buildAcademyContent(copy);
  };

  it('fails on missing, stray or mismatched files', () => {
    expect(
      broken((copy) => {
        copy.lessons = copy.lessons.filter((lesson) => (lesson as LessonFile).id !== 'ch01-l02');
      }),
    ).toThrow(/ch01-l02 has no lesson file/);
    expect(
      broken((copy) => {
        copy.banks = copy.banks.filter((bank) => (bank as BankFile).item_id !== 'ch02-exam');
      }),
    ).toThrow(/ch02-exam has no question bank/);
    expect(
      broken((copy) => {
        const bank = copy.banks.find(
          (entry) => (entry as BankFile).item_id === 'ch01-l01',
        ) as BankFile;
        copy.banks.push({
          ...bank,
          item_id: 'ch06-l01',
          questions: bank.questions.map((q, i) => ({
            ...q,
            id: `ch06-l01-q0${i + 1}`,
          })),
        });
      }),
    ).toThrow(/bank ch06-l01 is not a published catalog item/);
    expect(
      broken((copy) => {
        const lesson = copy.lessons.find(
          (entry) => (entry as LessonFile).id === 'ch01-l03',
        ) as LessonFile;
        lesson.order = 4;
      }),
    ).toThrow(/ch01-l03 lesson file order/);
    expect(
      broken((copy) => {
        const retired = copy.retired as { lessons: Array<{ lesson_key: string; name: string }> };
        retired.lessons.push({ lesson_key: 'technical:rsi', name: 'RSI' });
      }),
    ).toThrow(/retired key technical:rsi is a catalog key/);
    expect(
      broken((copy) => {
        const bank = copy.banks.find(
          (entry) => (entry as BankFile).item_id === 'ch04-l01',
        ) as BankFile;
        bank.questions.pop();
      }),
    ).toThrow(/ch04-l01 bank has 4 questions/);
  });
});
