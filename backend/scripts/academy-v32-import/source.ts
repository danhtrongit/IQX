import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'parse5';

import { CATALOG_ROWS } from './catalog-table.js';
import type { CatalogRow } from './catalog-table.js';
import { attr, findAll } from './dom.js';
import type { Element } from './dom.js';
import { SOURCE_SHA256 } from './paths.js';

/** One mockup item: `IT[g]` in the page script. */
export interface MockItem {
  c: number;
  k: number;
  n: number;
  t: string;
  ex: boolean;
  opt: boolean;
  q: [string, string[], number][];
  p: number;
}

export interface SourceArticle {
  index: number;
  row: CatalogRow;
  el: Element;
}

export interface Source {
  sha256: string;
  bytes: number;
  articles: SourceArticle[];
  items: MockItem[];
  /** Every `svg[id]` inside the articles, in document order. */
  svgIds: string[];
}

export function readSource(path: string): Source {
  const buf = readFileSync(path);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  if (sha256 !== SOURCE_SHA256)
    throw new Error(`source SHA-256 ${sha256} does not match the approved mockup ${SOURCE_SHA256}`);
  const html = buf.toString('utf8');
  const doc = parse(html);

  const arts = findAll(
    doc,
    (e) => e.tagName === 'article' && /^lesson\d+$/.test(attr(e, 'id') ?? ''),
  );
  if (arts.length !== CATALOG_ROWS.length)
    throw new Error(`expected ${CATALOG_ROWS.length} articles, found ${arts.length}`);
  const articles = arts.map((el, i) => {
    const id = attr(el, 'id');
    if (id !== `lesson${i}`) throw new Error(`article ${i} has id ${id}`);
    const row = CATALOG_ROWS[i];
    if (!row) throw new Error(`no catalog row for article ${i}`);
    return { index: i, row, el };
  });

  const items = parseItems(html);
  if (items.length !== CATALOG_ROWS.length)
    throw new Error(`IT has ${items.length} items, catalog has ${CATALOG_ROWS.length}`);
  items.forEach((it, i) => {
    const row = CATALOG_ROWS[i] as CatalogRow;
    const ch = Number(row.id.slice(2, 4));
    if (it.c !== ch) throw new Error(`IT[${i}] chapter ${it.c} != ${row.id}`);
    if (it.ex !== (row.kind === 'chapter_exam'))
      throw new Error(`IT[${i}] exam flag differs from ${row.id}`);
    if (it.opt !== (row.kind === 'practice'))
      throw new Error(`IT[${i}] optional flag differs from ${row.id}`);
    if (it.p !== it.q.length)
      throw new Error(`IT[${i}] pass mark ${it.p} != ${it.q.length} questions`);
  });

  const svgIds = articles.flatMap((a) =>
    findAll(a.el, (e) => e.tagName === 'svg' && attr(e, 'id') !== undefined).map(
      (e) => attr(e, 'id') as string,
    ),
  );
  return { sha256, bytes: buf.length, articles, items, svgIds };
}

/** `const IT=[...];` sits on one line of the page script and is plain JSON. */
function parseItems(html: string): MockItem[] {
  const start = html.indexOf('const IT=');
  if (start < 0) throw new Error('const IT= not found');
  const lineEnd = html.indexOf('\n', start);
  const line = html.slice(start + 'const IT='.length, lineEnd < 0 ? undefined : lineEnd);
  const semi = line.lastIndexOf(';');
  if (semi < 0 || line.indexOf('];') !== semi - 1)
    throw new Error('IT literal is not terminated on its line');
  return JSON.parse(line.slice(0, semi)) as MockItem[];
}
