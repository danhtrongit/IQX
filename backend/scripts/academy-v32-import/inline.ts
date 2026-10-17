import { children, describe, hasClass, isElement, isText, styleColor, styleProp } from './dom.js';
import type { Element, Node } from './dom.js';

/**
 * Text normalisation (design §6.3), applied to every visible string the importer emits.
 * Overrides (`overrides/text.json`) are substring replacements on decoded source text; every
 * override must be used at least once, and any en/em dash left after the digit-range rule fails.
 */
export class TextNormalizer {
  private readonly keys: string[];
  readonly used = new Set<string>();
  readonly missing: string[] = [];
  readonly warnings: string[] = [];
  /** Item id whose text is being normalised (for warnings), and whether `?` is reviewed there. */
  context = '';
  warnQuestions = false;

  constructor(private readonly overrides: Readonly<Record<string, string>>) {
    this.keys = Object.keys(overrides).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  }

  /** Normalise one run of plain text. Does not trim; collapses whitespace unless `keepNewlines`. */
  text(input: string, opts: { keepNewlines?: boolean } = {}): string {
    let s = input.replace(/\u00a0/g, ' ');
    s = opts.keepNewlines ? s.replace(/[^\S\n]+/g, ' ') : s.replace(/\s+/g, ' ');
    for (const k of this.keys) {
      if (s.includes(k)) {
        s = s.split(k).join(this.overrides[k] ?? k);
        this.used.add(k);
      }
    }
    s = s.replace(/(\d[\d.,]*%?)\s*[–—]\s*(\d)/g, '$1-$2');
    s = s.replace(/✓ ?/g, '');
    s = s.replace(/\s*Phần bạn viết được lưu trên trình duyệt này\.?/g, '');
    if (/[–—]/.test(s)) this.missing.push(`${this.context}: ${s.trim()}`);
    if (this.warnQuestions && s.includes('?'))
      this.warnings.push(`${this.context}: question mark in "${s.trim()}"`);
    return s;
  }

  /** Normalised, trimmed plain text of an element (or string). */
  plain(n: Node | string): string {
    const raw = typeof n === 'string' ? n : textOf(n);
    return this.text(raw).trim();
  }

  /** Plain text keeping line breaks (`<br>` and source newlines), each line trimmed. */
  lines(n: Node): string {
    const raw = textOf(n, true);
    return this.text(raw, { keepNewlines: true })
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .replace(/^\n+|\n+$/g, '');
  }

  unusedOverrides(): string[] {
    return this.keys.filter((k) => !this.used.has(k));
  }
}

function textOf(n: Node, br = false): string {
  if (isText(n)) return n.value;
  if (!isElement(n) && n.nodeName !== '#document-fragment') return '';
  if (isElement(n) && n.tagName === 'br') return br ? '\n' : ' ';
  return ((n as Element).childNodes as Node[]).map((c) => textOf(c, br)).join('');
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Mockup text colour -> inline tone class (schema.ts §1). */
const INLINE_TONE: Readonly<Record<string, string>> = {
  '#7fe0bd': 'pos',
  '#2bb886': 'pos',
  '#3fc495': 'pos',
  '#f2a0a0': 'neg',
  '#e66767': 'neg',
  '#e8c77d': 'warn',
  '#dfb969': 'warn',
  '#7fb8ff': 'info',
  '#5db8ff': 'info',
  '#c9a0f0': 'violet',
  '#b48cf2': 'violet',
  '#dbe7f3': 'strong',
};

/** Mockup text colour -> card/table tone (cardToneSchema). `#dbe7f3` (plain white) has no tone. */
const CARD_TONE: Readonly<Record<string, CardTone>> = {
  '#7fe0bd': 'pos',
  '#2bb886': 'pos',
  '#3fc495': 'pos',
  '#f2a0a0': 'neg',
  '#e66767': 'neg',
  '#e8c77d': 'warn',
  '#dfb969': 'warn',
  '#7fb8ff': 'info',
  '#5db8ff': 'info',
  '#c9a0f0': 'violet',
  '#b48cf2': 'violet',
};

export type CardTone =
  'neutral' | 'highlight' | 'pos' | 'neg' | 'good' | 'bad' | 'warn' | 'info' | 'violet';

export function inlineTone(hex: string, where: string): string {
  const t = INLINE_TONE[hex];
  if (!t) throw new Error(`${where}: no inline tone for colour ${hex}`);
  return t;
}

/** Card tone of an element's inline `color`, undefined when uncoloured or plain white. */
export function cardToneOf(el: Element): CardTone | undefined {
  const c = styleColor(el);
  if (!c) return undefined;
  if (c === '#dbe7f3') return undefined;
  const t = CARD_TONE[c];
  if (!t) throw new Error(`${describe(el)}: no card tone for colour ${c}`);
  return t;
}

/**
 * Element children -> Inline HTML (schema.ts `inlineHtml`): b/strong/em/br and tone spans only.
 * `skip` drops matching children (for example the `small` label inside a `.say`).
 */
export function inlineOf(
  norm: TextNormalizer,
  el: Element,
  opts: { skip?: (e: Element) => boolean } = {},
): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (isText(n)) {
      out.push(escapeHtml(norm.text(n.value)));
      return;
    }
    if (!isElement(n)) return;
    if (opts.skip?.(n)) return;
    const tag = n.tagName;
    if (tag === 'br') {
      out.push('<br>');
      return;
    }
    if (tag === 'i' && hasClass(n, 'dot')) return;
    const inner = () => (n.childNodes as Node[]).forEach(walk);
    if (tag === 'b' || tag === 'strong' || tag === 'em') {
      const color = styleColor(n);
      const tone = hasClass(n, 'hl')
        ? 'accent'
        : color
          ? inlineTone(color, describe(n))
          : undefined;
      if (tone) out.push(`<span class="tone-${tone}">`);
      out.push(`<${tag}>`);
      inner();
      out.push(`</${tag}>`);
      if (tone) out.push('</span>');
      return;
    }
    if ((tag === 'span' || tag === 'small') && !styleProp(n, 'color')) {
      inner();
      return;
    }
    throw new Error(`inline: unsupported element ${describe(n)} inside ${describe(el)}`);
  };
  (el.childNodes as Node[]).forEach(walk);
  return tidyInline(out.join(''));
}

/** Collapse spaces, trim around `<br>` and at both ends (also just inside a leading/trailing tag). */
export function tidyInline(s: string): string {
  let r = s.replace(/ {2,}/g, ' ');
  r = r.replace(/ ?<br> ?/g, '<br>');
  r = r.replace(/^((?:<[^>]+>)*) +/, '$1').replace(/ +((?:<\/[^>]+>)*)$/, '$1');
  r = r.replace(/^ +| +$/g, '');
  // Move a space that sits just inside an opening tag outside of it: "<b> x" -> " <b>x".
  r = r.replace(/((?:<(?:b|strong|em|span class="tone-[a-z]+")>)+) /g, ' $1');
  r = r.replace(/ ((?:<\/(?:b|strong|em|span)>)+)/g, '$1 ');
  r = r.replace(/ {2,}/g, ' ').replace(/^ +| +$/g, '');
  return r;
}

/** Inline HTML of an element that may only hold text (used for strict plain fields). */
export function plainOnly(norm: TextNormalizer, el: Element): string {
  for (const c of children(el))
    if (c.tagName !== 'br' && c.tagName !== 'b')
      throw new Error(`plain: unexpected ${describe(c)} in ${describe(el)}`);
  return norm.plain(el);
}
