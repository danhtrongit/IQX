export const SYMBOL_PATTERN = /^[A-Z0-9._-]{1,20}$/;
export const MAX_SYMBOLS = 500;
export const NAME_MAX = 120;

/** Split on whitespace/comma/semicolon, uppercase, dedupe; invalid tokens are reported (deduped). */
export function parseSymbols(text: string): { symbols: string[]; invalid: string[] } {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const symbols: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (SYMBOL_PATTERN.test(t)) {
      if (!symbols.includes(t)) symbols.push(t);
    } else if (!invalid.includes(t)) invalid.push(t);
  }
  return { symbols, invalid };
}

export type SymbolsCheck = { ok: true; symbols: string[] } | { ok: false; message: string };

export function validateSymbols(text: string): SymbolsCheck {
  const { symbols, invalid } = parseSymbols(text);
  if (invalid.length > 0) return { ok: false, message: `Mã không hợp lệ: ${invalid.join(', ')}. Chỉ dùng chữ, số, dấu chấm, gạch ngang và gạch dưới.` };
  if (symbols.length === 0) return { ok: false, message: 'Chọn ít nhất một mã cổ phiếu.' };
  if (symbols.length > MAX_SYMBOLS) return { ok: false, message: `Tối đa ${MAX_SYMBOLS} mã mỗi cảnh báo.` };
  return { ok: true, symbols };
}

export const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
