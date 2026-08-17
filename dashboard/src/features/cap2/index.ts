export {
  Cap2Provider,
  useCap2Events,
  type Cap2EventBus,
  type Cap2EventHandlers,
  type Cap2OrderEvent,
} from "./Cap2Context"
export {
  useCap2Progress,
  useEnterCap2,
  useCompleteCap2Task,
  useRecordKehoachCap2,
  useRecordKetsoCap2,
  useDiemKyLuat,
  useGraduateCap2,
} from "./hooks"
export { cap2Api } from "./api"
export { cap2Keys } from "./keys"
export { SlTpBlock, type SlTpBlockProps } from "./SlTpBlock"
export {
  computeBienDoDaoDong,
  computeBienDoSlTp,
  computeHoTroKhangCuSlTp,
  extractHoTroKhangCu,
  extractNumberFromFragments,
  roundToStep,
  type LayerField,
  type OhlcvBar,
  type SlTpResult,
} from "./slTp"
export {
  isSlTpValid,
  countCap2TasksDone,
  CAP2_TOTAL_TASKS,
  type Cap2Progress,
  type DiemKyLuat,
  type DiemKyLuatThanhPhan,
  type KehoachInputCap2,
  type KetsoInputCap2,
  type OrderKehoachCap2,
  type OrderKetsoCap2,
  type PhuongPhapSlTp,
  type XepLoai,
} from "./types"
export { ChuoiWidget, type ChuoiWidgetProps } from "./ChuoiWidget"
export { DiemKyLuatCard, type DiemKyLuatCardProps } from "./DiemKyLuat"
export {
  MAX_IMPORTANT_ALERTS_PER_SESSION,
  AUTO_MUTE_CLEAN_ORDERS_THRESHOLD,
  ESCALATION_GREYED_MIN,
  ESCALATION_TYPE_CONFIRM_MIN,
  GREYED_CONFIRM_SECONDS,
  evaluateAlertRate,
  type AlertLevel,
  type AlertRateInput,
  type AlertRateResult,
} from "./alertRate"
export {
  ChamCatLoBanner,
  type ChamCatLoBannerProps,
  NhoiLenhWarning,
  type NhoiLenhWarningProps,
} from "./AlertCap2"
export {
  GHI_NHAN_NHO_MS,
  CHUOI_MILESTONES,
  ghiNhanNhoText,
  GhiNhanNho,
  type GhiNhanNhoEvent,
  type GhiNhanNhoProps,
} from "./GhiNhanNho"
export {
  pickCoachIdCap2,
  pickCoachCap2,
  composeCoachCap2,
  type CoachIdCap2,
  type CoachFlagsCap2,
  type CoachSituationCap2,
  type CoachResultCap2,
  type ComposedCoachCap2,
} from "./coachTemplateCap2"
export {
  KetsoModalCap2,
  type KetsoDataCap2,
  type KetsoModalCap2Props,
} from "./KetsoModalCap2"
export {
  computeCap2PortfolioAnalysis,
  computeSlTpUsageCap2,
  SL_TP_ORDERS_TARGET,
  VI_PHAM_LOAI_LABELS,
  type Cap2TradeRecord,
  type Cap2DailyScoreRecord,
  type ViPhamLoai,
  type Cap2SlTpUsage,
  type Cap2PortfolioAnalysisResult,
} from "./portfolioAnalysisCap2"
export {
  Cap2PortfolioAnalysis,
  type Cap2AnalysisHost,
  type Cap2PortfolioAnalysisProps,
} from "./Cap2PortfolioAnalysis"
export { Cap2PortfolioAnalysisPanel } from "./Cap2PortfolioAnalysisPanel"
export {
  useCap2TradeLog,
  readCap2TradeLog,
  appendCap2TradeRecord,
  readCap2ScoreLog,
  appendCap2ScoreRecord,
  type UseCap2TradeLogReturn,
} from "./tradeLogCap2"
export { JourneyPanelCap2 } from "./JourneyPanelCap2"
export { GraduationModalCap2, isGraduationReadyCap2 } from "./GraduationModalCap2"
export {
  Cap2TradingPage,
  computeKetsoFlagsCap2,
  type KetsoFlagsCap2Input,
  type KetsoFlagsCap2,
} from "./Cap2TradingPage"
