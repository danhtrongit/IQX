// Automatic output checks before a thesis is stored (spec §21.1–21.4). Backend only, 0 tokens.
import {
  SUMMARY_MAX_WORDS,
  type BuiltThesis,
  type Disagreement,
  type ExtractedClaim,
  type ThesisBuildInput,
  type ValidationFailure,
} from '../research.types.js';

export const TITLE_MAX_WORDS = 14;

// ─── text helpers ───────────────────────────────────────────────────────────

const norm = (s: string): string => s.normalize('NFC').toLowerCase();

/** Lower-cased NFC word tokens. Diacritics are significant: "mua" !== "mùa", "bán" !== "bàn". */
function words(text: string): string[] {
  return norm(text).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

export function countWords(text: string): number {
  return text.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Start indices where the phrase (as word tokens) occurs in the token list. */
function phraseHits(tokens: string[], phrase: string[]): number[] {
  const hits: number[] = [];
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((w, k) => tokens[i + k] === w)) hits.push(i);
  }
  return hits;
}

const phraseOf = (s: string): string[] => words(s);

// ─── forbidden recommendation terms (§21.2) ─────────────────────────────────

export const FORBIDDEN_RECOMMENDATION_TERMS: readonly string[] = [
  'mua',
  'bán',
  'nắm giữ',
  'khả quan',
  'kém khả quan',
  'khuyến nghị',
  'tích lũy',
  'tích luỹ',
  'trung lập',
  'tăng tỷ trọng',
  'giảm tỷ trọng',
  'outperform',
  'underperform',
  'buy',
  'sell',
  'hold',
  'overweight',
  'underweight',
  'accumulate',
  'neutral',
];

/**
 * Ordinary business phrases that contain "mua"/"bán" as a noun/verb of the business itself
 * (retail, selling price, power purchase agreements, property launches...). They are masked before
 * the forbidden-word scan so that a retail or real-estate thesis is not rejected for vocabulary.
 */
const FORBIDDEN_EXCEPTIONS: readonly string[] = [
  'bán lẻ',
  'bán buôn',
  'bán sỉ',
  'bán hàng',
  'bán dẫn',
  'bán đảo',
  'bán kính',
  'bán thành phẩm',
  'bán ra',
  'bán nhà',
  'bán căn hộ',
  'bán sản phẩm',
  'mở bán',
  'giá bán',
  'hàng bán',
  'mua bán',
  'mua sắm',
  'mua lại',
  'mua hàng',
  'mua điện',
  'mua nguyên liệu',
  'giá mua',
];

export function findForbiddenTerms(text: string): string[] {
  const tokens = words(text);
  const masked = new Array<boolean>(tokens.length).fill(false);
  for (const ex of FORBIDDEN_EXCEPTIONS) {
    const p = phraseOf(ex);
    for (const at of phraseHits(tokens, p)) for (let k = 0; k < p.length; k++) masked[at + k] = true;
  }
  const found = new Set<string>();
  for (const term of FORBIDDEN_RECOMMENDATION_TERMS) {
    const p = phraseOf(term);
    for (const at of phraseHits(tokens, p)) {
      if (p.some((_, k) => masked[at + k])) continue;
      found.add(term);
    }
  }
  return [...found];
}

// ─── generic titles (§6.2) ──────────────────────────────────────────────────

export const GENERIC_TITLES: readonly string[] = [
  'Triển vọng tích cực',
  'Nhiều cơ hội tăng trưởng',
  'Rủi ro cần theo dõi',
  'Tình hình khả quan',
  'Triển vọng khả quan',
  'Triển vọng tiêu cực',
  'Triển vọng tăng trưởng',
  'Triển vọng ổn định',
  'Triển vọng kinh doanh tích cực',
  'Cơ hội tăng trưởng',
  'Nhiều cơ hội',
  'Rủi ro cần lưu ý',
  'Rủi ro cần chú ý',
  'Các rủi ro cần theo dõi',
  'Rủi ro tiềm ẩn',
  'Tình hình tích cực',
  'Tình hình kinh doanh khả quan',
  'Tăng trưởng tích cực',
];

export function isGenericTitle(title: string): boolean {
  const t = words(title);
  return GENERIC_TITLES.some((g) => {
    const p = phraseOf(g);
    // The title is the generic phrase itself, or the phrase plus at most one filler word.
    return t.length <= p.length + 1 && phraseHits(t, p).length > 0;
  });
}

// ─── technical terms (§29.3) ────────────────────────────────────────────────

export const TECHNICAL_TERMS: readonly string[] = [
  'DATA CACHE',
  'AI CACHE',
  'backend',
  'research cache',
  'AI updated',
  'report watcher',
  'canonical thesis',
  'semantic clustering',
  'embedding',
  'token',
  'Xem nguồn',
];

export function findTechnicalTerms(text: string): string[] {
  const tokens = words(text);
  return TECHNICAL_TERMS.filter((t) => phraseHits(tokens, phraseOf(t)).length > 0);
}

// ─── numeric tokenisation ───────────────────────────────────────────────────

interface NumCandidate {
  value: number;
  decimals: number;
}

type Tok =
  | { kind: 'quarter'; q: number; y: number | null }
  | { kind: 'half'; h: number; y: number | null }
  | { kind: 'year'; y: number }
  | {
      kind: 'number';
      raw: string;
      cands: NumCandidate[];
      pct: boolean;
      scale: number;
      /** The text states a unit/scale word (tỷ, triệu, đồng...). */
      explicit: boolean;
      hasUnit: boolean;
      integer: boolean;
      calendar: boolean;
    };

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };

const yearOf = (s: string | undefined): number | null => {
  if (!s) return null;
  return s.length === 2 ? 2000 + Number(s) : Number(s);
};

const YEAR = String.raw`20[2-3]\d|\d{2}`;
const MASTER = new RegExp(
  [
    // quarter: Q4/2026, quý 3/2026, quý IV, 4Q26
    String.raw`(?<![\p{L}\d])(?:(?<qa>[1-4])Q|Q(?<qb>[1-4])|quý\s*(?<qc>IV|III|II|I|[1-4]))(?:\s?[\/\-.]\s?(?<qy>${YEAR})|(?<=Q)(?<qy2>${YEAR}))?(?![\p{L}\d])`,
    // half year: H2/2027, 1H26
    String.raw`(?<![\p{L}\d])(?:(?<ha>[12])H|H(?<hb>[12]))(?:\s?[\/\-.]\s?(?<hy>${YEAR})|(?<=H)(?<hy2>${YEAR}))?(?![\p{L}\d])`,
    // year 2020–2035 (not followed by a unit, then it is an amount), or FY26
    String.raw`(?<![\d.,])(?<yr>20[2-3]\d)(?!\d|[.,]\d)(?!\s*(?:%|tỷ|triệu|nghìn|ngàn|đồng|vnd|usd))`,
    String.raw`(?<![\p{L}\d])FY\s?(?<fy>20[2-3]\d|[2-3]\d)(?!\d)`,
    // plain number with Vietnamese or English separators
    String.raw`(?<![\p{L}\d.,$])(?<num>\d+(?:[.,]\d+)*)`,
  ].join('|'),
  'giu',
);

const UNIT_RE =
  /^\s*(?:(?<pct>%|(?:điểm\s+)?phần\s+trăm)|(?<scale>nghìn\s+tỷ|ngàn\s+tỷ|trillion|billion|million|bn|mn|tỷ|triệu|nghìn|ngàn)(?![\p{L}\d])|(?<cur>đồng|vnd|vnđ|usd|đô\s+la|đ)(?![\p{L}\d]))/iu;
const CUR_RE = /^\s*(?:đồng|vnd|vnđ|usd|đô\s+la)(?![\p{L}\d])/iu;

const SCALE_WORDS: [RegExp, number][] = [
  [/^(nghìn|ngàn)\s+tỷ$|^trillion$/iu, 1e12],
  [/^(tỷ|billion|bn)$/iu, 1e9],
  [/^(triệu|million|mn)$/iu, 1e6],
  [/^(nghìn|ngàn)$/iu, 1e3],
];

function scaleOfWord(word: string): number {
  const w = word.toLowerCase().replace(/\s+/g, ' ');
  for (const [re, v] of SCALE_WORDS) if (re.test(w)) return v;
  return 1;
}

/** Possible numeric readings of "12.500", "12,5", "1.234,56", "1,250,000". */
function numberCandidates(raw: string): NumCandidate[] {
  const seps = raw.match(/[.,]/g) ?? [];
  if (seps.length === 0) return [{ value: Number(raw), decimals: 0 }];
  const kinds = new Set(seps);
  if (kinds.size === 2) {
    const dec = seps[seps.length - 1]!;
    const thou = dec === '.' ? ',' : '.';
    const [intPart, fracPart = ''] = raw.split(dec);
    if (raw.split(dec).length > 2) return [];
    const v = Number(`${intPart!.split(thou).join('')}.${fracPart}`);
    return Number.isNaN(v) ? [] : [{ value: v, decimals: fracPart.length }];
  }
  const sep = seps[0]!;
  const groups = raw.split(sep);
  if (groups.length > 2) {
    return groups.slice(1).every((g) => g.length === 3) && groups[0]!.length <= 3
      ? [{ value: Number(groups.join('')), decimals: 0 }]
      : [];
  }
  const [before, after] = groups as [string, string];
  const decimal: NumCandidate = { value: Number(`${before}.${after}`), decimals: after.length };
  if (after.length === 3 && before.length <= 3 && before !== '0' && before !== '00') {
    return [{ value: Number(`${before}${after}`), decimals: 0 }, decimal];
  }
  return [decimal];
}

function tokenize(text: string): Tok[] {
  const src = text.normalize('NFC');
  const out: Tok[] = [];
  for (const m of src.matchAll(MASTER)) {
    const g = m.groups!;
    if (g.qa || g.qb || g.qc) {
      const rawQ = g.qa ?? g.qb ?? g.qc!;
      const q = /^\d$/.test(rawQ) ? Number(rawQ) : ROMAN[rawQ.toLowerCase()]!;
      out.push({ kind: 'quarter', q, y: yearOf(g.qy ?? g.qy2) });
    } else if (g.ha || g.hb) {
      out.push({ kind: 'half', h: Number(g.ha ?? g.hb), y: yearOf(g.hy ?? g.hy2) });
    } else if (g.yr || g.fy) {
      out.push({ kind: 'year', y: yearOf(g.yr ?? g.fy)! });
    } else if (g.num) {
      const end = m.index! + m[0].length;
      const unit = UNIT_RE.exec(src.slice(end));
      const pct = Boolean(unit?.groups?.pct);
      const scaleWord = unit?.groups?.scale;
      let hasCur = Boolean(unit?.groups?.cur);
      if (scaleWord && CUR_RE.test(src.slice(end + unit![0].length))) hasCur = true;
      const before = src.slice(Math.max(0, m.index! - 8), m.index!);
      out.push({
        kind: 'number',
        raw: g.num,
        cands: numberCandidates(g.num),
        pct,
        scale: scaleWord ? scaleOfWord(scaleWord) : 1,
        explicit: Boolean(scaleWord) || hasCur,
        hasUnit: pct || Boolean(scaleWord) || hasCur,
        integer: !/[.,]/.test(g.num),
        calendar: /(tháng|ngày)\s*$/iu.test(before),
      });
    }
  }
  return out;
}

// ─── claim evidence pool ────────────────────────────────────────────────────

interface UnitInfo {
  pct: boolean;
  scale: number;
  scaleKnown: boolean;
  empty: boolean;
}

function parseClaimUnit(unit: string | undefined): UnitInfo {
  const u = norm(unit ?? '');
  const has = (re: RegExp): boolean => re.test(u);
  const w = (term: string): RegExp => new RegExp(`(?<![\\p{L}\\d])${term}(?![\\p{L}\\d])`, 'u');
  const pct = has(/%/u) || has(w('phần trăm')) || has(w('percent')) || has(w('pct')) || has(w('pp'));
  let scale = 1;
  let known = false;
  if (has(w('(?:nghìn|ngàn)\\s+tỷ')) || has(w('trillion')) || has(w('tn'))) [scale, known] = [1e12, true];
  else if (has(w('tỷ')) || has(w('billion')) || has(w('bn'))) [scale, known] = [1e9, true];
  else if (has(w('triệu')) || has(w('million')) || has(w('mn')) || has(w('mm'))) [scale, known] = [1e6, true];
  else if (has(w('nghìn')) || has(w('ngàn')) || has(w('thousand'))) [scale, known] = [1e3, true];
  else if (has(w('đồng')) || has(w('vnd')) || has(w('vnđ')) || has(w('usd')) || pct) known = true;
  return { pct, scale, scaleKnown: known, empty: u.trim() === '' };
}

interface Pool {
  numbers: { value: number; unit: UnitInfo }[];
  quarters: { q: number; y: number | null }[];
  halves: { h: number; y: number | null }[];
  years: Set<number>;
  /** Digits that appear in timeHorizon / period text ("12 tháng"). */
  textNumbers: number[];
}

function buildPool(claims: ExtractedClaim[]): Pool {
  const pool: Pool = { numbers: [], quarters: [], halves: [], years: new Set(), textNumbers: [] };
  const eat = (text: string | undefined): void => {
    if (!text) return;
    for (const t of tokenize(text)) {
      if (t.kind === 'quarter') {
        pool.quarters.push({ q: t.q, y: t.y });
        if (t.y !== null) pool.years.add(t.y);
      } else if (t.kind === 'half') {
        pool.halves.push({ h: t.h, y: t.y });
        if (t.y !== null) pool.years.add(t.y);
      } else if (t.kind === 'year') {
        pool.years.add(t.y);
        pool.textNumbers.push(t.y);
      } else {
        for (const c of t.cands) pool.textNumbers.push(c.value);
      }
    }
  };
  for (const claim of claims) {
    eat(claim.timeHorizon);
    for (const n of claim.numbers ?? []) {
      if (typeof n.value !== 'number' || Number.isNaN(n.value)) continue;
      pool.numbers.push({ value: n.value, unit: parseClaimUnit(n.unit) });
      if (Number.isInteger(n.value) && n.value >= 2020 && n.value <= 2035) pool.years.add(n.value);
      eat(n.period);
    }
  }
  return pool;
}

// ─── number matching ────────────────────────────────────────────────────────

const REL_TOLERANCE = 0.01;

/** Equal within 1% relative, or equal once the claim value is rounded to the displayed precision. */
function sameValue(shown: NumCandidate, actual: number): boolean {
  const a = Math.abs(actual);
  const s = Math.abs(shown.value);
  if (Math.abs(a - s) <= REL_TOLERANCE * Math.max(a, s)) return true;
  const p = 10 ** shown.decimals;
  return Math.abs(Math.round(a * p) / p - s) < 1e-9 * Math.max(1, s);
}

type NumTok = Extract<Tok, { kind: 'number' }>;

function numberTraceable(t: NumTok, pool: Pool): boolean {
  for (const cand of t.cands) {
    for (const { value, unit } of pool.numbers) {
      // A shown percentage must come from a percentage (or unit-less) claim number, and an amount
      // must not come from a percentage. A plain count matches anything.
      if (t.pct && !unit.pct && !unit.empty) continue;
      if (!t.pct && t.hasUnit && unit.pct) continue;
      const inShownUnit = (value * unit.scale) / t.scale;
      if (sameValue(cand, inShownUnit)) return true;
      // The writer may drop or restate the unit; compare raw values when a scale is not trustworthy.
      if ((!t.explicit || !unit.scaleKnown) && sameValue(cand, value)) return true;
    }
    if (pool.textNumbers.some((v) => v === cand.value)) return true;
  }
  return false;
}

function quarterTraceable(t: { q: number; y: number | null }, pool: Pool): boolean {
  return pool.quarters.some(
    (p) => p.q === t.q && (t.y === null || (p.y === null ? pool.years.has(t.y) : p.y === t.y)),
  );
}

function halfTraceable(t: { h: number; y: number | null }, pool: Pool): boolean {
  return pool.halves.some(
    (p) => p.h === t.h && (t.y === null || (p.y === null ? pool.years.has(t.y) : p.y === t.y)),
  );
}

/** Numbers in `text` that cannot be traced to the evidence claims. */
export function untraceableNumbers(text: string, claims: ExtractedClaim[]): string[] {
  const pool = buildPool(claims);
  const bad: string[] = [];
  for (const t of tokenize(text)) {
    if (t.kind === 'quarter') {
      if (!quarterTraceable(t, pool)) bad.push(`Q${t.q}${t.y ? `/${t.y}` : ''}`);
    } else if (t.kind === 'half') {
      if (!halfTraceable(t, pool)) bad.push(`H${t.h}${t.y ? `/${t.y}` : ''}`);
    } else if (t.kind === 'year') {
      if (!pool.years.has(t.y)) bad.push(String(t.y));
    } else {
      const v = t.cands[0]?.value;
      // Small counts ("2 dự án", "tháng 10") are prose, not claims.
      if (!t.hasUnit && t.integer && v !== undefined && v >= 1 && v <= (t.calendar ? 31 : 10)) continue;
      if (!numberTraceable(t, pool)) bad.push(t.raw + (t.pct ? '%' : ''));
    }
  }
  return bad;
}

// ─── disagreement & certainty ───────────────────────────────────────────────

const DISAGREEMENT_SIGNALS: readonly string[] = [
  'khác nhau',
  'chưa thống nhất',
  'không thống nhất',
  'chưa nhất quán',
  'tùy báo cáo',
  'tuỳ báo cáo',
  'tùy theo báo cáo',
  'tuỳ theo báo cáo',
  'tùy từng báo cáo',
  'tuỳ từng báo cáo',
  'bất đồng',
];

const HEDGE_WORDS: readonly string[] = [
  ...DISAGREEMENT_SIGNALS,
  'tùy',
  'tuỳ',
  'dao động',
  'hoặc',
  'chưa rõ',
  'chưa chắc',
  'khác biệt',
  'chênh lệch',
];

function hasPhrase(text: string, list: readonly string[]): boolean {
  const tokens = words(text);
  return list.some((p) => phraseHits(tokens, phraseOf(p)).length > 0);
}

function signalsDisagreement(summary: string): boolean {
  return hasPhrase(summary, DISAGREEMENT_SIGNALS) || /dao động từ .+? đến/u.test(norm(summary));
}

function hasHedge(summary: string): boolean {
  return hasPhrase(summary, HEDGE_WORDS) || /từ .+? đến/u.test(norm(summary));
}

function distinctValues(d: Disagreement | null): string[] {
  if (!d) return [];
  return [...new Set(d.values.map((v) => norm(v.value).replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

function tokenCovered(vt: Tok, summary: Tok[]): boolean {
  return summary.some((st) => {
    if (vt.kind === 'quarter') {
      return st.kind === 'quarter' && st.q === vt.q && (vt.y === null || st.y === null || st.y === vt.y);
    }
    if (vt.kind === 'half') {
      return st.kind === 'half' && st.h === vt.h && (vt.y === null || st.y === null || st.y === vt.y);
    }
    if (vt.kind === 'year') {
      return (
        (st.kind === 'year' && st.y === vt.y) ||
        ((st.kind === 'quarter' || st.kind === 'half') && st.y === vt.y)
      );
    }
    return (
      st.kind === 'number' &&
      st.pct === vt.pct &&
      st.cands.some((a) => vt.cands.some((b) => a.value * st.scale === b.value * vt.scale))
    );
  });
}

function mentionsValue(summary: string, summaryToks: Tok[], value: string): boolean {
  const vToks = tokenize(value);
  if (vToks.length > 0) return vToks.every((vt) => tokenCovered(vt, summaryToks));
  const hay = words(summary);
  return phraseHits(hay, phraseOf(value)).length > 0;
}

/** Negated forms ("chưa chắc chắn", "không đảm bảo") are hedges, not certainty. */
function claimsCertainty(summary: string): boolean {
  const tokens = words(summary);
  const negated = (i: number): boolean => tokens[i - 1] === 'chưa' || tokens[i - 1] === 'không';
  return (
    phraseHits(tokens, ['chắc', 'chắn']).some((i) => !negated(i)) ||
    phraseHits(tokens, ['sẽ', 'chắc']).some((i) => !negated(i)) ||
    phraseHits(tokens, ['đảm', 'bảo']).some((i) => !negated(i))
  );
}

const FORECAST_TYPES = new Set(['forecast', 'assumption']);
const FORECAST_WORDS = ['dự kiến', 'kỳ vọng', 'kì vọng', 'ước tính', 'dự báo'];

function isForecastClaim(c: ExtractedClaim): boolean {
  if (FORECAST_TYPES.has(c.claimType)) return true;
  return hasPhrase(`${c.summary} ${c.outcome} ${c.timeHorizon}`, FORECAST_WORDS);
}

// ─── validator ──────────────────────────────────────────────────────────────

export function validateBuiltTheses(
  built: BuiltThesis[],
  ctx: { inputs: ThesisBuildInput[]; brokerNames: string[] },
): { passed: BuiltThesis[]; failures: ValidationFailure[] } {
  const inputById = new Map(ctx.inputs.map((i) => [i.thesisId, i]));
  const passed: BuiltThesis[] = [];
  const failures: ValidationFailure[] = [];
  const seen = new Set<string>();

  for (const t of built) {
    const id = typeof t?.thesisId === 'string' ? t.thesisId : '';
    const fail = (code: ValidationFailure['code'], detail: string): void => {
      failures.push({ thesisId: id, code, detail });
    };
    const before = failures.length;

    const title = typeof t?.title === 'string' ? t.title.trim() : '';
    const summary = typeof t?.summary === 'string' ? t.summary.trim() : '';
    const input = inputById.get(id);

    if (!id || !input) {
      fail('unknown_thesis', `thesisId "${id}" is not among the requested theses`);
      continue;
    }
    if (seen.has(id)) {
      fail('schema', 'duplicate thesisId in output');
      continue;
    }
    seen.add(id);

    if (!title) fail('schema', 'empty title');
    if (!summary) fail('schema', 'empty summary');
    if (!Number.isInteger(t.materiality) || t.materiality < 1 || t.materiality > 5) {
      fail('schema', `materiality must be an integer 1-5, got ${String(t.materiality)}`);
    }

    const text = `${title}. ${summary}`;
    const summaryWords = countWords(summary);
    if (summaryWords > SUMMARY_MAX_WORDS) fail('word_count', `summary has ${summaryWords} words (max ${SUMMARY_MAX_WORDS})`);
    const titleWords = countWords(title);
    if (titleWords > TITLE_MAX_WORDS) fail('word_count', `title has ${titleWords} words (max ${TITLE_MAX_WORDS})`);

    const forbidden = findForbiddenTerms(text);
    if (forbidden.length) fail('forbidden_term', `recommendation wording: ${forbidden.join(', ')}`);

    const tokens = words(text);
    const brokerHits = ctx.brokerNames.filter((n) => {
      const p = phraseOf(n);
      return p.length > 0 && phraseHits(tokens, p).length > 0;
    });
    // Anonymised refs ("B1") must not leak either.
    for (const ev of input.evidence) {
      const ref = ev.brokerRef.toLowerCase();
      if (ref && tokens.includes(ref) && !brokerHits.includes(ev.brokerRef)) brokerHits.push(ev.brokerRef);
    }
    if (brokerHits.length) fail('broker_name', `mentions broker: ${brokerHits.join(', ')}`);

    if (title && isGenericTitle(title)) fail('generic_title', `generic title "${title}"`);

    const tech = findTechnicalTerms(text);
    if (tech.length) fail('forbidden_term', `technical wording: ${tech.join(', ')}`);

    const claims = input.evidence.map((e) => e.claim);
    const bad = untraceableNumbers(text, claims);
    if (bad.length) fail('untraceable_number', `numbers not found in evidence: ${bad.join(', ')}`);

    // Disagreement (§21.4)
    const values = distinctValues(input.disagreement);
    const hasDisagreement = values.length >= 2;
    if (signalsDisagreement(summary) && !hasDisagreement) {
      fail('disagreement', 'summary states a disagreement but the evidence has fewer than 2 distinct values');
    }
    if (hasDisagreement && !hasHedge(summary)) {
      const summaryToks = tokenize(summary);
      const mentioned = values.filter((v) => mentionsValue(summary, summaryToks, v));
      if (mentioned.length === 1) {
        fail('disagreement', `summary states "${mentioned[0]}" as fact although brokers disagree`);
      }
    }

    // Certainty (§21.7, deterministic part)
    if (claims.some(isForecastClaim) && claimsCertainty(summary)) {
      fail('certainty', 'summary presents a forecast/assumption as certain');
    }

    if (failures.length === before) passed.push(t);
  }
  return { passed, failures };
}
