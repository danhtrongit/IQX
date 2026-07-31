/**
 * Cấp 5 «Lão luyện» — public surface (mirrors `cap4/index.ts`'s layout so the
 * cấp-to-cấp diff stays readable).
 */
export {
  Cap5Provider,
  useCap5Events,
  type Cap5EventBus,
  type Cap5EventHandlers,
  type Cap5OrderEvent,
} from "./Cap5Context"
export {
  useCap5Progress,
  useEnterCap5,
  useCompleteCap5Task,
  useVerdictGoiY,
  useRecordKetsoCap5,
  useDungNgoai,
  useDanhSachDungNgoai,
  useChamDungNgoai,
  useThachThucCap5,
  useGraduateCap5,
} from "./hooks"
export { cap5Api } from "./api"
export { cap5Keys } from "./keys"
export { DungNgoaiButton, type DungNgoaiButtonProps } from "./DungNgoaiButton"
export { PhanLoai4O, type PhanLoai4OProps } from "./PhanLoai4O"
export { KetsoModalCap5, type KetsoDataCap5, type KetsoModalCap5Props } from "./KetsoModalCap5"
export {
  Cap5PortfolioAnalysis,
  type Cap5PortfolioAnalysisProps,
} from "./Cap5PortfolioAnalysis"
export {
  composeCoachCap5,
  deriveO4,
  pickCoachCap5,
  splitEmphasis,
  viPhamTuSignals,
  type CoachIdCap5,
  type CoachResultCap5,
  type CoachSituationCap5,
  type ComposedCoachCap5,
  type EmphasisPart,
} from "./coachTemplateCap5"
export {
  computeCap5Khoi12MaTran,
  computeCap5PortfolioAnalysis,
  viPhamPhoBienCap5,
  KHOI12_DUNG_THUA_CAO,
  KHOI12_MIN_LENH,
  KHOI12_SAI_THANG_CANH_BAO,
  O4_ORDER,
  type Cap5Khoi12MaTran,
  type Cap5PortfolioAnalysisResult,
  type Khoi12Cell,
} from "./portfolioAnalysisCap5"
export {
  appendCap5TradeRecord,
  readCap5TradeLog,
  useCap5TradeLog,
  type Cap5TradeRecord,
  type UseCap5TradeLogReturn,
} from "./tradeLogCap5"
export {
  countCap5TasksDone,
  isPhanLoaiSettled,
  LY_DO_DUNG_NGOAI_OPTIONS,
  O4_LABEL,
  TARGET_DUNG_NGOAI,
  TARGET_LENH_PHAN_LOAI,
  TARGET_TY_LE_QUYET_DINH_DUNG,
  VERDICT_LABEL,
} from "./types"
export type {
  Cap5Progress,
  ChamDungNgoaiResult,
  DungNgoaiInput,
  DungNgoaiItem,
  DungNgoaiList,
  KetQuaDungNgoai,
  KetsoInputCap5,
  LyDoDungNgoai,
  LyDoHayDung,
  O4,
  OrderKetsoCap5,
  ThachThucCap5,
  ThachThucDieuKienCap5,
  Verdict,
  VerdictGoiY,
  VerdictSignal,
} from "./types"
