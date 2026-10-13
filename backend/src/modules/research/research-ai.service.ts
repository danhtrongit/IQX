// AI steps of the research engine (spec §14–§20): claim extraction, semantic matching and the
// thesis builder. Everything here is text-in/JSON-out over AiProviderService; the hard rules
// that must not depend on the model (merge only on driver+mechanism+direction, every claim
// accounted for, VND conversion) are enforced in code after parsing.
import { Injectable } from '@nestjs/common';
import { AiProviderService } from '../analysis/ai-provider.service.js';
import type { AiUsage, ResearchAi } from './research.ports.js';
import {
  RISK_CLAIM_TYPES,
  type BuiltThesis,
  type CanonicalThesis,
  type ClaimMatch,
  type ClaimRelationship,
  type ClaimType,
  type Disagreement,
  type ExtractedClaim,
  type ExtractedTarget,
  type ExtractionResult,
  type MatchingResult,
  type NewThesisDraft,
  type ResearchReport,
  type StoredClaim,
  type ThesisBuildInput,
  type ValidationFailure,
} from './research.types.js';
import {
  buildEnvelopeSchema,
  builtThesisSchema,
  disagreementItemSchema,
  extractEnvelopeSchema,
  extractTargetSchema,
  extractedClaimSchema,
  matchEnvelopeSchema,
  matchItemSchema,
  newThesisDraftSchema,
} from './research-ai.schemas.js';
import { researchPrompt } from './research-prompts.js';

export const RESEARCH_AI_INVALID_OUTPUT = 'RESEARCH_AI_INVALID_OUTPUT';

/** The model answered, but not with the JSON contract. The orchestrator retries once. */
export class ResearchAiInvalidOutputError extends Error {
  readonly code = RESEARCH_AI_INVALID_OUTPUT;
  constructor(readonly detail: string) {
    super(RESEARCH_AI_INVALID_OUTPUT);
    this.name = 'ResearchAiInvalidOutputError';
  }
}

export const EXTRACT_CHUNK_CHARS = 60_000;
export const EXTRACT_MAX_CHUNKS = 6;
export const MAX_CLAIMS_PER_REPORT = 12;
export const MATCH_BATCH_SIZE = 12;
const TEMPERATURE = 0.1;
const EXTRACT_MAX_TOKENS = 8_000;
const MATCH_MAX_TOKENS = 6_000;
const BUILD_MAX_TOKENS = 3_000;

type ThesisContext = Pick<
  CanonicalThesis,
  'id' | 'canonicalDriver' | 'canonicalMechanism' | 'canonicalOutcome' | 'direction' | 'currentSummary'
>;

const PAGE_MARKER = /(?=\[\[page\s+\d+\]\])/i;

/** Splits a long string at line boundaries into pieces of at most `max` characters. */
function hardSplit(piece: string, max: number): string[] {
  const out: string[] = [];
  let rest = piece;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/**
 * Packs the PDF text into chunks of at most `maxChars`, cutting only at `[[page N]]` boundaries
 * (a single oversized page is split at line breaks). Only the first `maxChunks` are kept:
 * company reports put the thesis and forecasts first.
 */
export function chunkReportText(text: string, maxChars = EXTRACT_CHUNK_CHARS, maxChunks = EXTRACT_MAX_CHUNKS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const pieces = trimmed
    .split(PAGE_MARKER)
    .filter((piece) => piece.trim().length > 0)
    .flatMap((piece) => hardSplit(piece, maxChars));
  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length > maxChars) {
      chunks.push(current);
      current = '';
      if (chunks.length >= maxChunks) break;
    }
    current += piece;
  }
  if (current && chunks.length < maxChunks) chunks.push(current);
  return chunks.slice(0, maxChunks);
}

/** Converts the model's target (with its explicit unit) to whole VND, or null when unusable. */
export function targetToVnd(price: number | string, unit: string | null | undefined): number | null {
  let value: number;
  if (typeof price === 'number') value = price;
  else {
    const compact = price.replace(/\s+/g, '');
    if (/^\d{1,3}([.,]\d{3})+$/.test(compact)) value = Number(compact.replace(/[.,]/g, ''));
    else value = Number(compact.replace(',', '.'));
  }
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = (unit ?? '').trim().toLowerCase();
  if (!normalized) return null;
  let factor: number;
  if (/(nghìn|nghin|ngàn|ngan|thousand)/.test(normalized) || /^(k|'000|000)\b/.test(normalized)) factor = 1_000;
  else if (/triệu|trieu|million/.test(normalized)) factor = 1_000_000;
  else if (/^(vnd|vnđ|đồng|dong|đ|d|vnd\/cp|đồng\/cp)$/.test(normalized)) factor = 1;
  else return null;
  const vnd = Math.round(value * factor);
  return vnd > 0 ? vnd : null;
}

function parseJsonObject(content: string): unknown {
  let body = content.trim();
  const fenced = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) body = fenced[1]!;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new ResearchAiInvalidOutputError('response is not valid JSON');
  }
}

function riskOf(claimType: ClaimType): boolean {
  return RISK_CLAIM_TYPES.has(claimType);
}

class UsageMeter {
  readonly total: AiUsage = { calls: 0, promptTokens: 0, completionTokens: 0 };
  add(usage: { promptTokens: number | null; completionTokens: number | null }): void {
    this.total.calls += 1;
    this.total.promptTokens += usage.promptTokens ?? 0;
    this.total.completionTokens += usage.completionTokens ?? 0;
  }
}

function normalizeSummary(summary: string): string {
  return summary.replace(/\s+/g, ' ').trim().toLowerCase();
}

@Injectable()
export class ResearchAiService implements ResearchAi {
  constructor(private readonly ai: AiProviderService) {}

  private async call<T>(
    meter: UsageMeter,
    kind: 'extract' | 'match' | 'build',
    user: string,
    maxTokens: number,
    envelope: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  ): Promise<T> {
    const completion = await this.ai.complete(researchPrompt(kind).text, user, {
      temperature: TEMPERATURE,
      maxTokens,
      json: true,
    });
    meter.add(completion.usage);
    const parsed = envelope.safeParse(parseJsonObject(completion.content));
    if (!parsed.success) throw new ResearchAiInvalidOutputError('response does not match the output schema');
    return parsed.data;
  }

  // ── 1. Claim extraction ────────────────────────────────────────────────────────────
  async extractClaims(
    report: Pick<ResearchReport, 'symbol' | 'broker' | 'reportDate' | 'title' | 'language'>,
    text: string,
  ): Promise<{ result: ExtractionResult; usage: AiUsage }> {
    const meter = new UsageMeter();
    const chunks = chunkReportText(text);
    const claims: ExtractedClaim[] = [];
    const seen = new Set<string>();
    let target: ExtractedTarget | null = null;

    for (const [index, chunk] of chunks.entries()) {
      const header = JSON.stringify({
        ma: report.symbol,
        ngay_bao_cao: report.reportDate,
        tieu_de: report.title,
        ngon_ngu: report.language,
        doan: `${index + 1}/${chunks.length}`,
      });
      const data = await this.call(meter, 'extract', `${header}\n---\n${chunk}`, EXTRACT_MAX_TOKENS, extractEnvelopeSchema);
      for (const raw of data.claims) {
        const parsed = extractedClaimSchema.safeParse(raw);
        if (!parsed.success) continue;
        const c = parsed.data;
        const key = normalizeSummary(c.summary);
        if (seen.has(key)) continue;
        seen.add(key);
        claims.push({
          subject: c.subject,
          driver: c.driver,
          mechanism: c.mechanism,
          outcome: c.outcome,
          direction: c.direction,
          timeHorizon: c.time_horizon,
          claimType: c.claim_type as ClaimType,
          summary: c.summary,
          numbers: c.numbers.map((n) => ({
            metric: n.metric,
            value: n.value,
            unit: n.unit,
            ...(n.period ? { period: n.period } : {}),
          })),
          sourcePage: c.source_page,
        });
      }
      if (!target) target = this.readTarget(data.target);
    }
    return { result: { claims: claims.slice(0, MAX_CLAIMS_PER_REPORT), target }, usage: meter.total };
  }

  private readTarget(raw: unknown): ExtractedTarget | null {
    if (raw === null || raw === undefined) return null;
    const parsed = extractTargetSchema.safeParse(raw);
    if (!parsed.success) return null;
    const vnd = targetToVnd(parsed.data.target_price, parsed.data.unit);
    if (vnd === null) return null;
    return { targetPriceVnd: vnd, horizon: parsed.data.horizon ? parsed.data.horizon : null };
  }

  // ── 2. Semantic matching ───────────────────────────────────────────────────────────
  async matchClaims(
    symbol: string,
    theses: ThesisContext[],
    claims: StoredClaim[],
  ): Promise<{ result: MatchingResult; usage: AiUsage }> {
    const meter = new UsageMeter();
    const result: MatchingResult = { matches: [], newTheses: [], disagreements: [] };
    const existingIds = new Set(theses.map((t) => t.id));
    const fedKeys = new Set<string>();
    const context: ThesisContext[] = [...theses];
    let keyCounter = 0;
    const nextKey = (): string => `new_${++keyCounter}`;

    for (let offset = 0; offset < claims.length; offset += MATCH_BATCH_SIZE) {
      const batch = claims.slice(offset, offset + MATCH_BATCH_SIZE);
      const payload = {
        symbol,
        theses: context.map((t) => ({
          id: t.id,
          driver: t.canonicalDriver,
          mechanism: t.canonicalMechanism,
          outcome: t.canonicalOutcome,
          direction: t.direction,
          current_summary: t.currentSummary,
        })),
        claims: batch.map((c) => ({
          id: c.id,
          broker: c.broker,
          subject: c.subject,
          driver: c.driver,
          mechanism: c.mechanism,
          outcome: c.outcome,
          direction: c.direction,
          time_horizon: c.timeHorizon,
          claim_type: c.claimType,
          summary: c.summary,
          numbers: c.numbers,
        })),
      };
      const data = await this.call(meter, 'match', JSON.stringify(payload), MATCH_MAX_TOKENS, matchEnvelopeSchema);

      const byClaim = new Map<string, ReturnType<typeof matchItemSchema.parse>>();
      for (const raw of data.matches) {
        const parsed = matchItemSchema.safeParse(raw);
        if (parsed.success && !byClaim.has(parsed.data.claim_id)) byClaim.set(parsed.data.claim_id, parsed.data);
      }
      const drafts = new Map<string, ReturnType<typeof newThesisDraftSchema.parse>>();
      for (const raw of data.new_theses ?? []) {
        const parsed = newThesisDraftSchema.safeParse(raw);
        if (parsed.success && !drafts.has(parsed.data.key)) drafts.set(parsed.data.key, parsed.data);
      }

      const keyMap = new Map<string, string>();
      const batchNewTheses: NewThesisDraft[] = [];

      const singleton = (claim: StoredClaim, verdict: ClaimMatch['match'] | null, why: string): ClaimMatch => {
        const key = nextKey();
        const draft: NewThesisDraft = {
          key,
          canonicalDriver: claim.driver,
          canonicalMechanism: claim.mechanism,
          canonicalOutcome: claim.outcome,
          direction: claim.direction,
          isRisk: riskOf(claim.claimType),
        };
        batchNewTheses.push(draft);
        return {
          claimId: claim.id,
          relationship: 'NEW_THESIS',
          thesisId: null,
          newThesisKey: key,
          invalidatesThesis: false,
          match: {
            driver: verdict?.driver ?? false,
            mechanism: verdict?.mechanism ?? false,
            direction: verdict?.direction ?? false,
            reason: [verdict?.reason, why].filter(Boolean).join(' | '),
          },
        };
      };

      for (const claim of batch) {
        const entry = byClaim.get(claim.id);
        if (!entry) {
          result.matches.push(singleton(claim, null, 'Không có kết quả so khớp hợp lệ cho claim này'));
          continue;
        }
        const verdict = entry.match;
        const relationship: ClaimRelationship = entry.relationship;

        if (relationship === 'IRRELEVANT') {
          result.matches.push({
            claimId: claim.id,
            relationship,
            thesisId: null,
            newThesisKey: null,
            invalidatesThesis: false,
            match: verdict,
          });
          continue;
        }

        if (relationship === 'NEW_THESIS') {
          const aiKey = entry.new_thesis_key ?? null;
          const draft = aiKey ? drafts.get(aiKey) : undefined;
          if (!aiKey || !draft) {
            result.matches.push(singleton(claim, verdict, 'Thiếu luận điểm mới đi kèm'));
            continue;
          }
          let key = keyMap.get(aiKey);
          if (!key) {
            key = nextKey();
            keyMap.set(aiKey, key);
            batchNewTheses.push({
              key,
              canonicalDriver: draft.canonical_driver,
              canonicalMechanism: draft.canonical_mechanism,
              canonicalOutcome: draft.canonical_outcome,
              direction: draft.direction,
              isRisk: draft.is_risk,
            });
          }
          result.matches.push({
            claimId: claim.id,
            relationship,
            thesisId: null,
            newThesisKey: key,
            invalidatesThesis: false,
            match: verdict,
          });
          continue;
        }

        // SUPPORT / UPDATE / CONTRADICT / REPLACE: attach only to a known thesis and only when
        // the dimensions agree (spec §16: lighter duplicates beat lost information).
        const ref = entry.thesis_id ?? null;
        const known = ref !== null && (existingIds.has(ref) || fedKeys.has(ref));
        if (!known) {
          result.matches.push(singleton(claim, verdict, 'Luận điểm được chọn không tồn tại'));
          continue;
        }
        // A contradiction/replacement differs in direction by nature; it must still share driver
        // and mechanism with the thesis it contradicts. Merging relations need all three.
        const mergesAsEvidence = relationship === 'SUPPORT' || relationship === 'UPDATE';
        const dimensionsAgree = verdict.driver && verdict.mechanism && (verdict.direction || !mergesAsEvidence);
        if (!dimensionsAgree) {
          result.matches.push(singleton(claim, verdict, 'Không khớp đủ driver, mechanism và direction'));
          continue;
        }
        if (existingIds.has(ref!)) {
          result.matches.push({
            claimId: claim.id,
            relationship,
            thesisId: ref!,
            newThesisKey: null,
            invalidatesThesis: relationship === 'REPLACE' && entry.invalidates_thesis === true,
            match: verdict,
          });
        } else {
          // Attached to a thesis drafted in an earlier batch of this run.
          result.matches.push({
            claimId: claim.id,
            relationship: 'NEW_THESIS',
            thesisId: null,
            newThesisKey: ref!,
            invalidatesThesis: false,
            match: verdict,
          });
        }
      }

      const resolveRef = (ref: string): string | null =>
        existingIds.has(ref) ? ref : (keyMap.get(ref) ?? (fedKeys.has(ref) ? ref : null));
      for (const raw of data.disagreements ?? []) {
        const parsed = disagreementItemSchema.safeParse(raw);
        if (!parsed.success) continue;
        const thesisRef = resolveRef(parsed.data.thesis_ref);
        if (!thesisRef) continue;
        const values = parsed.data.values.filter((v) => v.value.length > 0);
        if (new Set(values.map((v) => v.value.toLowerCase())).size < 2) continue;
        const disagreement: Disagreement = {
          dimension: parsed.data.dimension,
          note: parsed.data.note,
          values,
        };
        result.disagreements.push({ thesisRef, disagreement });
      }

      for (const draft of batchNewTheses) {
        result.newTheses.push(draft);
        fedKeys.add(draft.key);
        context.push({
          id: draft.key,
          canonicalDriver: draft.canonicalDriver,
          canonicalMechanism: draft.canonicalMechanism,
          canonicalOutcome: draft.canonicalOutcome,
          direction: draft.direction,
          currentSummary: null,
        });
      }
    }
    return { result, usage: meter.total };
  }

  // ── 3. Thesis builder ──────────────────────────────────────────────────────────────
  async buildTheses(
    symbol: string,
    inputs: ThesisBuildInput[],
    failures?: ValidationFailure[],
  ): Promise<{ result: BuiltThesis[]; usage: AiUsage }> {
    const meter = new UsageMeter();
    if (inputs.length === 0) return { result: [], usage: meter.total };
    const payload = {
      symbol,
      theses: inputs.map((input) => ({
        thesis_id: input.thesisId,
        driver: input.canonicalDriver,
        mechanism: input.canonicalMechanism,
        outcome: input.canonicalOutcome,
        direction: input.direction,
        is_risk: input.isRisk,
        // Broker names never reach this prompt: only the distinct stated values are passed.
        disagreement: input.disagreement
          ? {
              dimension: input.disagreement.dimension,
              values: [...new Set(input.disagreement.values.map((v) => v.value))],
            }
          : null,
        previous_title: input.previousTitle,
        previous_summary: input.previousSummary,
        evidence: input.evidence.map((e) => ({
          source: e.brokerRef,
          date: e.evidenceDate,
          subject: e.claim.subject,
          driver: e.claim.driver,
          mechanism: e.claim.mechanism,
          outcome: e.claim.outcome,
          direction: e.claim.direction,
          time_horizon: e.claim.timeHorizon,
          claim_type: e.claim.claimType,
          summary: e.claim.summary,
          numbers: e.claim.numbers,
        })),
      })),
    };
    let user = JSON.stringify(payload);
    if (failures && failures.length > 0) {
      const lines = failures.map((f) => `- thesis_id ${f.thesisId} [${f.code}]: ${f.detail}`);
      user += `\n\nLý do bị từ chối lần trước (hãy sửa):\n${lines.join('\n')}`;
    }
    const data = await this.call(meter, 'build', user, BUILD_MAX_TOKENS, buildEnvelopeSchema);
    const result: BuiltThesis[] = [];
    const seen = new Set<string>();
    for (const raw of data.theses) {
      const parsed = builtThesisSchema.safeParse(raw);
      if (!parsed.success || seen.has(parsed.data.thesis_id)) continue;
      seen.add(parsed.data.thesis_id);
      result.push({
        thesisId: parsed.data.thesis_id,
        title: parsed.data.title,
        summary: parsed.data.summary,
        materiality: parsed.data.materiality,
      });
    }
    return { result, usage: meter.total };
  }
}
