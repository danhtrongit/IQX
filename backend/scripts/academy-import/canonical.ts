import { createHash } from 'node:crypto';

/**
 * Number-preserving JSON reader and a byte-exact port of the spec's object-hash convention:
 * `json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'))` encoded as UTF-8.
 *
 * `JSON.parse` collapses `25.0` into `25`; Python keeps it a float and prints `25.0`, so a plain
 * `JSON.stringify` port cannot reproduce the published hashes of the chapter 3 chart definitions.
 * The raw tree below keeps every number as a token (int vs float) and re-prints it Python style.
 */

export class RawNumber {
  constructor(
    readonly raw: string,
    readonly isFloat: boolean,
  ) {}
}

export type RawJson = null | boolean | string | RawNumber | RawJson[] | { [key: string]: RawJson };

const NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseRawJson(text: string): RawJson {
  let i = 0;
  const fail = (msg: string): never => {
    throw new Error(`parseRawJson: ${msg} at offset ${i}`);
  };
  const ws = (): void => {
    while (i < text.length) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) i += 1;
      else break;
    }
  };
  const value = (): RawJson => {
    ws();
    const c = text[i];
    if (c === '{') {
      i += 1;
      const out: { [key: string]: RawJson } = {};
      ws();
      if (text[i] === '}') {
        i += 1;
        return out;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('object key expected');
        const key = stringToken();
        ws();
        if (text[i] !== ':') fail("':' expected");
        i += 1;
        out[key] = value();
        ws();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === '}') {
          i += 1;
          return out;
        }
        fail("',' or '}' expected");
      }
    }
    if (c === '[') {
      i += 1;
      const out: RawJson[] = [];
      ws();
      if (text[i] === ']') {
        i += 1;
        return out;
      }
      for (;;) {
        out.push(value());
        ws();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === ']') {
          i += 1;
          return out;
        }
        fail("',' or ']' expected");
      }
    }
    if (c === '"') return stringToken();
    if (text.startsWith('true', i)) {
      i += 4;
      return true;
    }
    if (text.startsWith('false', i)) {
      i += 5;
      return false;
    }
    if (text.startsWith('null', i)) {
      i += 4;
      return null;
    }
    NUMBER_RE.lastIndex = i;
    const m = NUMBER_RE.exec(text);
    if (!m) return fail('unexpected token');
    i += m[0].length;
    return new RawNumber(m[0], /[.eE]/.test(m[0]));
  };
  const stringToken = (): string => {
    const start = i;
    i += 1;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') i += 2;
      else if (c === '"') {
        i += 1;
        return JSON.parse(text.slice(start, i)) as string;
      } else i += 1;
    }
    return fail('unterminated string');
  };
  const result = value();
  ws();
  if (i !== text.length) fail('trailing characters');
  return result;
}

/** Python `repr(float)` for the value range used by the content (throws outside it). */
export function pyFloatRepr(x: number): string {
  if (!Number.isFinite(x)) throw new Error('non-finite float');
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const a = Math.abs(x);
  if (a >= 1e16 || a < 1e-4) {
    const [mant = '', exp = '0'] = x.toExponential().split('e');
    const sign = exp.startsWith('-') ? '-' : '+';
    const digits = exp.replace(/^[+-]/, '').padStart(2, '0');
    return `${mant}e${sign}${digits}`;
  }
  const s = String(x);
  return Number.isInteger(x) ? `${s}.0` : s;
}

function compareCodePoints(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const ra = ia.next();
    const rb = ib.next();
    if (ra.done && rb.done) return 0;
    if (ra.done) return -1;
    if (rb.done) return 1;
    const ca = ra.value.codePointAt(0) ?? 0;
    const cb = rb.value.codePointAt(0) ?? 0;
    if (ca !== cb) return ca < cb ? -1 : 1;
  }
}

/** Canonical (sorted, compact, ensure_ascii=False) serialisation of a raw tree. */
export function canonicalRaw(node: RawJson): string {
  if (node === null) return 'null';
  if (typeof node === 'boolean') return node ? 'true' : 'false';
  if (typeof node === 'string') return JSON.stringify(node);
  if (node instanceof RawNumber) {
    if (node.isFloat) return pyFloatRepr(Number(node.raw));
    return BigInt(node.raw).toString();
  }
  if (Array.isArray(node)) return `[${node.map(canonicalRaw).join(',')}]`;
  const keys = Object.keys(node).sort(compareCodePoints);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalRaw(node[k] as RawJson)}`).join(',')}}`;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Opaque option id of an imported question: first 10 hex characters of
 * sha256(`<question id>|<source option id>`). Re-keying the options keeps the answer key out of the
 * attempt payload (every chapter 3 question has `o1` as its key in the approved source).
 */
export const opaqueOptionId = (questionId: string, sourceOptionId: string): string =>
  createHash('sha256').update(`${questionId}|${sourceOptionId}`).digest('hex').slice(0, 10);

/** SHA-256 of the spec's canonical form of a raw sub-tree. */
export function canonicalHash(node: RawJson): string {
  return sha256Hex(Buffer.from(canonicalRaw(node), 'utf8'));
}

/** Same convention applied to plain JS values (numbers lose int/float identity). */
export function canonicalPlain(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalPlain).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort(compareCodePoints);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalPlain(obj[k])}`).join(',')}}`;
  }
  throw new Error(`unsupported value of type ${typeof value}`);
}

export function canonicalPlainHash(value: unknown): string {
  return sha256Hex(Buffer.from(canonicalPlain(value), 'utf8'));
}

/**
 * Deterministic pretty printer for committed JSON: objects and arrays of objects are indented,
 * arrays of scalars stay on one line. Key order is the object's own insertion order.
 */
export function stableStringify(value: unknown): string {
  return `${print(value, 0)}\n`;
}

function print(value: unknown, depth: number): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number in output');
    return JSON.stringify(value);
  }
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const scalars = value.every((v) => v === null || typeof v !== 'object');
    if (scalars) return `[${value.map((v) => print(v, depth)).join(', ')}]`;
    return `[\n${value.map((v) => `${pad}${print(v, depth + 1)}`).join(',\n')}\n${end}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    if (keys.length === 0) return '{}';
    return `{\n${keys.map((k) => `${pad}${JSON.stringify(k)}: ${print(obj[k], depth + 1)}`).join(',\n')}\n${end}}`;
  }
  throw new Error(`unsupported value of type ${typeof value}`);
}
