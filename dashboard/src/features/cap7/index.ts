/**
 * Cấp 7 «Đọc sổ lệnh» — public surface (mirrors `cap6/index.ts`'s layout so the
 * cấp-to-cấp diff stays readable).
 *
 * FE1: the event bus, the API/hooks/keys/types layer, the PURE reading helpers
 * and the panel's khối Đọc sổ lệnh. FE2: Kết sổ Cấp 7, the coach's 7th
 * paragraph, and khối ⑯⑰ of Phân tích danh mục. The Hành trình tab, the
 * graduation screen and the page/routing pieces arrive in FE3.
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
  KehoachInputCap7,
  LucDocUser,
  OrderKehoachCap7,
  PhienCap7,
  QuyTacCap7,
  ThachThucCap7,
  ThachThucDieuKienCap7,
} from "./types"
