/**
 * Cấp 6 «Bậc thầy» — public surface (mirrors `cap5/index.ts`'s layout so the
 * cấp-to-cấp diff stays readable).
 *
 * The public API exposes the server-owned conflict-evidence journey, settlement
 * view, portfolio analysis, and graduation flow.
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
  useGraduateCap6,
} from "./hooks"
export { cap6Api } from "./api"
export { cap6Keys } from "./keys"
// ── CẤP 6 «BẬC THẦY» (spec `demo-trading/LEVEL 6`) ──────────────────────────
export { MauThuanBlock, type MauThuanBlockProps } from "./MauThuanBlock"
export {
  CAU_CHOT_MAU_THUAN,
  CHU_THICH_DIEM_TRU,
  CHU_THICH_KHUNG_THAM_KHAO,
  CHU_THICH_PHU_QUYET,
  CONFLICT_LEVEL_OPTIONS,
  MUC_TIEU_NHAT_QUAN_MAC_DINH,
  coBangMauThuan,
  conflictLevelIcon,
  conflictLevelLabel,
  conflictLevelText,
  datCongCap6,
  feedbackNhanDinh,
  lechNhanDinhHanhDong,
  lyDoTuMauThuan,
  mucTieuNhatQuan,
} from "./nhanDinhCap6"
export {
  useKehoachMauThuanCap6,
  useMarkTourMauThuan,
  useMauThuanCap6,
  usePhanTichCap6,
  useRecordKehoachMauThuanCap6,
  useSkipCap6,
} from "./hooks"
export {
  COACH_NHAT_QUAN_CAP6,
  NhanDinhKetsoBlock,
  loiCanhBaoLech,
  mergeNhanDinhCap6,
  type NhanDinhKetsoBlockProps,
  type NhanDinhKetsoCap6,
} from "./NhanDinhKetsoBlock"
export type {
  ConflictLevel,
  KehoachMauThuanCap6,
  Khoi14Cap6,
  Khoi14RowCap6,
  Khoi15Cap6,
  Khoi15RowCap6,
  LopNguocCap6,
  LopTrungTinhCap6,
  LopUngHoCap6,
  MauThuanCap6,
  PhanTichCap6,
} from "./mauThuanTypes"

// ── FE2: Kết sổ Cấp 6 + khối nhận định ─────────────────────────────────────
export { KetsoModalCap6 } from "./KetsoModalCap6"
export type { KetsoDataCap6, KetsoModalCap6Props } from "./KetsoModalCap6"
export { Cap6PortfolioAnalysis, type Cap6PortfolioAnalysisProps } from "./Cap6PortfolioAnalysis"
export {
  appendCap6TradeRecord,
  readCap6TradeLog,
  useCap6TradeLog,
  type Cap6TradeRecord,
  type UseCap6TradeLogReturn,
} from "./tradeLogCap6"

// ── FE3: Hành trình + tốt nghiệp + panel Phân tích danh mục + trang Cấp 6 ────
export { JourneyPanelCap6, taskStateCap6 } from "./JourneyPanelCap6"
export { GraduationModalCap6, isGraduationReadyCap6 } from "./GraduationModalCap6"
export { Cap6PortfolioAnalysisPanel } from "./Cap6PortfolioAnalysisPanel"
export { Cap6TradingPage } from "./Cap6TradingPage"
