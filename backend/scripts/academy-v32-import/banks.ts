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

export function buildBank(
  norm: TextNormalizer,
  row: CatalogRow,
  item: MockItem,
  salt: string,
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
    questions: item.q.map(([prompt, options, correct], k) => {
      const id = `${row.id}-q${String(k + 1).padStart(2, '0')}`;
      if (options.length !== 3) throw new Error(`${id}: ${options.length} options`);
      if (!Number.isInteger(correct) || correct < 0 || correct > 2)
        throw new Error(`${id}: correct index ${correct}`);
      const opts = options.map((text, j) => ({
        id: optionId(salt, id, j),
        text: norm.plain(text),
      }));
      return {
        id,
        prompt: norm.plain(prompt),
        options: opts,
        correct_option_id: (opts[correct] as { id: string }).id,
      };
    }),
  };
}
