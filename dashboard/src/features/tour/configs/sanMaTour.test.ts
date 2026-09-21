// sanMaTour.test.ts — tour «Săn mã» (tour thứ tư), spec
// `demo-trading/LEVEL 5/IQX-Tour-SanMa.md` + `IQX-Cap5-Spec.md` §7.
import { describe, expect, it } from "vitest"
import { sanMaTour } from "./sanMaTour"

describe("sanMaTour config", () => {
  it("còn 6 bước sau khi bỏ phần lọc sàn khỏi giao diện", () => {
    expect(sanMaTour.steps).toHaveLength(6)
  })

  it("tên config là 'sanma' (tiền tố localStorage/analytics)", () => {
    expect(sanMaTour.name).toBe("sanma")
  })

  it("các bước theo đúng thứ tự và không còn neo vào phần lọc sàn đã bỏ", () => {
    expect(sanMaTour.steps.map((s) => s.targetId ?? s.targetSelector)).toEqual([
      "tour-sanma-panel",
      "tour-sanma-filter-ngoai",
      "tour-sanma-popup",
      "tour-sanma-add",
      "tour-sanma-watchlist-link",
      "#toolbar-cap5-sanma",
    ])
  })

  it("★ mọi bước đều neo vào một phần tử THẬT — không bước nào bịa ra bong bóng giữa màn", () => {
    for (const step of sanMaTour.steps) {
      expect(step.centered).toBeFalsy()
      expect(step.targetId ?? step.targetSelector).toBeTruthy()
    }
  })

  it("target không trùng nhau", () => {
    const ids = sanMaTour.steps.map((s) => s.targetId ?? s.targetSelector)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("mỗi bước có tiêu đề + nội dung, không có template rỗng", () => {
    for (const step of sanMaTour.steps) {
      expect(step.title.trim().length).toBeGreaterThan(0)
      expect(step.body.trim().length).toBeGreaterThan(20)
      expect(step.body).not.toContain("{")
    }
  })

  it("nội dung khớp file tour ở những câu chốt", () => {
    const bodies = sanMaTour.steps.map((s) => s.body)
    expect(bodies[1]).toContain("≥3/5 phiên")
    expect(bodies[2]).toContain("tối đa 10 mã")
    expect(bodies[3]).toContain("+ Theo dõi")
    expect(bodies[3]).toContain("KHÔNG phải để mua ngay")
    expect(bodies[4]).toContain("≥4/5 lớp ủng hộ")
    expect(bodies[4]).toContain("Quyết định mua vẫn là của bạn")
    expect(bodies[5]).toContain("Săn nhiều, chọn kỹ, không mua vội")
  })

  it("★ KHÔNG hứa hẹn giá / khuyến nghị mua (spec §4.3 + §11)", () => {
    const all = sanMaTour.steps.map((s) => `${s.title} ${s.body}`).join(" ")
    for (const tu of ["sẽ tăng", "chắc chắn", "nên mua ngay", "khuyến nghị mua", "cam kết"]) {
      expect(all).not.toContain(tu)
    }
  })
})
