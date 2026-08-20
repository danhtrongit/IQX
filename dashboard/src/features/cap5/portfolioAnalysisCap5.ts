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
  CAP5_SO_MA_MUA_TARGET,
  CAP5_SO_MA_SAN_TARGET,
  HUNT_FILTER_LABEL,
  HUNT_FILTER_ORDER,
  HUNT_FILTER_TEN,
  type Cap5Progress,
  type HuntFilter,
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
 *  · ⑫ đọc nhật ký client `tradeLogCap5.ts` (xem gap ghi ở đó). Lệnh KHÔNG đến
 *    từ săn mã (`huntFilter == null`, kể cả bản ghi cũ thiếu trường) được ĐẾM
 *    RIÊNG chứ không gán vào bộ lọc nào.
 *  · Bộ lọc dưới ngưỡng mẫu giữ nguyên số ĐẾM (nó thật) nhưng `tyLeThang` là
 *    `null` — 1 lệnh thắng KHÔNG được in thành "100%".
 *  · ⑬ đọc 3 con số của `GET /cap5/progress` (authoritative, có backfill, và
 *    đúng bằng con số nuôi 2 nhiệm vụ). Tầng giữa `so_ma_cho_du_lop` là
 *    NULLABLE: chưa chạy mẻ chấm 5 lớp ⇒ "chưa đo được", không vẽ 0.
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
  "từng lên ≥4/5 lớp ủng hộ, và số mã bạn thực sự vào lệnh. Điểm đồng thuận 5 lớp được chấm theo " +
  "mẻ 1 lần/ngày sau phiên, nên tầng giữa có thể chưa có số — khi đó nó ghi «chưa đo được», " +
  "không phải 0."

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
}

export interface Cap5Khoi12BoLoc {
  /** Mọi bộ lọc user ĐÃ từng săn ra một lệnh đã đóng. Bộ lọc chưa dùng KHÔNG có dòng. */
  rows: Khoi12FilterRow[]
  /** Số lệnh đã đóng có nguồn săn. */
  soLenhSan: number
  /** Số lệnh đã đóng KHÔNG đến từ săn mã (user tự gõ mã). Hiện ra để không ai thắc mắc tổng. */
  soLenhKhongSan: number
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

/** Câu cảnh báo riêng cho từng bộ lọc yếu — spec §9 gợi ý ví dụ cho `kl`. */
const KHOI12_CANH_BAO: Record<HuntFilter, string> = {
  ngoai: "khối ngoại có thể mua ròng vì cơ cấu quỹ chứ không vì mã tốt",
  tudoanh: "tự doanh gom có thể là nghiệp vụ phòng hộ, không phải đánh giá cơ bản",
  kl: "khối lượng đột biến dễ là sóng ngắn, cần cẩn thận hơn",
  dinh: "vượt đỉnh dễ gặp phiên phân phối ngay sau đó",
  tang: "tăng mạnh trong phiên dễ mua đúng đỉnh ngắn hạn",
}

/**
 * Khối ⑫ (spec §9) — tỷ lệ thắng theo từng bộ lọc đã săn ra lệnh, sắp GIẢM DẦN.
 *
 * Thứ tự: nhóm ĐỦ MẪU trước (theo `tyLeThang` giảm dần, hoà thì theo số lệnh
 * nhiều hơn, hoà nữa thì theo thứ tự bảng spec §5.3), rồi tới nhóm chưa đủ mẫu
 * (theo số lệnh giảm dần). Nhóm chưa đủ mẫu vẫn hiện — user cần thấy mình còn
 * thiếu bao nhiêu lệnh, đó là thông tin thật.
 */
export function computeCap5Khoi12BoLoc(trades: Cap5TradeRecord[]): Cap5Khoi12BoLoc {
  const daSan = trades.filter(
    (t): t is Cap5TradeRecord & { huntFilter: HuntFilter } => t.huntFilter != null,
  )
  const soLenhSan = daSan.length
  const soLenhKhongSan = trades.length - soLenhSan

  const rows: Khoi12FilterRow[] = []
  for (const filter of HUNT_FILTER_ORDER) {
    const cua = daSan.filter((t) => t.huntFilter === filter)
    if (cua.length === 0) continue
    const soThang = cua.filter((t) => t.pnlPct > 0).length
    const duMau = cua.length >= KHOI12_MIN_LENH
    rows.push({
      filter,
      label: HUNT_FILTER_LABEL[filter],
      ten: HUNT_FILTER_TEN[filter],
      soLenh: cua.length,
      soThang,
      tyLeThang: duMau ? round((soThang / cua.length) * 100) : null,
      duMau,
      conThieu: duMau ? 0 : KHOI12_MIN_LENH - cua.length,
    })
  }

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

  const duMauRows = rows.filter((r) => r.duMau)
  const base = {
    rows,
    soLenhSan,
    soLenhKhongSan,
    giaiThich: KHOI12_GIAI_THICH,
  }

  if (duMauRows.length === 0) {
    const conThieuIt = rows.length > 0 ? Math.min(...rows.map((r) => r.conThieu)) : KHOI12_MIN_LENH
    const note =
      soLenhSan === 0
        ? "Chưa có lệnh nào đóng từ mã bạn săn được. Khối này hiện sau khi bạn săn mã bằng bộ lọc, " +
          "vào lệnh, rồi đóng lệnh đó."
        : `Mới có ${soLenhSan.toLocaleString("en-US")} lệnh đã đóng từ săn mã, chưa bộ lọc nào đủ ` +
          `${KHOI12_MIN_LENH} lệnh để nói được gì. Bộ lọc gần nhất còn thiếu ` +
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
      `(${worst.soThang}/${worst.soLenh} lệnh): ${KHOI12_CANH_BAO[worst.filter]}.`
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

export interface Cap5Khoi13Pheu {
  tang: Khoi13Tang[]
  soMaDaSan: number | null
  /** `null` = mẻ chấm 5 lớp chưa chạy — xem `Cap5Progress#so_ma_cho_du_lop`. */
  soMaChoDuLop: number | null
  soMaVaoLenh: number | null
  /** % mã săn thực sự vào lệnh. `null` khi chưa săn mã nào (không chia cho 0). */
  tyLeVaoLenh: number | null
  phatHien: string | null
  insufficientNote: string | null
  giaiThich: string
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

  const tang: Khoi13Tang[] = [
    { ic: "🔍", label: "Mã đã săn (đưa vào Watchlist)", value: soMaDaSan },
    { ic: "👀", label: "Chờ đến khi ≥4/5 lớp ủng hộ", value: soMaChoDuLop },
    { ic: "✅", label: "Thực sự vào lệnh", value: soMaVaoLenh },
  ]

  const base = { tang, soMaDaSan, soMaChoDuLop, soMaVaoLenh, giaiThich: KHOI13_GIAI_THICH }

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
        `nhiệm vụ ① là ${CAP5_SO_MA_SAN_TARGET.toLocaleString("en-US")} mã.`,
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
 */
export function computeCap5PortfolioAnalysis(
  trades: Cap5TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[],
  cap2Progress: Cap2Progress | null,
  cap3Progress: Cap3Progress | null,
  cap4Progress: Cap4Progress | null,
  cap5Progress: Cap5Progress | null,
  now: Date = new Date(),
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
    khoi12BoLoc: computeCap5Khoi12BoLoc(trades),
    khoi13Pheu: computeCap5Khoi13Pheu(cap5Progress),
    soMaDaSan: cap5Progress?.so_ma_da_san ?? null,
    soMaMuaTuWatchlist: cap5Progress?.so_ma_mua_tu_watchlist ?? null,
    bestFilterServer: cap5Progress?.best_filter ?? null,
    mucTieuSan: CAP5_SO_MA_SAN_TARGET,
    mucTieuMua: CAP5_SO_MA_MUA_TARGET,
  }
}
