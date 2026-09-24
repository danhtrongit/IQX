/**
 * Nhãn tiếng Việt + tông màu cho quản trị giao dịch ảo.
 *
 * Đây là module dữ liệu thuần: chỉ dịch từ vựng backend (enum Prisma) sang nhãn
 * hiển thị và giữ nguyên giá trị lạ để không che dữ liệu thật. Nơi dùng tự tra
 * bảng (`MAP[value] ?? value`) nên không có lớp hàm trung gian.
 */
import type {
  VtAccountStatus,
  VtOrderSide,
  VtOrderStatus,
  VtOrderType,
  VtSettlementKind,
  VtSettlementMode,
  VtSettlementStatus,
} from "./api"

/* ── Tông màu dùng chung với bảng lệnh của /demo-trading ─────────────────── */

export const TONE_ACTIVE = "border-price-up/40 text-price-up"
export const TONE_PENDING = "border-accent/60 text-accent-foreground"
export const TONE_NEUTRAL = "border-border text-muted-foreground"
export const TONE_DANGER = "border-destructive/40 text-destructive"

/* ── Tài khoản ───────────────────────────────────────────────────────────── */

export const ACCOUNT_STATUS_LABEL: Record<VtAccountStatus, string> = {
  active: "Đang hoạt động",
  suspended: "Tạm khóa",
}

export const ACCOUNT_STATUS_TONE: Record<VtAccountStatus, string> = {
  active: TONE_ACTIVE,
  suspended: TONE_DANGER,
}

/* ── Lệnh ────────────────────────────────────────────────────────────────── */

export const ORDER_STATUS_LABEL: Record<VtOrderStatus, string> = {
  pending: "Đang chờ",
  filled: "Đã khớp",
  cancelled: "Đã huỷ",
  expired: "Hết hạn",
  rejected: "Bị từ chối",
}

export const ORDER_STATUS_TONE: Record<VtOrderStatus, string> = {
  pending: TONE_PENDING,
  filled: TONE_ACTIVE,
  cancelled: TONE_NEUTRAL,
  expired: TONE_NEUTRAL,
  rejected: TONE_DANGER,
}

/** Sổ lệnh Việt Nam gọi lệnh thị trường là MP, lệnh giới hạn là LO. */
export const ORDER_TYPE_LABEL: Record<VtOrderType, string> = { market: "MP", limit: "LO" }

export const SIDE_LABEL: Record<VtOrderSide, string> = { buy: "MUA", sell: "BÁN" }

/** Tông chữ cho cột chiều của lệnh/giao dịch (không kèm viền). */
export const SIDE_TEXT_TONE: Record<VtOrderSide, string> = { buy: "text-price-up", sell: "text-price-down" }

/* ── Thanh toán T+N ──────────────────────────────────────────────────────── */

export const SETTLEMENT_KIND_LABEL: Record<VtSettlementKind, string> = {
  buy_qty_release: "Giải phóng cổ phiếu mua",
  sell_cash_release: "Giải phóng tiền bán",
}

/** `buy_qty_release` tính bằng cổ phiếu, `sell_cash_release` tính bằng VND. */
export const SETTLEMENT_AMOUNT_UNIT: Record<VtSettlementKind, "shares" | "vnd"> = {
  buy_qty_release: "shares",
  sell_cash_release: "vnd",
}

export const SETTLEMENT_STATUS_LABEL: Record<VtSettlementStatus, string> = {
  pending: "Chờ đến hạn",
  settled: "Đã tất toán",
}

export const SETTLEMENT_STATUS_TONE: Record<VtSettlementStatus, string> = {
  pending: TONE_PENDING,
  settled: TONE_ACTIVE,
}

export const SETTLEMENT_MODE_OPTIONS: { value: VtSettlementMode; label: string; hint: string }[] = [
  { value: "T0", label: "T0 — khớp là có ngay", hint: "Cổ phiếu mua bán được ngay, tiền bán về ngay trong ngày." },
  { value: "T2", label: "T2 — đúng luật thị trường", hint: "Cổ phiếu mua và tiền bán chờ 2 ngày giao dịch mới được giải phóng." },
]

/* ── Sổ cái ──────────────────────────────────────────────────────────────── */

/** Loại bút toán là cột `String(50)` phía backend; giá trị lạ hiển thị nguyên văn. */
export const LEDGER_KIND_LABEL: Record<string, string> = {
  activate: "Kích hoạt tài khoản",
  reset: "Đặt lại tài khoản",
  admin_adjust: "Quản trị điều chỉnh tiền",
  buy: "Dòng tiền mua (ròng)",
  sell: "Dòng tiền bán (ròng)",
}

/** Bộ lọc sổ cái — chỉ những loại backend thực sự ghi. */
export const LEDGER_KIND_OPTIONS: { value: string; label: string }[] = Object.entries(LEDGER_KIND_LABEL).map(
  ([value, label]) => ({ value, label }),
)

/* ── Nguồn giá của giao dịch (`price_source`) ────────────────────────────── */

export const PRICE_SOURCE_LABEL: Record<string, string> = {
  live: "Giá thị trường",
  close: "Giá đóng cửa",
  cached: "Giá lưu tạm",
  snapshot: "Giá tại lúc đặt lệnh",
}
