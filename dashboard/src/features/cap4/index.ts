export {
  Cap4Provider,
  useCap4Events,
  type Cap4EventBus,
  type Cap4EventHandlers,
  type Cap4OrderEvent,
} from "./Cap4Context"
export {
  useCap4Progress,
  useEnterCap4,
  useCompleteCap4Task,
  useRecordKehoachCap4,
  useVuKhiDiemMu,
  useThachThucCap4,
  useGraduateCap4,
} from "./hooks"
export { cap4Api } from "./api"
export { cap4Keys } from "./keys"
export { Doc5LopBlock, type Doc5LopBlockProps } from "./Doc5LopBlock"
export { KetsoModalCap4, type KetsoDataCap4, type KetsoModalCap4Props } from "./KetsoModalCap4"
export {
  Cap4PortfolioAnalysis,
  type Cap4PortfolioAnalysisProps,
} from "./Cap4PortfolioAnalysis"
export {
  composeCoachCap4,
  lopKhacAiCap4,
  lopLabelCap4,
  lopSoSanhDuocCap4,
  pickCoachCap4,
  pickCoachIdCap4,
  type CoachIdCap4,
  type CoachResultCap4,
  type CoachSituationCap4,
  type ComposedCoachCap4,
} from "./coachTemplateCap4"
export {
  computeCap4Khoi10DongThuan,
  computeCap4Khoi11GocNhinRieng,
  computeCap4PortfolioAnalysis,
  DONG_THUAN_BAND_LABEL,
  KHOI10_MIN_TRADES_PER_NHOM,
  KHOI10_WIN_RATE_GAP_PCT,
  KHOI11_MIN_LENH,
  type Cap4Khoi10DongThuan,
  type Cap4Khoi11GocNhinRieng,
  type Cap4PortfolioAnalysisResult,
  type DongThuanBand,
  type Khoi10DongThuanRow,
} from "./portfolioAnalysisCap4"
export {
  appendCap4TradeRecord,
  readCap4TradeLog,
  useCap4TradeLog,
  type Cap4TradeRecord,
  type UseCap4TradeLogReturn,
} from "./tradeLogCap4"
export {
  LOP_DEFS,
  LOP_KEYS,
  NHAN_DINH_LABEL,
  NHAN_DINH_OPTIONS,
  countCungGocNhin,
  countDongThuan,
  countKhacAi,
  deriveAiRating,
  deriveLyDoForCap1,
  isDoc5LopComplete,
  nhanDinhFromVerdict,
  type AiRatingSource,
  type LopDef,
} from "./doc5Lop"
export { countCap4TasksDone } from "./types"
export type {
  Cap4Progress,
  KehoachInputCap4,
  Lop,
  Lop5Map,
  Lop5Partial,
  LopWinRate,
  NhanDinhLop,
  NhanVuKhi,
  OrderKehoachCap4,
  ThachThucCap4,
  ThachThucDieuKienCap4,
  VuKhiDiemMuCap4,
} from "./types"
