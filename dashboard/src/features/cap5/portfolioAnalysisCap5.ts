import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import {
  computeCap4PortfolioAnalysis,
  type Cap4PortfolioAnalysisResult,
} from "@/features/cap4/portfolioAnalysisCap4"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import {
  HUNT_FILTER_LABEL,
  HUNT_FILTER_ORDER,
  HUNT_FILTER_TEN,
  mucTieuSoMaMua,
  mucTieuSoMaSan,
  type Cap5PhanTich,
  type Cap5Progress,
  type HuntFilter,
  type Khoi12,
} from "./types"

/**
 * Cấp 5 Phân tích danh mục (spec `IQX-Cap5-Spec.md` §9) — pure compute.
 *
 * **Delegation, not duplication:** MỌI khối Cấp 1-4 (① hồ sơ, ② bảng 5 lý do, ③
 * vi phạm 30 ngày, ④ cửa sổ 20 lệnh, ⑤ điểm kỷ luật, ⑥ vi phạm theo tuần, ⑦ phát
 * hiện từ ghi chú, ⑦ tự tin, ⑧ khối lượng, ⑨ vũ khí/điểm mù, ⑩ đồng thuận vs
 * thắng, ⑪ góc nhìn riêng) đều do `computeCap4PortfolioAnalysis` tính (chính nó
 * delegate xuống Cấp 3 → Cấp 2 → Cấp 1). `Cap5TradeRecord extends
 * Cap4TradeRecord` nên mảng lệnh được truyền THẲNG xuống, không map/copy.
 *
 * ★★ **KHỐI ⑫ CŨ (ma trận 4 ô) ĐÃ NGHỈ HƯU** cùng toàn bộ Cấp 5 cũ, và khối ⑬
 * cũ ("nhật ký đứng ngoài") cũng vậy. Cấp 5 mới thêm ĐÚNG 2 khối, cả hai đo
 * bằng KẾT QUẢ THẬT (spec §9):
 *   - **⑫ Bộ lọc nào mang lại mã thắng nhiều nhất** — tỷ lệ thắng của các lệnh
 *     đã đóng theo từng `hunt_filter`, cần ≥`KHOI12_MIN_LENH` lệnh/bộ lọc.
 *   - **⑬ Kỷ luật săn mã (phễu 3 tầng)** — săn → chờ đủ lớp → vào lệnh.
 *
 * **Honesty over fake data (luật 1 của repo):**
 *  · ⑫ đọc **`GET /cap5/phan-tich`** — SERVER là nguồn duy nhất. Lệnh KHÔNG đến
 *    từ săn mã được server đếm RIÊNG (`so_lenh_khong_tu_san`) chứ không gán vào
 *    bộ lọc nào; bộ lọc dưới ngưỡng mẫu giữ nguyên số ĐẾM nhưng `ty_le_thang`
 *    là `null` — 1 lệnh thắng KHÔNG được in thành "100%".
 *  · ⑬ đọc 3 con số của `GET /cap5/progress` (authoritative, có backfill, và
 *    đúng bằng con số nuôi 2 nhiệm vụ). Tầng giữa `so_ma_cho_du_lop` là
 *    NULLABLE: chưa chạy mẻ chấm 5 lớp ⇒ "chưa đo được", không vẽ 0.
 *
 * ★★ **⑫ KHÔNG CÒN TÍNH TỪ NHẬT KÝ CLIENT** (`tradeLogCap5.ts`). Nhật ký đó là
 * **per-browser**: user đóng 6 lệnh từ «Khối lượng đột biến» trên laptop rồi mở
 * điện thoại sẽ thấy khối ① nói *"Bộ lọc mạnh nhất của bạn: «Khối lượng đột
 * biến»"* (server) và khối ⑫ cách đó ba dòng nói *"Chưa có lệnh nào đóng từ mã
 * bạn săn được"* (localStorage rỗng) — HAI CÂU MÂU THUẪN TRÊN CÙNG MỘT MÀN. Đây
 * đúng lớp lỗi Cấp 4 đã ghi cho khối ⑨ ("tính lại từ nhật ký localStorage sẽ
 * sinh ra một con số thứ hai, thấp hơn, mâu thuẫn với màn Hành trình"), nên ⑫ đi
 * theo cùng cách: đọc server, và khi query lỗi/đang tải thì NÓI THẲNG là chưa
 * lấy được số — fail-closed, KHÔNG đắp tạm bằng phép tính client.
 *
 * Vì thế `computeCap5Khoi12BoLoc(trades)` đã bị **GỠ HẲN** (không để lại dạng
 * optional/deprecated): còn một hàm tính ⑫ từ localStorage là còn đường để lỗi
 * đó quay lại — cùng lý do `cap2/types.ts` đã ghi khi gỡ trường chết.
 */

/**
 * Số lệnh tối thiểu của MỘT bộ lọc trước khi dám in tỷ lệ thắng của nó.
 * Spec §9 khối ⑫ viết thẳng: *"Cần ≥3 lệnh/bộ lọc mới hiện."*
 */
export const KHOI12_MIN_LENH = 3

/** Ngưỡng "hợp với bạn nhất" — spec §9 gắn nhãn này cho bộ lọc cao nhất. */
export const KHOI12_TOT_PCT = 60

/** Ngưỡng cảnh báo cho bộ lọc thấp nhất (mockup vẽ 38% ở nhóm đỏ). */
export const KHOI12_KEM_PCT = 45

/** §C12c — nói rõ con số của khối ⑫ đến từ đâu, đo cái gì và KHÔNG đo cái gì. */
const KHOI12_GIAI_THICH =
  "Chỉ tính các lệnh ĐÃ ĐÓNG có nguồn săn — tức mã bạn tìm ra bằng một bộ lọc rồi mới vào lệnh. " +
  "Lệnh bạn tự gõ mã không thuộc bộ lọc nào và được đếm riêng. Thắng = lệnh đóng có lãi; đóng " +
  `ngang giá 0% KHÔNG tính là thắng. Mỗi bộ lọc cần ít nhất ${KHOI12_MIN_LENH} lệnh đã đóng mới ` +
  "hiện tỷ lệ — dưới mức đó con số chỉ là may rủi, nên chỗ tỷ lệ để trống chứ không suy ra từ " +
  "một hai lệnh."

/** §C12c — phễu ⑬ đo cái gì, và vì sao tầng giữa có thể "chưa đo được". */
const KHOI13_GIAI_THICH =
  "Phễu đọc thẳng số liệu máy chủ: số mã bạn đã đưa vào Watchlist bằng bộ lọc, số mã trong đó " +
  "ĐANG ở mức ≥4/5 lớp ủng hộ theo hai lần chấm gần nhất, và số mã bạn thực sự vào lệnh. " +
  "Hệ KHÔNG lưu lược sử điểm đồng thuận, nên nó không biết một mã có TỪNG chín trước đó hay " +
  "không — kể cả mã bạn đã xoá khỏi Watchlist sau khi mua. Vì vậy tầng giữa thường là CẬN DƯỚI " +
  "(ghi «≥ N»), và khi chưa mã săn nào được chấm thì nó ghi «—» chứ không phải 0."

function round(n: number): number {
  return Math.round(n)
}

// ── Khối ⑫ — bộ lọc nào ra mã thắng nhiều nhất ───────────────────────────────

export interface Khoi12FilterRow {
  filter: HuntFilter
  /** "💰 Khối ngoại gom" — nhãn dùng chung với màn Săn mã. */
  label: string
  /** Tên trần (không icon) để nhét vào câu văn phát hiện. */
  ten: string
  soLenh: number
  soThang: number
  /** % thắng. `null` khi `soLenh < KHOI12_MIN_LENH` — KHÔNG suy tỷ lệ từ 1-2 lệnh. */
  tyLeThang: number | null
  /** Đã đủ mẫu để in tỷ lệ chưa. */
  duMau: boolean
  /** Còn thiếu bao nhiêu lệnh nữa mới đủ mẫu. `0` khi đã đủ. */
  conThieu: number
  /** Nhãn ngắn do SERVER gắn cho dòng này (VD "hợp với bạn nhất"). `null` = không có. */
  nhan: string | null
  /** Câu cảnh báo riêng do SERVER viết cho bộ lọc này. `null` ⇒ dùng bản lùi FE. */
  canhBaoRieng: string | null
}

export interface Cap5Khoi12BoLoc {
  /**
   * Máy chủ chưa trả được khối này (đang tải / lỗi).
   *
   * ★ FAIL-CLOSED: khi `true`, MỌI số ở trên là rỗng và UI phải nói thẳng "chưa
   * lấy được", KHÔNG được đắp tạm bằng phép tính từ nhật ký client — đó chính là
   * cái đã làm khối ① và khối ⑫ nói hai chuyện khác nhau trên cùng một màn.
   */
  chuaLayDuoc: boolean
  /** `true` khi query còn đang bay (khác với lỗi — câu chữ khác nhau). */
  dangTai: boolean
  /** Mọi bộ lọc user ĐÃ từng săn ra một lệnh đã đóng. Bộ lọc chưa dùng KHÔNG có dòng. */
  rows: Khoi12FilterRow[]
  /** Số lệnh đã đóng có nguồn săn. */
  soLenhSan: number
  /** Số lệnh đã đóng KHÔNG đến từ săn mã (user tự gõ mã). Hiện ra để không ai thắc mắc tổng. */
  soLenhKhongSan: number
  /** Ngưỡng mẫu do SERVER chốt (`so_lenh_toi_thieu`) — hằng số FE chỉ là bản lùi. */
  minLenh: number
  /** Bộ lọc tốt nhất trong nhóm ĐỦ MẪU. `null` khi chưa bộ lọc nào đủ mẫu. */
  best: Khoi12FilterRow | null
  /** Bộ lọc kém nhất trong nhóm ĐỦ MẪU — chỉ khác `best` khi có ≥2 bộ lọc đủ mẫu. */
  worst: Khoi12FilterRow | null
  /** Chưa bộ lọc nào đủ mẫu ⇒ không kết luận gì. */
  insufficient: boolean
  /** 1 dòng phát hiện (spec §9). `null` khi chưa đủ mẫu. */
  phatHien: string | null
  /** Phát hiện mang tính CẢNH BÁO (bộ lọc kém nhất dưới ngưỡng). */
  canhBao: boolean
  /** Trạng thái rỗng TRUNG THỰC kèm số còn thiếu. `null` khi đã đủ mẫu. */
  insufficientNote: string | null
  giaiThich: string
}

/** Câu cảnh báo riêng cho từng bộ lọc yếu — bản lùi khi server không gửi `canh_bao`. */
const KHOI12_CANH_BAO: Record<HuntFilter, string> = {
  ngoai: "khối ngoại có thể mua ròng vì cơ cấu quỹ chứ không vì mã tốt",
  tudoanh: "tự doanh gom có thể là nghiệp vụ phòng hộ, không phải đánh giá cơ bản",
  kl: "khối lượng đột biến dễ là sóng ngắn, cần cẩn thận hơn",
  dinh: "vượt đỉnh dễ gặp phiên phân phối ngay sau đó",
  tang: "tăng mạnh trong phiên dễ mua đúng đỉnh ngắn hạn",
}

/** Trạng thái query `GET /cap5/phan-tich` mà khối ⑫ phải phân biệt. */
export type Khoi12TrangThai = "dang_tai" | "loi" | "co_du_lieu"

/** Khung rỗng dùng cho cả hai nhánh fail-closed (đang tải / lỗi). */
function khoi12Rong(dangTai: boolean, note: string): Cap5Khoi12BoLoc {
  return {
    chuaLayDuoc: true,
    dangTai,
    rows: [],
    soLenhSan: 0,
    soLenhKhongSan: 0,
    minLenh: KHOI12_MIN_LENH,
    best: null,
    worst: null,
    insufficient: true,
    phatHien: null,
    canhBao: false,
    insufficientNote: note,
    giaiThich: KHOI12_GIAI_THICH,
  }
}

/**
 * Khối ⑫ (spec §9) — dựng VIEW MODEL từ `GET /cap5/phan-tich` `khoi_12`.
 *
 * Hàm THUẦN: server đưa số, hàm này chỉ sắp thứ tự + viết câu. Không một con số
 * nào được tính ở đây (`ty_le_thang`, `du_mau`, `so_lenh_khong_tu_san`,
 * `so_lenh_toi_thieu` đều của server).
 *
 * Thứ tự: nhóm ĐỦ MẪU trước (theo `ty_le_thang` giảm dần, hoà thì theo số lệnh
 * nhiều hơn, hoà nữa thì theo thứ tự bảng spec §5.3), rồi tới nhóm chưa đủ mẫu
 * (theo số lệnh giảm dần). Nhóm chưa đủ mẫu vẫn hiện — user cần thấy mình còn
 * thiếu bao nhiêu lệnh, đó là thông tin thật.
 */
export function viewCap5Khoi12BoLoc(
  khoi12: Khoi12 | null | undefined,
  trangThai: Khoi12TrangThai,
): Cap5Khoi12BoLoc {
  if (trangThai === "dang_tai") {
    return khoi12Rong(true, "Đang lấy số liệu bộ lọc từ máy chủ…")
  }
  if (trangThai === "loi" || khoi12 == null) {
    return khoi12Rong(
      false,
      "Chưa lấy được số liệu bộ lọc từ máy chủ. Khối này chỉ hiện số THẬT do máy chủ tính — " +
        "không suy ra từ nhật ký trên máy này, vì nhật ký đó chỉ có các lệnh bạn đóng trên đúng " +
        "thiết bị này.",
    )
  }

  const minLenh = khoi12.so_lenh_toi_thieu > 0 ? khoi12.so_lenh_toi_thieu : KHOI12_MIN_LENH
  const rows: Khoi12FilterRow[] = khoi12.items.map((it) => ({
    filter: it.ma,
    label: HUNT_FILTER_LABEL[it.ma] ?? it.ten,
    ten: it.ten || HUNT_FILTER_TEN[it.ma],
    soLenh: it.so_lenh,
    soThang: it.so_lenh_thang,
    // ★ `du_mau === false` ⇒ tỷ lệ về `null` kể cả khi server vẫn gửi một số:
    // hai trường phải không bao giờ nói ngược nhau trên màn.
    tyLeThang: it.du_mau && it.ty_le_thang != null ? round(it.ty_le_thang) : null,
    duMau: it.du_mau,
    conThieu: it.du_mau ? 0 : Math.max(0, minLenh - it.so_lenh),
    nhan: it.nhan ?? null,
    canhBaoRieng: it.canh_bao ?? null,
  }))

  const rank = (r: Khoi12FilterRow) => HUNT_FILTER_ORDER.indexOf(r.filter)
  rows.sort((a, b) => {
    if (a.duMau !== b.duMau) return a.duMau ? -1 : 1
    if (a.duMau && b.duMau) {
      const d = (b.tyLeThang ?? 0) - (a.tyLeThang ?? 0)
      if (d !== 0) return d
    }
    if (b.soLenh !== a.soLenh) return b.soLenh - a.soLenh
    return rank(a) - rank(b)
  })

  const soLenhSan = rows.reduce((n, r) => n + r.soLenh, 0)
  const duMauRows = rows.filter((r) => r.duMau)
  const base = {
    chuaLayDuoc: false,
    dangTai: false,
    rows,
    soLenhSan,
    soLenhKhongSan: khoi12.so_lenh_khong_tu_san,
    minLenh,
    giaiThich: khoi12.giai_thich || KHOI12_GIAI_THICH,
  }

  if (duMauRows.length === 0 || !khoi12.du_de_ket_luan) {
    const conThieuIt = rows.length > 0 ? Math.min(...rows.map((r) => r.conThieu)) : minLenh
    const note =
      soLenhSan === 0
        ? "Chưa có lệnh nào đóng từ mã bạn săn được. Khối này hiện sau khi bạn săn mã bằng bộ lọc, " +
          "vào lệnh, rồi đóng lệnh đó."
        : `Mới có ${soLenhSan.toLocaleString("en-US")} lệnh đã đóng từ săn mã, chưa bộ lọc nào đủ ` +
          `${minLenh} lệnh để nói được gì. Bộ lọc gần nhất còn thiếu ` +
          `${conThieuIt.toLocaleString("en-US")} lệnh.`
    return {
      ...base,
      best: null,
      worst: null,
      insufficient: true,
      phatHien: null,
      canhBao: false,
      insufficientNote: note,
    }
  }

  const best = duMauRows[0]
  const worst = duMauRows.length > 1 ? duMauRows[duMauRows.length - 1] : null
  const bestPct = best.tyLeThang ?? 0
  const worstPct = worst?.tyLeThang ?? null

  let phatHien: string
  let canhBao = false
  if (worst && worstPct != null && worstPct < KHOI12_KEM_PCT) {
    canhBao = true
    phatHien =
      `«${best.ten}» đang là bộ lọc hợp với bạn nhất — mã săn từ đây thắng ${bestPct}% ` +
      `(${best.soThang}/${best.soLenh} lệnh). Ngược lại «${worst.ten}» chỉ ${worstPct}% ` +
      `(${worst.soThang}/${worst.soLenh} lệnh): ` +
      `${worst.canhBaoRieng ?? KHOI12_CANH_BAO[worst.filter]}.`
  } else if (bestPct >= KHOI12_TOT_PCT) {
    phatHien =
      `«${best.ten}» đang là bộ lọc hợp với bạn nhất — mã săn từ đây thắng ${bestPct}% ` +
      `(${best.soThang}/${best.soLenh} lệnh). Đây là kết quả thật của riêng bạn, không phải đánh ` +
      "giá chung về bộ lọc."
  } else {
    phatHien =
      `Bộ lọc đứng đầu của bạn là «${best.ten}» với ${bestPct}% ` +
      `(${best.soThang}/${best.soLenh} lệnh) — chưa bộ lọc nào thắng quá ${KHOI12_TOT_PCT}%. ` +
      "Bộ lọc chỉ ra mã đáng xem; phần còn lại vẫn là bạn chọn thời điểm vào."
  }

  return {
    ...base,
    best,
    worst,
    insufficient: false,
    phatHien,
    canhBao,
    insufficientNote: null,
  }
}

// ── Khối ⑬ — kỷ luật săn mã (phễu 3 tầng) ────────────────────────────────────

export interface Khoi13Tang {
  ic: string
  label: string
  /** `null` = CHƯA ĐO ĐƯỢC (hiện "—"), tuyệt đối không phải 0. */
  value: number | null
}

/**
 * Tầng giữa phễu ⑬ — ★ BA trạng thái, không phải hai.
 *
 * · `chua_do`  — `so_ma_cho_du_lop == null`: hệ CHƯA chấm được mã săn nào ⇒ hiện
 *   "—", không được vẽ 0 (0 nghĩa là "đã đo, không mã nào chín").
 * · `can_duoi` — có số, nhưng mẫu số (`so_ma_da_cham_diem`) NHỎ HƠN số mã đã săn,
 *   hoặc wire chưa gửi mẫu số ⇒ con số chỉ là CẬN DƯỚI, phải nói "ít nhất N".
 * · `day_du`   — server khẳng định đã chấm hết mã săn ⇒ N là con số chắc chắn.
 *
 * ★ `undefined` mẫu số KHÔNG được quy về "đầy đủ": thiếu thông tin thì mặc định
 * là cận dưới, vì in N như số chắc chắn là khẳng định về những mã chưa ai chấm.
 */
export type TangGiuaTrangThai = "chua_do" | "can_duoi" | "day_du"

export interface Cap5TangGiua {
  trangThai: TangGiuaTrangThai
  /** Số mã đang ở ≥4/5 lớp. `null` ⇔ `trangThai === "chua_do"`. */
  value: number | null
  /** Mẫu số THẬT (số mã săn đã chấm được điểm). `null` = wire chưa gửi. */
  mauSo: number | null
  /** Tổng mã đã săn — mẫu số user tưởng là đang dùng. `null` khi chưa vào Cấp 5. */
  soMaDaSan: number | null
}

export interface Cap5Khoi13Pheu {
  tang: Khoi13Tang[]
  soMaDaSan: number | null
  /** `null` = mẻ chấm 5 lớp chưa chạy — xem `Cap5Progress#so_ma_cho_du_lop`. */
  soMaChoDuLop: number | null
  /** Trạng thái ĐẦY ĐỦ của tầng giữa (chưa đo / cận dưới / đủ). */
  tangGiua: Cap5TangGiua
  soMaVaoLenh: number | null
  /** % mã săn thực sự vào lệnh. `null` khi chưa săn mã nào (không chia cho 0). */
  tyLeVaoLenh: number | null
  phatHien: string | null
  insufficientNote: string | null
  giaiThich: string
}

/**
 * Đọc trạng thái tầng giữa từ hồ sơ Cấp 5. Chịu được CẢ hai hình dạng wire (có
 * hay chưa có `so_ma_da_cham_diem`/`so_ma_cho_du_lop_day_du`) — mặc định an toàn
 * là "cận dưới".
 */
export function tangGiuaCap5(progress: Cap5Progress | null): Cap5TangGiua {
  const soMaDaSan = progress ? progress.so_ma_da_san : null
  const value = progress ? progress.so_ma_cho_du_lop : null
  const mauSo = progress?.so_ma_da_cham_diem ?? null
  if (value == null) return { trangThai: "chua_do", value: null, mauSo, soMaDaSan }
  const dayDu =
    progress?.so_ma_cho_du_lop_day_du === true ||
    (mauSo != null && soMaDaSan != null && soMaDaSan > 0 && mauSo >= soMaDaSan)
  return { trangThai: dayDu ? "day_du" : "can_duoi", value, mauSo, soMaDaSan }
}

/** Nhãn tầng giữa cho phễu — "ít nhất N" khi con số chỉ là cận dưới. */
export function nhanTangGiua(tg: Cap5TangGiua): string {
  if (tg.trangThai === "chua_do" || tg.value == null) return "—"
  const n = tg.value.toLocaleString("en-US")
  return tg.trangThai === "day_du" ? n : `≥ ${n}`
}

/**
 * Khối ⑬ (spec §9) — phễu 3 tầng đọc THẲNG `GET /cap5/progress`.
 *
 * Phát hiện chỉ nói khi có đủ hai đầu phễu THẬT (đã săn ≥1 mã và biết số mã vào
 * lệnh). Câu mẫu spec đưa ("Bạn săn 34 mã nhưng chỉ vào 14 — biết chờ…") chỉ
 * đúng khi user THẬT SỰ có sàng lọc; nếu user mua gần hết số mã săn thì khen câu
 * đó là khen một việc họ không làm (luật 3), nên nhánh dưới nói thẳng điều ngược
 * lại.
 */
export function computeCap5Khoi13Pheu(progress: Cap5Progress | null): Cap5Khoi13Pheu {
  const soMaDaSan = progress ? progress.so_ma_da_san : null
  const soMaChoDuLop = progress ? progress.so_ma_cho_du_lop : null
  const soMaVaoLenh = progress ? progress.so_ma_mua_tu_watchlist : null
  const tangGiua = tangGiuaCap5(progress)

  const tang: Khoi13Tang[] = [
    { ic: "🔍", label: "Mã đã săn (đưa vào Watchlist)", value: soMaDaSan },
    { ic: "👀", label: "Đang ở ≥4/5 lớp ủng hộ", value: soMaChoDuLop },
    { ic: "✅", label: "Thực sự vào lệnh", value: soMaVaoLenh },
  ]

  const base = {
    tang,
    soMaDaSan,
    soMaChoDuLop,
    tangGiua,
    soMaVaoLenh,
    giaiThich: KHOI13_GIAI_THICH,
  }

  if (soMaDaSan == null || soMaVaoLenh == null) {
    return {
      ...base,
      tyLeVaoLenh: null,
      phatHien: null,
      insufficientNote:
        "Chưa đọc được số liệu săn mã của bạn — phễu sẽ hiện ngay khi bạn vào Cấp 5 và bắt đầu săn.",
    }
  }

  if (soMaDaSan === 0) {
    return {
      ...base,
      tyLeVaoLenh: null,
      phatHien: null,
      insufficientNote:
        `Bạn chưa săn mã nào. Mở màn Săn mã, bấm một bộ lọc rồi thêm mã vào Watchlist — mục tiêu ` +
        `nhiệm vụ ① là ${mucTieuSoMaSan(progress).toLocaleString("en-US")} mã.`,
    }
  }

  const tyLeVaoLenh = round((soMaVaoLenh / soMaDaSan) * 100)
  const soLoai = soMaDaSan - soMaVaoLenh
  const phatHien =
    soLoai > 0
      ? `Bạn săn ${soMaDaSan.toLocaleString("en-US")} mã nhưng chỉ vào ` +
        `${soMaVaoLenh.toLocaleString("en-US")} — loại ${soLoai.toLocaleString("en-US")} mã chưa ` +
        `chín (${tyLeVaoLenh}% số mã săn được vào lệnh). Đây là kỷ luật của thợ săn: săn nhiều, ` +
        "chọn kỹ, không mua vội mọi mã tìm được."
      : `Bạn săn ${soMaDaSan.toLocaleString("en-US")} mã và vào lệnh cả ` +
        `${soMaVaoLenh.toLocaleString("en-US")} mã — chưa loại mã nào. Watchlist đang là danh ` +
        "sách mua chứ chưa phải công cụ sàng lọc: hãy để mã chờ tới khi lên ≥4/5 lớp ủng hộ rồi " +
        "mới quyết định."

  return {
    ...base,
    tyLeVaoLenh,
    phatHien,
    insufficientNote: null,
  }
}

// ── top-level ────────────────────────────────────────────────────────────────

export interface Cap5PortfolioAnalysisResult extends Cap4PortfolioAnalysisResult {
  /** ⑫ Bộ lọc nào mang lại mã thắng nhiều nhất. */
  khoi12BoLoc: Cap5Khoi12BoLoc
  /** ⑬ Kỷ luật săn mã (phễu 3 tầng). */
  khoi13Pheu: Cap5Khoi13Pheu
  /** ① Số mã đã săn (server đếm). `null` khi chưa vào Cấp 5. */
  soMaDaSan: number | null
  /** ② Số mã săn đã vào lệnh (server đếm). `null` khi chưa vào Cấp 5. */
  soMaMuaTuWatchlist: number | null
  /** `best_filter` do server chốt. `null` = chưa đủ dữ liệu (KHÔNG phải "không có"). */
  bestFilterServer: HuntFilter | null
  /** Mốc nhiệm vụ — surface để UI không hard-code lại con số. */
  mucTieuSan: number
  mucTieuMua: number
}

/**
 * Phân tích danh mục Cấp 5 (spec §9) — 1 object gồm MỌI khối Cấp 1-4 (delegate
 * xuống `computeCap4PortfolioAnalysis`) + khối ⑫ + khối ⑬.
 *
 * `Cap5PortfolioAnalysis.tsx` render lại markup Cấp 1-4 bằng chính component
 * `Cap4PortfolioAnalysis` nên nó chỉ cần 2 hàm khối ở trên; hàm tổng này là API
 * cho consumer muốn 1 object duy nhất (và là bề mặt test của delegation) — cùng
 * quy ước Cấp 3/4 đã ghi.
 *
 * ★ `phanTich` = payload `GET /cap5/phan-tich` (khối ⑫ do SERVER tính). `null` =
 * chưa lấy được ⇒ khối ⑫ về trạng thái fail-closed "chưa lấy được số", KHÔNG
 * quay về tính từ `trades` (nhật ký per-browser — xem docstring đầu file).
 */
export function computeCap5PortfolioAnalysis(
  trades: Cap5TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[],
  cap2Progress: Cap2Progress | null,
  cap3Progress: Cap3Progress | null,
  cap4Progress: Cap4Progress | null,
  cap5Progress: Cap5Progress | null,
  now: Date = new Date(),
  phanTich: Cap5PhanTich | null = null,
): Cap5PortfolioAnalysisResult {
  const cap4Result = computeCap4PortfolioAnalysis(
    trades,
    dailyScores,
    cap2Progress,
    cap3Progress,
    cap4Progress,
    now,
  )

  return {
    ...cap4Result,
    khoi12BoLoc: viewCap5Khoi12BoLoc(
      phanTich?.khoi_12 ?? null,
      phanTich == null ? "loi" : "co_du_lieu",
    ),
    khoi13Pheu: computeCap5Khoi13Pheu(cap5Progress),
    soMaDaSan: cap5Progress?.so_ma_da_san ?? null,
    soMaMuaTuWatchlist: cap5Progress?.so_ma_mua_tu_watchlist ?? null,
    bestFilterServer: cap5Progress?.best_filter ?? null,
    // ★ Mốc nhiệm vụ đọc từ SERVER (`muc_tieu_so_ma_*`) qua helper — hằng số FE
    // chỉ là bản lùi BÊN TRONG helper. Trả thẳng hằng số ở đây là bỏ qua con số
    // server gửi: một lần BE đổi ngưỡng là mọi UI đọc object này in mẫu số sai.
    mucTieuSan: mucTieuSoMaSan(cap5Progress),
    mucTieuMua: mucTieuSoMaMua(cap5Progress),
  }
}
