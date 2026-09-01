import { describe, expect, it } from "vitest"
import { taskStateCap8 } from "./journeyState"
import { isGraduationReadyCap8 } from "./GraduationModalCap8"
import type { Cap8Progress } from "./types"

const progress = (overrides: Partial<Cap8Progress> = {}): Cap8Progress => ({
  id: "p8", user_id: "u8", entered_at: "2026-01-01T00:00:00Z",
  so_lenh_thoat_dung_ke_hoach: 0, muc_tieu_thoat_dung_ke_hoach: 5,
  graduated_at: null, time_to_graduate_hours: null, ...overrides,
})

describe("Cấp 8 terminal one-task journey", () => {
  it("does not complete before five compliant exits", () => {
    expect(taskStateCap8(progress({ so_lenh_thoat_dung_ke_hoach: 4 }))).toBe("active")
    expect(isGraduationReadyCap8(progress({ so_lenh_thoat_dung_ke_hoach: 4 }))).toBe(false)
  })
  it("unlocks terminal graduation on the fifth compliant exit with no next-level state", () => {
    const fifth = progress({ so_lenh_thoat_dung_ke_hoach: 5 })
    expect(taskStateCap8(fifth)).toBe("done")
    expect(isGraduationReadyCap8(fifth)).toBe(true)
  })
  it("presents a preserved historical graduation as terminal without inventing exits", () => {
    const legacyGraduate = progress({
      graduated_at: "2026-01-02T00:00:00Z",
      so_lenh_thoat_dung_ke_hoach: 0,
    })
    expect(taskStateCap8(legacyGraduate)).toBe("done")
    expect(legacyGraduate.so_lenh_thoat_dung_ke_hoach).toBe(0)
    expect(isGraduationReadyCap8(legacyGraduate)).toBe(false)
  })
})
