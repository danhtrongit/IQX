import { createHash } from 'node:crypto';

import {
  JOURNEY_LAYER_KEYS,
  type JourneyLayer,
  type JourneyLayerAssessment,
} from '../core/index.js';

export const MASCOT_RULES_VERSION = 1;
export const MASCOTS: Record<JourneyLayer, { id: MascotId; name: string }> = {
  ky_thuat: { id: 'bach_ho', name: 'Bạch Hổ' },
  dong_tien: { id: 'thanh_long', name: 'Thanh Long' },
  noi_bo: { id: 'loc_huou', name: 'Lộc Hươu' },
  tin_tuc: { id: 'phung_hoang', name: 'Phụng Hoàng' },
  dinh_gia: { id: 'kim_quy', name: 'Kim Quy' },
};

export type MascotId = 'bach_ho' | 'thanh_long' | 'loc_huou' | 'phung_hoang' | 'kim_quy';
export type MatchCounts = Record<JourneyLayer, number>;
export type AssignmentBasis = 'ai_match_count' | 'stable_tie_break' | 'zero_match_tie_break';

export type EvidenceRecord = {
  id: string;
  user_id: string;
  symbol: string;
  trading_date: string;
  completed_at: Date | string;
  revealed_at: Date | string | null;
  answers: unknown;
  source: string;
  mode: string;
  record_status: string;
  proof_version: string;
  dataset_id: string;
  dataset_hash: string;
  ai_answers: unknown;
  snapshot_matches: boolean;
};

export type ClassificationResult = {
  assignment_status: 'assigned' | 'pending_data_repair';
  mascot_id: MascotId | null;
  dominant_layer: JourneyLayer | null;
  assignment_basis: AssignmentBasis | null;
  tied_layers: JourneyLayer[];
  valid_pair_count: number;
  match_counts: MatchCounts;
  selected_assessment_refs: Array<{
    assessment_id: string;
    dataset_id: string;
    dataset_hash: string;
    assessment_hash: string;
    contribution: MatchCounts;
  }>;
  dataset_hash: string;
  excluded_records_summary: Record<string, number>;
};

export function digest(value: unknown): string {
  return createHash('sha256').update(pythonCanonicalJson(value)).digest('hex');
}

export function completeAssessmentMap(
  value: unknown,
): value is Record<JourneyLayer, JourneyLayerAssessment> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== JOURNEY_LAYER_KEYS.length) return false;
  return JOURNEY_LAYER_KEYS.every(
    (key) => record[key] === 'ok' || record[key] === 'neu' || record[key] === 'bad',
  );
}

export function chooseMascot(
  counts: MatchCounts,
  count: number,
): Pick<
  ClassificationResult,
  'assignment_status' | 'mascot_id' | 'dominant_layer' | 'assignment_basis' | 'tied_layers'
> {
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    !JOURNEY_LAYER_KEYS.every(
      (key) => Number.isInteger(counts[key]) && counts[key] >= 0 && counts[key] <= count,
    )
  ) {
    throw new Error('Invalid mascot evidence counts');
  }
  if (count === 0) {
    return {
      assignment_status: 'pending_data_repair',
      mascot_id: null,
      dominant_layer: null,
      assignment_basis: null,
      tied_layers: [],
    };
  }
  const maximum = Math.max(...JOURNEY_LAYER_KEYS.map((key) => counts[key]));
  const tied = JOURNEY_LAYER_KEYS.filter((key) => counts[key] === maximum);
  const layer = tied[0]!;
  return {
    assignment_status: 'assigned',
    mascot_id: MASCOTS[layer].id,
    dominant_layer: layer,
    assignment_basis:
      maximum === 0
        ? 'zero_match_tie_break'
        : tied.length > 1
          ? 'stable_tie_break'
          : 'ai_match_count',
    tied_layers: [...tied],
  };
}

export function classifyEvidence(
  records: EvidenceRecord[],
  userId: string,
  windowStart: Date | string | null,
  windowEnd: Date | string,
): ClassificationResult {
  const counts = zeroCounts();
  const excluded: Record<string, number> = {};
  const candidates = new Map<string, EvidenceRecord[]>();

  for (const row of records) {
    let reason: string | null = null;
    if (
      row.user_id !== userId ||
      row.source !== 'learning' ||
      row.mode !== 'thuc_chien' ||
      row.record_status !== 'valid'
    ) {
      reason = 'not_learning_evidence';
    } else if (
      !windowStart ||
      toMillis(row.completed_at) < toMillis(windowStart) ||
      toMillis(row.completed_at) > toMillis(windowEnd)
    ) {
      reason = 'outside_frozen_window';
    } else if (!completeAssessmentMap(row.answers)) {
      reason = 'incomplete_user_answers';
    } else if (row.proof_version !== 'commit_then_reveal_v1') {
      reason = 'missing_commit_proof';
    } else if (row.revealed_at && toMillis(row.revealed_at) < toMillis(row.completed_at)) {
      reason = 'reveal_precedes_submission';
    }
    if (reason) {
      increment(excluded, reason);
      continue;
    }
    const key = `${row.symbol}\u0000${row.trading_date}`;
    const group = candidates.get(key) ?? [];
    group.push(row);
    candidates.set(key, group);
  }

  const selected: EvidenceRecord[] = [];
  for (const rows of candidates.values()) {
    const earliest = Math.min(...rows.map((row) => toMillis(row.completed_at)));
    const first = rows.filter((row) => toMillis(row.completed_at) === earliest);
    if (first.length > 1) {
      increment(excluded, 'ambiguous_first_submission_order', first.length);
      increment(excluded, 'duplicate_later_submission', rows.length - first.length);
      continue;
    }
    selected.push(first[0]!);
    increment(excluded, 'duplicate_later_submission', rows.length - 1);
  }

  const refs: ClassificationResult['selected_assessment_refs'] = [];
  selected.sort(
    (a, b) =>
      toMillis(a.completed_at) - toMillis(b.completed_at) ||
      a.symbol.localeCompare(b.symbol) ||
      a.trading_date.localeCompare(b.trading_date),
  );
  for (const row of selected) {
    if (
      !row.snapshot_matches ||
      !completeAssessmentMap(row.ai_answers) ||
      !completeAssessmentMap(row.answers)
    ) {
      increment(excluded, 'missing_or_invalid_ai_snapshot');
      continue;
    }
    const contribution = zeroCounts();
    for (const layer of JOURNEY_LAYER_KEYS) {
      contribution[layer] = Number(row.answers[layer] === row.ai_answers[layer]);
      counts[layer] += contribution[layer];
    }
    refs.push({
      assessment_id: row.id,
      dataset_id: row.dataset_id,
      dataset_hash: row.dataset_hash,
      assessment_hash: assessmentDigest(row),
      contribution,
    });
  }
  return {
    ...chooseMascot(counts, refs.length),
    valid_pair_count: refs.length,
    match_counts: counts,
    selected_assessment_refs: refs,
    dataset_hash: digest(refs),
    excluded_records_summary: Object.fromEntries(
      Object.entries(excluded).filter(([, count]) => count > 0),
    ),
  };
}

export function validateFrozenAssignment(profile: ClassificationResult): void {
  const expected = chooseMascot(profile.match_counts, profile.valid_pair_count);
  if (
    profile.assignment_status !== expected.assignment_status ||
    profile.mascot_id !== expected.mascot_id ||
    profile.dominant_layer !== expected.dominant_layer ||
    profile.assignment_basis !== expected.assignment_basis ||
    pythonCanonicalJson(profile.tied_layers) !== pythonCanonicalJson(expected.tied_layers) ||
    digest(profile.selected_assessment_refs) !== profile.dataset_hash ||
    profile.selected_assessment_refs.length !== profile.valid_pair_count
  ) {
    throw new Error('Invalid frozen mascot assignment');
  }
  const totals = zeroCounts();
  const ids = new Set<string>();
  for (const ref of profile.selected_assessment_refs) {
    if (ids.has(ref.assessment_id) || !validContribution(ref.contribution)) {
      throw new Error('Invalid frozen mascot evidence');
    }
    ids.add(ref.assessment_id);
    for (const key of JOURNEY_LAYER_KEYS) totals[key] += ref.contribution[key];
  }
  if (pythonCanonicalJson(totals) !== pythonCanonicalJson(profile.match_counts)) {
    throw new Error('Frozen mascot counts do not match evidence');
  }
}

function assessmentDigest(row: EvidenceRecord): string {
  return digest({
    id: row.id,
    user_id: row.user_id,
    symbol: row.symbol,
    trading_date: row.trading_date,
    dataset_id: row.dataset_id,
    answers: row.answers,
    source: row.source,
    mode: row.mode,
    record_status: row.record_status,
    proof_version: row.proof_version,
    completed_at: new Date(row.completed_at).toISOString(),
  });
}

function validContribution(value: MatchCounts): boolean {
  return JOURNEY_LAYER_KEYS.every((key) => value[key] === 0 || value[key] === 1);
}

function zeroCounts(): MatchCounts {
  return { ky_thuat: 0, dong_tien: 0, noi_bo: 0, tin_tuc: 0, dinh_gia: 0 };
}

function increment(target: Record<string, number>, key: string, count = 1): void {
  target[key] = (target[key] ?? 0) + count;
}

function toMillis(value: Date | string): number {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Invalid evidence timestamp');
  return timestamp;
}

/** Match Python json.dumps(sort_keys=True, ensure_ascii=False, default=str). */
function pythonCanonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite values are not digestible');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(pythonCanonicalJson).join(', ')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}: ${pythonCanonicalJson(nested)}`)
      .join(', ')}}`;
  }
  return JSON.stringify(String(value));
}
