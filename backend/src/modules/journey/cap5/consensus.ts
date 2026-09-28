import {
  LAYER_KEYS,
  LAYER_LABELS,
  type ConsensusLayer,
  type ConsensusResult,
  type LayerKey,
  type LayerLevel,
  type ValuationReading,
} from './cap5.types.js';

export const CONSENSUS_THRESHOLD = 4;
export const CONSENSUS_VALID_SESSIONS = 5;
export const TOTAL_LAYERS = LAYER_KEYS.length;

export const LAYER_TO_AI: Record<LayerKey, 'L1' | 'L3' | 'L4' | 'L5' | null> = {
  ky_thuat: 'L1',
  dong_tien: 'L3',
  noi_bo: 'L4',
  tin_tuc: 'L5',
  dinh_gia: null,
};

export const SUPPORT_LABELS: Record<string, ReadonlySet<string>> = {
  L1: new Set(['Mạnh', 'Rất mạnh']),
  L3: new Set(['Hỗ trợ nhẹ', 'Hỗ trợ mạnh']),
  L4: new Set(['Hỗ trợ nhẹ', 'Hỗ trợ mạnh']),
  L5: new Set(['Tích cực', 'Rất tích cực']),
};
export const VALID_NON_SUPPORT_LABELS: Record<string, ReadonlySet<string>> = {
  L1: new Set(['Rất yếu', 'Yếu', 'Trung bình', 'Bình thường']),
  L3: new Set(['Cảnh báo mạnh', 'Cảnh báo nhẹ', 'Trung tính']),
  L4: new Set(['Cảnh báo mạnh', 'Cảnh báo nhẹ', 'Trung tính']),
  L5: new Set(['Rất tiêu cực', 'Tiêu cực', 'Trung tính']),
};
export const OPPOSING_LABELS: Record<string, ReadonlySet<string>> = {
  L1: new Set(['Rất yếu', 'Yếu']),
  L3: new Set(['Cảnh báo mạnh', 'Cảnh báo nhẹ']),
  L4: new Set(['Cảnh báo mạnh', 'Cảnh báo nhẹ']),
  L5: new Set(['Rất tiêu cực', 'Tiêu cực']),
};

function labelFromLayer(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const layer = (payload as Record<string, unknown>)[key];
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return undefined;
  return (layer as Record<string, unknown>).statusLabel;
}

function support(key: string, value: unknown): boolean | null {
  if (typeof value !== 'string') return null;
  const label = value.trim();
  if (SUPPORT_LABELS[key]?.has(label)) return true;
  if (VALID_NON_SUPPORT_LABELS[key]?.has(label)) return false;
  return null;
}

function displayLevel(key: string, value: unknown, supported: boolean | null): LayerLevel | null {
  if (supported === null) return null;
  if (supported) return 'ok';
  return typeof value === 'string' && OPPOSING_LABELS[key]?.has(value.trim()) ? 'bad' : 'neu';
}

export function earliestValidSession(
  today: string | Date,
  sessions = CONSENSUS_VALID_SESSIONS,
): string {
  const date = typeof today === 'string' ? new Date(`${today}T00:00:00Z`) : new Date(today);
  let remaining = sessions;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() - 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

export function scoreConsensus(
  payload: unknown,
  options: {
    valuation?: ValuationReading | null;
    sessionDate?: string | null;
    insightSessionDate?: string | null;
    expiredSessionDate?: string | null;
  } = {},
): ConsensusResult {
  let score = 0;
  let scored = 0;
  const layers: ConsensusLayer[] = [];
  const insightDate = options.insightSessionDate ?? options.sessionDate ?? null;

  for (const layer of LAYER_KEYS) {
    const aiKey = LAYER_TO_AI[layer];
    let label: unknown;
    let supported: boolean | null = null;
    let level: LayerLevel | null = null;
    let explanation: string;
    let source: string | null = null;
    let sourceDate: string | null = null;

    if (layer === 'dinh_gia' && options.valuation) {
      label = options.valuation.label;
      supported = options.valuation.verdict === 'ok';
      level = options.valuation.verdict;
      explanation = options.valuation.explanation;
      source = options.valuation.sourceRef;
      sourceDate = options.valuation.tradingDate;
    } else if (aiKey) {
      label = labelFromLayer(payload, aiKey);
      supported = support(aiKey, label);
      level = displayLevel(aiKey, label, supported);
      sourceDate = insightDate;
      source = supported === null ? null : `ai_insight:${aiKey}`;
      if (supported !== null) explanation = `AI Insight ${aiKey}: ${String(label).trim()}`;
      else if (options.expiredSessionDate)
        explanation = `Bản phân tích 5 lớp gần nhất là phiên ${options.expiredSessionDate}, đã quá ${CONSENSUS_VALID_SESSIONS} phiên nên không dùng để chấm.`;
      else if (insightDate)
        explanation = `Bản phân tích phiên ${insightDate} không có nhãn hợp lệ cho lớp này.`;
      else explanation = 'Mã này chưa có bản phân tích 5 lớp nào để chấm.';
    } else {
      explanation = 'Chưa có snapshot BCTC Khối 02 còn hiệu lực để chấm lớp Định giá.';
    }

    if (supported !== null) {
      scored += 1;
      if (supported) score += 1;
    }
    layers.push({
      lop: layer,
      ten: LAYER_LABELS[layer],
      ung_ho: supported,
      muc: level,
      nhan: supported === null || typeof label !== 'string' ? null : label,
      giai_thich: explanation,
      nguon: source,
      source_date: sourceDate,
    });
  }

  if (scored === 0) {
    return {
      diem: null,
      so_lop_da_cham: null,
      status: null,
      lop: layers,
      session_date: null,
      session_date_qua_han: options.expiredSessionDate ?? null,
    };
  }
  const unknown = TOTAL_LAYERS - scored;
  return {
    diem: score,
    so_lop_da_cham: scored,
    status:
      score >= CONSENSUS_THRESHOLD
        ? 'notable'
        : score + unknown < CONSENSUS_THRESHOLD
          ? 'watching'
          : null,
    lop: layers,
    session_date: options.sessionDate ?? null,
    session_date_qua_han: options.expiredSessionDate ?? null,
  };
}
