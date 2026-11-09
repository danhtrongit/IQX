/**
 * Nội dung bài tập của Candle Dojo nằm trong `content/*.json` (lấy từ bản mẫu, sao chép vào `dist` bởi
 * `scripts/copy-assets.ts`). Server đọc để CHẤM LẠI bài người học gửi lên và để RA ĐỀ THI ĐAI: đáp án thi
 * đai không bao giờ rời server (spec v1.2 §5.3).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CdBar } from './shared/detector.js';
import { CD_CARDS } from './shared/cards.js';
import { CD_EXAM, CD_LESSONS } from './shared/lessons.js';
import type { CdLessonExercises } from './shared/grading.js';

export const CANDLE_DOJO_CONTENT = Symbol('CANDLE_DOJO_CONTENT');

export const CANDLE_DOJO_CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'content');

/** Một câu thi đai: biểu đồ có mẫu tô vàng ở cuối, 4 lựa chọn là tên thẻ cùng Dojo. */
export interface CdExamQuestion {
  readonly bars: readonly CdBar[];
  /** Số nến của mẫu (nằm cuối biểu đồ). */
  readonly n: number;
  readonly ans: string;
  readonly opts: readonly string[];
}

export interface CdExamDef {
  readonly dojo: number;
  readonly pass: number;
  readonly qs: readonly CdExamQuestion[];
}

export interface CandleDojoContent {
  readonly exercises: ReadonlyMap<string, CdLessonExercises>;
  readonly exams: ReadonlyMap<number, CdExamDef>;
}

function fail(message: string): never {
  throw new Error(`Invalid Candle Dojo content: ${message}`);
}

export function buildCandleDojoContent(files: {
  exercises: unknown;
  exams: unknown;
}): CandleDojoContent {
  const exercisesFile = files.exercises as { lessons?: Record<string, CdLessonExercises> };
  const examsFile = files.exams as { exams?: CdExamDef[] };
  const exercises = new Map<string, CdLessonExercises>();
  for (const lesson of CD_LESSONS) {
    const item = exercisesFile.lessons?.[lesson.id];
    if (!item) fail(`bài ${lesson.id} chưa có bài tập`);
    if (item.hunt.targets.length === 0) fail(`bài ${lesson.id} không có mẫu để săn`);
    if (item.twins.length !== 3) fail(`bài ${lesson.id} cần đúng 3 câu Song sinh`);
    exercises.set(lesson.id, item);
  }
  const exams = new Map<number, CdExamDef>();
  const cardIds = new Set(CD_CARDS.map((card) => card.id));
  for (const exam of examsFile.exams ?? []) {
    if (exam.qs.length !== CD_EXAM.questions) fail(`đề thi Dojo ${exam.dojo} không đủ câu`);
    for (const question of exam.qs) {
      if (!question.opts.includes(question.ans)) fail(`đáp án ngoài lựa chọn (Dojo ${exam.dojo})`);
      for (const option of question.opts)
        if (!cardIds.has(option)) fail(`lựa chọn ${option} không phải thẻ`);
    }
    exams.set(exam.dojo, exam);
  }
  for (const dojo of [1, 2, 3, 4, 5]) if (!exams.has(dojo)) fail(`thiếu đề thi Dojo ${dojo}`);
  return { exercises, exams };
}

const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(CANDLE_DOJO_CONTENT_DIR, name), 'utf8')) as unknown;

let cached: CandleDojoContent | null = null;

/** Nội dung đọc từ đĩa, nhớ lại sau lần đầu. */
export function loadCandleDojoContent(): CandleDojoContent {
  cached ??= buildCandleDojoContent({
    exercises: readJson('exercises.json'),
    exams: readJson('exams.json'),
  });
  return cached;
}
