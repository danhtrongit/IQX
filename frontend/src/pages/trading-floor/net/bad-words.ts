/**
 * Basic profanity check for Gáy / Khấn texts. Mirror of `hasBadWords` in
 * `backend/src/modules/trading-floor/floor-fx.logic.ts` (SPEC v2): the server has the final say,
 * this copy only lets the form warn before anything is sent.
 */

/** Matched with their diacritics, as whole words ("đụ" yes, "đụng" no). */
const WORDS_WITH_DIACRITICS = [
  "địt",
  "đụ",
  "lồn",
  "cặc",
  "buồi",
  "đéo",
  "đĩ",
  "cứt",
  "đcm",
  "đkm",
  "đmm",
]

/** Whole tokens once diacritics are gone (never plain cac / lon / du / vl). */
const TOKENS = new Set([
  "dm",
  "dmm",
  "dcm",
  "dkm",
  "dit",
  "djt",
  "dmcs",
  "vcl",
  "vkl",
  "vcc",
  "clm",
  "cmm",
  "loz",
  "fuck",
  "fucking",
  "shit",
  "bitch",
  "dick",
  "pussy",
])

/** Substrings once every separator is removed ("d.i.t m.e" → "ditme"). */
const JOINED = ["ditme", "dume", "duma", "concac", "conlon", "occho"]

const WHOLE_WORD = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${WORDS_WITH_DIACRITICS.join("|")})(?=$|[^\\p{L}\\p{N}])`,
  "u"
)

const stripMarks = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d")

export function hasBadWords(text: string): boolean {
  const lower = text.normalize("NFC").toLowerCase()
  if (WHOLE_WORD.test(lower)) return true
  const plain = stripMarks(lower)
  if (plain.split(/[^a-z0-9]+/).some((t) => TOKENS.has(t))) return true
  // "Đ.M", "v.c.l": punctuation inside one space-separated chunk does not split the word.
  if (
    plain
      .split(/\s+/)
      .some((chunk) => TOKENS.has(chunk.replace(/[^a-z0-9]/g, "")))
  )
    return true
  const joined = plain.replace(/[^a-z0-9]/g, "")
  return JOINED.some((w) => joined.includes(w))
}
