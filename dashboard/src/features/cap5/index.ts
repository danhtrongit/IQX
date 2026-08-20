/**
 * Cấp 5 «Lão luyện» — public surface (mirrors `cap4/index.ts`'s layout so the
 * cấp-to-cấp diff stays readable).
 *
 * ★★ Bề mặt của Cấp 5 CŨ (`PhanLoai4O`, `DungNgoaiButton`, `useVerdictGoiY`,
 * `useRecordKetsoCap5`, `useDungNgoai`, `useDanhSachDungNgoai`,
 * `useChamDungNgoai`, `useThachThucCap5`, `deriveO4`, `viPhamTuSignals`,
 * `computeCap5Khoi12MaTran`, `O4*`, `Verdict*`, `LyDoDungNgoai*`,
 * `ThachThuc*`) đã BỊ GỠ HẲN — không re-export "cho tương thích", vì một tên
 * còn sống là một lời mời dựng lại màn hình đã nghỉ hưu.
 */
export {
  Cap5Provider,
  useCap5Events,
  type Cap5EventBus,
  type Cap5EventHandlers,
  type Cap5OrderEvent,
} from "./Cap5Context"
export { useCap5Progress, useEnterCap5, useCompleteCap5Task, useGraduateCap5 } from "./hooks"
export { cap5Api } from "./api"
export { cap5Keys } from "./keys"
export { KetsoModalCap5, type KetsoDataCap5, type KetsoModalCap5Props } from "./KetsoModalCap5"
export {
  Cap5PortfolioAnalysis,
  type Cap5PortfolioAnalysisProps,
} from "./Cap5PortfolioAnalysis"
export { Cap5PortfolioAnalysisPanel } from "./Cap5PortfolioAnalysisPanel"
export { SanMaPanel } from "./SanMaPanel"
export { Cap5WatchlistPanel } from "./Cap5WatchlistPanel"
export {
  cap5WatchStatus,
  countWatchTabs,
  describeConsensus,
  describeConsensusTrend,
  describeHuntSource,
  lopIconRow,
  lopMark,
  soLopChuaRo,
  soLopDaCham,
  CAP5_WATCH_STATUS_LABEL,
  NOTABLE_MIN_LOP,
  TONG_SO_LOP,
  type Cap5LopChiTiet,
  type Cap5WatchlistItem,
  type Cap5WatchStatus,
} from "./watchlistTypes"
export { JourneyPanelCap5 } from "./JourneyPanelCap5"
export { GraduationModalCap5, isGraduationReadyCap5 } from "./GraduationModalCap5"
export { Cap5TradingPage } from "./Cap5TradingPage"
export {
  composeCoachCap5,
  pickCoachCap5,
  splitEmphasis,
  CAP5_LOP_CHIN,
  type CoachIdCap5,
  type CoachResultCap5,
  type CoachSituationCap5,
  type ComposedCoachCap5,
  type EmphasisPart,
} from "./coachTemplateCap5"
export {
  computeCap5Khoi12BoLoc,
  computeCap5Khoi13Pheu,
  computeCap5PortfolioAnalysis,
  KHOI12_KEM_PCT,
  KHOI12_MIN_LENH,
  KHOI12_TOT_PCT,
  type Cap5Khoi12BoLoc,
  type Cap5Khoi13Pheu,
  type Cap5PortfolioAnalysisResult,
  type Khoi12FilterRow,
  type Khoi13Tang,
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
  huntFilterTen,
  mucTieuSoMaMua,
  mucTieuSoMaSan,
  taskStateCap5,
  CAP5_SO_MA_MUA_TARGET,
  CAP5_SO_MA_SAN_TARGET,
  CAP5_TOTAL_TASKS,
  HUNT_FILTER_LABEL,
  HUNT_FILTER_ORDER,
  HUNT_FILTER_TEN,
} from "./types"
export type { Cap5Progress, HuntFilter, TaskStateCap5 } from "./types"
