import { describe, expect, it } from "vitest"
import {
  CAU_CHOT_MAU_THUAN,
  CONFLICT_LEVEL_OPTIONS,
  MUC_TIEU_NHAT_QUAN_MAC_DINH,
  coBangMauThuan,
  conflictLevelLabel,
  conflictLevelText,
  datCongCap6,
  feedbackNhanDinh,
  lechNhanDinhHanhDong,
  lyDoTuMauThuan,
  mucTieuNhatQuan,
} from "./nhanDinhCap6"
import type { MauThuanCap6 } from "./mauThuanTypes"
import type { Cap6Progress } from "./types"

function progress(over: Partial<Cap6Progress> = {}): Cap6Progress {
  return {
    entered_at: "2026-08-01T00:00:00Z",
    so_lan_xu_ly_nhat_quan: 0,
    so_lan_xu_ly_veto_nhat_quan: 0,
    muc_tieu_nhat_quan: 3,
    tong_lai_lenh_cap6_pct: null,
    da_xem_tour_mauthuan: false,
    graduated_at: null,
    ...over,
  }
}

function mauThuan(over: Partial<MauThuanCap6> = {}): MauThuanCap6 {
  return {
    co_mau_thuan: true,
    ung_ho: [{ lop: "ky_thuat", nhan: "Mạnh", bac: 5 }],
    nguoc: [{ lop: "tin_tuc", nhan: "Rất tiêu cực", bac: 1, la_phu_quyet: true }],
    trung_tinh: [],
    phu_quyet_kich_hoat: true,
    lop_phu_quyet_xau: ["tin_tuc"],
    canh_bao: "Có 1 lớp phủ quyết đang ở mức rất xấu.",
    chua_du_du_lieu: false,
    ly_do_chua_du: null,
    ...over,
  }
}

describe("CONFLICT_LEVEL_OPTIONS (spec §6)", () => {
  it("có đúng 4 mức, theo đúng thứ tự mockup", () => {
    expect(CONFLICT_LEVEL_OPTIONS.map((o) => o.value)).toEqual([
      "nhe",
      "ngai",
      "nghiem",
      "chua_ro",
    ])
    expect(CONFLICT_LEVEL_OPTIONS.map((o) => o.icon)).toEqual(["🟢", "🟡", "🔴", "⚪"])
  })

  it("KHÔNG lựa chọn nào dính tới khối lượng (spec §6 loại thẳng)", () => {
    const text = CONFLICT_LEVEL_OPTIONS.map((o) => `${o.title} ${o.desc}`).join(" ")
    expect(text).not.toContain("khối lượng")
    // Neo dương tính: chuỗi thật sự có nội dung để mà kiểm.
    expect(text).toContain("Lớp phủ quyết quá xấu")
  })

  it("nhãn + icon dùng chung một nguồn", () => {
    expect(conflictLevelLabel("nghiem")).toBe("Nghiêm trọng")
    expect(conflictLevelText("nghiem")).toBe("🔴 Nghiêm trọng")
    expect(conflictLevelText("chua_ro")).toBe("⚪ Chưa rõ")
  })
})

describe("feedbackNhanDinh — KHÔNG nhắc cắt lỗ (spec §4.3/§6/§8/§9)", () => {
  it.each(["nhe", "ngai", "nghiem", "chua_ro"] as const)("mức %s", (level) => {
    const text = feedbackNhanDinh(level)
    expect(text.length).toBeGreaterThan(20)
    expect(text).not.toContain("cắt lỗ")
  })

  it("mức 🔴 vẫn nói tới khối lượng + tự tin (thứ hệ THẬT SỰ đo)", () => {
    expect(feedbackNhanDinh("nghiem")).toContain("khối lượng")
    expect(feedbackNhanDinh("nghiem")).toContain("tự tin")
  })

  it("câu chốt giữ nguyên văn spec §5.2", () => {
    expect(CAU_CHOT_MAU_THUAN).toBe(
      "IQX chỉ ra mâu thuẫn — nhận định của bạn được ghi lại để nhìn lại khi kết sổ. Quyết định vẫn là của bạn.",
    )
  })
})

describe("coBangMauThuan (spec §5.1)", () => {
  it("hiện khi CÓ ĐỒNG THỜI ≥1 ủng hộ VÀ ≥1 ngược", () => {
    expect(coBangMauThuan(mauThuan())).toBe(true)
  })

  it("KHÔNG hiện khi chỉ có phe ủng hộ", () => {
    expect(coBangMauThuan(mauThuan({ nguoc: [] }))).toBe(false)
  })

  it("KHÔNG hiện khi chỉ có phe ngược", () => {
    expect(coBangMauThuan(mauThuan({ ung_ho: [] }))).toBe(false)
  })

  it("KHÔNG hiện khi server nói không mâu thuẫn", () => {
    expect(coBangMauThuan(mauThuan({ co_mau_thuan: false }))).toBe(false)
  })

  it("KHÔNG hiện khi chưa đủ dữ liệu — dù hai phe có vẻ đầy", () => {
    expect(coBangMauThuan(mauThuan({ chua_du_du_lieu: true }))).toBe(false)
  })

  it("null/undefined → false", () => {
    expect(coBangMauThuan(null)).toBe(false)
    expect(coBangMauThuan(undefined)).toBe(false)
  })
})

describe("lyDoTuMauThuan — KHÔNG bịa một lớp mặc định", () => {
  it("lấy lớp ủng hộ đầu tiên", () => {
    expect(lyDoTuMauThuan(mauThuan())).toBe("ky_thuat")
  })

  it("không có ủng hộ → lớp trung tính đầu tiên", () => {
    expect(
      lyDoTuMauThuan(
        mauThuan({ ung_ho: [], trung_tinh: [{ lop: "dinh_gia", nhan: "Trung tính" }] }),
      ),
    ).toBe("dinh_gia")
  })

  it("chỉ có lớp ngược → lấy lớp ngược đầu tiên", () => {
    expect(lyDoTuMauThuan(mauThuan({ ung_ho: [], trung_tinh: [] }))).toBe("tin_tuc")
  })

  it("KHÔNG đọc được gì → null, KHÔNG phải 'ky_thuat'", () => {
    expect(lyDoTuMauThuan(null)).toBeNull()
    expect(lyDoTuMauThuan(undefined)).toBeNull()
    expect(lyDoTuMauThuan(mauThuan({ ung_ho: [], nguoc: [], trung_tinh: [] }))).toBeNull()
  })
})

describe("lechNhanDinhHanhDong — bẫy 'đắn đo mà vẫn mua lớn' (spec §1/§8)", () => {
  it("nghiêm trọng + tự tin cao nhất = LỆCH", () => {
    expect(lechNhanDinhHanhDong("nghiem", 3)).toBe(true)
  })

  it("nghiêm trọng + tự tin vừa = LỆCH (mua nhỏ mới là nhất quán)", () => {
    expect(lechNhanDinhHanhDong("nghiem", 2)).toBe(true)
  })

  it("nghiêm trọng + tự tin thấp nhất = KHỚP", () => {
    expect(lechNhanDinhHanhDong("nghiem", 1)).toBe(false)
  })

  it("mức khác 'nghiêm trọng' không bị coi là lệch dù tự tin cao", () => {
    expect(lechNhanDinhHanhDong("nhe", 3)).toBe(false)
    expect(lechNhanDinhHanhDong("ngai", 3)).toBe(false)
    expect(lechNhanDinhHanhDong("chua_ro", 3)).toBe(false)
  })

  it("thiếu một nửa dữ kiện → null (CHƯA BIẾT), không phải false", () => {
    expect(lechNhanDinhHanhDong(null, 3)).toBeNull()
    expect(lechNhanDinhHanhDong("nghiem", null)).toBeNull()
    expect(lechNhanDinhHanhDong(undefined, undefined)).toBeNull()
  })
})

describe("mục tiêu xử lý nhất quán", () => {
  it("lấy mục tiêu 3 do server gửi", () => {
    expect(mucTieuNhatQuan(progress())).toBe(3)
  })

  it("chưa có hồ sơ → mặc định 3", () => {
    expect(mucTieuNhatQuan(null)).toBe(MUC_TIEU_NHAT_QUAN_MAC_DINH)
  })
})

describe("datCongCap6 — thuần hành vi, KHÔNG đo lãi (spec §2/§3)", () => {
  it("3 lần nhất quán, không có phủ quyết vẫn đạt", () => {
    expect(
      datCongCap6(progress({ so_lan_xu_ly_nhat_quan: 3, so_lan_xu_ly_veto_nhat_quan: 0 })),
    ).toBe(true)
  })

  it("2 lần nhất quán, dù có phủ quyết, vẫn chưa đạt", () => {
    expect(
      datCongCap6(progress({ so_lan_xu_ly_nhat_quan: 2, so_lan_xu_ly_veto_nhat_quan: 2 })),
    ).toBe(false)
  })

  it("lỗ nặng vẫn đạt — lãi KHÔNG phải cổng", () => {
    expect(
      datCongCap6(
        progress({
          so_lan_xu_ly_nhat_quan: 3,
          so_lan_xu_ly_veto_nhat_quan: 0,
          tong_lai_lenh_cap6_pct: -42.5,
        }),
      ),
    ).toBe(true)
  })

  it("chưa có hồ sơ → chưa đạt", () => {
    expect(datCongCap6(null)).toBe(false)
  })
})
