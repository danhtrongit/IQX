import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5Progress } from "@/features/cap5/types"
import type { Cap6Progress, NhomDoiChieuCap6 } from "@/features/cap6/types"
import {
  computeCap7PortfolioAnalysis,
  type Cap7PortfolioAnalysisResult,
} from "@/features/cap7/portfolioAnalysisCap7"
import type { Cap7TradeRecord } from "@/features/cap7/tradeLogCap7"
import type { Cap7Progress, ThachThucCap7 } from "@/features/cap7/types"
import type {
  Cap8Progress,
  CapTuongQuanCap8,
  DonNganhMaxCap8,
  PhanBoNganhCap8,
  ThachThucCap8,
} from "./types"

/**
 * Cấp 8 Phân tích danh mục (spec `IQX-Cap8-Spec.md` §7) — pure compute.
 *
 * **Delegation, not duplication:** MỌI khối Cấp 1-7 (①-⑰) do
 * `computeCap7PortfolioAnalysis` tính (chính nó delegate xuống Cấp 6 → 5 → 4 →
 * 3 → 2 → 1). Cấp 8 KHÔNG thêm trường nào vào nhật ký lệnh, nên mảng
 * `Cap7TradeRecord[]` được truyền THẲNG xuống — cùng tiền lệ Cấp 6/7 đã ghi.
 *
 * Cấp 8 chỉ THÊM 1 khối:
 *   - **⑱ Bản đồ rủi ro danh mục** — phân bổ ngành (kể cả tiền mặt) · cặp tương
 *     quan cao · tổng vốn ở rủi ro vs trần khẩu vị · ĐÚNG MỘT dòng phát hiện.
 *
 * ★★ **TOÀN BỘ KHỐI ⑱ ĐẾN TỪ SERVER** (`GET /cap8/thach-thuc` → `danh_muc`). Ba
 * thước đo cần ngành ICB, lịch sử giá và cắt lỗ của từng vị thế — frontend không
 * có thứ nào trong ba thứ đó. Query lỗi/chưa tải → khối nói thẳng, KHÔNG đắp tạm
 * bằng phép tính client (cùng tiền lệ ⑯⑰ của Cấp 7, ⑮ của Cấp 6).
 *
 * ★★ **`null` KHÔNG BAO GIỜ LÀ `0`.** `tong_rui_ro_pct = null` nghĩa là *chưa
 * tính được*; hiện `0%` sẽ nói với user rằng danh mục hoàn toàn an toàn trong
 * khi thật ra chưa có gì được tính. Cùng lý do, dòng phát hiện mặc định ("phân
 * tán tốt, tổng rủi ro trong ngưỡng khẩu vị") CHỈ được phép xuất hiện khi cả
 * tổng rủi ro lẫn trần khẩu vị đều biết — nếu không, khối nói "chưa so được".
 *
 * ★★ **`tuong_quan_du_lieu === false` KHÔNG PHẢI "hai mã không đi cùng nhịp".**
 * Hàm `correlation()` dùng chung trả `0.0` cho chuỗi nó không chấm được, nên
 * server bọc lại thành cờ này. Khối render "chưa đủ dữ liệu" và TUYỆT ĐỐI không
 * in ra một hệ số 0.
 *
 * ★★ **Vị thế chưa có cắt lỗ có rủi ro CHƯA BIẾT, không phải rủi ro 0.** Câu
 * caveat của server đi kèm MỌI nơi hiện tổng rủi ro; nếu server trả câu rỗng mà
 * vẫn có vị thế thiếu cắt lỗ, khối tự nói ra chứ không im lặng.
 */

/** spec §7 — dưới ngần này vị thế thì ẩn HẲN tương quan (cần ≥2 mã để so). */
export const KHOI18_MIN_VI_THE_TUONG_QUAN = 2

/**
 * Ngưỡng dồn ngành DỰ PHÒNG (spec §7 = 40%).
 *
 * ★ Server luôn gửi ngưỡng của chính nó ở `danh_muc_an_toan.muc_tieu` và giá trị
 * đó LUÔN THẮNG — nó chính là con số dùng để chấm nhiệm vụ ③, nên một hằng số
 * cứng ở FE sẽ âm thầm lệch khỏi cách graduation được chấm. Hằng này chỉ dùng khi
 * payload thiếu/hỏng, để khối vẫn cảnh báo được thay vì im lặng bỏ qua một ngành
 * đang chiếm nửa danh mục.
 */
export const KHOI18_NGUONG_DON_NGANH_MAC_DINH = 40

/**
 * Cross-ref Người quản lý danh mục — spec §7/§9 nguyên văn.
 *
 * Bình thường lấy câu của server (`danh_muc.cross_ref_pm`); hằng này là bản dự
 * phòng cho nhánh chưa tải được payload, vì spec §9 yêu cầu dòng này LUÔN có mặt:
 * Cấp 8 cố ý KHÔNG dựng lại báo cáo PM, nên user phải luôn biết bản sâu ở đâu.
 */
export const KHOI18_CROSS_REF_PM =
  "Muốn phân tích sâu hơn (stress test, đóng góp lãi/lỗ)? Mở 'Phân tích danh mục' " +
  "(Người quản lý danh mục)."

/** ★ Câu bắt buộc: trần khẩu vị và tổng vốn ở rủi ro KHÔNG đo cùng một thứ. */
export const KHOI18_TRAN_KHAU_VI_NOTE =
  "Hai con số này KHÔNG cùng một nghĩa: trần khẩu vị là trần cho MỘT lệnh (cách bạn " +
  "đặt ở Cấp 3), còn tổng vốn ở rủi ro là phần vốn mất nếu MỌI cắt lỗ trên cả danh " +
  "mục bị chạm cùng lúc. Cấp 8 mượn lại chính con số đó làm mức trần cho cả danh mục."

/**
 * ★★ MỘT NGUỒN DUY NHẤT cho câu "{N} vị thế chưa có cắt lỗ".
 *
 * Câu của server (`DanhMucCap8.caveat`) là bản CHÍNH. Nhưng nó là một chuỗi có
 * thể RỖNG, và một chuỗi rỗng đi kèm `so_vi_the_thieu_cat_lo > 0` là khoảng
 * trống nguy hiểm nhất của cả cấp: tổng vốn ở rủi ro lúc đó trông như đầy đủ
 * trong khi vài vị thế đã bị loại khỏi phép cộng. Nên hàm này tự dựng câu cho
 * đúng trường hợp đó.
 *
 * Hàm được EXPORT vì khối ⑱, widget "Danh mục hiện tại" ở tab Hành trình và màn
 * tốt nghiệp Cấp 8 đều phải nói một câu GIỐNG NHAU trên cùng một payload — trước
 * fix wave FE-2, widget Hành trình render caveat chỉ khi chuỗi server khác rỗng
 * còn khối ⑱ thì tự dựng, nên cùng một danh mục lại được kể hai kiểu.
 *
 * `null` = THẬT SỰ không thiếu vị thế nào (và server cũng không nói gì) — chỉ khi
 * đó mới được im lặng.
 */
export function caveatThieuCatLoCap8(
  caveatServer: string | null | undefined,
  soViTheThieuCatLo: number | null | undefined,
): string | null {
  const cauServer = (caveatServer ?? "").trim()
  if (cauServer.length > 0) return cauServer
  if (soViTheThieuCatLo != null && soViTheThieuCatLo > 0) {
    return (
      `${soViTheThieuCatLo} vị thế chưa có cắt lỗ — chưa tính được rủi ro của các vị thế này, ` +
      "nên con số trên là phần ĐÃ BIẾT, không phải toàn bộ."
    )
  }
  return null
}

/** `46%` — số en-US, làm tròn nguyên; dấu trừ typographic "−" (U+2212). */
function fmtPct0(pct: number): string {
  const r = Math.round(pct)
  return `${r < 0 ? "−" : ""}${Math.abs(r)}%`
}

/** `0.82` — 2 chữ số thập phân, en-US (dấu chấm). */
function fmtHeSo(heSo: number): string {
  return heSo.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export interface Cap8Khoi18BanDoRuiRo {
  /** Server đã dựng được bản đồ hay chưa. `false` → KHÔNG con số nào. */
  duDuLieu: boolean
  soViThe: number
  /** ★ Vị thế bị LOẠI khỏi tổng vì rủi ro của chúng CHƯA BIẾT (không phải 0). */
  soViTheThieuCatLo: number
  /** Phân bổ ngành theo đúng thứ tự server trả (tiền mặt là MỘT ô riêng). */
  phanBoNganh: PhanBoNganhCap8[]
  donNganhMax: DonNganhMaxCap8 | null
  /** Ngưỡng dồn ngành ĐANG DÙNG — của server khi có. */
  nguongDonNganhPct: number
  donNganhCanhBao: boolean
  /** spec §7 — `false` khi <2 vị thế: khối ẩn HẲN phần tương quan. */
  hienTuongQuan: boolean
  /** ★ `false` = chưa đủ dữ liệu, KHÔNG "không có cặp nào tương quan cao". */
  tuongQuanDuLieu: boolean
  capTuongQuanCao: CapTuongQuanCap8[]
  /** `null` khi tương quan bị ẩn (<2 vị thế). Không bao giờ chứa một hệ số 0 bịa. */
  tuongQuanText: string | null
  /** ★ `null` = chưa tính được, KHÔNG phải 0%. */
  tongRuiRoPct: number | null
  tranKhauViPct: number | null
  khauViTen: string | null
  /** ★ CHỈ `true` khi CẢ HAI số đều biết và tổng thật sự vượt. */
  tongRuiRoVuotTran: boolean
  /** Nhãn đầy đủ, ghi rõ mỗi con số đo cái gì. */
  tongRuiRoText: string
  /** Câu phân biệt hai nghĩa của trần khẩu vị — luôn đi kèm con số trên. */
  tranKhauViNote: string
  /** "{N} vị thế chưa có cắt lỗ…" — `null` chỉ khi THẬT SỰ không thiếu gì. */
  caveat: string | null
  /** ĐÚNG MỘT dòng, theo thứ tự ưu tiên spec §7. `null` khi chưa có dữ liệu. */
  phatHien: string | null
  crossRefPm: string
  /** Câu §C12c của server cho điều kiện ③ — render NGUYÊN VĂN. */
  giaiThichServer: string | null
  thieuDuLieuNote: string | null
  giaiThich: string
}

/** §C12c — ba thước đo là gì, đến từ đâu, và vì sao có thứ chưa tính được. */
const KHOI18_GIAI_THICH =
  "Bản đồ này do hệ thống tính trên danh mục THẬT của bạn tại thời điểm mở: phân bổ ngành " +
  "= giá trị thị trường mỗi ngành / tổng tài sản (tiền mặt tính là một ô riêng, nên các ô " +
  "cộng lại bằng 100%); cặp tương quan = hệ số tương quan lợi suất ngày giữa hai vị thế " +
  "đáng kể, tính trên lịch sử giá gần đây; tổng vốn ở rủi ro = Σ (tỷ trọng vị thế × khoảng " +
  "cách tới cắt lỗ của vị thế đó). Vị thế chưa đặt cắt lỗ hoặc chưa lấy được giá KHÔNG được " +
  "cộng 0 vào tổng — chúng bị loại khỏi phép cộng và đếm riêng, vì rủi ro của chúng là CHƯA " +
  "BIẾT chứ không phải bằng không. Cặp nào chưa đủ lịch sử giá cũng để trống thay vì hiện " +
  "hệ số 0. Khối này không tính lại gì trên máy bạn."

/** Dòng CẶP TƯƠNG QUAN CAO của spec §7 — hoặc trạng thái "chưa đủ dữ liệu". */
function tuongQuanText(cap: CapTuongQuanCap8[], duLieu: boolean): string {
  // ★ Cờ `duLieu` đi TRƯỚC danh sách: một danh sách rỗng vì "không tính được"
  // và một danh sách rỗng vì "không cặp nào vượt ngưỡng" là hai sự thật khác
  // nhau, và chỉ cờ này phân biệt được chúng.
  if (!duLieu) {
    return (
      "chưa đủ dữ liệu — chưa tính được hệ số tương quan giữa các vị thế " +
      "(thiếu lịch sử giá chung, hoặc chưa có 2 vị thế đủ lớn để so)."
    )
  }
  if (cap.length === 0) {
    return "Không có cặp nào đi cùng nhịp ở mức đáng lo — các vị thế đang phân tán."
  }
  return cap
    .map((c) => `${c.a} ↔ ${c.b} (~${fmtHeSo(c.he_so)}) — cùng nhịp, ít phân tán`)
    .join(" · ")
}

/**
 * Khối ⑱ (spec §7) — bản đồ rủi ro danh mục + ĐÚNG MỘT dòng phát hiện.
 *
 * Thứ tự nhánh của dòng phát hiện (spec §7, nguyên văn 3 câu):
 *  1. Một ngành > ngưỡng → dòng dồn ngành. Thắng cả khi tổng rủi ro cũng vượt:
 *     spec xếp nó trước, và một cú sốc ngành là rủi ro cụ thể hơn.
 *  2. Tổng rủi ro > trần khẩu vị → dòng vượt trần.
 *  3. Mặc định "phân tán tốt, tổng rủi ro trong ngưỡng khẩu vị".
 *  4. ★ NHÁNH THỨ TƯ, không có trong spec nhưng bắt buộc: khi tổng rủi ro hoặc
 *     trần khẩu vị chưa biết thì câu (3) là một lời trấn an KHÔNG có cơ sở —
 *     khối nói "chưa so được" và nêu lý do.
 */
export function computeCap8Khoi18BanDoRuiRo(
  thachThuc: ThachThucCap8 | null | undefined,
): Cap8Khoi18BanDoRuiRo {
  const dieuKien = thachThuc?.danh_muc_an_toan ?? null
  const mucTieu = dieuKien?.muc_tieu
  const nguongDonNganhPct =
    mucTieu != null && Number.isFinite(mucTieu) && mucTieu > 0
      ? mucTieu
      : KHOI18_NGUONG_DON_NGANH_MAC_DINH

  const base = {
    nguongDonNganhPct,
    giaiThich: KHOI18_GIAI_THICH,
    tranKhauViNote: KHOI18_TRAN_KHAU_VI_NOTE,
    giaiThichServer: dieuKien?.giai_thich ?? null,
  }

  const danhMuc = thachThuc?.danh_muc ?? null
  if (!danhMuc) {
    return {
      ...base,
      duDuLieu: false,
      soViThe: 0,
      soViTheThieuCatLo: 0,
      phanBoNganh: [],
      donNganhMax: null,
      donNganhCanhBao: false,
      hienTuongQuan: false,
      tuongQuanDuLieu: false,
      capTuongQuanCao: [],
      tuongQuanText: null,
      tongRuiRoPct: null,
      tranKhauViPct: null,
      khauViTen: null,
      tongRuiRoVuotTran: false,
      tongRuiRoText: "Tổng vốn ở rủi ro: chưa tính được",
      caveat: null,
      phatHien: null,
      crossRefPm: KHOI18_CROSS_REF_PM,
      thieuDuLieuNote: thachThuc
        ? "Chưa định giá được danh mục nên chưa dựng được bản đồ rủi ro — IQX để trống thay " +
          "vì hiện những con số nó chưa tính được."
        : "Chưa lấy được bản đồ rủi ro danh mục từ hệ thống. Ba thước đo của khối này cần " +
          "ngành, lịch sử giá và cắt lỗ của từng vị thế — chúng chỉ do máy chủ tính, nên khối " +
          "sẽ hiện lại khi tải được chứ không đắp tạm bằng phép tính trên máy này.",
    }
  }

  const tong = danhMuc.tong_rui_ro_pct
  const tran = danhMuc.tran_khau_vi_pct
  const soThieuCatLo = danhMuc.so_vi_the_thieu_cat_lo
  const donNganhMax = danhMuc.don_nganh_max
  const donNganhCanhBao = donNganhMax != null && donNganhMax.pct > nguongDonNganhPct
  const hienTuongQuan = danhMuc.so_vi_the >= KHOI18_MIN_VI_THE_TUONG_QUAN
  const soSanhDuoc = tong != null && tran != null
  const tongRuiRoVuotTran = soSanhDuoc && tong > tran

  // ★ Nhãn spec-chuẩn: mỗi con số kèm ĐÚNG nghĩa của nó ngay tại chỗ.
  const tongPhan =
    tong != null ? `${fmtPct0(tong)} (nếu mọi cắt lỗ bị chạm)` : "chưa tính được"
  const tranPhan =
    tran == null
      ? "chưa đặt khẩu vị rủi ro ở Cấp 3 nên chưa có trần để đối chiếu"
      : `trần khẩu vị ${danhMuc.khau_vi_ten ?? danhMuc.khau_vi ?? "đã đặt"}: ${fmtPct0(tran)}`

  // ★ Caveat: câu của server là bản chính; nếu nó rỗng mà vẫn có vị thế thiếu
  // cắt lỗ thì khối tự nói ra — im lặng ở đây sẽ biến một khoảng trống đã biết
  // thành một con số trông như đầy đủ. Dùng CHUNG `caveatThieuCatLoCap8` với
  // widget Hành trình + màn tốt nghiệp để ba bề mặt không kể khác nhau.
  const caveat = caveatThieuCatLoCap8(danhMuc.caveat, soThieuCatLo)

  let phatHien: string
  if (donNganhCanhBao && donNganhMax) {
    phatHien =
      `Danh mục dồn ${donNganhMax.nganh} ${fmtPct0(donNganhMax.pct)} — một cú sốc ngành ` +
      "sẽ ảnh hưởng lớn. Cân nhắc phân tán."
  } else if (tongRuiRoVuotTran && tong != null && tran != null) {
    const ten = danhMuc.khau_vi_ten ?? danhMuc.khau_vi ?? ""
    phatHien =
      `Tổng vốn ở rủi ro ${fmtPct0(tong)} vượt trần khẩu vị ${ten} ${fmtPct0(tran)} — ` +
      "đang mạo hiểm hơn mức bạn đã chọn."
  } else if (soSanhDuoc) {
    phatHien = "Danh mục phân tán tốt, tổng rủi ro trong ngưỡng khẩu vị. Giữ vững."
  } else {
    phatHien =
      "Không ngành nào vượt ngưỡng, nhưng chưa so được tổng vốn ở rủi ro với trần khẩu vị " +
      (tong == null
        ? "vì chưa tính được tổng rủi ro của danh mục."
        : "vì bạn chưa đặt khẩu vị rủi ro ở Cấp 3.")
  }

  return {
    ...base,
    duDuLieu: true,
    soViThe: danhMuc.so_vi_the,
    soViTheThieuCatLo: soThieuCatLo,
    phanBoNganh: danhMuc.phan_bo_nganh,
    donNganhMax,
    donNganhCanhBao,
    hienTuongQuan,
    tuongQuanDuLieu: danhMuc.tuong_quan_du_lieu,
    capTuongQuanCao: danhMuc.cap_tuong_quan_cao,
    tuongQuanText: hienTuongQuan
      ? tuongQuanText(danhMuc.cap_tuong_quan_cao, danhMuc.tuong_quan_du_lieu)
      : null,
    tongRuiRoPct: tong,
    tranKhauViPct: tran,
    khauViTen: danhMuc.khau_vi_ten,
    tongRuiRoVuotTran,
    tongRuiRoText: `Tổng vốn ở rủi ro: ${tongPhan} · ${tranPhan}`,
    caveat,
    phatHien,
    crossRefPm: danhMuc.cross_ref_pm || KHOI18_CROSS_REF_PM,
    thieuDuLieuNote: null,
  }
}

// ── top-level ────────────────────────────────────────────────────────────────

export interface Cap8PortfolioAnalysisResult extends Cap7PortfolioAnalysisResult {
  /** ⑱ Bản đồ rủi ro danh mục. */
  khoi18BanDoRuiRo: Cap8Khoi18BanDoRuiRo
  /**
   * Ngành lớn nhất (%) mà SERVER chốt gần nhất.
   * ★ `null` = CHƯA TÍNH ĐƯỢC, không phải 0 — `/cap8/progress` cố ý không định
   * giá lại danh mục, nên đây là ảnh chụp và nó `null` cho tới lần chấm đầu tiên.
   */
  donNganhMaxPctServer: number | null
  /** Tổng vốn ở rủi ro (%) SERVER chốt gần nhất. ★ `null` = chưa tính được. */
  tongRuiRoPctServer: number | null
}

/**
 * Phân tích danh mục Cấp 8 (spec §7) — 1 object gồm MỌI khối Cấp 1-7 (delegate
 * xuống `computeCap7PortfolioAnalysis`) + ⑱ + 2 số server.
 *
 * `Cap8PortfolioAnalysis.tsx` render lại markup Cấp 1-7 bằng chính component
 * `Cap7PortfolioAnalysis` nên nó chỉ cần hàm khối ở trên; hàm tổng này là API
 * cho consumer muốn 1 object duy nhất (và là bề mặt test của delegation) — cùng
 * quy ước Cấp 3/4/5/6/7 đã ghi.
 */
export function computeCap8PortfolioAnalysis(
  trades: Cap7TradeRecord[],
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
  cap7Progress: Cap7Progress | null,
  thachThucCap7: ThachThucCap7 | null,
  cap8Progress: Cap8Progress | null,
  thachThucCap8: ThachThucCap8 | null,
  now: Date = new Date(),
): Cap8PortfolioAnalysisResult {
  const cap7Result = computeCap7PortfolioAnalysis(
    trades,
    dailyScores,
    cap2Progress,
    cap3Progress,
    cap4Progress,
    cap5Progress,
    cap6Progress,
    nhomDoiChieu,
    cap7Progress,
    thachThucCap7,
    now,
  )

  return {
    ...cap7Result,
    khoi18BanDoRuiRo: computeCap8Khoi18BanDoRuiRo(thachThucCap8),
    // ★ `?? null`, KHÔNG `?? 0`: xem chú thích trên hai trường này.
    donNganhMaxPctServer: cap8Progress?.don_nganh_max_pct ?? null,
    tongRuiRoPctServer: cap8Progress?.tong_rui_ro_pct ?? null,
  }
}
