import { describe, expect, it } from "vitest"
import { isGraduationReadyCap7 } from "./GraduationModalCap7"

const progress = {
  id: "p7", user_id: "u7", entered_at: "2026-09-01T00:00:00Z", can_doi_ok: true,
  so_ma_dang_giu: 4, so_nganh_dang_giu: 3, ma_ty_trong_cao_nhat: "AAA",
  ty_trong_ma_cao_nhat_pct: 30, nganh_ty_trong_cao_nhat: "Ngân hàng",
  ty_trong_nganh_cao_nhat_pct: 40, ma_chua_co_gia: [], ma_chua_ro_nganh: [],
  du_lieu_day_du: true, nguong_ty_trong_ma_pct: 30, nguong_ty_trong_nganh_pct: 40,
  toi_thieu_ma: 4, toi_thieu_nganh: 3, graduated_at: null, time_to_graduate_hours: null,
}

describe("isGraduationReadyCap7", () => {
  it("requires the single live balance task and no prior graduation", () => {
    expect(isGraduationReadyCap7(progress)).toBe(true)
    expect(isGraduationReadyCap7({ ...progress, can_doi_ok: false })).toBe(false)
    expect(isGraduationReadyCap7({ ...progress, graduated_at: "2026-09-01T01:00:00Z" })).toBe(false)
  })
})
