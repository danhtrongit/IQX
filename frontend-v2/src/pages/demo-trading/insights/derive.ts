/**
 * Pure derivations for the hunt/watchlist and Bot panels.
 *
 * Three-state discipline (rule 1): `kha_dung === false` means "not enough data
 * to run this filter" and is never drawn as "0 mã"; a missing consensus score
 * is "-/5", never "0/5"; a missing price is "-", never 0.
 */
import { LOP_DEFS, NOTABLE_MIN_LOP, TONG_SO_LOP, huntFilterLabel, type HuntFilterKey } from "./copy"
import type { BotJournalItem, Cap5LopChiTiet, Cap5WatchlistItem, HuntResult, LocSanTieuChi, SanMaIndex } from "./api"

/* ── Hunt filter availability / coverage ───────────────────────────────── */

export function huntFilterAvailability(index: SanMaIndex | null | undefined, ma: HuntFilterKey): { kha_dung: boolean | null; ly_do: string | null } {
  const row = index?.bo_loc.find((item) => item.ma === ma)
  if (!row) return { kha_dung: null, ly_do: null }
  return { kha_dung: row.kha_dung, ly_do: row.ly_do_chua_kha_dung ?? null }
}

export function splitLocSan(locSan: readonly LocSanTieuChi[] | null | undefined): { apDung: string[]; chuaApDung: string[] } {
  const apDung: string[] = []
  const chuaApDung: string[] = []
  for (const dk of locSan ?? []) (dk.ap_dung ? apDung : chuaApDung).push(dk.ten)
  return { apDung, chuaApDung }
}

/** Never prints a total the server did not send. */
export function describeHuntTotal(result: HuntResult, def: { ghi_chu_top: string }): string {
  const shown = result.items.length.toLocaleString("vi-VN")
  if (result.tong_so_ma == null) return `Chưa đếm được tổng số mã thỏa điều kiện · đang hiện ${shown} ${def.ghi_chu_top}`
  return `${result.tong_so_ma.toLocaleString("vi-VN")} mã HOSE thỏa điều kiện · hiện ${shown} ${def.ghi_chu_top}`
}

export type CoverageState = { trangThai: "day_du" | "thieu" | "chua_biet"; text: string }

/** "N mã thỏa điều kiện" alone claims the whole exchange - this says what was actually scanned. */
export function describeHuntBaoPhu(result: HuntResult): CoverageState {
  const ro = result.so_ma_trong_ro
  const xet = result.so_ma_xet
  const boQua = result.so_ma_bo_qua_thieu_du_lieu

  if (result.ket_qua_day_du === true) {
    return {
      trangThai: "day_du",
      text: ro != null ? `Đã xét đủ ${ro.toLocaleString("vi-VN")} mã HOSE trong rổ - không mã nào bị bỏ vì thiếu dữ liệu.` : "Máy chủ khẳng định đã xét đủ rổ mã của lần chạy này.",
    }
  }
  if (result.ket_qua_day_du === false) {
    if (result.canh_bao_thieu_du_lieu) return { trangThai: "thieu", text: result.canh_bao_thieu_du_lieu }
    const veXet = xet != null && ro != null ? `đã xét ${xet.toLocaleString("vi-VN")}/${ro.toLocaleString("vi-VN")} mã` : "chưa xét được hết rổ mã"
    const veBoQua = boQua != null ? ` - ${boQua.toLocaleString("vi-VN")} mã thiếu dữ liệu` : " - một số mã thiếu dữ liệu"
    return { trangThai: "thieu", text: `Kết quả CHƯA đầy đủ: ${veXet}${veBoQua}, nên danh sách có thể còn sót mã thỏa điều kiện.` }
  }
  return { trangThai: "chua_biet", text: "Máy chủ chưa cho biết đã xét được bao nhiêu mã trong rổ, nên chưa thể nói con số trên là của cả sàn." }
}

/* ── Watchlist derivation (spec §6.1/§6.2) ─────────────────────────────── */

export type WatchStatus = "chua_cham" | "chua_ket_luan" | "du_lieu_cu" | "watching" | "notable"

export const WATCH_STATUS_LABEL: Record<WatchStatus, string> = {
  chua_cham: "Chưa chấm 5 lớp",
  chua_ket_luan: "Chưa kết luận",
  du_lieu_cu: "Điểm đã cũ",
  watching: "Đang quan sát",
  notable: "Đáng chú ý",
}

/** The real denominator: how many layers the system actually scored. `null` = unknown. */
export function soLopDaCham(item: Cap5WatchlistItem): number | null {
  if (item.consensus_da_cham != null) return item.consensus_da_cham
  if (item.lop_chi_tiet != null) return item.lop_chi_tiet.filter((row) => row.ung_ho != null || row.muc != null).length
  if (item.lop != null) return LOP_DEFS.filter((def) => item.lop?.[def.lop] != null).length
  return null
}

/** Never says "Đang quan sát" for a score that simply has not been computed. */
export function watchStatus(item: Cap5WatchlistItem): WatchStatus {
  const score = item.consensus_today
  if (score == null) return "chua_cham"
  if (item.consensus_het_han === true) return "du_lieu_cu"
  if (score >= NOTABLE_MIN_LOP) return "notable"
  const scored = soLopDaCham(item)
  if (scored == null) return "chua_ket_luan"
  const unknown = Math.max(0, TONG_SO_LOP - scored)
  if (score + unknown < NOTABLE_MIN_LOP) return "watching"
  return "chua_ket_luan"
}

export function describeConsensus(item: Cap5WatchlistItem): { text: string; canhBao: string | null } {
  if (item.consensus_today == null) return { text: "-/5", canhBao: "Chưa chấm 5 lớp cho mã này" }
  const scored = soLopDaCham(item)
  const unknown = scored == null ? null : Math.max(0, TONG_SO_LOP - scored)
  return {
    text: `${item.consensus_today.toLocaleString("vi-VN")}/${TONG_SO_LOP}`,
    canhBao: unknown != null && unknown > 0 ? `${unknown.toLocaleString("vi-VN")} lớp chưa có dữ liệu - chưa chấm đủ 5 lớp` : null,
  }
}

function formatSessionDate(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw
}

export function describeConsensusFreshness(item: Cap5WatchlistItem): string | null {
  const window = item.so_phien_hieu_luc != null ? ` trong ${item.so_phien_hieu_luc.toLocaleString("vi-VN")} phiên gần nhất` : " đủ mới"
  if (item.consensus_het_han === true) return `Điểm ${describeConsensus(item).text} đã cũ - chưa có bản phân tích mới${window}.`
  if (item.consensus_session_date) return `Điểm đồng thuận từ phiên ${formatSessionDate(item.consensus_session_date)}.`
  if (item.consensus_today == null && item.consensus_session_date_qua_han) {
    return `Bản phân tích gần nhất từ phiên ${formatSessionDate(item.consensus_session_date_qua_han)} đã quá cũ - chưa có bản mới${window}.`
  }
  return null
}

export type TrendTone = "up" | "down" | "flat" | "unknown"

export function describeConsensusTrend(item: Cap5WatchlistItem): { text: string; tone: TrendTone } {
  const now = item.consensus_today
  const prev = item.consensus_prev
  if (now == null) return { text: "chưa chấm lần nào", tone: "unknown" }
  if (prev == null) return { text: "chưa có phiên trước để so", tone: "unknown" }
  const head = `${prev}/${TONG_SO_LOP} → ${now}/${TONG_SO_LOP}`
  if (now > prev) return { text: `${head} (cải thiện)`, tone: "up" }
  if (now < prev) return { text: `${head} (yếu đi)`, tone: "down" }
  return { text: `${head} (đi ngang)`, tone: "flat" }
}

/** "Săn từ [bộ lọc] · N phiên trước" - missing data is stated, never invented. */
export function describeHuntSource(item: Cap5WatchlistItem): string {
  const ten = item.hunt_filter == null ? null : (item.hunt_filter_ten ?? huntFilterLabel(item.hunt_filter))
  const nguon = ten ? `Săn từ ${ten}` : "Thêm tay - không qua bộ lọc săn"
  if (item.so_phien_tu_khi_san != null) return `${nguon} · ${item.so_phien_tu_khi_san.toLocaleString("vi-VN")} phiên trước`
  const raw = item.hunt_at ?? item.added_at ?? null
  if (raw) {
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) return `${nguon} · thêm ngày ${date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`
  }
  return nguon
}

export type LopMark = "ok" | "bad" | "neu" | "unknown"

/** `ung_ho === false` is neutral-or-warning on the wire - it is never drawn as a warning. */
export function lopMarkFromUngHo(row: Cap5LopChiTiet | null): LopMark {
  if (row == null) return "unknown"
  if (row.muc != null) return row.muc
  if (row.ung_ho === true) return "ok"
  if (row.ung_ho === false) return "neu"
  return "unknown"
}

export function lopIconRow(item: Cap5WatchlistItem): { lop: string; mark: LopMark }[] {
  const rows = item.lop_chi_tiet
  return LOP_DEFS.map((def) => ({
    lop: def.lop,
    mark: rows != null ? lopMarkFromUngHo(rows.find((row) => row.lop === def.lop) ?? null) : ((item.lop?.[def.lop] ?? "unknown") as LopMark),
  }))
}

export function countWatchTabs(items: readonly Cap5WatchlistItem[]): { tatCa: number; dangChuY: number } {
  return { tatCa: items.length, dangChuY: items.filter((item) => watchStatus(item) === "notable").length }
}

/* ── Bot copy + wire helpers ───────────────────────────────────────────── */

export const RUN_COPY: Record<string, { label: string; text: string; tone: "muted" | "info" | "good" | "bad" }> = {
  idle: { label: "Đang chờ", text: "Bot đang chờ phiên giao dịch tiếp theo.", tone: "muted" },
  running: { label: "Đang xử lý", text: "Bot đang ghi nhận và đối soát dữ liệu phiên.", tone: "info" },
  succeeded: { label: "Đã xử lý", text: "Bot đã xử lý xong phiên. Trạng thái này không có nghĩa phiên có lãi.", tone: "good" },
  failed: { label: "Cần kiểm tra", text: "Bot chưa xử lý xong phiên. Dữ liệu hoặc sổ sách đang cần được kiểm tra.", tone: "bad" },
}

export const ACTION_COPY: Record<string, { label: string; tone: "good" | "bad" | "info" | "muted" | "warn" }> = {
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
  insufficient_supporting_layers: "Chưa đủ 3/5 lớp Ủng hộ",
  below_support_gate: "Chưa đủ 3/5 lớp Ủng hộ",
  missing_layers: "Thiếu dữ liệu năm lớp",
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
  hold_within_thresholds: "Giá đóng cửa vẫn nằm giữa mốc cắt lỗ và chốt lời",
  stop_loss: "Giá đóng cửa chạm hoặc xuống dưới cắt lỗ",
  take_profit: "Giá đóng cửa chạm hoặc vượt chốt lời",
}

export function formatFilter(id: string | null | undefined): string {
  if (!id) return "-"
  return FILTER_LABELS[id] ?? id
}

/** The server's `detail` wins; unknown codes print raw rather than a guess. */
export function formatReason(code: string | null | undefined, detail: string | null | undefined): string {
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
export function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const HUNT_TOP_NOTE = "Bấm “Theo dõi” để đưa mã vào danh sách quan sát - săn chưa phải là mua."
