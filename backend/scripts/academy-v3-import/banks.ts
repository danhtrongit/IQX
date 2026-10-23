import { createHmac, randomBytes } from 'node:crypto';

import { questionCountFor } from '../../src/modules/academy/content/v3/schema.js';
import type { BankFile } from '../../src/modules/academy/content/v3/schema.js';
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
 * thành câu khái niệm (v3.3) và gắn `chart_id` cho câu đọc biểu đồ đại diện. Id phương án giữ theo vị trí
 * trong bản mẫu nên không đổi khi sửa chữ.
 */
export interface QuestionOverride {
  prompt?: string;
  options?: [string, string, string];
  correct?: number;
  chart_id?: string;
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
        ...(fix?.chart_id ? { chart_id: fix.chart_id } : {}),
      };
    }),
  };
}
