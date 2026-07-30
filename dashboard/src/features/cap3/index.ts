export {
  Cap3Provider,
  useCap3Events,
  type Cap3EventBus,
  type Cap3EventHandlers,
  type Cap3OrderEvent,
} from "./Cap3Context"
export {
  useCap3Progress,
  useEnterCap3,
  useSetKhauVi,
  useCompleteCap3Task,
  useRecordKehoachCap3,
  useThachThuc,
  useGraduateCap3,
} from "./hooks"
export { cap3Api } from "./api"
export { cap3Keys } from "./keys"
export { KhauViModal, type KhauViModalProps } from "./KhauViModal"
export { QuanLyVonBlock, type QuanLyVonBlockProps } from "./QuanLyVonBlock"
export { KetsoModalCap3, type KetsoDataCap3, type KetsoModalCap3Props } from "./KetsoModalCap3"
export {
  Cap3PortfolioAnalysis,
  type Cap3PortfolioAnalysisProps,
} from "./Cap3PortfolioAnalysis"
export {
  composeCoachCap3,
  pickCoachCap3,
  pickCoachIdCap3,
  MUC_TU_TIN_LABEL,
  type CoachIdCap3,
  type CoachResultCap3,
  type CoachSituationCap3,
  type ComposedCoachCap3,
} from "./coachTemplateCap3"
export {
  computeCap3PortfolioAnalysis,
  computeCap3Khoi7TuTin,
  computeCap3Khoi8KhoiLuong,
  CACH_KHOI_LUONG_LABEL,
  KHOI7_MIN_TRADES_PER_MUC,
  KHOI7_WIN_RATE_GAP_PCT,
  KHOI8_MIN_RATIO,
  KHOI8_MIN_TRADES_PER_MUC,
  type Cap3Khoi7TuTin,
  type Cap3Khoi8KhoiLuong,
  type Cap3PortfolioAnalysisResult,
  type Khoi7TuTinRow,
  type Khoi8KhoiLuongRow,
} from "./portfolioAnalysisCap3"
export {
  useCap3TradeLog,
  readCap3TradeLog,
  appendCap3TradeRecord,
  type Cap3TradeRecord,
  type UseCap3TradeLogReturn,
} from "./tradeLogCap3"
export {
  computeKhoiLuong,
  isKhoiLuongValid,
  roundToLo,
  KHAU_VI_PCT,
  MUC_TU_TIN_HE_SO,
  type KhoiLuongInput,
  type KhoiLuongResult,
} from "./khoiLuong"
export {
  computeKhauViConsequence,
  SAN_PCT_GIA_DINH,
  type KhauViConsequence,
} from "./khauViConsequence"
export type {
  CachKhoiLuong,
  Cap3Progress,
  KehoachInputCap3,
  KhauViLoai,
  MucTuTin,
  OrderKehoachCap3,
  ThachThucCap3,
  ThachThucDieuKienCap3,
} from "./types"
