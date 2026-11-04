import { createHmac, randomBytes } from 'node:crypto';

import { questionCountFor } from '../../src/modules/academy/content/v4/schema.js';
import type { BankFile } from '../../src/modules/academy/content/v4/schema.js';
import type { CatalogRow } from './catalog-table.js';
import type { TextNormalizer } from './inline.js';
import type { MockItem } from './source.js';

/**
 * Option id = HMAC-SHA256(key = salt bytes (hex-decoded), `${question id}|${source index}`), first 10 hex.
 * Not derivable from public data: the salt lives only in the private bank file and overrides/salts.json.
 */
export function optionId(salt: string, qid: string, j: number): string {
  return createHmac('sha256', Buffer.from(salt, 'hex'))
    .update(`${qid}|${j}`)
    .digest('hex')
    .slice(0, 10);
}

export const newSalt = (): string => randomBytes(32).toString('hex');

/** Fill in a salt for every item that has none yet. Returns true when something was added. */
export function ensureSalts(salts: Record<string, string>, ids: readonly string[]): boolean {
  let added = false;
  for (const id of ids)
    if (!salts[id]) {
      salts[id] = newSalt();
      added = true;
    }
  return added;
}

/**
 * Sửa câu hỏi sau khi trích từ bản mẫu (overrides/questions.json), theo id câu hỏi: viết lại câu tính toán
 * thành câu khái niệm (Chương 1-7, v3.3). Id phương án giữ theo vị trí trong bản mẫu nên không đổi khi sửa chữ.
 * Câu đọc biểu đồ đại diện của bài Chương 8-12 được gắn `chart_id` tự động (`repChartQuestion`), không cần override.
 */
export interface QuestionOverride {
  prompt?: string;
  options?: [string, string, string];
  correct?: number;
  chart_id?: string;
}

/** Prompt of the one question per Chương 8-12 lesson that reads the "Biểu đồ đại diện" (spec v4 §3). */
const REP_CHART_PROMPT = /biểu đồ đại diện/i;

/**
 * Index of the question of a chapter 8-12 lesson that is about its representative chart, null for every other
 * item. The mockup writes exactly one such question per lesson ("Trên biểu đồ đại diện của NIM, ..."); the bank
 * shows that lesson's `c{chapter}l{lesson}-rep` chart next to it.
 */
function repChartQuestion(row: CatalogRow, item: MockItem): number | null {
  const chapter = Number(row.id.slice(2, 4));
  if (row.kind !== 'lesson' || chapter < 8) return null;
  const hits = item.q.flatMap(([prompt], k) => (REP_CHART_PROMPT.test(prompt) ? [k] : []));
  if (hits.length !== 1)
    throw new Error(
      `${row.id}: ${hits.length} questions about the representative chart, expected 1`,
    );
  return hits[0] as number;
}

export function buildBank(
  norm: TextNormalizer,
  row: CatalogRow,
  item: MockItem,
  salt: string,
  overrides: Record<string, QuestionOverride> = {},
  used: Set<string> = new Set(),
): BankFile {
  const chapter = Number(row.id.slice(2, 4));
  const want = questionCountFor(chapter, row.kind);
  if (item.q.length !== want)
    throw new Error(`${row.id}: ${item.q.length} questions, expected ${want}`);
  norm.context = `${row.id} (questions)`;
  norm.warnQuestions = false;
  const repQuestion = repChartQuestion(row, item);
  const repChartId = `c${chapter}l${Number(row.id.slice(6))}-rep`;
  return {
    format: 'iqx-academy-bank-v3',
    item_id: row.id,
    salt,
    questions: item.q.map(([sourcePrompt, sourceOptions, sourceCorrect], k) => {
      const id = `${row.id}-q${String(k + 1).padStart(2, '0')}`;
      const fix = overrides[id];
      if (fix) used.add(id);
      const options = fix?.options ?? sourceOptions;
      const correct = fix?.correct ?? sourceCorrect;
      if (options.length !== 3) throw new Error(`${id}: ${options.length} options`);
      if (!Number.isInteger(correct) || correct < 0 || correct > 2)
        throw new Error(`${id}: correct index ${correct}`);
      const opts = options.map((text, j) => ({
        id: optionId(salt, id, j),
        text: fix?.options ? text : norm.plain(text),
      }));
      return {
        id,
        prompt: fix?.prompt ?? norm.plain(sourcePrompt),
        options: opts,
        correct_option_id: (opts[correct] as { id: string }).id,
        ...(fix?.chart_id
          ? { chart_id: fix.chart_id }
          : k === repQuestion
            ? { chart_id: repChartId }
            : {}),
      };
    }),
  };
}
