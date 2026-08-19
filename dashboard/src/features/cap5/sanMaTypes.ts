/**
 * Cấp 5 «Lão luyện» — màn SĂN MÃ: hằng số tĩnh + hình dạng wire + helper THUẦN.
 *
 * ★★ LUẬT SỐ 1 CỦA REPO SỐNG Ở ĐÂY: "chưa biết" ≠ 0.
 * Một bộ lọc mà máy chủ CHƯA đủ dữ liệu để chạy KHÔNG được vẽ ra "0 mã" như
 * thể đã lọc xong. Vì vậy mọi trường đếm/tỷ lệ trên wire đều `| null`, và mọi
 * helper trong file này phân biệt ba trạng thái:
 *   · `kha_dung === false` → CHƯA ĐỦ DỮ LIỆU (kèm lý do do server nói)
 *   · `kha_dung === true` + `items.length === 0` → đã lọc thật, hôm nay không mã nào thỏa
 *   · `tong_so_ma === null` → server chạy được bộ lọc nhưng KHÔNG đếm được tổng
 *
 * ─── GIẢ ĐỊNH WIRE (BE làm song song, chưa chốt) ────────────────────────────
 * `GET /cap5/san-ma`        → `SanMaIndex`  (điều kiện lọc sàn + tình trạng 5 bộ lọc)
 * `GET /cap5/san-ma/{ma}`   → `HuntResult`  (top 10 + dòng minh bạch)
 * `POST /cap5/watchlist`    → thêm mã kèm nguồn săn
 * `GET /cap5/watchlist`     → `Cap5WatchlistItem[]`
 * Nếu BE chốt tên khác, ĐỔI Ở `sanMaApi.ts` — phần còn lại chỉ nói chuyện qua
 * các kiểu trong file này.
 *
 * Phần chữ TĨNH (tên bộ lọc, mô tả, điều kiện, cách xếp hạng) lấy nguyên văn
 * từ mockup `iqx-cap5-sanma.html` + spec §5.3 — đó là ĐỊNH NGHĨA sản phẩm, không
 * phải dữ liệu thị trường, nên hard-code là đúng.
 */

/** 5 bộ lọc săn mã (spec §5.3 · `hunt_filter` của bảng `watchlist`). */
export type HuntFilterKey = "ngoai" | "tudoanh" | "kl" | "dinh" | "tang"

export interface HuntFilterDef {
  ma: HuntFilterKey
  icon: string
  /** Tên hiện trên dòng bộ lọc. */
  ten: string
  /** Dòng mô tả ngắn dưới tên. */
  mo_ta: string
  /** Dòng điều kiện (mono, vàng) — nguyên văn mockup. */
  dieu_kien: string
  /** Khối định nghĩa nền vàng trong popup (spec §5.4). */
  dinh_nghia: string
  /** Mô tả top 10 trong dòng minh bạch: "hiện 10 {ghi_chu_top}". */
  ghi_chu_top: string
}

/** spec §5.3 + mockup `iqx-cap5-sanma.html` — đúng thứ tự, đúng chữ. */
export const HUNT_FILTERS: readonly HuntFilterDef[] = [
  {
    ma: "ngoai",
    icon: "💰",
    ten: "Khối ngoại gom",
    mo_ta: "Nước ngoài mua ròng nhiều tiền nhất",
    dieu_kien: "Mua ròng ≥3/5 phiên · tổng 5 phiên > 0",
    dinh_nghia:
      "Mã khối ngoại mua ròng ≥3/5 phiên gần nhất và tổng mua ròng 5 phiên dương. Xếp theo tổng giá trị mua ròng.",
    ghi_chu_top: "mã NN mua ròng mạnh nhất",
  },
  {
    ma: "tudoanh",
    icon: "🏦",
    ten: "Tự doanh gom",
    mo_ta: "Tự doanh CTCK mua ròng nhiều nhất",
    dieu_kien: "Mua ròng ≥3/5 phiên · tổng 5 phiên > 0",
    dinh_nghia:
      "Mã tự doanh CTCK mua ròng ≥3/5 phiên gần nhất và tổng mua ròng 5 phiên dương. Xếp theo tổng giá trị mua ròng.",
    ghi_chu_top: "mã tự doanh mua ròng mạnh nhất",
  },
  {
    ma: "kl",
    icon: "📊",
    ten: "Khối lượng đột biến",
    mo_ta: "Khối lượng bùng nổ so với thường ngày",
    dieu_kien: "KL phiên ≥2× trung bình 20 phiên",
    dinh_nghia:
      "Mã có khối lượng phiên gần nhất ≥2× trung bình 20 phiên. Xếp theo số lần vượt trung bình.",
    ghi_chu_top: "mã khối lượng bùng nổ mạnh nhất",
  },
  {
    ma: "dinh",
    icon: "🎯",
    ten: "Vượt đỉnh 20 phiên",
    mo_ta: "Giá vừa vượt đỉnh cao nhất gần đây",
    dieu_kien: "Giá đóng cửa > đỉnh 20 phiên trước",
    dinh_nghia:
      "Mã có giá đóng cửa vượt lên đỉnh cao nhất 20 phiên trước đó. Xếp theo % vượt đỉnh.",
    ghi_chu_top: "mã vượt đỉnh dứt khoát nhất",
  },
  {
    ma: "tang",
    icon: "📈",
    ten: "Tăng mạnh + KL cao",
    mo_ta: "Tăng giá mạnh kèm lực mua thật",
    dieu_kien: "Tăng ≥3% · KL ≥1,5× trung bình 20 phiên",
    dinh_nghia:
      "Mã tăng ≥3% trong phiên và khối lượng ≥1,5× trung bình 20 phiên. Xếp theo % tăng giá.",
    ghi_chu_top: "mã tăng mạnh nhất có thanh khoản",
  },
] as const

/** Tra nhanh định nghĩa một bộ lọc; `undefined` cho mã lạ (dữ liệu cũ/BE mới). */
export function huntFilterDef(ma: string | null | undefined): HuntFilterDef | undefined {
  return HUNT_FILTERS.find((f) => f.ma === ma)
}

/**
 * Tên bộ lọc để nhúng vào câu ("Săn từ …"). Mã lạ/thiếu KHÔNG được bịa thành
 * một bộ lọc có thật — trả `null` để chỗ gọi nói "không rõ bộ lọc".
 */
export function huntFilterLabel(ma: string | null | undefined): string | null {
  return huntFilterDef(ma)?.ten ?? null
}

/** Số mã tối đa một popup hiện (spec §5.4). Chỉ để VẼ; server mới là nơi cắt. */
export const HUNT_MAX_RESULTS = 10

/* ────────────────────────────── Wire shapes ────────────────────────────── */

/**
 * Một điều kiện của LỌC SÀN (spec §5.2). `ap_dung=false` nghĩa là máy chủ CHƯA
 * lọc được điều kiện này — phải nói thẳng, không được im lặng để user tin là
 * đã lọc (khảo sát Cấp 5: "diện cảnh báo/kiểm soát" và "GTGD TB/phiên" hiện
 * KHÔNG có trong backend).
 */
export interface LocSanDieuKien {
  ma: string
  ten: string
  ap_dung: boolean
}

/** Tình trạng một bộ lọc trong `GET /cap5/san-ma`. */
export interface HuntFilterStatus {
  ma: HuntFilterKey
  kha_dung: boolean
  /** Vì sao chưa chạy được — server nói, FE hiện nguyên văn. */
  ly_do_chua_kha_dung: string | null
}

/** `GET /cap5/san-ma` — dữ liệu cho MÀN săn mã (chưa mở popup nào). */
export interface SanMaIndex {
  loc_san: LocSanDieuKien[]
  bo_loc: HuntFilterStatus[]
}

/** Một dòng kết quả trong popup. `tin_hieu` là chuỗi thô do server dựng. */
export interface HuntItem {
  hang: number
  symbol: string
  tin_hieu: string
}

/** `GET /cap5/san-ma/{ma}` — kết quả một bộ lọc. */
export interface HuntResult {
  ma: HuntFilterKey
  kha_dung: boolean
  ly_do_chua_kha_dung: string | null
  /** Tổng số mã HOSE thỏa điều kiện. `null` = server KHÔNG đếm được (≠ 0). */
  tong_so_ma: number | null
  hien_thi_toi_da: number
  loc_san: LocSanDieuKien[]
  items: HuntItem[]
}

/* ─────────────────────────────── Helper thuần ──────────────────────────── */

/**
 * Tình trạng một bộ lọc, ba trạng thái:
 *   `true`  — chạy được
 *   `false` — CHƯA đủ dữ liệu (kèm `ly_do`)
 *   `null`  — chưa biết (chưa tải xong / server không nói gì về bộ lọc này)
 *
 * ★ `null` KHÔNG được quy về `true`: hiện một dòng bấm được rồi mở ra popup
 * rỗng chính là kiểu "giả vờ đã lọc xong" mà luật số 1 cấm.
 */
export function huntFilterAvailability(
  index: SanMaIndex | null | undefined,
  ma: HuntFilterKey,
): { kha_dung: boolean | null; ly_do: string | null } {
  if (!index) return { kha_dung: null, ly_do: null }
  const row = index.bo_loc.find((b) => b.ma === ma)
  if (!row) return { kha_dung: null, ly_do: null }
  return { kha_dung: row.kha_dung, ly_do: row.ly_do_chua_kha_dung ?? null }
}

/** Tách điều kiện lọc sàn thành "đã áp dụng" / "chưa áp dụng được". */
export function splitLocSan(loc_san: readonly LocSanDieuKien[] | null | undefined): {
  apDung: string[]
  chuaApDung: string[]
} {
  const apDung: string[] = []
  const chuaApDung: string[] = []
  for (const dk of loc_san ?? []) {
    ;(dk.ap_dung ? apDung : chuaApDung).push(dk.ten)
  }
  return { apDung, chuaApDung }
}

/**
 * Dòng minh bạch của popup (spec §5.4). KHÔNG bao giờ in một con số tổng mà
 * server không gửi.
 */
export function describeHuntTotal(result: HuntResult, def: HuntFilterDef): string {
  const hien = result.items.length
  if (result.tong_so_ma == null) {
    return `Chưa đếm được tổng số mã thỏa điều kiện · đang hiện ${hien.toLocaleString(
      "en-US",
    )} ${def.ghi_chu_top}`
  }
  return `${result.tong_so_ma.toLocaleString("en-US")} mã HOSE thỏa điều kiện · hiện ${hien.toLocaleString(
    "en-US",
  )} ${def.ghi_chu_top}`
}
