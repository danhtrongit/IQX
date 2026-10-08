/**
 * Pure derivations for the hunt and Bot panels.
 *
 * Three-state discipline: `kha_dung === false` means "not enough data to run
 * this filter" and is never drawn as "0 mã"; a missing price is "-", never 0.
 */
import type { HuntFilterKey } from "./copy"
import type {
  BotJournalItem,
  HuntResult,
  LocSanTieuChi,
  SanMaIndex,
} from "./api"

/* ── Hunt filter availability / coverage ───────────────────────────────── */

export function huntFilterAvailability(
  index: SanMaIndex | null | undefined,
  ma: HuntFilterKey
): { kha_dung: boolean | null; ly_do: string | null } {
  const row = index?.bo_loc.find((item) => item.ma === ma)
  if (!row) return { kha_dung: null, ly_do: null }
  return { kha_dung: row.kha_dung, ly_do: row.ly_do_chua_kha_dung ?? null }
}

export function splitLocSan(
  locSan: readonly LocSanTieuChi[] | null | undefined
): { apDung: string[]; chuaApDung: string[] } {
  const apDung: string[] = []
  const chuaApDung: string[] = []
  for (const dk of locSan ?? []) (dk.ap_dung ? apDung : chuaApDung).push(dk.ten)
  return { apDung, chuaApDung }
}

/** Never prints a total the server did not send. */
export function describeHuntTotal(
  result: HuntResult,
  def: { ghi_chu_top: string }
): string {
  const shown = result.items.length.toLocaleString("vi-VN")
  if (result.tong_so_ma == null)
    return `Chưa đếm được tổng số mã thỏa điều kiện · đang hiện ${shown} ${def.ghi_chu_top}`
  return `${result.tong_so_ma.toLocaleString("vi-VN")} mã HOSE thỏa điều kiện · hiện ${shown} ${def.ghi_chu_top}`
}

export type CoverageState = {
  trangThai: "day_du" | "thieu" | "chua_biet"
  text: string
}

/** "N mã thỏa điều kiện" alone claims the whole exchange - this says what was actually scanned. */
export function describeHuntBaoPhu(result: HuntResult): CoverageState {
  const ro = result.so_ma_trong_ro
  const xet = result.so_ma_xet
  const boQua = result.so_ma_bo_qua_thieu_du_lieu

  if (result.ket_qua_day_du === true) {
    return {
      trangThai: "day_du",
      text:
        ro != null
          ? `Đã xét đủ ${ro.toLocaleString("vi-VN")} mã HOSE trong rổ - không mã nào bị bỏ vì thiếu dữ liệu.`
          : "Máy chủ khẳng định đã xét đủ rổ mã của lần chạy này.",
    }
  }
  if (result.ket_qua_day_du === false) {
    if (result.canh_bao_thieu_du_lieu)
      return { trangThai: "thieu", text: result.canh_bao_thieu_du_lieu }
    const veXet =
      xet != null && ro != null
        ? `đã xét ${xet.toLocaleString("vi-VN")}/${ro.toLocaleString("vi-VN")} mã`
        : "chưa xét được hết rổ mã"
    const veBoQua =
      boQua != null
        ? ` - ${boQua.toLocaleString("vi-VN")} mã thiếu dữ liệu`
        : " - một số mã thiếu dữ liệu"
    return {
      trangThai: "thieu",
      text: `Kết quả CHƯA đầy đủ: ${veXet}${veBoQua}, nên danh sách có thể còn sót mã thỏa điều kiện.`,
    }
  }
  return {
    trangThai: "chua_biet",
    text: "Máy chủ chưa cho biết đã xét được bao nhiêu mã trong rổ, nên chưa thể nói con số trên là của cả sàn.",
  }
}

/* ── Bot copy + wire helpers ───────────────────────────────────────────── */

export const RUN_COPY: Record<
  string,
  { label: string; text: string; tone: "muted" | "info" | "good" | "bad" }
> = {
  idle: {
    label: "Đang chờ",
    text: "Bot đang chờ phiên giao dịch tiếp theo.",
    tone: "muted",
  },
  running: {
    label: "Đang xử lý",
    text: "Bot đang ghi nhận và đối soát dữ liệu phiên.",
    tone: "info",
  },
  succeeded: {
    label: "Đã xử lý",
    text: "Bot đã xử lý xong phiên. Trạng thái này không có nghĩa phiên có lãi.",
    tone: "good",
  },
  failed: {
    label: "Cần kiểm tra",
    text: "Bot chưa xử lý xong phiên. Dữ liệu hoặc sổ sách đang cần được kiểm tra.",
    tone: "bad",
  },
}

export const ACTION_COPY: Record<
  string,
  { label: string; tone: "good" | "bad" | "info" | "muted" | "warn" }
> = {
  buy: { label: "Mua", tone: "good" },
  sell: { label: "Bán", tone: "bad" },
  hold: { label: "Giữ", tone: "info" },
  skip: { label: "Bỏ qua", tone: "muted" },
  issue: { label: "Lỗi", tone: "warn" },
}

export const FILTER_LABELS: Record<string, string> = {
  khoi_ngoai_gom: "Khối ngoại gom",
  ngoai: "Khối ngoại gom",
  tu_doanh_gom: "Tự doanh gom",
  tudoanh: "Tự doanh gom",
  kl_dot_bien: "Khối lượng đột biến",
  kl: "Khối lượng đột biến",
  vuot_dinh_20: "Vượt đỉnh 20 phiên",
  dinh: "Vượt đỉnh 20 phiên",
  tang_manh_kl: "Tăng mạnh kèm khối lượng",
  tang: "Tăng mạnh kèm khối lượng",
}

export const REASON_LABELS: Record<string, string> = {
  insufficient_supporting_layers: "Chưa đủ 3/4 lớp Ủng hộ",
  below_support_gate: "Chưa đủ 3/4 lớp Ủng hộ",
  missing_layers: "Thiếu dữ liệu bốn lớp",
  missing_veto_severity: "Thiếu mức độ Tin tức/Nội bộ để kiểm tra phủ quyết",
  veto_news_very_negative: "Tin tức ở mức rất xấu",
  veto_insider_very_negative: "Nội bộ ở mức rất xấu",
  veto_very_negative: "Tin tức hoặc Nội bộ ở mức rất xấu",
  invalid_or_missing_l1_amplitude: "Biên độ L1 thiếu hoặc không hợp lệ",
  existing_open_position: "Mã đã có vị thế mở",
  already_open: "Mã đã có vị thế mở",
  blocked_at_batch_start: "Mã đã bị chặn từ đầu phiên",
  blocked_at_start: "Mã đã bị chặn từ đầu phiên",
  rebuy_same_session: "Không mua lại mã vừa bán trong cùng phiên",
  insufficient_cash_or_lot: "Không đủ tiền cho một lô hợp lệ",
  max_symbol_weight: "Vượt trần 30% NAV cho một mã",
  symbol_weight_limit: "Vượt trần 30% NAV cho một mã",
  buy_limit_reached: "Đã đủ hai giao dịch mua mới trong phiên",
  no_eligible_candidate: "Không có ứng viên đạt đủ điều kiện",
  no_candidate: "Không có ứng viên đạt đủ điều kiện",
  already_traded_in_run: "Không mua lại mã đã giao dịch trong cùng phiên",
  insufficient_cash: "Tiền mặt không đủ cho lệnh mua",
  below_board_lot: "Không đủ ngân sách cho một lô hợp lệ",
  missing_official_close: "Thiếu giá đóng cửa chính thức",
  missing_security_status: "Thiếu trạng thái giao dịch của mã",
  filter_data_incomplete: "Dữ liệu Săn mã chưa đầy đủ",
  valuation_incomplete: "NAV chưa được định giá đầy đủ",
  source_error: "Nguồn dữ liệu đang lỗi",
  reconciliation_failed: "Đối soát sổ sách chưa hoàn tất",
  bought: "Đã mua mô phỏng theo bộ quy tắc tiêu chuẩn IQX",
  hold_within_thresholds: "Giá đóng cửa chưa chạm cắt lỗ (policy cũ)",
  stop_loss: "Giá đóng cửa chạm hoặc xuống dưới cắt lỗ",
  take_profit: "Giá đóng cửa chạm chốt lời (policy cũ)",
  waiting_for_academy_conditions: "Chờ kích hoạt điều kiện trong Học viện",
  no_active_buy_conditions: "Không mua mới: chưa có điều kiện Mua đang bật",
  academy_buy_not_met: "Điều kiện Mua chưa cùng đúng tại phiên này",
  academy_condition_missing: "Thiếu dữ liệu đầu vào của chỉ báo đang bật",
  config_invalid_or_unauthorized:
    "Cấu hình không thể thực thi an toàn (lỗi hoặc chưa được cấp quyền)",
  academy_buy: "Đã mua mô phỏng theo cấu hình Học viện",
  academy_sell: "Đã bán theo hợp lưu điều kiện Bán",
  academy_sell_not_met: "Giữ: điều kiện Bán chưa cùng đúng, chưa chạm cắt lỗ",
  no_active_sell_conditions: "Giữ: không có điều kiện Bán, vẫn quản lý cắt lỗ",
  invalid_close: "Thiếu giá đóng cửa hợp lệ",
  missing_stop: "Thiếu mốc cắt lỗ đã lưu; cần đối soát",
  ledger_error: "Sổ sách chưa đối soát; không ghi giao dịch",
  already_holding: "Mã đang được giữ, không mua thêm",
  rebuy_same_session_blocked: "Không mua lại mã đã bán trong cùng phiên",
  symbol_limit: "Vượt trần 30% NAV cho một mã",
  session_buy_limit: "Đã đủ hai giao dịch mua mới trong phiên",
  shared_config_sell: "Đã bán theo hợp lưu điều kiện Bán",
  buy_inputs_incomplete: "Chưa đủ nguồn dữ liệu để xét mua",
}

export function formatFilter(id: string | null | undefined): string {
  if (!id) return "-"
  return FILTER_LABELS[id] ?? id
}

/** The server's `detail` wins; unknown codes print raw rather than a guess. */
export function formatReason(
  code: string | null | undefined,
  detail: string | null | undefined
): string {
  if (detail && detail.trim().length > 0) return detail
  if (!code) return "Chưa có mô tả"
  return REASON_LABELS[code] ?? code
}

export type JournalKind = "execution" | "decision" | "issue"

export function journalKind(item: BotJournalItem): JournalKind {
  if (item.execution != null) return "execution"
  if (item.action === "buy" || item.action === "sell") return "execution"
  if (item.action === "issue") return "issue"
  return "decision"
}

/** `null`/empty/non-finite ⇒ `null` (never 0). */
export function toFiniteNumber(
  value: string | number | null | undefined
): number | null {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const HUNT_TOP_NOTE =
  "Tích Theo dõi để đưa mã vào danh sách quan sát - săn mã chưa phải là mua."
