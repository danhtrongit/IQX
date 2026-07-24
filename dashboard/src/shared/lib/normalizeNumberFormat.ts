/**
 * Normalize AI-generated number formatting to en-US, conservatively.
 *
 * AI narrative (per-stock insight fragments + market-analysis inline HTML) is
 * written by the LLM and rendered verbatim — it is NOT produced by our number
 * formatter, so it can arrive in Vietnamese convention (comma = decimal,
 * period = thousands). The app standard is en-US (comma = thousands, period =
 * decimal). This helper fixes only the UNAMBIGUOUS vi-VN case and leaves
 * genuinely ambiguous tokens for the prompt-level rule to handle.
 *
 * Safe transform — a comma used as a DECIMAL separator:
 *   In en-US a comma is always a thousands separator followed by EXACTLY three
 *   digits. So a comma followed by 1 or 2 digits that are NOT part of a longer
 *   digit run is never valid en-US → it is a vi-VN decimal → convert to period.
 *     "0,35" → "0.35"   "1,01%" → "1.01%"   "−4,9 triệu" → "−4.9 triệu"
 *   Left unchanged (ambiguous or already en-US):
 *     "35,000" (thousands)   "1,234,567"   "1,824.53"   "1.000"/"7.2M" (period)
 *
 * Does not touch period separators (a period-thousands like "18.804" is
 * indistinguishable from an en-US decimal "18.804" without semantic context,
 * which only the model has — the prompt rule covers those going forward).
 */
const VI_DECIMAL_COMMA = /(\d),(\d{1,2})(?!\d)/g

export function normalizeNumberFormat(input: string): string {
  if (!input) return input
  return input.replace(VI_DECIMAL_COMMA, "$1.$2")
}
