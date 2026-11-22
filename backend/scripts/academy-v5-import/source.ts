import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'parse5';

import { attr, findAll } from '../academy-v4-import/dom.js';
import type { Element } from '../academy-v4-import/dom.js';
import type { MockItem } from '../academy-v4-import/source.js';
import { CATALOG_ROWS, chapterOf } from './catalog-table.js';
import type { CatalogRow } from './catalog-table.js';
import { SOURCE_SHA256 } from './paths.js';

export type { MockItem };

export interface SourceArticle {
  index: number;
  row: CatalogRow;
  el: Element;
  /** 1-based position inside the chapter (`C<ch>N<pos>` in the mockup ids). */
  position: number;
}

/** One `FIG.draw("<svg id>", "<kind>", {json})` line of the page script. */
export interface FigCall {
  svgId: string;
  kind: string;
  opts: Record<string, unknown>;
}

/** One `REPD` entry: the Dashboard chart object of a v5 lesson's "Biểu đồ đại diện". */
export interface RepData {
  name: string;
  kind: string;
  unit: string;
  labels: string[];
  main?: { name: string; v: (number | null)[] }[];
  /** Kind F (valuation by trading day): one unnamed series. */
  v?: (number | null)[];
  sub?: {
    unit: string;
    type: 'grouped' | 'stacked';
    series: { name: string; v: (number | null)[] }[];
  };
  ref?: number;
  hero?: number | null;
  mainUnit?: string;
}

export interface Source {
  sha256: string;
  bytes: number;
  articles: SourceArticle[];
  items: MockItem[];
  repd: Record<string, RepData>;
  figs: FigCall[];
  /** `const CH` of the page script: chapter number -> title. */
  chapters: Record<string, string>;
}

/** `const <name>=<json>;` on one line of the page script. */
function scriptLiteral<T>(html: string, name: string): T {
  const key = `const ${name}=`;
  const start = html.indexOf(key);
  if (start < 0) throw new Error(`${key} not found`);
  if (html.indexOf(key, start + 1) >= 0) throw new Error(`${key} appears twice`);
  const lineEnd = html.indexOf('\n', start);
  const line = html.slice(start + key.length, lineEnd < 0 ? undefined : lineEnd).trimEnd();
  if (!line.endsWith(';')) throw new Error(`${name} literal is not terminated on its line`);
  return JSON.parse(line.slice(0, -1)) as T;
}

const FIG_LINE = /^\s*FIG\.draw\("([^"]+)","([a-z]+)",(\{.*\})\);\s*$/;

function figCalls(html: string): FigCall[] {
  const out: FigCall[] = [];
  for (const line of html.split('\n')) {
    if (!line.includes('FIG.draw(')) continue;
    const m = FIG_LINE.exec(line);
    if (!m) {
      if (/^\s*FIG\.draw\(/.test(line))
        throw new Error(`FIG.draw line does not parse: ${line.slice(0, 120)}`);
      continue; // the FIG library itself (`draw:(id,k,o)=>...`)
    }
    out.push({
      svgId: m[1] as string,
      kind: m[2] as string,
      opts: JSON.parse(m[3] as string) as Record<string, unknown>,
    });
  }
  return out;
}

export function readSource(path: string): Source {
  const buf = readFileSync(path);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  if (sha256 !== SOURCE_SHA256)
    throw new Error(
      `source SHA-256 ${sha256} does not match the approved v5 mockup ${SOURCE_SHA256}`,
    );
  const html = buf.toString('utf8');
  const doc = parse(html);

  const arts = findAll(
    doc,
    (e) => e.tagName === 'article' && /^lesson\d+$/.test(attr(e, 'id') ?? ''),
  );
  if (arts.length !== CATALOG_ROWS.length)
    throw new Error(`expected ${CATALOG_ROWS.length} articles, found ${arts.length}`);
  const positions = new Map<number, number>();
  const articles = arts.map((el, i) => {
    const id = attr(el, 'id');
    if (id !== `lesson${i}`) throw new Error(`article ${i} has id ${id}`);
    const row = CATALOG_ROWS[i];
    if (!row) throw new Error(`no catalog row for article ${i}`);
    const ch = chapterOf(row.id);
    const position = (positions.get(ch) ?? 0) + 1;
    positions.set(ch, position);
    return { index: i, row, el, position };
  });

  const items = scriptLiteral<MockItem[]>(html, 'IT');
  if (items.length !== CATALOG_ROWS.length)
    throw new Error(`IT has ${items.length} items, catalog has ${CATALOG_ROWS.length}`);
  items.forEach((it, i) => {
    const art = articles[i] as SourceArticle;
    if (it.c !== chapterOf(art.row.id))
      throw new Error(`IT[${i}] chapter ${it.c} != ${art.row.id}`);
    if (it.k !== art.position - 1)
      throw new Error(`IT[${i}] position ${it.k} != ${art.position - 1} (${art.row.id})`);
    if (it.ex !== (art.row.kind === 'chapter_exam'))
      throw new Error(`IT[${i}] exam flag differs from ${art.row.id}`);
    if (it.opt !== (art.row.kind === 'practice'))
      throw new Error(`IT[${i}] optional flag differs from ${art.row.id}`);
    if (it.p !== it.q.length)
      throw new Error(`IT[${i}] pass mark ${it.p} != ${it.q.length} questions`);
  });

  return {
    sha256,
    bytes: buf.length,
    articles,
    items,
    repd: scriptLiteral<Record<string, RepData>>(html, 'REPD'),
    figs: figCalls(html),
    chapters: scriptLiteral<Record<string, string>>(html, 'CH'),
  };
}
