import {
  VI_PHAM_LOAI_LABELS,
  type Cap2DailyScoreRecord,
  type ViPhamLoai,
} from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import {
  computeCap4PortfolioAnalysis,
  type Cap4PortfolioAnalysisResult,
} from "@/features/cap4/portfolioAnalysisCap4"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import { O4_LABEL, TARGET_TY_LE_QUYET_DINH_DUNG, type Cap5Progress, type O4 } from "./types"

/**
 * Cấp 5 Phân tích danh mục (spec `IQX-Cap5-Spec.md` §6) — pure compute.
 *
 * **Delegation, not duplication:** MỌI khối Cấp 1-4 (① hồ sơ, ② bảng 5 lý do, ③
 * vi phạm 30 ngày, ④ cửa sổ 20 lệnh, ⑤ điểm kỷ luật, ⑥ vi phạm theo tuần, ⑦ phát
 * hiện từ ghi chú, ⑦ tự tin, ⑧ khối lượng, ⑩ đồng thuận vs thắng, ⑪ góc nhìn
 * riêng) đều do `computeCap4PortfolioAnalysis` tính (chính nó delegate xuống Cấp
 * 3 → Cấp 2 → Cấp 1). `Cap5TradeRecord extends Cap4TradeRecord` nên mảng lệnh
 * được truyền THẲNG xuống, không map/copy.
 *
 * Cấp 5 chỉ THÊM 1 khối ở tầng compute:
 *   - **⑫ Ma trận quyết định** — 4 ô (verdict × kết quả) + số lượng + % trên số
 *     lệnh ĐÃ phân loại + `tyLeQuyetDinhDung` + 1 dòng phát hiện theo đúng thứ
 *     tự ưu tiên của spec §6.
 *
 * ★ **KHỐI ⑬ KHÔNG Ở ĐÂY — CỐ TÌNH.** "Nhật ký đứng ngoài" có endpoint riêng
 * `GET /cap5/dung-ngoai` (hook `useDanhSachDungNgoai`) trả về CẢ số liệu (né
 * đúng/né hụt/trung tính/chưa tới hạn), lý do hay dùng, ngưỡng chấm, `giai_thich`
 * và cờ `du_de_phan_tich` — authoritative, có backfill (job chấm chạy cuối phiên
 * cho mọi nước đứng ngoài đủ 5 phiên, kể cả nước ghi trước khi FE ship) và đúng
 * bằng con số nuôi nhiệm vụ ③. Tính lại ở client sẽ sinh MỘT con số thứ hai,
 * lệch, và có thể mâu thuẫn với widget Thách thức — nên `Cap5PortfolioAnalysis`
 * render THẲNG dữ liệu hook đó (cùng tiền lệ khối ⑨ của Cấp 4).
 *
 * **Honesty over fake data:** ⑫ CHƯA có endpoint nào, nên nguồn duy nhất là nhật
 * ký client `tradeLogCap5.ts` (xem gap ghi ở đó). Lệnh chưa phân loại
 * (`o4 == null`) được ĐẾM RIÊNG (`soChuaPhanLoai`) chứ không gộp vào ô nào — gộp
 * sẽ vu cho user một verdict họ chưa từng chốt. Khi chưa có lệnh nào được phân
 * loại thì mọi % là `null` (hiển thị "—", KHÔNG in 0% như thể đã đo) và phát hiện
 * bị chặn bằng `insufficientNote`.
 */

/**
 * Ngưỡng ô Sai-Thắng để bật cảnh báo "may mắn củng cố thói quen xấu" — spec §6
 * viết thẳng "≥3 lệnh".
 */
export const KHOI12_SAI_THANG_CANH_BAO = 3

/**
 * Ngưỡng ô Đúng-Thua để coi là "cao" (nhánh phát hiện thứ 2).
 *
 * Spec §6 viết *"nếu ô Đúng-Thua cao **mà user hay đổi cách**"* — nửa sau KHÔNG
 * đo được từ bất cứ trường nào đang ghi (không có gì theo dõi việc user đổi cách
 * làm). Nên nhánh này dùng một proxy ĐO ĐƯỢC và nói rõ ở đây: đủ `3` lệnh
 * Đúng-Thua VÀ số lệnh Đúng-Thua ≥ số lệnh Đúng-Thắng — tức là khi làm đúng quy
 * trình mà thua nhiều hơn thắng, đúng lúc user dễ bỏ cách làm đúng nhất. KHÔNG
 * suy diễn thêm về hành vi mà dữ liệu không chứa.
 */
export const KHOI12_DUNG_THUA_CAO = 3

/**
 * Số lệnh đã phân loại tối thiểu trước khi dám nói bất cứ điều gì về tỷ lệ quyết
 * định đúng. Cùng ngưỡng 3 mà Cấp 2/3/4 đặt cho các khối của chúng — một chuẩn
 * duy nhất cho toàn bộ chương trình. Dưới ngưỡng, số ĐẾM vẫn hiện (nó thật) còn
 * phát hiện thì không.
 */
export const KHOI12_MIN_LENH = 3

/** 4 ô theo thứ tự bảng của spec §6 (hàng ĐÚNG trước, cột THẮNG trước). */
export const O4_ORDER: readonly O4[] = ["dung_thang", "dung_thua", "sai_thang", "sai_thua"] as const

/** Thứ tự ưu tiên khi 2 loại vi phạm bằng số lần (mirror `cap2/portfolioAnalysisCap2.ts`). */
const VI_PHAM_ORDER: readonly ViPhamLoai[] = [
  "cat_lo_cham",
  "chot_loi_hut",
  "ban_som_khi_lo",
  "nhoi_lenh",
] as const

/**
 * §C12c — nói rõ 2 con số của khối này đến từ đâu và khác nhau ở chỗ nào.
 *
 * ★ "Quyết định đúng/sai" là verdict CUỐI do user chốt ở bước phân loại trong Kết
 * sổ (`verdictUser`), không phải verdict hệ gợi ý — nếu user đảo verdict thì ô 4
 * đi theo verdict của user. Lệnh đóng ngang giá (0%) tính là THUA, y như
 * `services/cap5/service.py#_derive_o_4`: không có ô "hoà".
 */
const KHOI12_GIAI_THICH =
  "4 ô = QUYẾT ĐỊNH (đúng/sai quy trình, verdict bạn chốt ở bước phân loại trong Kết sổ) × KẾT QUẢ " +
  "(lãi/lỗ thật của lệnh). Lệnh đóng ngang giá 0% tính là THUA — không có ô hoà. % của mỗi ô tính " +
  "trên số lệnh ĐÃ phân loại, không phải trên toàn bộ lệnh đã đóng. Tỷ lệ quyết định đúng đo QUY " +
  `TRÌNH (mốc nhiệm vụ ③ là ${TARGET_TY_LE_QUYET_DINH_DUNG}%); tỷ lệ thắng đo KẾT QUẢ — hai con số ` +
  "khác nhau và có thể lệch xa nhau."

function round(n: number): number {
  return Math.round(n)
}

function viPhamLoaiOf(t: Cap5TradeRecord): ViPhamLoai[] {
  const out: ViPhamLoai[] = []
  if (t.chamSlKhongCat) out.push("cat_lo_cham")
  if (t.chamTpGiuLamHut) out.push("chot_loi_hut")
  if (t.banSomKhiLoNhe) out.push("ban_som_khi_lo")
  if (t.nhoiLenhKhiLo) out.push("nhoi_lenh")
  return out
}

/**
 * Vi phạm hay gặp nhất trong TẬP LỆNH truyền vào (dùng cho ô Sai-Thắng).
 * `null` khi không lệnh nào trong tập có cờ vi phạm — spec muốn "soi lại {vi phạm
 * phổ biến}" nhưng KHÔNG được bịa một vi phạm chưa từng được ghi (§C12c).
 */
export function viPhamPhoBienCap5(trades: Cap5TradeRecord[]): string | null {
  const counts = new Map<ViPhamLoai, number>()
  for (const t of trades) {
    for (const loai of viPhamLoaiOf(t)) counts.set(loai, (counts.get(loai) ?? 0) + 1)
  }
  let best: ViPhamLoai | null = null
  let bestCount = 0
  for (const loai of VI_PHAM_ORDER) {
    const c = counts.get(loai) ?? 0
    if (c > bestCount) {
      best = loai
      bestCount = c
    }
  }
  return best ? VI_PHAM_LOAI_LABELS[best].toLowerCase() : null
}

// ── Khối ⑫ — ma trận quyết định (4 ô) ────────────────────────────────────────

export interface Khoi12Cell {
  o4: O4
  /** "Đúng · Thắng" — nhãn dùng chung với Kết sổ (`O4_LABEL`). */
  label: string
  count: number
  /** % trên số lệnh ĐÃ phân loại. `null` khi chưa có lệnh nào (KHÔNG in 0%). */
  pct: number | null
}

export interface Cap5Khoi12MaTran {
  /** 4 ô theo `O4_ORDER` — luôn đủ 4 phần tử, kể cả ô 0 lệnh. */
  cells: Khoi12Cell[]
  /** Số lệnh đã đóng CÓ phân loại 4 ô (mẫu số của mọi %). */
  soDaPhanLoai: number
  /** Lệnh đã đóng nhưng chưa phân loại — hiện ra để không ai thắc mắc số lệnh. */
  soChuaPhanLoai: number
  soQuyetDinhDung: number
  soQuyetDinhSai: number
  /** % lệnh có verdict "đúng". `null` khi chưa phân loại lệnh nào. */
  tyLeQuyetDinhDung: number | null
  /** % lệnh có verdict "sai". `null` khi chưa phân loại lệnh nào. */
  tyLeQuyetDinhSai: number | null
  /** Số lệnh LÃI trong tập đã phân loại (để so với tỷ lệ quyết định đúng). */
  soThang: number
  /** Tỷ lệ thắng của tập đã phân loại. `null` khi chưa phân loại lệnh nào. */
  tyLeThang: number | null
  /** Con số THẬT nhưng chưa đủ lệnh để kết luận (`soDaPhanLoai < KHOI12_MIN_LENH`). */
  insufficient: boolean
  /** 1 dòng phát hiện theo thứ tự ưu tiên spec §6. `null` khi chưa đủ dữ liệu. */
  phatHien: string | null
  /** Ô Sai-Thắng ≥ ngưỡng → phát hiện là CẢNH BÁO, không phải lời khen. */
  canhBao: boolean
  /** Vi phạm hay gặp nhất trong các lệnh Sai-Thắng. `null` khi chưa ghi được vi phạm nào. */
  viPhamPhoBien: string | null
  insufficientNote: string | null
  giaiThich: string
}

/**
 * Khối ⑫ (spec §6) — ma trận 2×2 + 1 phát hiện, ĐÚNG thứ tự ưu tiên của spec:
 *  1. Ô Sai-Thắng ≥ `KHOI12_SAI_THANG_CANH_BAO` → cảnh báo may mắn củng cố thói
 *     quen xấu, kèm vi phạm phổ biến THẬT (hoặc lời nhắc chung nếu chưa ghi được
 *     vi phạm nào — không bịa).
 *  2. Ngược lại, ô Đúng-Thua "cao" (xem `KHOI12_DUNG_THUA_CAO`) → "đó là thị
 *     trường, không phải lỗi bạn — giữ vững cách làm đúng".
 *  3. Mặc định → so tỷ lệ quyết định đúng với tỷ lệ thắng, in CẢ HAI con số.
 *
 * Nhánh 1 được ưu tiên tuyệt đối: ô Sai-Thắng là ô nguy hiểm nhất của cả cấp
 * (spec §4), im lặng về nó để nói một câu êm hơn sẽ là xu nịnh.
 */
export function computeCap5Khoi12MaTran(trades: Cap5TradeRecord[]): Cap5Khoi12MaTran {
  const daPhanLoai = trades.filter((t): t is Cap5TradeRecord & { o4: O4 } => t.o4 != null)
  const soDaPhanLoai = daPhanLoai.length
  const soChuaPhanLoai = trades.length - soDaPhanLoai

  const counts: Record<O4, number> = {
    dung_thang: 0,
    dung_thua: 0,
    sai_thang: 0,
    sai_thua: 0,
  }
  for (const t of daPhanLoai) counts[t.o4] += 1

  const cells: Khoi12Cell[] = O4_ORDER.map((o4) => ({
    o4,
    label: O4_LABEL[o4],
    count: counts[o4],
    pct: soDaPhanLoai > 0 ? round((counts[o4] / soDaPhanLoai) * 100) : null,
  }))

  const soQuyetDinhDung = counts.dung_thang + counts.dung_thua
  const soQuyetDinhSai = counts.sai_thang + counts.sai_thua
  const soThang = counts.dung_thang + counts.sai_thang
  const tyLeQuyetDinhDung =
    soDaPhanLoai > 0 ? round((soQuyetDinhDung / soDaPhanLoai) * 100) : null
  const tyLeQuyetDinhSai = soDaPhanLoai > 0 ? round((soQuyetDinhSai / soDaPhanLoai) * 100) : null
  const tyLeThang = soDaPhanLoai > 0 ? round((soThang / soDaPhanLoai) * 100) : null
  const viPhamPhoBien = viPhamPhoBienCap5(daPhanLoai.filter((t) => t.o4 === "sai_thang"))

  const base = {
    cells,
    soDaPhanLoai,
    soChuaPhanLoai,
    soQuyetDinhDung,
    soQuyetDinhSai,
    tyLeQuyetDinhDung,
    tyLeQuyetDinhSai,
    soThang,
    tyLeThang,
    viPhamPhoBien,
    giaiThich: KHOI12_GIAI_THICH,
  }

  if (soDaPhanLoai === 0) {
    return {
      ...base,
      insufficient: true,
      phatHien: null,
      canhBao: false,
      insufficientNote:
        "Chưa có lệnh nào được phân loại 4 ô — chưa thể đo tỷ lệ quyết định đúng. Ma trận sẽ hiện " +
        "sau khi bạn chốt quyết định đúng/sai ở bước phân loại trong Kết sổ.",
    }
  }

  if (soDaPhanLoai < KHOI12_MIN_LENH) {
    return {
      ...base,
      insufficient: true,
      phatHien: null,
      canhBao: false,
      insufficientNote:
        `Cần ít nhất ${KHOI12_MIN_LENH} lệnh đã phân loại để nói được gì về tỷ lệ quyết định đúng ` +
        `(hiện: ${soDaPhanLoai}). Vài lệnh đầu chưa phân biệt được quy trình với may mắn.`,
    }
  }

  if (counts.sai_thang >= KHOI12_SAI_THANG_CANH_BAO) {
    const duoi = viPhamPhoBien
      ? `soi lại ${viPhamPhoBien} — vi phạm hay gặp nhất ở các lệnh đó.`
      : "soi lại phần quy trình bạn đã phá ở từng lệnh đó (hệ chưa ghi được vi phạm cụ thể nào)."
    return {
      ...base,
      insufficient: false,
      canhBao: true,
      phatHien:
        `⚠ Bạn có ${counts.sai_thang} lệnh thắng dù làm sai quy trình. ` +
        `Đừng để may mắn củng cố thói quen xấu — ${duoi}`,
      insufficientNote: null,
    }
  }

  if (counts.dung_thua >= KHOI12_DUNG_THUA_CAO && counts.dung_thua >= counts.dung_thang) {
    return {
      ...base,
      insufficient: false,
      canhBao: false,
      phatHien:
        `Bạn có ${counts.dung_thua} lệnh làm đúng nhưng thua. Đó là thị trường, không phải lỗi bạn ` +
        `— giữ vững cách làm đúng.`,
      insufficientNote: null,
    }
  }

  return {
    ...base,
    insufficient: false,
    canhBao: false,
    phatHien:
      `Tỷ lệ quyết định đúng ${tyLeQuyetDinhDung}% — đây mới là thước đo năng lực thật, không phải ` +
      `tỷ lệ thắng ${tyLeThang}%.`,
    insufficientNote: null,
  }
}

// ── top-level ────────────────────────────────────────────────────────────────

export interface Cap5PortfolioAnalysisResult extends Cap4PortfolioAnalysisResult {
  /** ⑫ Ma trận quyết định (4 ô). */
  khoi12MaTran: Cap5Khoi12MaTran
  /** ③ đk 1 — số lệnh đã phân loại, do SERVER đếm. `null` khi chưa vào Cấp 5. */
  soLenhPhanLoai: number | null
  /** ③ đk 2 — số nước đứng ngoài ĐÃ chấm, do SERVER đếm. `null` khi chưa vào Cấp 5. */
  soLanDungNgoaiDaCham: number | null
  /**
   * ③ đk 3 — tỷ lệ quyết định đúng SERVER chốt trên `cap5_progress`.
   *
   * ★ Đây là con số AUTHORITATIVE (nuôi nhiệm vụ ③ + widget Hành trình). Nó có
   * thể CAO/THẤP hơn `khoi12MaTran.tyLeQuyetDinhDung` vì ma trận chỉ đếm được
   * lệnh ghi trên máy này (xem gap ở `tradeLogCap5.ts`). Cả hai được surface để
   * UI nói thẳng ra sự khác biệt thay vì lặng lẽ hiện một con số thấp hơn.
   */
  tyLeQuyetDinhDungServer: number | null
}

/**
 * Phân tích danh mục Cấp 5 (spec §6) — 1 object gồm MỌI khối Cấp 1-4 (delegate
 * xuống `computeCap4PortfolioAnalysis`) + khối ⑫ + 3 số server.
 *
 * Khối ⑬ KHÔNG có ở đây (xem docstring đầu file): nó đến từ
 * `GET /cap5/dung-ngoai` qua hook `useDanhSachDungNgoai`.
 *
 * `Cap5PortfolioAnalysis.tsx` render lại markup Cấp 1-4 bằng chính component
 * `Cap4PortfolioAnalysis` nên nó chỉ cần hàm khối ⑫ ở trên; hàm tổng này là API
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
    khoi12MaTran: computeCap5Khoi12MaTran(trades),
    soLenhPhanLoai: cap5Progress?.so_lenh_phan_loai ?? null,
    soLanDungNgoaiDaCham: cap5Progress?.so_lan_dung_ngoai_da_cham ?? null,
    tyLeQuyetDinhDungServer: cap5Progress?.ty_le_quyet_dinh_dung ?? null,
  }
}
