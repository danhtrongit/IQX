import type { DefaultTreeAdapterMap } from 'parse5';

export type Node = DefaultTreeAdapterMap['node'];
export type Element = DefaultTreeAdapterMap['element'];
export type TextNode = DefaultTreeAdapterMap['textNode'];
export type ParentNode = DefaultTreeAdapterMap['parentNode'];

export function isElement(n: Node | undefined | null): n is Element {
  return !!n && typeof (n as Element).tagName === 'string';
}

export function isText(n: Node): n is TextNode {
  return n.nodeName === '#text';
}

export function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

export function classes(el: Element): string[] {
  return (attr(el, 'class') ?? '').split(/\s+/).filter(Boolean);
}

export function hasClass(el: Element, c: string): boolean {
  return classes(el).includes(c);
}

/** Element children (comments and whitespace text dropped). */
export function children(el: ParentNode): Element[] {
  return (el.childNodes as Node[]).filter(isElement);
}

/** Raw text content (entities already decoded by parse5), not normalised. */
export function rawText(n: Node): string {
  if (isText(n)) return n.value;
  if (!isElement(n) && n.nodeName !== '#document-fragment') return '';
  const kids = (n as ParentNode).childNodes as Node[];
  return kids.map((k) => (isElement(k) && k.tagName === 'br' ? '\n' : rawText(k))).join('');
}

/** First descendant matching the predicate (depth first, document order). */
export function find(el: ParentNode, pred: (e: Element) => boolean): Element | undefined {
  for (const c of children(el)) {
    if (pred(c)) return c;
    const hit = find(c, pred);
    if (hit) return hit;
  }
  return undefined;
}

export function findAll(el: ParentNode, pred: (e: Element) => boolean): Element[] {
  const out: Element[] = [];
  const walk = (p: ParentNode) => {
    for (const c of children(p)) {
      if (pred(c)) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

/** `color:#xxxxxx` / `background:#xxxxxx` / `background:var(--c1)` from an inline style. */
export function styleProp(el: Element, prop: string): string | undefined {
  const style = attr(el, 'style') ?? '';
  for (const part of style.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    if (part.slice(0, i).trim().toLowerCase() === prop)
      return part
        .slice(i + 1)
        .trim()
        .toLowerCase();
  }
  return undefined;
}

export const styleColor = (el: Element): string | undefined => styleProp(el, 'color');

/** Short CSS-like path for error messages: `article#lesson3 > div.sec[2] > div.ex2`. */
export function describe(el: Element): string {
  const id = attr(el, 'id');
  const cls = classes(el);
  return `${el.tagName}${id ? `#${id}` : ''}${cls.length ? `.${cls.join('.')}` : ''}`;
}

/** Matches `tag.class1.class2` exactly (same class set). */
export function is(el: Element, tag: string, ...cls: string[]): boolean {
  if (el.tagName !== tag) return false;
  const c = classes(el);
  return c.length === cls.length && cls.every((x) => c.includes(x));
}
