import {
  LAYER_KEYS,
  LAYER_LABELS,
  type LayerKey,
  type ValuationReading,
} from '../cap5/cap5.types.js';
import { LAYER_TO_AI } from '../cap5/consensus.js';
import { DEDUCTION_LAYERS, VETO_LAYERS, type ConflictResult } from './cap6.types.js';

export const AI_RANKS: Record<string, Readonly<Record<string, number>>> = {
  L1: { 'Rất yếu': 1, Yếu: 2, 'Trung bình': 3, 'Bình thường': 3, Mạnh: 4, 'Rất mạnh': 5 },
  L3: { 'Cảnh báo mạnh': 1, 'Cảnh báo nhẹ': 2, 'Trung tính': 3, 'Hỗ trợ nhẹ': 4, 'Hỗ trợ mạnh': 5 },
  L4: { 'Cảnh báo mạnh': 1, 'Cảnh báo nhẹ': 2, 'Trung tính': 3, 'Hỗ trợ nhẹ': 4, 'Hỗ trợ mạnh': 5 },
  L5: { 'Rất tiêu cực': 1, 'Tiêu cực': 2, 'Trung tính': 3, 'Tích cực': 4, 'Rất tích cực': 5 },
};

function labelFrom(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const layer = (payload as Record<string, unknown>)[key];
  return layer && typeof layer === 'object' && !Array.isArray(layer)
    ? (layer as Record<string, unknown>).statusLabel
    : undefined;
}

function warning(
  result: Pick<ConflictResult, 'ung_ho' | 'nguoc' | 'lop_phu_quyet_xau'>,
): string | null {
  if (result.ung_ho.length === 0 || result.nguoc.length === 0) return null;
  const support = result.ung_ho.map((row) => `${row.ten} (${row.nhan})`).join(' và ');
  const opposing = result.nguoc.map((row) => `${row.ten} (${row.nhan})`).join(' và ');
  if (result.lop_phu_quyet_xau.length > 0) {
    const names = result.lop_phu_quyet_xau.map((layer) => LAYER_LABELS[layer]).join(' và ');
    return `Có ${result.lop_phu_quyet_xau.length} lớp phủ quyết đang ở mức rất xấu. ${names} đang ở bậc thấp nhất — nhóm lớp này khi rất xấu có thể phủ định cả tín hiệu đẹp của ${support}. Đây là loại mâu thuẫn cần cân nhắc rất kỹ.`;
  }
  return `${result.ung_ho.length} lớp đang ủng hộ (${support}) nhưng ${result.nguoc.length} lớp đang ngược chiều (${opposing}). Các lớp ngược chiều lần này đều thuộc nhóm điểm trừ — xấu thì bớt hấp dẫn, không phủ định các lớp còn lại.`;
}

export function emptyConflict(reason: string): ConflictResult {
  return {
    co_mau_thuan: false,
    ung_ho: [],
    nguoc: [],
    trung_tinh: [],
    phu_quyet_kich_hoat: false,
    lop_phu_quyet_xau: [],
    canh_bao: null,
    chua_du_du_lieu: true,
    ly_do_chua_du: reason,
    so_lop_da_cham: 0,
    session_date: null,
  };
}

export function readConflict(
  payload: unknown,
  options: { valuation?: ValuationReading | null; sessionDate?: string | null } = {},
): ConflictResult {
  const ung_ho: ConflictResult['ung_ho'] = [];
  const nguoc: ConflictResult['nguoc'] = [];
  const trung_tinh: ConflictResult['trung_tinh'] = [];
  const veto: LayerKey[] = [];

  for (const layer of LAYER_KEYS) {
    const aiKey = LAYER_TO_AI[layer];
    let label: unknown;
    let rank: number | null = null;
    if (layer === 'dinh_gia' && options.valuation) {
      label = options.valuation.label;
      rank = options.valuation.rank;
    } else if (aiKey) {
      label = labelFrom(payload, aiKey);
      rank = typeof label === 'string' ? (AI_RANKS[aiKey]?.[label.trim()] ?? null) : null;
    }
    if (rank === null || typeof label !== 'string') continue;
    const common = { lop: layer, ten: LAYER_LABELS[layer], nhan: label.trim() };
    if (rank >= 4) ung_ho.push({ ...common, bac: rank });
    else if (rank <= 2) {
      const hasVetoPower = VETO_LAYERS.has(layer);
      nguoc.push({ ...common, bac: rank, la_phu_quyet: hasVetoPower });
      if (hasVetoPower && rank === 1) veto.push(layer);
    } else trung_tinh.push(common);
  }

  const scored = ung_ho.length + nguoc.length + trung_tinh.length;
  if (scored === 0)
    return emptyConflict(
      'Bản phân tích 5 lớp không có nhãn hợp lệ ở lớp nào, nên IQX chưa dựng được bảng mâu thuẫn.',
    );
  const result: ConflictResult = {
    co_mau_thuan: ung_ho.length > 0 && nguoc.length > 0,
    ung_ho,
    nguoc,
    trung_tinh,
    phu_quyet_kich_hoat: veto.length > 0,
    lop_phu_quyet_xau: veto,
    canh_bao: null,
    chua_du_du_lieu: false,
    ly_do_chua_du: null,
    so_lop_da_cham: scored,
    session_date: options.sessionDate ?? null,
  };
  result.canh_bao = warning(result);
  return result;
}

// Import-time invariant: every learning layer belongs to exactly one category.
const categorized = new Set([...VETO_LAYERS, ...DEDUCTION_LAYERS]);
if (categorized.size !== LAYER_KEYS.length || LAYER_KEYS.some((layer) => !categorized.has(layer))) {
  throw new Error('Cap6 layer classification must cover the five layers exactly once');
}
