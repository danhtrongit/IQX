// Backend (no AI) target-price parsing from report titles / summaries, Vietnamese and English.

const KEYWORDS = String.raw`(?:giá\s+mục\s+tiêu|target\s+price|price\s+target|(?<![\p{L}\p{N}])(?:TP|GMT)(?![\p{L}\p{N}]))`;
// Words allowed between the keyword and the number: "12M TP of VND54,600", "GMT: 46.800đ", "giá mục tiêu 12 tháng là".
const FILLER = String.raw`(?:\s|[:=~(,\-]|\d{1,2}\s*(?:tháng|months?|m|th)(?![\p{L}\p{N}])|12-?month|of|at|is|to|của|là|đạt|ở\s+mức|mức|với|khoảng|điều\s+chỉnh|dự\s+phóng|forward)*`;
const CURRENCY = String.raw`(?:VND|VNĐ|vnd|đồng|đ|d)?\s*`;
const NUMBER = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(?:\s*(nghìn|ngàn|nghin|k)(?![\p{L}\p{N}]))?`;

const PATTERN = new RegExp(`${KEYWORDS}${FILLER}${CURRENCY}${NUMBER}${UNIT}(?![\\d%])`, 'giu');

const MAX_TARGET_VND = 10_000_000;

function parseNumber(token: string): { value: number; decimal: boolean } | null {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(token))
    return { value: Number(token.replace(/[.,]/g, '')), decimal: false };
  if (/^\d+$/.test(token)) return { value: Number(token), decimal: false };
  const m = /^(\d+)[.,](\d+)$/.exec(token);
  if (m) return { value: Number(`${m[1]}.${m[2]}`), decimal: true };
  return null;
}

/**
 * Normalizes the first plausible target price found in `text` to an integer VND value.
 * Values below 1,000 are only accepted when the text says nghìn/ngàn/k; otherwise null (no guessing).
 */
export function parseTargetPriceVnd(text: string | null | undefined): number | null {
  if (!text) return null;
  const input = text.normalize('NFC').replace(/\s+/g, ' ');
  for (const match of input.matchAll(PATTERN)) {
    const parsed = parseNumber(match[1] ?? '');
    if (!parsed) continue;
    const scaled = Boolean(match[2]);
    let value = parsed.value;
    if (scaled) {
      if (value < 1000) value = Math.round(value * 1000);
    } else if (parsed.decimal || value < 1000) {
      continue;
    }
    value = Math.round(value);
    if (value >= 1000 && value <= MAX_TARGET_VND) return value;
  }
  return null;
}
