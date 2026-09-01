/**
 * Cấp 8 «Quản trị rủi ro danh mục» — public surface (mirrors `cap7/index.ts`'s
 * layout so the cấp-to-cấp diff stays readable).
 *
 * FE1: the event bus, the API/hooks/keys/types layer, the two pure rules and the
 * panel's khối Kiểm tra danh mục. FE2: Kết sổ Cấp 8, the coach's 8th paragraph,
 * and khối ⑱ of Phân tích danh mục. FE3: the Hành trình tab + rail 0-8, the
 * graduation screen (the program's finale) and the page.
 *
 * ★ `Cap8TradingPage` is exported from this barrel like every other cấp's page,
 * but `DauTruongPage`/`RightSidebar`/`GraduationModalCap7` deliberately import it
 * (and `JourneyPanelCap8`/`Cap8PortfolioAnalysisPanel`/`hooks`) from their
 * concrete files instead: this barrel pulls in the page, which pulls in
 * `@/features/dashboard`, which pulls in `RightSidebar` — a module cycle.
 *
 * ★ Cấp 8 cố ý KHÔNG có `tradeLogCap8`: nó không thêm trường nào vào nhật ký
 * lệnh (khối ⑱ đọc thẳng từ `GET /cap8/thach-thuc`), nên Kết sổ và Phân tích
 * dùng lại `useCap7TradeLog` / `Cap7TradeRecord` nguyên vẹn.
 */
export {
  Cap8Provider,
  useCap8Events,
  type Cap8EventBus,
  type Cap8EventHandlers,
  type Cap8OrderEvent,
} from "./Cap8Context"
export {
  useCap8Progress,
  useEnterCap8,
  useCompleteCap8Task,
  useKiemTraCap8,
  useRecordKehoachCap8,
  useThachThucCap8,
  useGraduateCap8,
  KIEM_TRA_DEBOUNCE_MS,
} from "./hooks"
export { cap8Api } from "./api"
export { cap8Keys } from "./keys"
export {
  KiemTraDanhMucBlock,
  type KiemTraDanhMucBlockProps,
} from "./KiemTraDanhMucBlock"
export { Cap8PortfolioAnalysisPanel } from "./Cap8PortfolioAnalysisPanel"
export { JourneyPanelCap8, taskStateCap8 } from "./JourneyPanelCap8"
export { HuyHieuRailCap8, type HuyHieuRailCap8Props } from "./HuyHieuRailCap8"
export { GraduationModalCap8, isGraduationReadyCap8 } from "./GraduationModalCap8"
export { Cap8TradingPage } from "./Cap8TradingPage"
export {
  countCap8TasksDone,
  giamKhoiLuong,
  hanhViCanhBaoToSend,
  HANH_VI_CANH_BAO_LABEL,
  HANH_VI_OPTIONS,
  LOAI_CANH_BAO_LABEL,
  LO_CO_PHIEU,
} from "./types"
export type {
  Cap8Progress,
  CanhBaoCap8,
  CapTuongQuanCap8,
  DanhMucCap8,
  DonNganhMaxCap8,
  GiaiThichKiemTraCap8,
  HanhViCanhBao,
  KehoachInputCap8,
  KiemTraCap8,
  KiemTraInputCap8,
  LoaiCanhBao,
  OrderKehoachCap8,
  PhanBoNganhCap8,
  QuyTacCap8,
  ThachThucCap8,
  ThachThucDieuKienCap8,
  TuongQuanCap8,
} from "./types"
