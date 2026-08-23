import { describe, expect, it } from "vitest"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import {
  computeCap5Khoi13Pheu,
  computeCap5PortfolioAnalysis,
  nhanTangGiua,
  tangGiuaCap5,
  viewCap5Khoi12BoLoc,
  KHOI12_MIN_LENH,
} from "./portfolioAnalysisCap5"
import type { Cap5TradeRecord } from "./tradeLogCap5"
import { type Cap5PhanTich, type Cap5Progress, type HuntFilter, type Khoi12 } from "./types"

const NOW = new Date("2026-07-31T12:00:00Z")

let seq = 0

function trade(overrides: Partial<Cap5TradeRecord> = {}): Cap5TradeRecord {
  seq += 1
  return {
    orderId: `o${seq}`,
    lyDo: "dong_tien",
    trangThaiLucDat: "ung_ho",
    pnlPct: 4,
    pnlVnd: 400_000,
    closedAt: "2026-07-25T10:00:00Z",
    chamSlKhongCat: false,
    chamTpGiuLamHut: false,
    banSomKhiLoNhe: false,
    nhoiLenhKhiLo: false,
    khauVi: "can_bang",
    mucTuTin: 3,
    cachKhoiLuong: "linh_hoat",
    khoiLuong: 1_000,
    pctVon: 20,
    doc_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" },
    ai_5_lop: { ky_thuat: "ok", dong_tien: "ok", noi_bo: "ok", tin_tuc: "ok", dinh_gia: "ok" },
    so_lop_dong_thuan: 5,
    so_lop_khac_ai: 0,
    huntFilter: null,
    huntSoPhienCho: null,
    huntSoLopLucVao: null,
    ...overrides,
  }
}

/** `soThang` lệnh lãi + `soThua` lệnh lỗ, cùng một bộ lọc. */
function hunts(filter: HuntFilter, soThang: number, soThua: number): Cap5TradeRecord[] {
  return [
    ...Array.from({ length: soThang }, () =>
      trade({ huntFilter: filter, pnlPct: 6, pnlVnd: 600_000 }),
    ),
    ...Array.from({ length: soThua }, () =>
      trade({ huntFilter: filter, pnlPct: -4, pnlVnd: -400_000 }),
    ),
  ]
}

function progress(overrides: Partial<Cap5Progress> = {}): Cap5Progress {
  return {
    id: "p1",
    user_id: "u1",
    entered_at: "2026-07-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    so_ma_da_san: 0,
    so_ma_mua_tu_watchlist: 0,
    so_ma_cho_du_lop: null,
    best_filter: null,
    graduated_at: null,
    time_to_graduate_hours: null,
    ...overrides,
  }
}

/**
 * Khối ⑫ giờ là VIEW MODEL trên payload `GET /cap5/phan-tich` — không còn hàm
 * nào tính nó từ nhật ký localStorage (xem docstring `portfolioAnalysisCap5.ts`).
 * Fixture vì thế là hình dạng WIRE, không phải mảng lệnh.
 */
function khoi12Item(
  ma: HuntFilter,
  soLenh: number,
  soThang: number,
  overrides: Partial<Khoi12["items"][number]> = {},
): Khoi12["items"][number] {
  const duMau = soLenh >= 3
  return {
    ma,
    ten: { ngoai: "Khối ngoại gom", tudoanh: "Tự doanh gom", kl: "Khối lượng đột biến", dinh: "Vượt đỉnh 20 phiên", tang: "Tăng mạnh + KL cao" }[ma],
    so_lenh: soLenh,
    so_lenh_thang: soThang,
    ty_le_thang: duMau ? Math.round((soThang / soLenh) * 100) : null,
    du_mau: duMau,
    nhan: null,
    canh_bao: null,
    giai_thich: "",
    ...overrides,
  }
}

function khoi12(
  items: Khoi12["items"],
  overrides: Partial<Khoi12> = {},
): Khoi12 {
  return {
    items,
    best_filter: null,
    so_lenh_toi_thieu: 3,
    so_lenh_khong_tu_san: 0,
    du_de_ket_luan: items.some((i) => i.du_mau),
    giai_thich: "Chỉ tính các lệnh ĐÃ ĐÓNG có nguồn săn.",
    ...overrides,
  }
}

function phanTich(k12: Khoi12): Cap5PhanTich {
  return {
    khoi_12: k12,
    khoi_13: {
      so_ma_da_san: 0,
      so_ma_cho_du_lop: null,
      so_ma_vao_lenh: 0,
      giai_thich: "",
      loi_ket: "",
    },
  }
}

describe("khối ⑫ — bộ lọc nào mang lại mã thắng nhiều nhất (đọc SERVER)", () => {
  it("★★ query LỖI ⇒ fail-closed: nói chưa lấy được, KHÔNG tự tính bù", () => {
    const r = viewCap5Khoi12BoLoc(null, "loi")
    expect(r.chuaLayDuoc).toBe(true)
    expect(r.dangTai).toBe(false)
    expect(r.rows).toEqual([])
    expect(r.phatHien).toBeNull()
    expect(r.insufficientNote).toMatch(/Chưa lấy được số liệu bộ lọc từ máy chủ/)
    // ★ Và tuyệt đối KHÔNG được nói "bạn chưa đóng lệnh nào từ săn mã" — đó là
    // một khẳng định về hành vi user mà ta chưa hỏi được máy chủ.
    expect(r.insufficientNote).not.toMatch(/Chưa có lệnh nào đóng từ mã bạn săn/)
  })

  it("★ đang tải ⇒ câu chữ KHÁC lỗi, và cũng không có số nào", () => {
    const r = viewCap5Khoi12BoLoc(undefined, "dang_tai")
    expect(r.chuaLayDuoc).toBe(true)
    expect(r.dangTai).toBe(true)
    expect(r.insufficientNote).toMatch(/Đang lấy số liệu/)
    expect(r.rows).toEqual([])
  })

  it("server nói chưa có lệnh săn nào ⇒ rỗng TRUNG THỰC, không bịa dòng bộ lọc", () => {
    const r = viewCap5Khoi12BoLoc(khoi12([], { so_lenh_khong_tu_san: 2 }), "co_du_lieu")
    expect(r.chuaLayDuoc).toBe(false)
    expect(r.rows).toEqual([])
    expect(r.soLenhSan).toBe(0)
    expect(r.soLenhKhongSan).toBe(2)
    expect(r.insufficient).toBe(true)
    expect(r.phatHien).toBeNull()
    expect(r.insufficientNote).toMatch(/Chưa có lệnh nào đóng từ mã bạn săn/)
  })

  it("★★ dưới ngưỡng mẫu ⇒ tyLeThang = null, KHÔNG suy 100% từ 1 lệnh thắng", () => {
    const r = viewCap5Khoi12BoLoc(khoi12([khoi12Item("ngoai", 1, 1)]), "co_du_lieu")
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].soLenh).toBe(1)
    expect(r.rows[0].soThang).toBe(1)
    expect(r.rows[0].tyLeThang).toBeNull()
    expect(r.rows[0].duMau).toBe(false)
    expect(r.rows[0].conThieu).toBe(KHOI12_MIN_LENH - 1)
    expect(r.insufficient).toBe(true)
    expect(r.phatHien).toBeNull()
  })

  it("★★ server gửi `du_mau=false` KÈM một tỷ lệ ⇒ vẫn KHÔNG in tỷ lệ đó", () => {
    // Hai trường nói ngược nhau thì FE chọn vế an toàn: không có tỷ lệ.
    const r = viewCap5Khoi12BoLoc(
      khoi12([khoi12Item("ngoai", 1, 1, { du_mau: false, ty_le_thang: 100 })]),
      "co_du_lieu",
    )
    expect(r.rows[0].tyLeThang).toBeNull()
  })

  it("trạng thái rỗng nói RÕ còn thiếu bao nhiêu lệnh", () => {
    const r = viewCap5Khoi12BoLoc(
      khoi12([khoi12Item("ngoai", 2, 0), khoi12Item("kl", 1, 0)]),
      "co_du_lieu",
    )
    expect(r.insufficientNote).toMatch(/còn thiếu 1 lệnh/)
    expect(r.soLenhSan).toBe(3)
  })

  it("đủ mẫu ⇒ giữ đúng tỷ lệ của server và sắp giảm dần", () => {
    const r = viewCap5Khoi12BoLoc(
      khoi12([khoi12Item("kl", 4, 1), khoi12Item("ngoai", 4, 3), khoi12Item("dinh", 3, 2)]),
      "co_du_lieu",
    )
    expect(r.rows.map((x) => x.filter)).toEqual(["ngoai", "dinh", "kl"])
    expect(r.rows.map((x) => x.tyLeThang)).toEqual([75, 67, 25])
    expect(r.best?.filter).toBe("ngoai")
    expect(r.worst?.filter).toBe("kl")
    expect(r.insufficient).toBe(false)
  })

  it("★ ngưỡng mẫu do SERVER chốt, không phải hằng số FE", () => {
    const r = viewCap5Khoi12BoLoc(
      khoi12([khoi12Item("ngoai", 4, 3, { du_mau: false, ty_le_thang: null })], {
        so_lenh_toi_thieu: 6,
        du_de_ket_luan: false,
      }),
      "co_du_lieu",
    )
    expect(r.minLenh).toBe(6)
    expect(r.rows[0].conThieu).toBe(2)
    expect(r.insufficientNote).toMatch(/chưa bộ lọc nào đủ 6 lệnh/)
  })

  it("bộ lọc kém nhất dưới ngưỡng ⇒ phát hiện là CẢNH BÁO kèm lý do riêng của nó", () => {
    const r = viewCap5Khoi12BoLoc(
      khoi12([khoi12Item("ngoai", 4, 3), khoi12Item("kl", 4, 1)]),
      "co_du_lieu",
    )
    expect(r.canhBao).toBe(true)
    expect(r.phatHien).toContain("Khối ngoại gom")
    expect(r.phatHien).toContain("Khối lượng đột biến")
    expect(r.phatHien).toContain("sóng ngắn")
  })

  it("★ câu cảnh báo của SERVER được dùng nguyên văn khi có", () => {
    const r = viewCap5Khoi12BoLoc(
      khoi12([
        khoi12Item("ngoai", 4, 3),
        khoi12Item("kl", 4, 1, { canh_bao: "bộ lọc này hay bắt đúng phiên phân phối" }),
      ]),
      "co_du_lieu",
    )
    expect(r.phatHien).toContain("bộ lọc này hay bắt đúng phiên phân phối")
    expect(r.phatHien).not.toContain("sóng ngắn")
  })

  it("server nói 0% (đã đủ mẫu) ⇒ in 0% thật, không đổi thành «—»", () => {
    const r = viewCap5Khoi12BoLoc(khoi12([khoi12Item("tudoanh", 3, 0)]), "co_du_lieu")
    expect(r.rows[0].soThang).toBe(0)
    expect(r.rows[0].tyLeThang).toBe(0)
  })

  it("chỉ 1 bộ lọc đủ mẫu ⇒ không có worst, không cảnh báo bịa", () => {
    const r = viewCap5Khoi12BoLoc(khoi12([khoi12Item("ngoai", 4, 3)]), "co_du_lieu")
    expect(r.best?.filter).toBe("ngoai")
    expect(r.worst).toBeNull()
    expect(r.canhBao).toBe(false)
    expect(r.phatHien).toContain("75%")
  })

  it("★ `giai_thich` của server được hiện NGUYÊN VĂN (§C12c)", () => {
    const r = viewCap5Khoi12BoLoc(
      khoi12([khoi12Item("ngoai", 4, 3)], { giai_thich: "CÂU CỦA MÁY CHỦ" }),
      "co_du_lieu",
    )
    expect(r.giaiThich).toBe("CÂU CỦA MÁY CHỦ")
  })
})

describe("khối ⑬ — kỷ luật săn mã (phễu)", () => {
  it("chưa vào Cấp 5 ⇒ cả 3 tầng là null (KHÔNG vẽ 0)", () => {
    const r = computeCap5Khoi13Pheu(null)
    expect(r.tang.map((t) => t.value)).toEqual([null, null, null])
    expect(r.tyLeVaoLenh).toBeNull()
    expect(r.phatHien).toBeNull()
    expect(r.insufficientNote).not.toBeNull()
  })

  it("★★ tầng giữa chưa có mẻ chấm 5 lớp ⇒ null, KHÔNG phải 0", () => {
    const r = computeCap5Khoi13Pheu(
      progress({ so_ma_da_san: 34, so_ma_cho_du_lop: null, so_ma_mua_tu_watchlist: 14 }),
    )
    expect(r.tang[1].value).toBeNull()
    expect(r.soMaChoDuLop).toBeNull()
    // hai tầng ngoài vẫn thật ⇒ vẫn kết luận được
    expect(r.phatHien).toContain("34")
    expect(r.phatHien).toContain("14")
  })

  it("có sàng lọc ⇒ khen đúng việc user LÀM (loại mã chưa chín)", () => {
    const r = computeCap5Khoi13Pheu(
      progress({ so_ma_da_san: 34, so_ma_cho_du_lop: 19, so_ma_mua_tu_watchlist: 14 }),
    )
    expect(r.tang.map((t) => t.value)).toEqual([34, 19, 14])
    expect(r.tyLeVaoLenh).toBe(41)
    expect(r.phatHien).toMatch(/loại 20 mã chưa chín/)
    expect(r.phatHien).toContain("kỷ luật của thợ săn")
  })

  it("★★ mua HẾT số mã săn ⇒ KHÔNG khen «biết chờ» — nói thẳng chưa sàng lọc", () => {
    const r = computeCap5Khoi13Pheu(
      progress({ so_ma_da_san: 10, so_ma_cho_du_lop: 10, so_ma_mua_tu_watchlist: 10 }),
    )
    expect(r.phatHien).not.toContain("kỷ luật của thợ săn")
    expect(r.phatHien).toContain("chưa loại mã nào")
  })

  it("chưa săn mã nào ⇒ không chia cho 0, nói mốc nhiệm vụ ①", () => {
    const r = computeCap5Khoi13Pheu(progress())
    expect(r.tyLeVaoLenh).toBeNull()
    expect(r.phatHien).toBeNull()
    expect(r.insufficientNote).toContain("10")
  })
})

describe("computeCap5PortfolioAnalysis — cộng dồn", () => {
  const cap2: Cap2Progress | null = null
  const cap3: Cap3Progress | null = null
  const cap4: Cap4Progress | null = null

  it("giữ nguyên mọi khối Cấp 1-4 và thêm đúng 2 khối mới", () => {
    const r = computeCap5PortfolioAnalysis(
      hunts("ngoai", 3, 1),
      [],
      cap2,
      cap3,
      cap4,
      progress({ so_ma_da_san: 12, so_ma_mua_tu_watchlist: 5, best_filter: "ngoai" }),
      NOW,
      phanTich(khoi12([khoi12Item("ngoai", 4, 3)])),
    )
    // khối cộng dồn của Cấp 1-4 vẫn có mặt
    expect(r).toHaveProperty("khoi10DongThuan")
    expect(r).toHaveProperty("khoi11GocNhinRieng")
    expect(r.khoi12BoLoc.best?.filter).toBe("ngoai")
    expect(r.khoi13Pheu.soMaDaSan).toBe(12)
    expect(r.soMaMuaTuWatchlist).toBe(5)
    expect(r.bestFilterServer).toBe("ngoai")
  })

  /**
   * ★★ A6 — "assert-on-own-default". Fixture cũ để `muc_tieu_so_ma_*` là
   * `undefined` rồi assert `toBe(10)`/`toBe(5)`, tức là assert đúng bằng hằng số
   * bản lùi: hàm trả `CAP5_SO_MA_*_TARGET` hay đọc server đều XANH. Fixture ở
   * đây cố ý dùng 12/7 — hai con số KHÁC default — nên chỉ bản đọc server xanh.
   */
  it("★★ mốc nhiệm vụ đọc từ SERVER (12/7), không phải hằng số FE (10/5)", () => {
    const r = computeCap5PortfolioAnalysis(
      [],
      [],
      cap2,
      cap3,
      cap4,
      progress({ muc_tieu_so_ma_san: 12, muc_tieu_so_ma_mua: 7 }),
      NOW,
    )
    expect(r.mucTieuSan).toBe(12)
    expect(r.mucTieuMua).toBe(7)
  })

  it("wire cũ chưa gửi mốc ⇒ mới dùng hằng số bản lùi 10/5", () => {
    const r = computeCap5PortfolioAnalysis([], [], cap2, cap3, cap4, progress(), NOW)
    expect(r.mucTieuSan).toBe(10)
    expect(r.mucTieuMua).toBe(5)
  })

  it("★★ không truyền `phanTich` ⇒ khối ⑫ fail-closed, KHÔNG tính từ `trades`", () => {
    // 4 lệnh săn từ «ngoai» trong nhật ký client — nếu hàm còn tính từ đó thì
    // `rows` sẽ có dòng và bài này đỏ. Nhật ký per-browser KHÔNG được thành số
    // của khối ⑫ (xem docstring `portfolioAnalysisCap5.ts`).
    const r = computeCap5PortfolioAnalysis(hunts("ngoai", 3, 1), [], cap2, cap3, cap4, progress(), NOW)
    expect(r.khoi12BoLoc.chuaLayDuoc).toBe(true)
    expect(r.khoi12BoLoc.rows).toEqual([])
    expect(r.khoi12BoLoc.soLenhSan).toBe(0)
  })

  it("chưa vào Cấp 5 ⇒ mọi số server là null, không phải 0", () => {
    const r = computeCap5PortfolioAnalysis([], [], cap2, cap3, cap4, null, NOW)
    expect(r.soMaDaSan).toBeNull()
    expect(r.soMaMuaTuWatchlist).toBeNull()
    expect(r.bestFilterServer).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   TẦNG GIỮA PHỄU ⑬ — cận dưới KHÔNG được in như số chắc chắn (B8)
   ══════════════════════════════════════════════════════════════════════════ */
describe("tangGiuaCap5 — ba trạng thái, không phải hai", () => {
  it("★ `so_ma_cho_du_lop = null` ⇒ chưa đo được, nhãn «—»", () => {
    const tg = tangGiuaCap5(progress({ so_ma_da_san: 34, so_ma_cho_du_lop: null }))
    expect(tg.trangThai).toBe("chua_do")
    expect(nhanTangGiua(tg)).toBe("—")
  })

  it("★★ mẫu số NHỎ HƠN số mã đã săn ⇒ CẬN DƯỚI, nhãn «≥ 19»", () => {
    const tg = tangGiuaCap5(
      progress({
        so_ma_da_san: 34,
        so_ma_cho_du_lop: 19,
        so_ma_da_cham_diem: 22,
        so_ma_cho_du_lop_day_du: false,
      }),
    )
    expect(tg.trangThai).toBe("can_duoi")
    expect(tg.mauSo).toBe(22)
    expect(nhanTangGiua(tg)).toBe("≥ 19")
  })

  it("★★ wire CHƯA gửi mẫu số ⇒ vẫn là cận dưới (KHÔNG mặc định là đủ)", () => {
    const tg = tangGiuaCap5(progress({ so_ma_da_san: 34, so_ma_cho_du_lop: 19 }))
    expect(tg.trangThai).toBe("can_duoi")
    expect(tg.mauSo).toBeNull()
    expect(nhanTangGiua(tg)).toBe("≥ 19")
  })

  it("server khẳng định đã chấm hết ⇒ số ĐỦ, in số trơn", () => {
    const tg = tangGiuaCap5(
      progress({
        so_ma_da_san: 34,
        so_ma_cho_du_lop: 19,
        so_ma_da_cham_diem: 34,
        so_ma_cho_du_lop_day_du: true,
      }),
    )
    expect(tg.trangThai).toBe("day_du")
    expect(nhanTangGiua(tg)).toBe("19")
  })

  it("cờ `day_du` thiếu nhưng mẫu số ≥ số mã săn ⇒ vẫn là số ĐỦ", () => {
    const tg = tangGiuaCap5(
      progress({ so_ma_da_san: 10, so_ma_cho_du_lop: 4, so_ma_da_cham_diem: 10 }),
    )
    expect(tg.trangThai).toBe("day_du")
  })

  it("★ phễu KHÔNG còn nói mã «từng lên» ≥4/5 lớp (hệ không lưu lược sử)", () => {
    const r = computeCap5Khoi13Pheu(progress({ so_ma_da_san: 34, so_ma_cho_du_lop: 19 }))
    expect(r.giaiThich).not.toMatch(/từng lên/)
    expect(r.giaiThich).toMatch(/ĐANG ở mức/)
    expect(r.tang[1].label).not.toMatch(/Chờ đến khi/)
  })
})
