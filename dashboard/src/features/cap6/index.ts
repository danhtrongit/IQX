/**
 * Cấp 6 «Đối chiếu» — public surface (mirrors `cap5/index.ts`'s layout so the
 * cấp-to-cấp diff stays readable).
 *
 * FE1 scope: the event bus, the API/hooks/keys/types layer, the PURE conflict
 * helpers and the panel's bước Đối chiếu. The Kết sổ, Phân tích danh mục, Hành
 * trình and page/routing pieces arrive in FE2.
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
