import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import { lopLabelCap4 } from "@/features/cap4/coachTemplateCap4"
import { LOP_KEYS } from "@/features/cap4/doc5Lop"
import type { Cap4Progress } from "@/features/cap4/types"
import {
  computeCap5PortfolioAnalysis,
  type Cap5PortfolioAnalysisResult,
} from "@/features/cap5/portfolioAnalysisCap5"
import type { Cap5Progress } from "@/features/cap5/types"
import type { Cap6TradeRecord } from "./tradeLogCap6"
import {
  KIEU_OPTIONS,
  type Cap6Progress,
  type KieuCoPhieu,
  type Lop,
  type NhomDoiChieuCap6,
} from "./types"

/**
 * Cấp 6 Phân tích danh mục (spec `IQX-Cap6-Spec.md` §7) — pure compute.
 *
 * **Delegation, not duplication:** MỌI khối Cấp 1-5 (①-⑬) do
 * `computeCap5PortfolioAnalysis` tính (chính nó delegate xuống Cấp 4 → 3 → 2 →
 * 1). `Cap6TradeRecord extends Cap5TradeRecord` nên mảng lệnh được truyền THẲNG
 * xuống, không map/copy.
 *
 * Cấp 6 chỉ THÊM 2 khối:
 *   - **⑭ Lớp nào đúng cho kiểu nào** — ma trận (kiểu × lớp quyết định) → tỷ lệ
 *     thắng. Tính từ nhật ký client (`tradeLogCap6.ts`) vì BE Cấp 6 không có
 *     endpoint liệt kê từng lệnh. **Một ô cần ≥3 lệnh đã đóng mới được gán
 *     nhãn**; dưới ngưỡng chỉ hiện số đếm (spec §7 "Cần ≥3 lệnh/ô mới hiện nhãn").
 *   - **⑮ Đối chiếu có giúp không** — so tỷ lệ thắng nhóm `khop_goi_y=true` vs
 *     `=false`. **Số ĐẾN TỪ SERVER** (`GET /cap6/thach-thuc` → `nhom_khop` /
 *     `nhom_lech`): đó là chính con số nuôi nhiệm vụ ③, được ghép lệnh mua-bán
 *     server-side và có sẵn cờ `du_du_lieu` cho ngưỡng ≥3 lệnh/nhóm. Tính lại ở
 *     client sẽ sinh MỘT con số thứ hai, lệch, và có thể mâu thuẫn với widget
 *     Thách thức — cùng tiền lệ khối ⑬ của Cấp 5 và khối ⑨ của Cấp 4. Hàm dưới
 *     chỉ thêm 1 dòng PHÁT HIỆN từ hai con số đó.
 *
 * ★★ **Trung thực CẢ HAI CHIỀU ở khối ⑮.** Nếu nhóm khớp KHÔNG thắng hơn nhóm
 * lệch thì khối nói thẳng ra ("với dữ liệu của bạn, đi theo gợi ý chưa cho kết quả
 * tốt hơn") và chỉ user về khối ⑭ để tìm mẫu riêng — KHÔNG bào chữa cho bảng trọng
 * số. Bảng trọng số là gợi ý khởi điểm (spec §5), trọng tài là kết quả thật.
 *
 * ★ **Lệch gợi ý KHÔNG BAO GIỜ là "sai"** — không nhánh nào ở đây gọi nó như vậy,
 * không nhánh nào loại nó khỏi một con số, và `khop_goi_y === null` (kiểu chưa
 * phân loại) KHÔNG vào nhóm nào cả (server đã làm đúng thế, client giữ nguyên).
 */

/** Số lệnh đã đóng tối thiểu của MỘT ô ⑭ trước khi ô đó được gán nhãn (spec §7). */
export const KHOI14_MIN_LENH_MOI_O = 3

/** Số lệnh đã đóng tối thiểu MỖI NHÓM ở ⑮ — mirror BE's `MIN_LENH_MOI_NHOM`. */
export const KHOI15_MIN_LENH_MOI_NHOM = 3

/**
 * Khoảng cách (điểm %) để coi "khớp hơn lệch" là RÕ RỆT — spec §7 viết thẳng
 * "nếu khớp > lệch ≥15%". Dưới ngưỡng mà vẫn hơn thì khối nói là khoảng cách còn
 * nhỏ, KHÔNG tuyên bố gợi ý đang giúp.
 */
export const KHOI15_DELTA_RO_RANG = 15

function round(n: number): number {
  return Math.round(n)
}

/** "🏦 Ngân hàng" — icon + tên kiểu, cùng bộ nhãn `KIEU_OPTIONS` của panel. */
function kieuLabel(kieu: KieuCoPhieu): string {
  const opt = KIEU_OPTIONS.find((o) => o.value === kieu)
  return opt ? `${opt.icon} ${opt.label}` : kieu
}

// ── Khối ⑭ — lớp nào đúng cho kiểu nào ──────────────────────────────────────

export interface Khoi14Cell {
  kieu: KieuCoPhieu
  lop: Lop
  /** "🏦 Ngân hàng" / "💎 Định giá" — nhãn hiển thị, dùng chung với panel. */
  kieuTen: string
  lopTen: string
  soLenh: number
  soThang: number
  /** % thắng. `null` khi ô CHƯA đủ `KHOI14_MIN_LENH_MOI_O` lệnh (không suy diễn). */
  tyLeThang: number | null
  duDuLieu: boolean
  /** Chuỗi hiển thị của ô: tỷ lệ khi đủ dữ liệu, "chưa đủ dữ liệu (n lệnh)" khi chưa. */
  nhan: string
}

export interface Cap6Khoi14LopTheoKieu {
  /** Các kiểu user ĐÃ gặp (có ≥1 lệnh đối chiếu), theo thứ tự bảng spec §5. */
  kieuDaGap: KieuCoPhieu[]
  /** Chỉ những ô có ≥1 lệnh, theo thứ tự kiểu × `LOP_KEYS`. */
  cells: Khoi14Cell[]
  /** Số lệnh đã đóng CÓ đi qua bước Đối chiếu (có `lopQuyetDinh`). */
  soLenhCoDoiChieu: number
  /** Lệnh có đối chiếu nhưng kiểu "chưa phân loại" — đếm RIÊNG, không gộp ô nào. */
  soLenhChuaPhanLoaiKieu: number
  /** Số ô đã đủ ngưỡng để gán nhãn. */
  oDuDuLieu: number
  /** 1 dòng phát hiện về ô mạnh nhất. `null` khi chưa ô nào đủ dữ liệu. */
  phatHien: string | null
  insufficientNote: string | null
  giaiThich: string
}

/** §C12c — nói rõ mỗi ô là gì, số đến từ đâu và ngưỡng nào mới dám gán nhãn. */
const KHOI14_GIAI_THICH =
  "Mỗi ô = kiểu cổ phiếu (hệ suy ra từ NGÀNH của mã lúc bạn đặt lệnh) × lớp quyết định bạn đã tin " +
  "ở bước Đối chiếu. Tỷ lệ thắng = số lệnh đã đóng có lãi / tổng số lệnh của ô đó (lệnh đóng ngang " +
  `giá 0% tính là thua). Số đọc từ nhật ký lệnh đã đóng trên máy này. Một ô cần ít nhất ${KHOI14_MIN_LENH_MOI_O} ` +
  "lệnh mới được gán nhãn — dưới ngưỡng đó khối chỉ hiện số đếm, vì 1-2 lệnh chưa phân biệt được mẫu " +
  "với ngẫu nhiên."

/**
 * Khối ⑭ (spec §7) — ma trận kiểu × lớp quyết định, và 1 dòng phát hiện về ô
 * mạnh nhất TRONG SỐ CÁC Ô ĐỦ DỮ LIỆU.
 *
 * ★ Lệnh không có đối chiếu (`lopQuyetDinh == null`) bị loại hoàn toàn: nó chưa
 * bao giờ đi qua bước này. Lệnh CÓ đối chiếu nhưng kiểu `null` ("chưa phân loại")
 * được đếm riêng — gộp nó vào một kiểu nào đó là bịa.
 */
export function computeCap6Khoi14LopTheoKieu(
  trades: Cap6TradeRecord[],
): Cap6Khoi14LopTheoKieu {
  const coDoiChieu = trades.filter(
    (t): t is Cap6TradeRecord & { lopQuyetDinh: Lop } => t.lopQuyetDinh != null,
  )
  const soLenhCoDoiChieu = coDoiChieu.length
  const daPhanLoaiKieu = coDoiChieu.filter(
    (t): t is Cap6TradeRecord & { lopQuyetDinh: Lop; kieuCoPhieu: KieuCoPhieu } =>
      t.kieuCoPhieu != null,
  )
  const soLenhChuaPhanLoaiKieu = soLenhCoDoiChieu - daPhanLoaiKieu.length

  const buckets = new Map<string, { soLenh: number; soThang: number }>()
  for (const t of daPhanLoaiKieu) {
    const key = `${t.kieuCoPhieu}|${t.lopQuyetDinh}`
    const bucket = buckets.get(key) ?? { soLenh: 0, soThang: 0 }
    bucket.soLenh += 1
    // Win rule mirrors the BE (`order_ketso.pnl_pct > 0`): 0% is a loss.
    if (t.pnlPct > 0) bucket.soThang += 1
    buckets.set(key, bucket)
  }

  const kieuDaGap = KIEU_OPTIONS.map((o) => o.value).filter((kieu) =>
    daPhanLoaiKieu.some((t) => t.kieuCoPhieu === kieu),
  )

  const cells: Khoi14Cell[] = []
  for (const kieu of kieuDaGap) {
    for (const lop of LOP_KEYS) {
      const bucket = buckets.get(`${kieu}|${lop}`)
      if (!bucket || bucket.soLenh === 0) continue
      const duDuLieu = bucket.soLenh >= KHOI14_MIN_LENH_MOI_O
      const tyLeThang = duDuLieu ? round((bucket.soThang / bucket.soLenh) * 100) : null
      cells.push({
        kieu,
        lop,
        kieuTen: kieuLabel(kieu),
        lopTen: lopLabelCap4(lop),
        soLenh: bucket.soLenh,
        soThang: bucket.soThang,
        tyLeThang,
        duDuLieu,
        nhan: duDuLieu
          ? `${tyLeThang}% (${bucket.soThang}/${bucket.soLenh} lệnh)`
          : `chưa đủ dữ liệu (${bucket.soLenh} lệnh)`,
      })
    }
  }

  const duDuLieuCells = cells.filter((c) => c.duDuLieu)
  const oDuDuLieu = duDuLieuCells.length

  let phatHien: string | null = null
  if (oDuDuLieu > 0) {
    // Ô mạnh nhất: tỷ lệ thắng cao nhất, hoà thì nhiều lệnh hơn, hoà nữa thì giữ
    // thứ tự kiểu × lớp chuẩn (so sánh CHẶT nên phần tử trước thắng).
    let best = duDuLieuCells[0]
    for (const cell of duDuLieuCells) {
      if (
        (cell.tyLeThang ?? 0) > (best.tyLeThang ?? 0) ||
        ((cell.tyLeThang ?? 0) === (best.tyLeThang ?? 0) && cell.soLenh > best.soLenh)
      ) {
        best = cell
      }
    }
    phatHien =
      `Với ${best.kieuTen}, khi bạn tin ${best.lopTen} thì thắng ${best.soThang}/${best.soLenh} ` +
      `lệnh (${best.tyLeThang}%). Đó là mẫu RIÊNG của bạn trên ${best.soLenh} lệnh, không phải một ` +
      `quy luật của thị trường.`
  }

  let insufficientNote: string | null = null
  if (oDuDuLieu === 0) {
    insufficientNote =
      soLenhCoDoiChieu === 0
        ? "Chưa có lệnh đối chiếu nào đã đóng — bảng này hiện sau khi bạn đóng lệnh có mâu thuẫn 5 " +
          `lớp. Mỗi ô cần ít nhất ${KHOI14_MIN_LENH_MOI_O} lệnh mới có nhãn tỷ lệ thắng.`
        : `Chưa ô nào đủ ${KHOI14_MIN_LENH_MOI_O} lệnh để gán nhãn (đã có ${soLenhCoDoiChieu} lệnh ` +
          "đối chiếu đã đóng, nhưng còn rải ra nhiều ô). Trên 1-2 lệnh thì tỷ lệ thắng chưa nói được gì."
  }

  return {
    kieuDaGap,
    cells,
    soLenhCoDoiChieu,
    soLenhChuaPhanLoaiKieu,
    oDuDuLieu,
    phatHien,
    insufficientNote,
    giaiThich: KHOI14_GIAI_THICH,
  }
}

// ── Khối ⑮ — đối chiếu có giúp không ────────────────────────────────────────

/** Một nhóm của khối ⑮ — view-model của server's `NhomDoiChieuCap6`. */
export interface Khoi15Nhom {
  ten: string
  soLenh: number
  soThang: number
  /** `null` khi nhóm chưa đủ `soLenhToiThieu` lệnh (server đã quyết, client giữ). */
  tyLeThang: number | null
  duDuLieu: boolean
  soLenhToiThieu: number
  /** Câu giải thích của server — render NGUYÊN VĂN (§C12c). `null` khi chưa tải. */
  giaiThichServer: string | null
}

export interface Cap6Khoi15DoiChieu {
  khop: Khoi15Nhom
  lech: Khoi15Nhom
  /**
   * ★ ĐÃ LẤY ĐƯỢC payload của server hay chưa — KHÁC HẲN `duCa2Nhom`.
   *
   * `false` = `GET /cap6/thach-thuc` chưa tải được/lỗi, nên MỌI con số trong
   * `khop`/`lech` chỉ là giá trị mặc định của `toNhom` (0/0, `tyLeThang: null`).
   * Tầng render PHẢI dùng cờ này để ẩn hẳn 2 ô nhóm: `0/0 lệnh đã đóng` in ra
   * cạnh câu "chưa lấy được số" là một lời khẳng định về người dùng mà không ai
   * có cơ sở để nói — và một người có 8 lệnh khớp thắng 6 sẽ đọc thấy mình 0/0.
   */
  coSoLieuServer: boolean
  /** Cả 2 nhóm đủ lệnh để so. `false` → KHÔNG kết luận gì. */
  duCa2Nhom: boolean
  /** Điểm % khớp − lệch. `null` khi chưa so được. */
  delta: number | null
  /** 1 dòng phát hiện, trung thực cả hai chiều. `null` khi chưa đủ dữ liệu. */
  phatHien: string | null
  /**
   * Nhóm khớp KHÔNG thắng hơn nhóm lệch → khối nói thẳng ra. Đây KHÔNG phải lỗi
   * của user; nó là một phát hiện về bảng trọng số gợi ý.
   */
  goiYChuaGiupIch: boolean
  thieuDuLieuNote: string | null
  giaiThich: string
}

/** §C12c — hai nhóm là gì, số đến từ đâu, và ngưỡng nào mới dám so. */
const KHOI15_GIAI_THICH =
  "Hai nhóm gồm các lệnh CÓ đối chiếu đã đóng, chia theo lớp bạn quyết định tin có nằm trong nhóm " +
  "gợi ý của kiểu cổ phiếu đó (khớp) hay không (lệch). Tỷ lệ thắng = số lệnh có lãi / số lệnh của " +
  "nhóm, do hệ thống ghép lệnh mua-bán và tính — đây chính là con số nuôi nhiệm vụ ③, nên khối này " +
  `đọc thẳng từ hệ thống chứ không tính lại. Mỗi nhóm cần ít nhất ${KHOI15_MIN_LENH_MOI_NHOM} lệnh ` +
  "mới được so. Lệch gợi ý là một sự thật TRUNG TÍNH: bảng trọng số chỉ là gợi ý khởi điểm, trọng " +
  "tài cuối là chính hai con số ở đây."

function toNhom(
  nhom: NhomDoiChieuCap6 | null | undefined,
  fallbackTen: string,
): Khoi15Nhom {
  return {
    ten: nhom?.ten ?? fallbackTen,
    soLenh: nhom?.so_lenh ?? 0,
    soThang: nhom?.so_thang ?? 0,
    tyLeThang: nhom?.ty_le_thang ?? null,
    duDuLieu: nhom?.du_du_lieu ?? false,
    soLenhToiThieu: nhom?.so_lenh_toi_thieu ?? KHOI15_MIN_LENH_MOI_NHOM,
    giaiThichServer: nhom?.giai_thich ?? null,
  }
}

/** "40% (2/5 lệnh)". */
function fmtNhom(n: Khoi15Nhom): string {
  return `${round(n.tyLeThang ?? 0)}% (${n.soThang}/${n.soLenh} lệnh)`
}

/**
 * Khối ⑮ (spec §7) — 1 dòng phát hiện trên HAI con số của server.
 *
 * Thứ tự nhánh:
 *  1. Thiếu dữ liệu (chưa tải được, hoặc một nhóm <3 lệnh) → KHÔNG kết luận, nói
 *     rõ còn cần thêm bao nhiêu lệnh.
 *  2. Khớp hơn lệch ≥ `KHOI15_DELTA_RO_RANG` → "đối chiếu theo kiểu đang giúp".
 *  3. Khớp hơn nhưng chưa tới ngưỡng → nói khoảng cách còn nhỏ, chưa kết luận.
 *  4. Bằng nhau → chưa thấy khác biệt.
 *  5. Khớp THẤP HƠN lệch → nói thẳng gợi ý chưa cho kết quả tốt hơn + chỉ về ⑭.
 *
 * Nhánh 5 KHÔNG được làm nhẹ đi: im lặng để bảo vệ bảng trọng số sẽ là xu nịnh,
 * và spec §7 yêu cầu "trung thực, không xu nịnh".
 */
export function computeCap6Khoi15DoiChieu(
  nhomKhop: NhomDoiChieuCap6 | null | undefined,
  nhomLech: NhomDoiChieuCap6 | null | undefined,
): Cap6Khoi15DoiChieu {
  const khop = toNhom(nhomKhop, "Khớp gợi ý")
  const lech = toNhom(nhomLech, "Lệch gợi ý")
  const chuaTai = nhomKhop == null && nhomLech == null
  const base = {
    khop,
    lech,
    coSoLieuServer: !chuaTai,
    giaiThich: KHOI15_GIAI_THICH,
  }

  const duCa2Nhom =
    !chuaTai && khop.duDuLieu && lech.duDuLieu && khop.tyLeThang != null && lech.tyLeThang != null

  if (!duCa2Nhom) {
    const thieuKhop = Math.max(0, khop.soLenhToiThieu - khop.soLenh)
    const thieuLech = Math.max(0, lech.soLenhToiThieu - lech.soLenh)
    const canThem = [
      thieuKhop > 0 ? `${thieuKhop} lệnh ở nhóm khớp gợi ý` : null,
      thieuLech > 0 ? `${thieuLech} lệnh ở nhóm lệch` : null,
    ].filter((s): s is string => s != null)
    return {
      ...base,
      duCa2Nhom: false,
      delta: null,
      phatHien: null,
      goiYChuaGiupIch: false,
      thieuDuLieuNote: chuaTai
        ? "Chưa lấy được số khớp/lệch từ hệ thống. Khối này chỉ hiện con số do hệ thống ghép lệnh " +
          "mua-bán rồi tính — sẽ hiện lại khi tải được, chứ không đắp tạm bằng phép tính trên máy này."
        : `Nhóm khớp gợi ý có ${khop.soLenh} lệnh đã đóng, nhóm lệch có ${lech.soLenh} — mỗi nhóm ` +
          `cần ít nhất ${KHOI15_MIN_LENH_MOI_NHOM} lệnh mới so được.` +
          (canThem.length > 0 ? ` Cần thêm ${canThem.join(" và ")}.` : ""),
    }
  }

  const delta = round(khop.tyLeThang as number) - round(lech.tyLeThang as number)

  if (delta >= KHOI15_DELTA_RO_RANG) {
    return {
      ...base,
      duCa2Nhom: true,
      delta,
      goiYChuaGiupIch: false,
      phatHien:
        `Đối chiếu theo kiểu đang giúp bạn chọn đúng lớp: nhóm khớp gợi ý thắng ${fmtNhom(khop)} ` +
        `so với nhóm lệch ${fmtNhom(lech)} — cách nhau ${delta} điểm %.`,
      thieuDuLieuNote: null,
    }
  }

  if (delta > 0) {
    return {
      ...base,
      duCa2Nhom: true,
      delta,
      goiYChuaGiupIch: false,
      phatHien:
        `Nhóm khớp gợi ý đang thắng nhiều hơn (${fmtNhom(khop)} so với ${fmtNhom(lech)}) nhưng ` +
        `khoảng cách ${delta} điểm % còn nhỏ — chưa đủ để coi là một mẫu. Cần thêm lệnh ở cả hai nhóm.`,
      thieuDuLieuNote: null,
    }
  }

  if (delta === 0) {
    return {
      ...base,
      duCa2Nhom: true,
      delta,
      goiYChuaGiupIch: false,
      phatHien:
        `Hai nhóm bằng nhau (${fmtNhom(khop)} so với ${fmtNhom(lech)}) — với dữ liệu của bạn, ` +
        "chưa thấy khác biệt giữa đi theo gợi ý và tự tin lớp khác.",
      thieuDuLieuNote: null,
    }
  }

  return {
    ...base,
    duCa2Nhom: true,
    delta,
    goiYChuaGiupIch: true,
    phatHien:
      `Với dữ liệu của bạn, đi theo gợi ý chưa cho kết quả tốt hơn: nhóm khớp gợi ý thắng ` +
      `${fmtNhom(khop)}, nhóm lệch ${fmtNhom(lech)}. Bảng trọng số chỉ là gợi ý khởi điểm — ` +
      "xem khối ⑭ để tìm mẫu riêng của bạn.",
    thieuDuLieuNote: null,
  }
}

// ── top-level ────────────────────────────────────────────────────────────────

export interface Cap6PortfolioAnalysisResult extends Cap5PortfolioAnalysisResult {
  /** ⑭ Lớp nào đúng cho kiểu nào. */
  khoi14LopTheoKieu: Cap6Khoi14LopTheoKieu
  /** ⑮ Đối chiếu có giúp không. */
  khoi15DoiChieu: Cap6Khoi15DoiChieu
  /** ③ đk 1 — số lệnh đối chiếu do SERVER đếm. `null` khi chưa vào Cấp 6. */
  soLenhDoiChieuServer: number | null
  /** ③ đk 2 — số kiểu cổ phiếu đã gặp, do SERVER đếm. */
  soKieuDaGapServer: number | null
  /** ③ đk 3 — % thắng nhóm khớp, SERVER chốt trên `cap6_progress`. */
  tyLeThangKhopServer: number | null
  /** ③ đk 3 — % thắng nhóm lệch. ★ Một sự thật trung tính, không phải điểm trừ. */
  tyLeThangLechServer: number | null
}

/**
 * Phân tích danh mục Cấp 6 (spec §7) — 1 object gồm MỌI khối Cấp 1-5 (delegate
 * xuống `computeCap5PortfolioAnalysis`) + ⑭ + ⑮ + 4 số server.
 *
 * `Cap6PortfolioAnalysis.tsx` render lại markup Cấp 1-5 bằng chính component
 * `Cap5PortfolioAnalysis` nên nó chỉ cần 2 hàm khối ở trên; hàm tổng này là API
 * cho consumer muốn 1 object duy nhất (và là bề mặt test của delegation) — cùng
 * quy ước Cấp 3/4/5 đã ghi.
 *
 * ★ KHỐI ⑫ (Cấp 5) ở object này LUÔN ở trạng thái "chưa lấy được số": nó chỉ
 * được nói bằng số của `GET /cap5/phan-tich`, và hàm tổng này không mang theo
 * payload đó. Đường LIVE là component `Cap5PortfolioAnalysis` (tự gọi
 * `useCap5PhanTich`). ĐỪNG "chữa" bằng cách cho ⑫ tính lại từ `trades`: nhật ký
 * đó per-browser và sẽ mâu thuẫn với khối ① ngay trên cùng một màn.
 */
export function computeCap6PortfolioAnalysis(
  trades: Cap6TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[],
  cap2Progress: Cap2Progress | null,
  cap3Progress: Cap3Progress | null,
  cap4Progress: Cap4Progress | null,
  cap5Progress: Cap5Progress | null,
  cap6Progress: Cap6Progress | null,
  nhomDoiChieu: {
    khop: NhomDoiChieuCap6 | null
    lech: NhomDoiChieuCap6 | null
  } | null,
  now: Date = new Date(),
): Cap6PortfolioAnalysisResult {
  const cap5Result = computeCap5PortfolioAnalysis(
    trades,
    dailyScores,
    cap2Progress,
    cap3Progress,
    cap4Progress,
    cap5Progress,
    now,
  )

  return {
    ...cap5Result,
    khoi14LopTheoKieu: computeCap6Khoi14LopTheoKieu(trades),
    khoi15DoiChieu: computeCap6Khoi15DoiChieu(
      nhomDoiChieu?.khop ?? null,
      nhomDoiChieu?.lech ?? null,
    ),
    soLenhDoiChieuServer: cap6Progress?.so_lenh_doi_chieu ?? null,
    soKieuDaGapServer: cap6Progress?.so_kieu_da_gap ?? null,
    tyLeThangKhopServer: cap6Progress?.ty_le_thang_khop ?? null,
    tyLeThangLechServer: cap6Progress?.ty_le_thang_lech ?? null,
  }
}
