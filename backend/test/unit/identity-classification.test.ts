import { describe, expect, it } from 'vitest';

import {
  classifyEvidence,
  chooseMascot,
  completeAssessmentMap,
  digest,
  type EvidenceRecord,
} from '../../src/modules/journey/identity/identity.classification.js';

const answers = {
  ky_thuat: 'ok',
  dong_tien: 'neu',
  noi_bo: 'bad',
  tin_tuc: 'ok',
  dinh_gia: 'neu',
} as const;

describe('journey identity classification', () => {
  it('uses the stable layer order to resolve ties', () => {
    const result = chooseMascot(
      { ky_thuat: 1, dong_tien: 1, noi_bo: 0, tin_tuc: 0, dinh_gia: 0 },
      1,
    );
    expect(result.mascot_id).toBe('bach_ho');
    expect(result.assignment_basis).toBe('stable_tie_break');
  });

  it('never assigns a mascot without a complete verified evidence pair', () => {
    expect(
      classifyEvidence([], 'u1', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z').assignment_status,
    ).toBe('pending_data_repair');
    expect(completeAssessmentMap({ ...answers, extra: 'ok' })).toBe(false);
  });

  it('excludes duplicate submissions and preserves a frozen digest', () => {
    const base: EvidenceRecord = {
      id: 'a1',
      user_id: 'u1',
      symbol: 'VNM',
      trading_date: '2026-01-05',
      completed_at: '2026-01-05T01:00:00Z',
      revealed_at: null,
      answers,
      source: 'learning',
      mode: 'thuc_chien',
      record_status: 'valid',
      proof_version: 'commit_then_reveal_v1',
      dataset_id: 'd1',
      dataset_hash: digest({ snapshot: 1 }),
      ai_answers: answers,
      snapshot_matches: true,
    };
    const later = { ...base, id: 'a2', completed_at: '2026-01-05T02:00:00Z' };
    const result = classifyEvidence(
      [later, base],
      'u1',
      '2026-01-01T00:00:00Z',
      '2026-02-01T00:00:00Z',
    );
    expect(result.valid_pair_count).toBe(1);
    expect(result.excluded_records_summary.duplicate_later_submission).toBe(1);
    expect(result.dataset_hash).toBe(digest(result.selected_assessment_refs));
  });
});
