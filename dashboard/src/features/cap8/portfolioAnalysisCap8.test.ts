import { describe, expect, it } from "vitest"
import {
  computeCap8Khoi18BanDoRuiRo,
  computeCap8PortfolioAnalysis,
  KHOI18_MIN_VI_THE_TUONG_QUAN,
} from "./portfolioAnalysisCap8"
import type { Cap8Progress, DanhMucCap8, ThachThucCap8 } from "./types"

/**
 * Khối ⑱ «Bản đồ rủi ro danh mục» (spec §7) — phân bổ ngành (kể cả tiền mặt) +
 * cặp tương quan cao + tổng vốn ở rủi ro vs trần khẩu vị + ĐÚNG MỘT dòng phát
 * hiện theo thứ tự ưu tiên của spec.
 *
 * ★ Bốn bất biến bao trùm cả file:
 *  1. **`null` không bao giờ là `0`.** `tong_rui_ro_pct = null` là "chưa tính
 *     được"; hiện `0%` sẽ nói với user rằng danh mục hoàn toàn an toàn.
 *  2. **Tương quan hệ không tính được KHÔNG hiện `0.0`** — nó là "chưa đủ dữ
 *     liệu", một trạng thái khác hẳn "hai mã không đi cùng nhịp".
 *  3. **Caveat "{N} vị thế chưa có cắt lỗ" đi kèm MỌI nơi có tổng rủi ro.**
 *  4. **<2 vị thế → chỉ phân bổ, ẩn tương quan** (spec §7: cần ≥2 mã).
 */

function danhMuc(overrides: Partial<DanhMucCap8> = {}): DanhMucCap8 {
  return {
    nav_vnd: 100_000_000,
    so_vi_the: 3,
    so_vi_the_thieu_cat_lo: 0,
    so_vi_the_thieu_gia: 0,
    phan_bo_nganh: [
      { nganh: "Ngân hàng", pct: 30 },
      { nganh: "Thép", pct: 20 },
      { nganh: "Công nghệ", pct: 18 },
      { nganh: "Tiền mặt", pct: 32 },
    ],
    don_nganh_max: { nganh: "Ngân hàng", pct: 30 },
    tong_rui_ro_pct: 14,
    khau_vi: "can_bang",
    khau_vi_ten: "Cân bằng",
    tran_khau_vi_pct: 20,
    cap_tuong_quan_cao: [{ a: "TCB", b: "MBB", he_so: 0.82 }],
    tuong_quan_du_lieu: true,
    caveat: "",
    cross_ref_pm: "CROSS REF CỦA SERVER",
    ...overrides,
  }
}

function thachThuc(dm: DanhMucCap8 | null = danhMuc()): ThachThucCap8 {
  return {
    dat_ca_3: false,
    so_lenh_kiem_tra: {
      ten: "Kiểm tra danh mục cho ≥ 15 lệnh",
      gia_tri_hien_tai: 9,
      muc_tieu: 15,
      dat: false,
      du_du_lieu: true,
      giai_thich: "GT1",
    },
    mua_bat_chap: {
      ten: "≤ 2 lần mua bất chấp cảnh báo trong 15 lệnh gần nhất",
      gia_tri_hien_tai: 1,
      muc_tieu: 2,
      dat: true,
      du_du_lieu: true,
      giai_thich: "GT2",
    },
    danh_muc_an_toan: {
      ten: "Không ngành nào > 40% và tổng vốn ở rủi ro ≤ trần khẩu vị",
      gia_tri_hien_tai: dm?.don_nganh_max?.pct ?? 0,
      muc_tieu: 40,
      dat: true,
      du_du_lieu: dm != null,
      giai_thich: "GIẢI THÍCH ĐIỀU KIỆN ③ CỦA SERVER",
    },
    so_lenh_da_ket_so: 9,
    so_lan_co_canh_bao: 4,
    so_lan_mua_bat_chap_canh_bao: 1,
    cua_so_gan_day: 15,
    danh_muc: dm,
  }
}

describe("khối ⑱ — phân bổ ngành (spec §7)", () => {
  it("giữ NGUYÊN thứ tự + con số của server, tiền mặt là một ô riêng", () => {
    const k = computeCap8Khoi18BanDoRuiRo(thachThuc())
    expect(k.duDuLieu).toBe(true)
    expect(k.phanBoNganh.map((p) => p.nganh)).toEqual([
      "Ngân hàng",
      "Thép",
      "Công nghệ",
      "Tiền mặt",
    ])
    expect(k.donNganhMax).toEqual({ nganh: "Ngân hàng", pct: 30 })
    expect(k.donNganhCanhBao).toBe(false)
  })

  it("ngưỡng dồn ngành đọc TỪ SERVER (`danh_muc_an_toan.muc_tieu`), không tự chế", () => {
    const tt = thachThuc(danhMuc({ don_nganh_max: { nganh: "Thép", pct: 35 } }))
    // 35% dưới ngưỡng 40 mặc định, nhưng server hạ ngưỡng xuống 30 → PHẢI cảnh báo.
    tt.danh_muc_an_toan.muc_tieu = 30
    const k = computeCap8Khoi18BanDoRuiRo(tt)
    expect(k.nguongDonNganhPct).toBe(30)
    expect(k.donNganhCanhBao).toBe(true)
  })
})

describe("khối ⑱ — cặp tương quan cao (spec §7)", () => {
  it("hiện cặp + hệ số 2 chữ số theo mẫu spec", () => {
    const k = computeCap8Khoi18BanDoRuiRo(thachThuc())
    expect(k.hienTuongQuan).toBe(true)
    expect(k.tuongQuanText).toBe("TCB ↔ MBB (~0.82) — cùng nhịp, ít phân tán")
  })

  it("<2 vị thế → ẩn HẲN tương quan (spec §7: cần ≥2 mã)", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(danhMuc({ so_vi_the: KHOI18_MIN_VI_THE_TUONG_QUAN - 1 })),
    )
    expect(k.hienTuongQuan).toBe(false)
    expect(k.tuongQuanText).toBeNull()
    // Phân bổ ngành thì VẪN hiện — spec chỉ ẩn tương quan.
    expect(k.phanBoNganh.length).toBeGreaterThan(0)
  })

  it("server không tính được hệ số → 'chưa đủ dữ liệu', TUYỆT ĐỐI không 0.0", () => {
    // Đổi ĐÚNG MỘT biến so với fixture xanh: cờ `tuong_quan_du_lieu`. Danh sách
    // cặp vẫn còn nguyên một cặp có hệ số 0 — nếu code chỉ nhìn `he_so` hay
    // `length` mà bỏ cờ, nó sẽ in ra "0.00" và test này bắt được.
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(
        danhMuc({
          tuong_quan_du_lieu: false,
          cap_tuong_quan_cao: [{ a: "TCB", b: "MBB", he_so: 0 }],
        }),
      ),
    )
    expect(k.hienTuongQuan).toBe(true)
    expect(k.tuongQuanDuLieu).toBe(false)
    expect(k.tuongQuanText).toContain("chưa đủ dữ liệu")
    expect(k.tuongQuanText).not.toContain("0.0")
    expect(k.tuongQuanText).not.toContain("TCB ↔ MBB")
  })

  it("tính được nhưng KHÔNG cặp nào vượt ngưỡng → nói thẳng, khác 'chưa đủ dữ liệu'", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(danhMuc({ cap_tuong_quan_cao: [] })),
    )
    expect(k.tuongQuanDuLieu).toBe(true)
    expect(k.tuongQuanText).not.toContain("chưa đủ dữ liệu")
    expect(k.tuongQuanText).toContain("Không có cặp nào")
  })

  it("nhiều cặp → liệt kê đủ", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(
        danhMuc({
          cap_tuong_quan_cao: [
            { a: "TCB", b: "MBB", he_so: 0.82 },
            { a: "HPG", b: "HSG", he_so: 0.76 },
          ],
        }),
      ),
    )
    expect(k.tuongQuanText).toContain("TCB ↔ MBB (~0.82)")
    expect(k.tuongQuanText).toContain("HPG ↔ HSG (~0.76)")
  })
})

describe("khối ⑱ — tổng vốn ở rủi ro vs trần khẩu vị", () => {
  it("nhãn nói RÕ hai con số đo hai thứ khác nhau", () => {
    const k = computeCap8Khoi18BanDoRuiRo(thachThuc())
    expect(k.tongRuiRoText).toBe(
      "Tổng vốn ở rủi ro: 14% (nếu mọi cắt lỗ bị chạm) · trần khẩu vị Cân bằng: 20%",
    )
    // Câu phân biệt hai nghĩa là BẮT BUỘC, không phải tùy chọn.
    expect(k.tranKhauViNote).toContain("KHÔNG cùng một nghĩa")
    expect(k.tranKhauViNote).toMatch(/trần cho MỘT lệnh/i)
    expect(k.tongRuiRoVuotTran).toBe(false)
  })

  it("tổng rủi ro null → 'chưa tính được', KHÔNG phải 0%", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(danhMuc({ tong_rui_ro_pct: null })),
    )
    expect(k.tongRuiRoPct).toBeNull()
    // Soi ĐÚNG vế tổng rủi ro: vế trần bên phải vẫn có "20%" một cách hợp lệ.
    const veTong = k.tongRuiRoText.split(" · ")[0]
    expect(veTong).toBe("Tổng vốn ở rủi ro: chưa tính được")
    expect(veTong).not.toMatch(/\d/)
    // Chưa biết thì KHÔNG được kết luận là trong ngưỡng.
    expect(k.tongRuiRoVuotTran).toBe(false)
  })

  it("chưa đặt khẩu vị ở Cấp 3 → nói thẳng là chưa có trần để đối chiếu", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(danhMuc({ khau_vi: null, khau_vi_ten: null, tran_khau_vi_pct: null })),
    )
    expect(k.tongRuiRoText).toContain("chưa có trần")
    expect(k.tongRuiRoVuotTran).toBe(false)
  })

  it("vượt trần → cờ bật", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(danhMuc({ tong_rui_ro_pct: 24 })),
    )
    expect(k.tongRuiRoVuotTran).toBe(true)
  })
})

describe("khối ⑱ — caveat vị thế chưa có cắt lỗ (bất biến 3)", () => {
  it("hiện NGUYÊN VĂN câu caveat của server", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(
        danhMuc({
          so_vi_the_thieu_cat_lo: 2,
          caveat: "CAVEAT NGUYÊN VĂN CỦA SERVER",
        }),
      ),
    )
    expect(k.caveat).toBe("CAVEAT NGUYÊN VĂN CỦA SERVER")
  })

  it("server quên câu caveat mà vẫn có vị thế thiếu cắt lỗ → khối tự nói ra", () => {
    // Đổi ĐÚNG MỘT biến so với test trên: `caveat` rỗng.
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(danhMuc({ so_vi_the_thieu_cat_lo: 2, caveat: "" })),
    )
    expect(k.caveat).toContain("2 vị thế chưa có cắt lỗ")
    expect(k.caveat).toContain("chưa tính được rủi ro của các vị thế này")
  })

  it("không vị thế nào thiếu cắt lỗ → không có caveat để bịa ra", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(danhMuc({ so_vi_the_thieu_cat_lo: 0, caveat: "" })),
    )
    expect(k.caveat).toBeNull()
  })
})

describe("khối ⑱ — ĐÚNG MỘT dòng phát hiện, theo thứ tự ưu tiên spec §7", () => {
  it("① ngành > ngưỡng thắng mọi thứ khác", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(
        danhMuc({
          don_nganh_max: { nganh: "Ngân hàng", pct: 46 },
          // Rủi ro CŨNG vượt trần — nhưng dòng ngành mới là dòng được chọn.
          tong_rui_ro_pct: 24,
        }),
      ),
    )
    expect(k.phatHien).toBe(
      "Danh mục dồn Ngân hàng 46% — một cú sốc ngành sẽ ảnh hưởng lớn. Cân nhắc phân tán.",
    )
  })

  it("② tổng rủi ro vượt trần khi KHÔNG ngành nào quá ngưỡng", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(danhMuc({ tong_rui_ro_pct: 24 })),
    )
    expect(k.phatHien).toBe(
      "Tổng vốn ở rủi ro 24% vượt trần khẩu vị Cân bằng 20% — đang mạo hiểm hơn mức bạn đã chọn.",
    )
  })

  it("③ mặc định — nguyên văn spec", () => {
    const k = computeCap8Khoi18BanDoRuiRo(thachThuc())
    expect(k.phatHien).toBe(
      "Danh mục phân tán tốt, tổng rủi ro trong ngưỡng khẩu vị. Giữ vững.",
    )
  })

  it("chưa so được tổng rủi ro với trần → KHÔNG nói 'phân tán tốt, trong ngưỡng'", () => {
    const k = computeCap8Khoi18BanDoRuiRo(
      thachThuc(danhMuc({ tong_rui_ro_pct: null })),
    )
    expect(k.phatHien).not.toContain("trong ngưỡng khẩu vị")
    expect(k.phatHien).toContain("chưa so được")
  })

  it("chỉ có ĐÚNG một dòng phát hiện, không bao giờ hai", () => {
    for (const dm of [
      danhMuc({ don_nganh_max: { nganh: "Ngân hàng", pct: 46 }, tong_rui_ro_pct: 24 }),
      danhMuc({ tong_rui_ro_pct: 24 }),
      danhMuc(),
    ]) {
      const k = computeCap8Khoi18BanDoRuiRo(thachThuc(dm))
      expect(k.phatHien).not.toBeNull()
      expect(k.phatHien!.split(" — ").length).toBeLessThanOrEqual(2)
    }
  })
})

describe("khối ⑱ — fail-closed khi chưa có dữ liệu", () => {
  it("chưa tải được thách thức → không con số nào, nói thẳng", () => {
    const k = computeCap8Khoi18BanDoRuiRo(null)
    expect(k.duDuLieu).toBe(false)
    expect(k.tongRuiRoPct).toBeNull()
    expect(k.donNganhMax).toBeNull()
    expect(k.phanBoNganh).toEqual([])
    expect(k.phatHien).toBeNull()
    expect(k.thieuDuLieuNote).toContain("Chưa lấy được")
  })

  it("chưa định giá được danh mục (danh_muc = null) → cũng fail-closed", () => {
    const k = computeCap8Khoi18BanDoRuiRo(thachThuc(null))
    expect(k.duDuLieu).toBe(false)
    expect(k.tongRuiRoPct).toBeNull()
    expect(k.phatHien).toBeNull()
    expect(k.thieuDuLieuNote).toContain("Chưa định giá được danh mục")
    // Câu §C12c của server cho điều kiện ③ vẫn hiện nguyên văn.
    expect(k.giaiThichServer).toBe("GIẢI THÍCH ĐIỀU KIỆN ③ CỦA SERVER")
  })

  it("cross-ref Người quản lý danh mục LUÔN có (spec §7/§9)", () => {
    expect(computeCap8Khoi18BanDoRuiRo(thachThuc()).crossRefPm).toBe("CROSS REF CỦA SERVER")
    expect(computeCap8Khoi18BanDoRuiRo(null).crossRefPm).toContain("Người quản lý danh mục")
  })
})

// ── top-level: delegation ①-⑰ ────────────────────────────────────────────────

function cap8Progress(overrides: Partial<Cap8Progress> = {}): Cap8Progress {
  return {
    id: "c8",
    user_id: "u1",
    entered_at: "2026-07-01T00:00:00Z",
    task_1_done_at: null,
    task_2_done_at: null,
    task_3_done_at: null,
    so_lenh_kiem_tra: 9,
    so_lan_mua_bat_chap_canh_bao: 1,
    don_nganh_max_pct: 30,
    tong_rui_ro_pct: 14,
    graduated_at: null,
    time_to_graduate_hours: null,
    so_lan_co_canh_bao: 4,
    bat_chap_gan_day: 1,
    cua_so_gan_day: 15,
    so_lenh_da_ket_so: 9,
    ...overrides,
  }
}

describe("computeCap8PortfolioAnalysis — delegate ①-⑰, chỉ THÊM ⑱", () => {
  it("mọi khối Cấp 1-7 vẫn có mặt, và ⑱ được thêm vào", () => {
    const result = computeCap8PortfolioAnalysis(
      [],
      [],
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      cap8Progress(),
      thachThuc(),
    )
    // Cấp 7
    expect(result.khoi16DocLuc).toBeDefined()
    expect(result.khoi17KyLuatCo).toBeDefined()
    // Cấp 6 → 1 (qua chuỗi delegate)
    expect(result.khoi14LopTheoKieu).toBeDefined()
    expect(result.khoi1).toBeDefined()
    // Cấp 8
    expect(result.khoi18BanDoRuiRo.duDuLieu).toBe(true)
  })

  it("số của Cấp 8 lấy từ hồ sơ server, và `null` KHÔNG bị quy về 0", () => {
    const co = computeCap8PortfolioAnalysis(
      [], [], null, null, null, null, null, null, null, null,
      cap8Progress(),
      thachThuc(),
    )
    expect(co.donNganhMaxPctServer).toBe(30)
    expect(co.tongRuiRoPctServer).toBe(14)

    const chua = computeCap8PortfolioAnalysis(
      [], [], null, null, null, null, null, null, null, null,
      cap8Progress({ don_nganh_max_pct: null, tong_rui_ro_pct: null }),
      thachThuc(),
    )
    expect(chua.donNganhMaxPctServer).toBeNull()
    expect(chua.tongRuiRoPctServer).toBeNull()
  })

  it("chưa vào Cấp 8 → 2 số server là null, các khối dưới vẫn tính", () => {
    const result = computeCap8PortfolioAnalysis(
      [], [], null, null, null, null, null, null, null, null, null, null,
    )
    expect(result.donNganhMaxPctServer).toBeNull()
    expect(result.tongRuiRoPctServer).toBeNull()
    expect(result.khoi16DocLuc).toBeDefined()
    expect(result.khoi18BanDoRuiRo.duDuLieu).toBe(false)
  })
})
