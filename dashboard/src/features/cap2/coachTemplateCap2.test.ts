import { describe, expect, it } from "vitest"
import {
  composeCoachCap2,
  pickCoachCap2,
  pickCoachIdCap2,
  type CoachSituationCap2,
} from "./coachTemplateCap2"

/**
 * spec `IQX-Cap2-Spec.md` §1 (4 hành vi vi phạm) + §5.6 (nhắc contextual
 * trong Kết sổ). Priority order under test mirrors the task brief's bullet
 * order — see `pickCoachIdCap2`'s own doc comment for the documented chain.
 */

function situation(overrides: Partial<CoachSituationCap2> = {}): CoachSituationCap2 {
  return {
    phuongPhapSlTp: "ho_tro_khang_cu",
    catLo: 60_400,
    chotLoi: 65_800,
    flags: {},
    giaSauKhiCat: null,
    ...overrides,
  }
}

describe("pickCoachIdCap2", () => {
  it('picks "cat_lo_cham" when cham_SL_khong_cat is true', () => {
    expect(pickCoachIdCap2(situation({ flags: { cham_SL_khong_cat: true } }))).toBe("cat_lo_cham")
  })

  it('picks "chot_loi_hut" when cham_TP_giu_lam_hut is true (and no cắt-lỗ violation)', () => {
    expect(pickCoachIdCap2(situation({ flags: { cham_TP_giu_lam_hut: true } }))).toBe(
      "chot_loi_hut",
    )
  })

  it('picks "ban_som_khi_lo_nhe" when only that flag is true', () => {
    expect(pickCoachIdCap2(situation({ flags: { ban_som_khi_lo_nhe: true } }))).toBe(
      "ban_som_khi_lo_nhe",
    )
  })

  it('picks "nhoi_lenh_khi_lo" when only that flag is true', () => {
    expect(pickCoachIdCap2(situation({ flags: { nhoi_lenh_khi_lo: true } }))).toBe(
      "nhoi_lenh_khi_lo",
    )
  })

  it('priority: "cat_lo_cham" beats "nhoi_lenh_khi_lo" when both are true', () => {
    const id = pickCoachIdCap2(
      situation({ flags: { cham_SL_khong_cat: true, nhoi_lenh_khi_lo: true } }),
    )
    expect(id).toBe("cat_lo_cham")
  })

  it('priority: "chot_loi_hut" beats "ban_som_khi_lo_nhe" and "nhoi_lenh_khi_lo"', () => {
    const id = pickCoachIdCap2(
      situation({
        flags: { cham_TP_giu_lam_hut: true, ban_som_khi_lo_nhe: true, nhoi_lenh_khi_lo: true },
      }),
    )
    expect(id).toBe("chot_loi_hut")
  })

  it('priority: "ban_som_khi_lo_nhe" beats "nhoi_lenh_khi_lo"', () => {
    const id = pickCoachIdCap2(
      situation({ flags: { ban_som_khi_lo_nhe: true, nhoi_lenh_khi_lo: true } }),
    )
    expect(id).toBe("ban_som_khi_lo_nhe")
  })

  it('picks "moc_bi_quet" when SL was cắt đúng phiên but price rebounded ≥5% above cắt lỗ', () => {
    const id = pickCoachIdCap2(
      situation({
        flags: { cham_SL_cat_dung_phien_ke: true },
        catLo: 60_400,
        giaSauKhiCat: 65_000, // ≈ +7.6%
      }),
    )
    expect(id).toBe("moc_bi_quet")
  })

  it('does NOT pick "moc_bi_quet" when the rebound is below the threshold', () => {
    const id = pickCoachIdCap2(
      situation({
        flags: { cham_SL_cat_dung_phien_ke: true },
        catLo: 60_400,
        giaSauKhiCat: 61_000, // ≈ +1%, not a strong rebound
      }),
    )
    expect(id).toBe("cach_dat_tot")
  })

  it('does NOT pick "moc_bi_quet" when SL was never touched (no giaSauKhiCat data)', () => {
    const id = pickCoachIdCap2(situation({ flags: {} }))
    expect(id).toBe("cach_dat_tot")
  })

  it('falls back to "cach_dat_tot" when no violation and no vi phạm/mốc-bị-quét situation applies', () => {
    expect(pickCoachIdCap2(situation())).toBe("cach_dat_tot")
  })
})

describe("pickCoachCap2 (text)", () => {
  it("cat_lo_cham text names the cắt lỗ price + số phiên giữ", () => {
    const { id, text } = pickCoachCap2(
      situation({
        flags: { cham_SL_khong_cat: true, giu_cham_SL_bao_nhieu_phien: 3 },
        catLo: 60_400,
      }),
    )
    expect(id).toBe("cat_lo_cham")
    expect(text).toContain("60,400")
    expect(text).toContain("3 phiên")
  })

  it("chot_loi_hut text names the chốt lời price", () => {
    const { text } = pickCoachCap2(situation({ flags: { cham_TP_giu_lam_hut: true }, chotLoi: 65_800 }))
    expect(text).toContain("65,800")
    expect(text.toLowerCase()).toContain("hụt")
  })

  it("ban_som_khi_lo_nhe text mentions selling before touching cắt lỗ", () => {
    const { text } = pickCoachCap2(situation({ flags: { ban_som_khi_lo_nhe: true }, catLo: 60_400 }))
    expect(text).toContain("60,400")
    expect(text.toLowerCase()).toContain("chưa chạm")
  })

  it("nhoi_lenh_khi_lo text names averaging-down behaviour", () => {
    const { text } = pickCoachCap2(situation({ flags: { nhoi_lenh_khi_lo: true } }))
    expect(text.toLowerCase()).toContain("nhồi")
  })

  it("moc_bi_quet text names both the cắt lỗ price and the rebound price", () => {
    const { text } = pickCoachCap2(
      situation({
        flags: { cham_SL_cat_dung_phien_ke: true },
        catLo: 60_400,
        giaSauKhiCat: 65_000,
      }),
    )
    expect(text).toContain("60,400")
    expect(text).toContain("65,000")
  })

  it("cach_dat_tot text names the phương pháp + cả 2 mốc cam kết", () => {
    const { text } = pickCoachCap2(
      situation({ phuongPhapSlTp: "bien_do_dao_dong", catLo: 60_700, chotLoi: 65_800 }),
    )
    expect(text).toContain("Biên độ dao động")
    expect(text).toContain("60,700")
    expect(text).toContain("65,800")
  })
})

describe("composeCoachCap2", () => {
  it("returns both Cấp 1's grid text (delegated) and Cấp 2's discipline text", () => {
    const result = composeCoachCap2(
      { pnlPositive: true, trangThaiLucDat: "ung_ho", soPhienGiu: 2 },
      { pnlPct: 8.2, lyDo: "dong_tien", soPhienGiu: 2, emotion: null },
      situation({ flags: { cham_SL_khong_cat: true } }),
    )
    // Cấp 1 template A verbatim phrase (coachTemplateCap1.test.ts already
    // pins this string — proves real delegation, not a re-implementation).
    expect(result.cap1Text).toContain("Ghi lại như mẫu chuẩn")
    expect(result.cap2.id).toBe("cat_lo_cham")
    expect(result.cap2.text.length).toBeGreaterThan(0)
  })
})
