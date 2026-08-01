/**
 * Cấp 6 «Đối chiếu» — public surface (mirrors `cap5/index.ts`'s layout so the
 * cấp-to-cấp diff stays readable).
 *
 * FE1: the event bus, the API/hooks/keys/types layer, the PURE conflict helpers
 * and the panel's bước Đối chiếu. FE2: Kết sổ Cấp 6, the coach's 6th paragraph,
 * and khối ⑭⑮ of Phân tích danh mục. The Hành trình tab, the graduation screen
 * and the page/routing pieces arrive in FE3.
 */
export {
  Cap6Provider,
  useCap6Events,
  type Cap6EventBus,
  type Cap6EventHandlers,
  type Cap6OrderEvent,
} from "./Cap6Context"
export {
  useCap6Progress,
  useEnterCap6,
  useCompleteCap6Task,
  useGoiYCap6,
  useRecordKehoachCap6,
  useThachThucCap6,
  useGraduateCap6,
} from "./hooks"
export { cap6Api } from "./api"
export { cap6Keys } from "./keys"
export { DoiChieuBlock, type DoiChieuBlockProps } from "./DoiChieuBlock"
export { coMauThuan, isDoiChieuValid, lopNguocChieu, lopUngHo } from "./doiChieu"
export {
  countCap6TasksDone,
  KIEU_ICON,
  KIEU_OPTIONS,
  TARGET_KIEU_DA_GAP,
  TARGET_LENH_DOI_CHIEU,
} from "./types"
export type {
  Cap6Progress,
  GoiYCap6,
  KehoachInputCap6,
  KieuCoPhieu,
  NhomDoiChieuCap6,
  OrderKehoachCap6,
  ThachThucCap6,
  ThachThucDieuKienCap6,
} from "./types"

// ── FE2: Kết sổ Cấp 6 + coach lớp 6 + khối ⑭⑮ ───────────────────────────────
export { KetsoModalCap6 } from "./KetsoModalCap6"
export type { DoiChieuKetsoCap6, KetsoDataCap6, KetsoModalCap6Props } from "./KetsoModalCap6"
export {
  COACH_CAP6_LABEL,
  composeCoachCap6,
  deriveCoachIdCap6,
  pickCoachCap6,
} from "./coachTemplateCap6"
export type {
  CoachIdCap6,
  CoachResultCap6,
  CoachSituationCap6,
  ComposedCoachCap6,
} from "./coachTemplateCap6"
export { Cap6PortfolioAnalysis, type Cap6PortfolioAnalysisProps } from "./Cap6PortfolioAnalysis"
export {
  computeCap6Khoi14LopTheoKieu,
  computeCap6Khoi15DoiChieu,
  computeCap6PortfolioAnalysis,
  KHOI14_MIN_LENH_MOI_O,
  KHOI15_DELTA_RO_RANG,
  KHOI15_MIN_LENH_MOI_NHOM,
} from "./portfolioAnalysisCap6"
export type {
  Cap6Khoi14LopTheoKieu,
  Cap6Khoi15DoiChieu,
  Cap6PortfolioAnalysisResult,
  Khoi14Cell,
  Khoi15Nhom,
} from "./portfolioAnalysisCap6"
export {
  appendCap6TradeRecord,
  readCap6TradeLog,
  useCap6TradeLog,
  type Cap6TradeRecord,
  type UseCap6TradeLogReturn,
} from "./tradeLogCap6"
