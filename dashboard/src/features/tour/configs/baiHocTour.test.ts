// baiHocTour.test.ts — Bài học tour config shape (T5, docs/superpowers/
// plans/2026-07-27-feature-tours.md), spec `IQX-Tour-BaiHoc.md` v1.0's 7 stops
// (TẦNG 1 danh mục · TẦNG 2 chi tiết khoá · TẦNG 3 xem bài).
//
// Cross-route nav (catalog → course detail → episode viewer) is fragile
// inside a tour (per plan Task T5) — so EVERY step here is a `centered`
// concept card, mounted only on `CatalogPage.tsx` (/bai-hoc). No
// `data-tour-id` targets are invented on `CourseDetailPage`/`EpisodeViewerPage`.
import { describe, expect, it } from "vitest"
import { baiHocTour } from "./baiHocTour"

describe("baiHocTour config", () => {
  it("has 6-7 steps (spec's ~7 stops, condensed to concept cards)", () => {
    expect(baiHocTour.steps.length).toBeGreaterThanOrEqual(6)
    expect(baiHocTour.steps.length).toBeLessThanOrEqual(7)
  })

  it("every step is a centered concept card — no cross-route data-tour-id targets", () => {
    for (const step of baiHocTour.steps) {
      expect(step.centered).toBe(true)
      expect(step.targetId).toBeUndefined()
    }
  })

  it("covers the catalog + filters concept", () => {
    expect(baiHocTour.steps.some((s) => /lọc|Kiến thức/i.test(s.title) || /lọc|cấp độ/i.test(s.body))).toBe(true)
  })

  it("covers the course card concept", () => {
    expect(baiHocTour.steps.some((s) => /thẻ khoá/i.test(s.body))).toBe(true)
  })

  it("covers course detail: hero + progress + continue CTA", () => {
    expect(
      baiHocTour.steps.some((s) => /tiến độ/i.test(s.body) && /(Bắt đầu học|Tiếp tục học)/.test(s.body)),
    ).toBe(true)
  })

  it("covers the episode list concept (lock/complete state)", () => {
    expect(baiHocTour.steps.some((s) => /(✓|hoàn thành)/i.test(s.body) && /khoá|đăng nhập/i.test(s.body))).toBe(
      true,
    )
  })

  it("covers the episode viewer concept", () => {
    expect(baiHocTour.steps.some((s) => /video|PDF/.test(s.body))).toBe(true)
  })

  it("covers the mark-complete concept", () => {
    expect(baiHocTour.steps.some((s) => /Đánh dấu hoàn thành/i.test(s.body))).toBe(true)
  })

  it("config name is 'baihoc' (used for the localStorage/analytics prefix)", () => {
    expect(baiHocTour.name).toBe("baihoc")
  })
})
