import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

/**
 * Allowlist sanitiser for the HTML that survives inside typed `html` blocks, table cells and
 * step bodies ("allowlist v2"). Everything structural (tables, figures, charts, steps, details,
 * callouts) is converted to typed blocks by `blocks.ts` before this runs, so the surviving markup
 * is prose and formulas only. Text content is never rewritten: `< > & ∈ ∉`, sub/sup and the
 * fraction/equation markup are kept exactly.
 *
 * Two modes:
 * - strict (the importer): any element, attribute or class outside the allowlist is a violation
 *   and the extraction fails, so nothing is silently dropped.
 * - lenient (hostile input, tests, runtime sanitising): script/style/handlers/unknown attributes
 *   are removed, unknown elements are unwrapped, and the result is always allowlisted.
 */

export type ParseNode = DefaultTreeAdapterMap['node'];
export type ParseChild = DefaultTreeAdapterMap['childNode'];
export type ParseElement = DefaultTreeAdapterMap['element'];
export type ParseText = DefaultTreeAdapterMap['textNode'];

/** Elements allowed in prose/formula blocks. */
export const FLOW_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h3',
  'h4',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'sub',
  'sup',
  'code',
  'br',
]);

/** Elements allowed inside table cells, captions, titles. */
export const INLINE_TAGS: ReadonlySet<string> = new Set([
  'span',
  'strong',
  'b',
  'em',
  'i',
  'sub',
  'sup',
  'code',
  'br',
]);

/** Classes that carry meaning for the renderer (formulas, filter chips, execution example). */
export const ALLOWED_CLASSES: ReadonlySet<string> = new Set([
  'formula-group',
  'math-eq',
  'frac',
  'good',
  'execution-example',
  'time-arrow',
  'filter-name',
  'filter-period',
  'filter-expression',
]);

const VOID_TAGS = new Set(['br']);
/** Dropped together with their content in lenient mode. */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'noscript',
  'svg',
  'math',
  'link',
  'meta',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'img',
  'audio',
  'video',
  'canvas',
]);

export interface SanitizeOptions {
  /** Record violations instead of repairing them (importer). */
  strict: boolean;
  /** Allowed element set (defaults to FLOW_TAGS). */
  tags?: ReadonlySet<string>;
}

export const isElement = (n: ParseNode): n is ParseElement => 'tagName' in n;
export const isText = (n: ParseNode): n is ParseText => n.nodeName === '#text';

export function getAttr(el: ParseElement, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

export function classList(el: ParseElement): string[] {
  return (getAttr(el, 'class') ?? '').split(/\s+/).filter(Boolean);
}

export const hasClass = (el: ParseElement, cls: string): boolean => classList(el).includes(cls);

export function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replaceAll(String.fromCharCode(0xa0), '&nbsp;');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Serialise nodes through the allowlist; violations are appended to `violations`. */
export function serializeSanitized(
  nodes: readonly ParseChild[],
  opts: SanitizeOptions,
  violations: string[],
): string {
  const tags = opts.tags ?? FLOW_TAGS;
  const walk = (list: readonly ParseChild[]): string => {
    let out = '';
    for (const node of list) {
      if (isText(node)) {
        out += escapeText(node.value);
        continue;
      }
      if (!isElement(node)) {
        if (node.nodeName !== '#comment') violations.push(`unsupported node ${node.nodeName}`);
        else if (opts.strict) violations.push('comment node');
        continue;
      }
      const tag = node.tagName;
      if (!tags.has(tag)) {
        if (opts.strict) {
          violations.push(`element <${tag}> is not allowed here`);
          continue;
        }
        if (DROP_WITH_CONTENT.has(tag)) continue;
        out += walk(node.childNodes);
        continue;
      }
      const keptClasses: string[] = [];
      for (const attr of node.attrs) {
        if (attr.name === 'class') {
          for (const c of attr.value.split(/\s+/).filter(Boolean)) {
            if (ALLOWED_CLASSES.has(c)) keptClasses.push(c);
            else if (opts.strict) violations.push(`class "${c}" on <${tag}> is not allowed`);
          }
        } else if (opts.strict) {
          violations.push(`attribute "${attr.name}" on <${tag}> is not allowed`);
        }
      }
      const attrs = keptClasses.length > 0 ? ` class="${escapeAttr(keptClasses.join(' '))}"` : '';
      if (VOID_TAGS.has(tag)) out += `<${tag}${attrs}>`;
      else out += `<${tag}${attrs}>${walk(node.childNodes)}</${tag}>`;
    }
    return out;
  };
  return walk(nodes);
}

/** Parse an HTML fragment and return allowlisted markup (lenient unless `strict` is set). */
export function sanitizeHtml(html: string, opts: Partial<SanitizeOptions> = {}): string {
  const violations: string[] = [];
  const fragment = parseFragment(html);
  const out = serializeSanitized(
    fragment.childNodes,
    { strict: opts.strict ?? false, ...(opts.tags ? { tags: opts.tags } : {}) },
    violations,
  );
  if (opts.strict && violations.length > 0) {
    throw new Error(`sanitizeHtml: ${[...new Set(violations)].join('; ')}`);
  }
  return out;
}

/* --------------------------------------------------------------- text equivalence */

export interface TextOptions {
  /** Skip these tags together with their content (UI chrome). */
  skipTags?: ReadonlySet<string>;
  /** Skip elements carrying one of these classes. */
  skipClasses?: ReadonlySet<string>;
}

/** Concatenated text of nodes in document order, whitespace removed (comparison form). */
export function squashedText(nodes: readonly ParseNode[], opts: TextOptions = {}): string {
  const parts: string[] = [];
  const walk = (list: readonly ParseNode[]): void => {
    for (const node of list) {
      if (isText(node)) parts.push(node.value);
      else if (isElement(node)) {
        if (opts.skipTags?.has(node.tagName)) continue;
        if (opts.skipClasses && classList(node).some((c) => opts.skipClasses?.has(c))) continue;
        if (node.tagName === 'template') continue;
        walk(node.childNodes);
      }
    }
  };
  walk(nodes);
  return parts.join('').replace(/\s+/g, '');
}

/** Plain text of an HTML snippet (entities decoded), whitespace left as is. */
export function plainText(html: string): string {
  const parts: string[] = [];
  const walk = (list: readonly ParseNode[]): void => {
    for (const node of list) {
      if (isText(node)) parts.push(node.value);
      else if (isElement(node)) walk(node.childNodes);
    }
  };
  walk(parseFragment(html).childNodes);
  return parts.join('');
}

export function squash(s: string): string {
  return s.replace(/\s+/g, '');
}

/** First position where two squashed strings differ, with context, for diagnostics. */
export function firstDifference(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  const ctx = (s: string): string => JSON.stringify(s.slice(Math.max(0, i - 30), i + 40));
  return `offset ${i}: source ${ctx(a)} vs output ${ctx(b)}`;
}

/* -------------------------------------------------------------- do-not-copy scan */

/**
 * Tokens that must never appear in learner-facing package data (design section 4, "Do not copy"):
 * preview labels, client-side grading and state, mock shell, mascots, catalogue duplicates.
 */
export const FORBIDDEN_TEXT: readonly { label: string; re: RegExp }[] = [
  { label: 'preview', re: /preview/i },
  { label: 'HTML', re: /HTML/ },
  { label: 'spec', re: /\bspec\b/i },
  { label: 'localStorage', re: /localStorage|sessionStorage/ },
  { label: 'Thông tin mẫu', re: /Thông tin mẫu|Mẫu Chương|Đặt lại mẫu/ },
  { label: 'http', re: /https?:|\/\/[a-z0-9.-]+\.[a-z]{2,}/i },
  {
    label: 'client grading/state',
    re: /shopTransaction|navigator\.locks|completedIds|SHOP\b|rewardGranted/,
  },
  {
    label: 'client grading/state',
    re: /\bCH[1-4]\.(?:grade|complete|math|getData|stats)|IQX_CH\d|window\.CH\d/,
  },
  {
    label: 'shell/mascot',
    re: /mascotAsset|petAsset|SHOP_ASSETS|registryData|catalogData|academyContractData/,
  },
  { label: 'shell/mascot', re: /chapterXInfo|chapter3FilterLink|\bscenario\b|published-preview/ },
  { label: 'embedded media', re: /data:image|base64,/ },
  { label: 'script/handler', re: /<script|<style|\son[a-z]+\s*=|javascript:|style\s*=/i },
];

/** Property names that must not appear anywhere in public package data. */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  'proof',
  'basis',
  'change_log',
  'review',
  'reference_runs',
  'reference_filter',
  'defaults',
  'fields',
  'content_status',
  'capture_kind',
  'datasets',
  'registryData',
  'catalogData',
]);

/** Additional keys that are answer data and must not be present in non-private files. */
export const ANSWER_KEYS: ReadonlySet<string> = new Set([
  'correct',
  'correct_option_id',
  'correct_index',
  'explanation',
  'option_explanations',
]);

/** Scan every string value and key of a JSON value; returns human readable findings. */
export function scanForbidden(
  value: unknown,
  opts: { keys?: ReadonlySet<string>; where?: string } = {},
): string[] {
  const findings: string[] = [];
  const keys = opts.keys ?? FORBIDDEN_KEYS;
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'string') {
      for (const { label, re } of FORBIDDEN_TEXT) {
        if (re.test(v))
          findings.push(`${path}: forbidden token (${label}) in ${JSON.stringify(v.slice(0, 80))}`);
      }
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (keys.has(k)) findings.push(`${path}.${k}: forbidden property`);
        walk(x, `${path}.${k}`);
      }
    }
  };
  walk(value, opts.where ?? '$');
  return findings;
}
