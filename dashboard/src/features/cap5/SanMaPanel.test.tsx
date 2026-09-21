import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RE_FAKE_ZERO_MA, visibleText } from "@/__tests__/textGuards"
import type { SanMaIndex } from "./sanMaTypes"

/**
 * Màn Săn mã (spec §5) — bài canh chính là LUẬT SỐ 1: một bộ lọc thiếu dữ liệu
 * phải NÓI THẲNG "chưa đủ dữ liệu", tuyệt đối không được mở ra một popup rỗng
 * trông như "đã lọc xong, 0 mã".
 */
const {
  indexQuery,
  setActivePanelMock,
  cap5Active,
  progressRef,
  markTourMutate,
  trackEventMock,
} = vi.hoisted(() => ({
    indexQuery: { current: {} as Record<string, unknown> },
    setActivePanelMock: vi.fn(),
    cap5Active: { current: true },
    progressRef: { current: null as Record<string, unknown> | null },
    markTourMutate: vi.fn(),
    trackEventMock: vi.fn(),
}))

vi.mock("@/shared/analytics/journey", () => ({ trackJourneyEvent: trackEventMock }))

vi.mock("./sanMaHooks", () => ({
  useSanMaIndex: () => indexQuery.current,
  useHuntResult: () => ({ data: undefined, isLoading: true, isError: false }),
  useCap5Watchlist: () => ({ data: [] }),
  useAddToCap5Watchlist: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("./Cap5Context", () => ({
  useCap5Events: () => ({ isCap5Active: cap5Active.current }),
}))
vi.mock("@/shared/contexts/sidebar-context", () => ({
  useSidebar: () => ({ setActivePanel: setActivePanelMock }),
}))
vi.mock("./hooks", () => ({
  useCap5Progress: () => ({ data: progressRef.current }),
  useMarkTourSanMa: () => ({ mutate: markTourMutate, isPending: false }),
}))

import { SanMaPanel } from "./SanMaPanel"

const FULL_INDEX: SanMaIndex = {
  loc_san: [
    { ma: "hose", ten: "mã HOSE", ap_dung: true },
    { ma: "thanh_khoan", ten: "thanh khoản ≥1 tỷ/phiên", ap_dung: true },
    { ma: "gia", ten: "giá ≥3.000đ", ap_dung: true },
  ],
  bo_loc: [
    { ma: "ngoai", kha_dung: true, ly_do_chua_kha_dung: null },
    { ma: "tudoanh", kha_dung: true, ly_do_chua_kha_dung: null },
    { ma: "kl", kha_dung: true, ly_do_chua_kha_dung: null },
    { ma: "dinh", kha_dung: true, ly_do_chua_kha_dung: null },
    { ma: "tang", kha_dung: true, ly_do_chua_kha_dung: null },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  cap5Active.current = true
  // Mặc định: server nói đã xem tour ⇒ tour KHÔNG tự bật, các bài khác không bị
  // overlay che.
  progressRef.current = { da_xem_tour_sanma: true }
  indexQuery.current = { data: FULL_INDEX, isLoading: false, isError: false }
})

describe("SanMaPanel — 5 bộ lọc + lọc sàn (spec §5, mockup iqx-cap5-sanma.html)", () => {
  it("hiện đủ 5 bộ lọc, đúng tên mockup", () => {
    render(<SanMaPanel />)
    for (const ten of [
      "Khối ngoại gom",
      "Tự doanh gom",
      "Khối lượng đột biến",
      "Vượt đỉnh 20 phiên",
      "Tăng mạnh + KL cao",
    ]) {
      expect(screen.getByText(ten)).toBeInTheDocument()
    }
  })

  it("ghi nhận lượt xem và bộ lọc được mở", () => {
    render(<SanMaPanel />)
    expect(trackEventMock).toHaveBeenCalledWith("cap5_san_ma_view")
    fireEvent.click(screen.getByTestId("cap5-sanma-filter-ngoai"))
    expect(trackEventMock).toHaveBeenCalledWith("cap5_hunt_open", { filter: "ngoai" })
  })

  it("mỗi bộ lọc ghi rõ điều kiện ngay bên dưới (spec §5.3)", () => {
    render(<SanMaPanel />)
    expect(screen.getAllByText("Mua ròng ≥3/5 phiên · tổng 5 phiên > 0")).toHaveLength(2)
    expect(screen.getByText("KL phiên ≥2× trung bình 20 phiên")).toBeInTheDocument()
    expect(screen.getByText("Giá đóng cửa > đỉnh 20 phiên trước")).toBeInTheDocument()
    expect(screen.getByText("Tăng ≥3% · KL ≥1,5× trung bình 20 phiên")).toBeInTheDocument()
  })

})

describe("SanMaPanel — LUẬT SỐ 1: bộ lọc thiếu dữ liệu", () => {
  beforeEach(() => {
    indexQuery.current = {
      data: {
        ...FULL_INDEX,
        bo_loc: [
          ...FULL_INDEX.bo_loc.filter((b) => b.ma !== "tudoanh"),
          {
            ma: "tudoanh",
            kha_dung: false,
            ly_do_chua_kha_dung: "chưa có dữ liệu tự doanh theo phiên",
          },
        ],
      },
      isLoading: false,
      isError: false,
    }
  })

it("★ hiện «Chưa đủ dữ liệu» + lý do NGUYÊN VĂN của máy chủ", () => {
    render(<SanMaPanel />)
    expect(screen.getByTestId("cap5-sanma-filter-tudoanh")).toBeDisabled()
    expect(screen.getByTestId("cap5-sanma-filter-tudoanh")).toHaveAttribute("title", "Chưa đủ dữ liệu")
  })

  it("★ KHÔNG hiện «0 mã» ở bất kỳ đâu trên màn (kể cả trong portal)", () => {
    render(<SanMaPanel />)
    // Neo dương tính: màn ĐÃ render thật (5 dòng bộ lọc + hộp thiếu dữ liệu).
    expect(screen.getByTestId("cap5-sanma-filter-tudoanh")).toBeInTheDocument()
    expect(screen.getByTestId("cap5-sanma-filter-ngoai")).toBeInTheDocument()
    // ★★ `visibleText()` = `document.body`: popup/tour của Arco vẽ ra PORTAL,
    // `container.textContent` không thấy — mà bài này tự nhận "ở bất kỳ đâu".
    // Và ranh giới ASCII sau chữ ã không bao giờ khớp (xem `textGuards.ts`).
    expect(visibleText()).not.toMatch(RE_FAKE_ZERO_MA)

    // Mở luôn popup của một bộ lọc CHẠY ĐƯỢC: đó là nơi "0 mã" dễ lọt nhất.
    fireEvent.click(screen.getByTestId("cap5-sanma-filter-ngoai"))
    expect(screen.getByText("💰 Khối ngoại gom")).toBeInTheDocument()
    expect(visibleText()).not.toMatch(RE_FAKE_ZERO_MA)
  })

  it("★ bộ lọc thiếu dữ liệu KHÔNG bấm được → không mở popup rỗng", () => {
    render(<SanMaPanel />)
    const btn = screen.getByTestId("cap5-sanma-filter-tudoanh")
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(screen.queryByText("🏦 Tự doanh gom")).not.toBeInTheDocument()
  })

  it("bộ lọc còn lại vẫn bấm được và mở popup", () => {
    render(<SanMaPanel />)
    const btn = screen.getByTestId("cap5-sanma-filter-ngoai")
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(screen.getByText("💰 Khối ngoại gom")).toBeInTheDocument()
  })
})

describe("SanMaPanel — bộ lọc nâng cao KHÓA (spec §5.5, hệ mở)", () => {
  it("nói thẳng «mở khóa ở các cấp sau», không phải nút bấm được", () => {
    render(<SanMaPanel />)
    const row = screen.getByTestId("cap5-sanma-locked")
    expect(row).toHaveTextContent("Bộ lọc nâng cao")
    expect(row).toHaveTextContent("mở khóa ở các cấp sau")
    expect(row.tagName).not.toBe("BUTTON")
  })
})

describe("SanMaPanel — ở TRONG shell cấp (luật số 5)", () => {
  it("«Xem Theo dõi →» chỉ đổi panel, KHÔNG điều hướng", () => {
    render(<SanMaPanel />)
    fireEvent.click(screen.getByText("Xem Theo dõi →"))
    expect(setActivePanelMock).toHaveBeenCalledWith("cap5-watchlist")
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   TOUR SĂN MÃ (spec §7 · `tour/configs/sanMaTour.ts`)
   ══════════════════════════════════════════════════════════════════════════ */
describe("SanMaPanel — tour Săn mã", () => {
  it("auto-opens once when the server says unseen", () => {
    progressRef.current = { da_xem_tour_sanma: false }
    render(<SanMaPanel />)
    expect(screen.getByRole("button", { name: /Hướng dẫn/ })).toBeInTheDocument()
    expect(screen.getByText("Săn mã — chủ động đi tìm cơ hội")).toBeInTheDocument()
  })

  it.each([true, undefined])("does not auto-open when seen=%s, but keeps manual replay", (seen) => {
    progressRef.current = seen === undefined ? null : { da_xem_tour_sanma: seen }
    render(<SanMaPanel />)
    expect(screen.getByRole("button", { name: /Hướng dẫn/ })).toBeInTheDocument()
    expect(screen.queryByText("Săn mã — chủ động đi tìm cơ hội")).not.toBeInTheDocument()
    expect(markTourMutate).not.toHaveBeenCalled()
  })
})
