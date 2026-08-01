/**
 * Cấp 7 «Đọc sổ lệnh» — public surface (mirrors `cap6/index.ts`'s layout so the
 * cấp-to-cấp diff stays readable).
 *
 * FE1: the event bus, the API/hooks/keys/types layer, the PURE reading helpers
 * and the panel's khối Đọc sổ lệnh. FE2: Kết sổ Cấp 7, the coach's 7th
 * paragraph, and khối ⑯⑰ of Phân tích danh mục. FE3: the Hành trình tab, the
 * graduation screen and the page/routing pieces.
 *
 * ★ `RightSidebar`, `DauTruongPage` and `GraduationModalCap6` import the CONCRETE
 * files (`./JourneyPanelCap7`, `./Cap7TradingPage`, `./hooks`) rather than this
 * barrel: it re-exports `Cap7TradingPage`, which imports `CenterPanel`/
 * `RightSidebar`/`RightToolbar` from `@/features/dashboard` — going through the
 * barrel there would create a module-graph cycle (same rule Cấp 1-6 follow).
 */
export {
  Cap7Provider,
  useCap7Events,
  type Cap7EventBus,
  type Cap7EventHandlers,
  type Cap7OrderEvent,
} from "./Cap7Context"
export {
  useCap7Progress,
  useEnterCap7,
  useCompleteCap7Task,
  usePhienCap7,
  useKehoachCap7,
  useRecordKehoachCap7,
  useChamCap7,
  useThachThucCap7,
  useGraduateCap7,
} from "./hooks"
export { cap7Api } from "./api"
export { cap7Keys } from "./keys"
export { DocSoLenhBlock, type DocSoLenhBlockProps } from "./DocSoLenhBlock"
export {
  bandLuc,
  coCanhGiac,
  docSoLenhSnapshot,
  gaugeFill,
  lucChiSo,
  tongDu,
  SO_O_GAUGE,
  type CoCanhGiac,
  type MucSoLenh,
  type NguongLuc,
  type QuyTacCo,
  type SnapshotSoLenh,
} from "./docSoLenh"
export { countCap7TasksDone, HANH_VI_CO_LABEL, LUC_DOC_OPTIONS } from "./types"
export type {
  BandCap7,
  BandLuc,
  Cap7Progress,
  ChamCap7,
  HanhViCo,
  KehoachDetailCap7,
  KehoachInputCap7,
  LucDocUser,
  OrderKehoachCap7,
  PhienCap7,
  QuyTacCap7,
  ThachThucCap7,
  ThachThucDieuKienCap7,
} from "./types"

// ── FE2: Kết sổ Cấp 7 + coach lớp 7 + khối ⑯⑰ ───────────────────────────────
export { KetsoModalCap7, mergeDocLucCap7 } from "./KetsoModalCap7"
export type { DocLucKetsoCap7, KetsoDataCap7, KetsoModalCap7Props } from "./KetsoModalCap7"
export {
  COACH_CAP7_LABEL,
  COACH_CO_CAP7_LABEL,
  composeCoachCap7,
  pickCoachCap7,
} from "./coachTemplateCap7"
export type {
  CoachCoIdCap7,
  CoachIdCap7,
  CoachResultCap7,
  CoachSituationCap7,
  ComposedCoachCap7,
} from "./coachTemplateCap7"
export { Cap7PortfolioAnalysis, type Cap7PortfolioAnalysisProps } from "./Cap7PortfolioAnalysis"
export {
  computeCap7Khoi16DocLuc,
  computeCap7Khoi17KyLuatCo,
  computeCap7PortfolioAnalysis,
  KHOI16_MIN_DA_CHAM,
  KHOI16_MIN_XU_HUONG,
  KHOI16_NGUONG_LOI_THE,
  KHOI17_DELTA_RO_RANG,
  KHOI17_MIN_LENH_MOI_NHOM,
} from "./portfolioAnalysisCap7"
export type {
  Cap7Khoi16DocLuc,
  Cap7Khoi17KyLuatCo,
  Cap7PortfolioAnalysisResult,
  Khoi16NuaKy,
  Khoi16XuHuong,
  Khoi17Nhom,
} from "./portfolioAnalysisCap7"
export {
  appendCap7TradeRecord,
  readCap7TradeLog,
  useCap7TradeLog,
  type Cap7TradeRecord,
  type UseCap7TradeLogReturn,
} from "./tradeLogCap7"

// ── FE3: Hành trình + tốt nghiệp + trang Cấp 7 ──────────────────────────────
export { JourneyPanelCap7, taskStateCap7 } from "./JourneyPanelCap7"
export { GraduationModalCap7, isGraduationReadyCap7 } from "./GraduationModalCap7"
export { Cap7PortfolioAnalysisPanel } from "./Cap7PortfolioAnalysisPanel"
export { Cap7TradingPage } from "./Cap7TradingPage"
