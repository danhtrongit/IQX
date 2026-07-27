import { describe, expect, it } from "vitest"
import { sauNguoiChoiTour } from "./sauNguoiChoiTour"

describe("sauNguoiChoiTour (T3, config shape)", () => {
  it("has exactly 6 steps", () => {
    expect(sauNguoiChoiTour.steps).toHaveLength(6)
  })

  it("every step is a centered concept card (no DOM target)", () => {
    for (const step of sauNguoiChoiTour.steps) {
      expect(step.centered).toBe(true)
      expect(step.targetId).toBeUndefined()
    }
  })

  it("covers the 6 players in spec order (Khối ngoại · Tự doanh · Tổ chức · Lãnh đạo/nội bộ · Cá nhân · Cá mập)", () => {
    const titles = sauNguoiChoiTour.steps.map((s) => s.title)
    expect(titles[0]).toMatch(/Khối ngoại/)
    expect(titles[1]).toMatch(/Tự doanh/)
    expect(titles[2]).toMatch(/Tổ chức/)
    expect(titles[3]).toMatch(/Lãnh đạo|nội bộ/i)
    expect(titles[4]).toMatch(/cá nhân/i)
    expect(titles[5]).toMatch(/cá mập|dòng tiền lớn/i)
  })

  it("threads Khối ngoại/Tự doanh to Cấp 1's lý do Dòng tiền", () => {
    expect(sauNguoiChoiTour.steps[0].body).toMatch(/Dòng tiền/)
    expect(sauNguoiChoiTour.steps[1].body).toMatch(/[Dd]òng tiền/)
  })

  it("threads Lãnh đạo/nội bộ to Cấp 1's lý do Nội bộ", () => {
    expect(sauNguoiChoiTour.steps[3].body).toMatch(/Nội bộ/)
  })
})
